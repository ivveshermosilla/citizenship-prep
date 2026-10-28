import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173/'
const phoneShot = process.env.BROWSER_REVIEW_SHOT_PHONE
const desktopShot = process.env.BROWSER_REVIEW_SHOT_DESKTOP
const noticeShot = process.env.BROWSER_REVIEW_SHOT_NOTICE
const settingsShot = process.env.BROWSER_REVIEW_SHOT_SETTINGS
const cardShot = process.env.BROWSER_REVIEW_SHOT_CARD
const response = await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent(base)}`, { method: 'PUT' })
if (!response.ok) throw new Error(`Chrome tab creation failed: ${response.status}`)
const tab = await response.json()
const socket = new WebSocket(tab.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
let recoveryCode = ''
const verifierList = []
const runtimeErrors = []
const practiceMetadataByQuestion = new Map()
const writtenRpcCalls = []
const metadataRequestIds = new Set()
const questionRequestIds = new Set()
let questionOrder = []
let questionAnswerCounts = new Map()
let quickDiagnostic = null
socket.addEventListener('message', event => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  if (msg.method === 'Page.javascriptDialogOpening' && msg.params.type === 'confirm') void cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
  if (msg.method === 'Runtime.exceptionThrown' && runtimeErrors.length < 8) {
    const detail = msg.params.exceptionDetails
    const raw = detail?.exception?.description?.split('\n')[0] ?? detail?.text ?? 'Runtime exception'
    runtimeErrors.push({ text: String(raw).slice(0, 180).replace(/[A-Z0-9_-]{35,}/giu, '[redacted]'), line: detail?.lineNumber ?? null })
  }
  if (msg.method === 'Network.requestWillBeSent') {
    const request = msg.params.request
    if (request.method === 'POST' && request.url.endsWith('/rpc/get_practice_metadata')) {
      metadataRequestIds.add(msg.params.requestId)
      practiceMetadataByQuestion.clear()
    }
    if (request.method === 'POST' && request.url.endsWith('/rpc/get_practice_questions')) questionRequestIds.add(msg.params.requestId)
    if (request.method === 'POST' && request.url.endsWith('/rpc/record_written_answer')) {
      try {
        const payload = JSON.parse(request.postData ?? '{}')
        writtenRpcCalls.push({
          requestId: msg.params.requestId,
          questionNumber: Number.isSafeInteger(payload.p_question_number) ? payload.p_question_number : null,
          outcome: ['correct', 'incorrect', 'skipped'].includes(payload.p_outcome) ? payload.p_outcome : null,
          attemptId: typeof payload.p_attempt_id === 'string' ? payload.p_attempt_id : null,
          keys: Object.keys(payload).sort(),
          codeShapeValid: typeof payload.p_code === 'string' && payload.p_code.length === 43,
          codeMatchesSession: payload.p_code === recoveryCode,
        })
      } catch { writtenRpcCalls.push({ requestId: msg.params.requestId, questionNumber: null, outcome: null, attemptId: null, keys: [], codeShapeValid: false, codeMatchesSession: false }) }
    }
  }
  if (msg.method === 'Network.loadingFinished' && metadataRequestIds.has(msg.params.requestId)) {
    metadataRequestIds.delete(msg.params.requestId)
    void cdp('Network.getResponseBody', { requestId: msg.params.requestId }).then(({ body, base64Encoded }) => {
      const decoded = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body
      const content = JSON.parse(decoded)
      if (Array.isArray(content)) for (const item of content) {
        if (Number.isSafeInteger(item.question_number)) practiceMetadataByQuestion.set(item.question_number, item)
      }
    }).catch(() => {})
  }
  if (msg.method === 'Network.loadingFinished' && questionRequestIds.has(msg.params.requestId)) {
    questionRequestIds.delete(msg.params.requestId)
    void cdp('Network.getResponseBody', { requestId: msg.params.requestId }).then(({ body, base64Encoded }) => {
      const decoded = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body
      const questions = JSON.parse(decoded)
      if (Array.isArray(questions)) {
        questionOrder = questions.map(item => item.question_number).filter(Number.isSafeInteger)
        questionAnswerCounts = new Map(questions.filter(item => Number.isSafeInteger(item.question_number)).map(item => [item.question_number, Array.isArray(item.answers) ? item.answers.length : 0]))
      }
    }).catch(() => {})
  }
})
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
function cdp(method, params = {}) {
  const commandId = ++id
  socket.send(JSON.stringify({ id: commandId, method, params }))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(commandId); reject(new Error(`CDP timed out at ${method}`)) }, 10000)
    pending.set(commandId, msg => { clearTimeout(timer); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result) })
  })
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails
    const raw = detail.exception?.description?.split('\n')[0] ?? detail.text
    throw new Error(`Runtime.evaluate failed at line ${detail.lineNumber ?? 'unknown'}: ${String(raw).slice(0, 180).replace(/[A-Z0-9_-]{35,}/giu, '[redacted]')}`)
  }
  return result.result.value
}
async function waitFor(expression, label, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  const route = await evaluate(`({heading:document.querySelector('.shell h1')?.textContent?.trim()||'',notice:document.querySelector('.step-label')?.textContent?.trim()||'',buttons:[...document.querySelectorAll('button')].map(button=>button.textContent.trim()).filter(Boolean),fields:['#cohort','#jurisdiction','#district'].map(selector=>{const field=document.querySelector(selector);return field?{id:selector,value:field.value}:null}).filter(Boolean),createDisabled:document.querySelector('.setup-panel .full-button')?.disabled,error:document.querySelector('.error-banner')?.innerText||''})`)
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify({ ...route, runtimeErrors })}`)
}
async function waitBrief(expression, timeout = 2200) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return false
}
function uniqueWrittenCalls() {
  return [...new Map(writtenRpcCalls.map(call => [call.requestId, call])).values()]
}
async function clickText(text) {
  const point = await evaluate(`(async()=>{const flip=document.querySelector('.quick-card-rotator');const animations=flip?[...flip.getAnimations()].filter(animation=>animation.playState==='running'&&Number.isFinite(animation.effect?.getTiming().duration)):[];if(animations.length)await Promise.race([Promise.allSettled(animations.map(animation=>animation.finished)),new Promise(resolve=>setTimeout(resolve,1000))]);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const e=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(${JSON.stringify(text)}));if(!e)return null;e.scrollIntoView({behavior:'instant',block:'center',inline:'center'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(!hit||!(hit===e||e.contains(hit)))return {blocked:true,hit:hit?.textContent?.trim().slice(0,80)||null};window.__codexTouchHit=false;document.addEventListener('touchstart',event=>{if(event.target===e||e.contains(event.target))window.__codexTouchHit=true},{capture:true,once:true});return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  if (!point) {
    const route = await evaluate(`({heading:document.querySelector('.shell h1')?.textContent?.trim()||'',buttons:[...document.querySelectorAll('button')].map(button=>button.textContent.trim()).filter(Boolean)})`)
    throw new Error(`Button not found: ${text}; route: ${JSON.stringify(route)}`)
  }
  if (point.blocked) throw new Error(`Touch target obscured for ${text}: ${point.hit}`)
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 }] })
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await new Promise(resolve => setTimeout(resolve, 300))
  if (!(await evaluate(`window.__codexTouchHit===true`))) throw new Error(`Touch event did not reach intended button: ${text}`)
}
async function quickQuestionNumber() {
  return evaluate(`Number(document.querySelector('.quick-question-edition')?.textContent.match(/·\\s*QUESTION\\s+(\\d+)/u)?.[1]||0)`)
}
async function waitQuickQuestionReady(label = 'Quick Question ready') {
  await waitFor(`!!document.querySelector('.quick-question') && document.querySelectorAll('.quick-answer-fields input').length>0 && !!document.querySelector('.quick-question-edition')`, label)
  const questionNumber = await quickQuestionNumber()
  if (!questionNumber || !practiceMetadataByQuestion.has(questionNumber) || !questionOrder.includes(questionNumber)) {
    const started = Date.now()
    while (Date.now() - started < 6000 && questionNumber && (!practiceMetadataByQuestion.has(questionNumber) || !questionOrder.includes(questionNumber))) await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!practiceMetadataByQuestion.has(questionNumber) || !questionOrder.includes(questionNumber)) throw new Error(`Reviewed question metadata was not captured for Quick Question ${questionNumber}`)
  return questionNumber
}
async function selectQuickQuestion(questionNumber) {
  const current = await quickQuestionNumber()
  const candidates = questionOrder.filter(number => number !== current && practiceMetadataByQuestion.has(number))
  const index = candidates.indexOf(questionNumber)
  if (index < 0) throw new Error(`No reviewed question choice for Quick Question ${questionNumber}`)
  const randomValue = (index + 0.25) / candidates.length
  await evaluate(`(() => {const original=Math.random;Math.random=()=>{Math.random=original;return ${randomValue}}})()`)
  await clickText('Another question')
  await waitFor(`Number(document.querySelector('.quick-question-edition')?.textContent.match(/·\\s*QUESTION\\s+(\\d+)/u)?.[1]||0)===${questionNumber}`, `Quick Question ${questionNumber}`)
  if (await quickQuestionNumber() === current) throw new Error('Another question repeated the prior question immediately')
}
async function fillQuickFields(values) {
  const result = await evaluate(`(() => {const fields=[...document.querySelectorAll('.quick-answer-fields input')];const entries=${JSON.stringify(values)};if(fields.length!==entries.length)return false;for(let i=0;i<fields.length;i++){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(fields[i],entries[i]??'');fields[i].dispatchEvent(new Event('input',{bubbles:true}));fields[i].dispatchEvent(new Event('change',{bubbles:true}))}return true})()`)
  if (!result) throw new Error('Quick Question fields did not match the reviewed answer count')
}
async function fillQuickField(index, value) {
  const result = await evaluate(`(() => {const fields=[...document.querySelectorAll('.quick-answer-fields input')];const field=fields[${index}];if(!field)return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  if (!result) throw new Error('The selected Quick Question answer field is missing')
}
async function quickFeedback(expected, doubleClick = false) {
  const before = uniqueWrittenCalls().length
  await evaluate(`(() => {const button=[...document.querySelectorAll('.quick-question-actions button')].find(item=>item.textContent.includes('Check answer'));if(!button)return false;button.click();${doubleClick ? 'button.click();' : ''}return true})()`)
  if (!(await waitBrief(`!!document.querySelector('.quick-question-next')` , 12000))) {
    const state = await evaluate(`({outcome:document.querySelector('.quick-question-outcome')?.textContent||'',error:document.querySelector('.quick-save-error')?.textContent||'',actions:[...document.querySelectorAll('.quick-question-actions button')].map(button=>({text:button.textContent,disabled:button.disabled}))})`)
    throw new Error(`Quick Question did not save after Check answer: ${JSON.stringify(state)}`)
  }
  const actual = await evaluate(`document.querySelector('.quick-question-outcome')?.textContent.trim()||''`)
  if (actual !== expected) throw new Error(`Expected Quick Question ${expected} feedback, received ${actual}`)
  await new Promise(resolve => setTimeout(resolve, 250))
  const uniqueCalls = uniqueWrittenCalls()
  if (uniqueCalls.length !== before + 1 && process.env.QUICK_QUESTION_DIAGNOSTIC_ONLY !== '1') throw new Error(`Expected exactly one unique written RPC after submission; observed ${JSON.stringify(uniqueCalls.map(({ requestId, attemptId, questionNumber, outcome }) => ({ requestId, attemptId, questionNumber, outcome })))}`)
  const write = uniqueCalls.at(-1)
  const permittedKeys = ['p_attempt_id', 'p_code', 'p_outcome', 'p_question_number']
  if (JSON.stringify(write.keys) !== JSON.stringify(permittedKeys) || !write.codeShapeValid || !write.codeMatchesSession || write.outcome !== expected.toLowerCase()) throw new Error(`Written RPC payload was not privacy-minimal: ${JSON.stringify({ ...write, attemptId: write.attemptId ? '[present]' : null })}`)
  return write
}
async function skipQuickQuestion(expected = 'Skipped') {
  const before = uniqueWrittenCalls().length
  await clickText('Skip')
  if (!(await waitBrief(`!!document.querySelector('.quick-question-next')`, 12000))) throw new Error('Quick Question Skip did not reach saved feedback')
  const actual = await evaluate(`document.querySelector('.quick-question-outcome')?.textContent.trim()||''`)
  await new Promise(resolve => setTimeout(resolve, 250))
  const uniqueCalls = uniqueWrittenCalls()
  if (actual !== expected || uniqueCalls.length !== before + 1) throw new Error(`Quick Question Skip persistence mismatch: ${actual}; writes ${JSON.stringify(uniqueCalls.map(({ requestId, attemptId, questionNumber, outcome }) => ({ requestId, attemptId, questionNumber, outcome })))}`)
  const write = uniqueCalls.at(-1)
  if (write.outcome !== 'skipped' || !write.codeShapeValid || !write.codeMatchesSession || JSON.stringify(write.keys) !== JSON.stringify(['p_attempt_id', 'p_code', 'p_outcome', 'p_question_number'])) throw new Error('Quick Question Skip did not use the minimal approved RPC payload')
  return write
}
async function anotherQuickQuestion() {
  const previous = await quickQuestionNumber()
  await clickText('Another question')
  await waitFor(`Number(document.querySelector('.quick-question-edition')?.textContent.match(/·\\s*QUESTION\\s+(\\d+)/u)?.[1]||0)!==${previous} && !!document.querySelector('.quick-answer-fields input')`, 'a non-repeating next Quick Question')
  return await waitQuickQuestionReady()
}
async function setSelect(selector, value) {
  const changed = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e) return false;const s=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;s.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  if (!changed) throw new Error(`Selector missing: ${selector}`)
}
async function setInput(selector, value) {
  const changed = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e) return false;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  if (!changed) throw new Error(`Input missing: ${selector}`)
}
async function assertViewport(width, height) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  const metrics = await evaluate(`(() => ({width:innerWidth,language:document.documentElement.lang,title:document.title,spanish:/[áéíóúñ¿¡]/i.test(document.body.innerText),visual:visualViewport.width,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,storage:localStorage.length+sessionStorage.length,external:[...performance.getEntriesByType('resource')].filter(r=>new URL(r.name).origin!==location.origin && !new URL(r.name).hostname.endsWith('.supabase.co')).length,brandLabel:document.querySelector('.brand')?.getAttribute('aria-label'),fullBrandVisible:!!document.querySelector('.brand-name-full')&&getComputedStyle(document.querySelector('.brand-name-full')).display!=='none',compactBrandVisible:!!document.querySelector('.brand-name-compact')&&getComputedStyle(document.querySelector('.brand-name-compact')).display!=='none',overflow:[...document.querySelectorAll('html,body,body *')].map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:'',left:Math.round(e.getBoundingClientRect().left),right:Math.round(e.getBoundingClientRect().right),scroll:e.scrollWidth,client:e.clientWidth})).filter(e=>e.right>visualViewport.width+1||e.left<-1||e.scroll>e.client+1).slice(0,16)}))()`)
  const compactWidth = width <= 620
  if (metrics.language !== 'en' || !metrics.title.includes('Naturalization Preparation App (NPA)') || metrics.spanish || metrics.scroll > metrics.client || metrics.visual !== metrics.client || metrics.storage !== 0 || metrics.external !== 0 || !metrics.brandLabel?.includes('Naturalization Preparation App (NPA)') || metrics.compactBrandVisible !== compactWidth || metrics.fullBrandVisible === compactWidth) throw new Error(`Viewport/language/privacy/brand check failed at ${width}px: ${JSON.stringify(metrics)}`)
}
try {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' })
  await new Promise(resolve => setTimeout(resolve, 350))
  if (noticeShot) {
    const safe = await evaluate(`!!document.querySelector('.notice-layout') && !document.querySelector('.secret-code')`)
    if (!safe) throw new Error('Refusing screenshot outside the safe notice screen')
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(noticeShot, Buffer.from(shot.data, 'base64'))
  }
  await clickText('Continue')
  await waitFor(`document.querySelector('.step-label')?.textContent.includes('02 / 03')`, 'notice two')
  if (!(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Resume previous session'))`))) throw new Error('Resume action missing from notice two')
  await clickText('Resume previous session')
  await waitFor(`!!document.querySelector('#recovery-code')`, 'notice-two recovery route')
  await clickText('Back')
  await evaluate(`document.querySelector('.notice-actions .button-primary').click()`)
  await waitFor(`document.querySelector('.step-label')?.textContent.includes('03 / 03')`, 'final notice')
  const privacyNotice = await evaluate(`(() => {const text=document.body.innerText.replace(/\\s+/g,' ');return {session:text.includes('We do not ask for identity details or use tracking analytics.'),provider:text.includes('Hosting and database providers may retain technical request/security logs under their own policies.')}})()`)
  if (!privacyNotice.session || !privacyNotice.provider) throw new Error(`Session notice omits required privacy disclosure: ${JSON.stringify(privacyNotice)}`)
  await evaluate(`document.querySelector('.button-row .button-secondary').click()`)
  await waitFor(`!!document.querySelector('#recovery-code')`, 'final-notice recovery route')
  await clickText('Back')
  await clickText('New session')
  await waitFor(`!!document.querySelector('#cohort')`, 'cohort selector')
  await setSelect('#cohort', '2025')
  await setSelect('#jurisdiction', 'UT')
  await waitFor(`!!document.querySelector('#district')`, 'district selector')
  await setSelect('#district', 'UT03')
  await evaluate(`document.querySelector('.setup-panel .full-button').click()`)
  await waitFor(`!!document.querySelector('.secret-code')`, 'recovery code screen')
  recoveryCode = await evaluate(`document.querySelector('.secret-code').textContent.trim()`)
  if (recoveryCode.length !== 43) throw new Error('Recovery code format not rendered')
  await clickText('I saved my code')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'hub after save acknowledgement')
  await assertViewport(320, 740)
  await assertViewport(390, 844)
  if (phoneShot) {
    if (!(await evaluate(`!!document.querySelector('.hub-layout') && !document.querySelector('.secret-code')`))) throw new Error('Refusing phone screenshot outside the safe hub screen')
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(phoneShot, Buffer.from(shot.data, 'base64'))
  }
  await assertViewport(820, 1180)
  await assertViewport(1440, 1000)
  if (desktopShot) {
    const safe = await evaluate(`!!document.querySelector('.hub-layout') && !document.querySelector('.secret-code')`)
    if (!safe) throw new Error('Refusing screenshot outside the safe hub screen')
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(desktopShot, Buffer.from(shot.data, 'base64'))
  }
  let quickNumber = await waitQuickQuestionReady('2025 reviewed Quick Question')
  const writesBeforeInteraction = writtenRpcCalls.length
  await new Promise(resolve => setTimeout(resolve, 700))
  if (writtenRpcCalls.length !== writesBeforeInteraction) throw new Error('Quick Question recorded an impression before submission')
  const firstMetadata = practiceMetadataByQuestion.get(quickNumber)
  await fillQuickFields(firstMetadata.answer_groups.slice(0, firstMetadata.required_count).map(group => group.display))
  await new Promise(resolve => setTimeout(resolve, 15500))
  const stillUntimed = await evaluate(`!document.querySelector('.quick-question-outcome') && !document.querySelector('.quick-question-actions button:disabled') && document.querySelectorAll('.quick-answer-fields input').length===${firstMetadata.required_count}`)
  if (!stillUntimed || writtenRpcCalls.length !== writesBeforeInteraction) throw new Error('Quick Question timed out, changed, or wrote data before a written submission')
  await quickFeedback('Correct', true)
  if (process.env.QUICK_QUESTION_DIAGNOSTIC_ONLY === '1') {
    const calls = uniqueWrittenCalls()
    quickDiagnostic = {
      eventCount: writtenRpcCalls.length,
      uniqueRequestCount: calls.length,
      calls: calls.map(({ requestId, attemptId, questionNumber, outcome }) => ({ requestId, attemptId, questionNumber, outcome })),
      attemptCount: new Set(calls.map(call => call.attemptId)).size,
      savedDom: await evaluate(`(() => ({saved:!!document.querySelector('.quick-question-next'),anotherButton:[...document.querySelectorAll('.quick-question-next button')].map(button=>button.textContent.trim()),flipped:!!document.querySelector('.quick-card-rotator.is-flipped'),frontInert:!!document.querySelector('.quick-card-front')?.inert,backPresent:!!document.querySelector('.quick-card-back'),outcome:document.querySelector('.quick-question-outcome')?.textContent.trim()||''}))()`),
      durableWrittenSummary: await evaluate(`document.querySelectorAll('.learning-mode-total')[1]?.innerText||''`),
    }
    throw new Error('QUICK_QUESTION_DIAGNOSTIC_COMPLETE')
  }

  const multiQuestions = [...practiceMetadataByQuestion.values()].filter(item => item.required_count > 1 && item.answer_groups.length >= item.required_count).sort((a, b) => a.question_number - b.question_number)
  if (multiQuestions.length < 2) throw new Error('The reviewed cohort metadata lacks two multi-concept questions for written-flow coverage')
  const partialTarget = multiQuestions.find(item => item.question_number !== quickNumber)
  if (!partialTarget) throw new Error('No nonrepeating multi-concept partial-answer target is available')
  await selectQuickQuestion(partialTarget.question_number)
  await fillQuickField(partialTarget.required_count - 1, partialTarget.answer_groups[0].display)
  await quickFeedback('Incorrect')

  const reorderedTarget = multiQuestions.find(item => item.question_number !== partialTarget.question_number)
  if (!reorderedTarget) throw new Error('No second multi-concept question is available for reordered-answer coverage')
  await selectQuickQuestion(reorderedTarget.question_number)
  await fillQuickFields(reorderedTarget.answer_groups.slice(0, reorderedTarget.required_count).reverse().map(group => group.display))
  await quickFeedback('Correct')

  const longAnswerTarget = [...practiceMetadataByQuestion.values()].filter(item => (questionAnswerCounts.get(item.question_number) ?? 0) >= 10 && item.question_number !== reorderedTarget.question_number).sort((a, b) => (questionAnswerCounts.get(b.question_number) ?? 0) - (questionAnswerCounts.get(a.question_number) ?? 0))[0]
  if (!longAnswerTarget) throw new Error('The reviewed cohort has no long accepted-answer list for layout coverage')
  await selectQuickQuestion(longAnswerTarget.question_number)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true })
  const longQuestionGeometry = await evaluate(`(() => {const q=document.querySelector('.quick-card-front h3').getBoundingClientRect(),i=document.querySelector('.quick-answer-fields input').getBoundingClientRect();return {gap:Math.round(i.top-q.bottom),fields:document.querySelectorAll('.quick-answer-fields input').length}})()`)
  if (longQuestionGeometry.fields !== longAnswerTarget.required_count || longQuestionGeometry.gap > 280) throw new Error(`Long-answer question pushes its field too far below the prompt: ${JSON.stringify(longQuestionGeometry)}`)
  await skipQuickQuestion()
  const acceptedListState = await evaluate(`(() => ({count:document.querySelectorAll('.quick-accepted-groups li').length,button:!!document.querySelector('.quick-question-next button'),back:!!document.querySelector('.quick-card-rotator.is-flipped .quick-card-back')}))()`)
  if (acceptedListState.count !== questionAnswerCounts.get(longAnswerTarget.question_number) || !acceptedListState.button || !acceptedListState.back) throw new Error(`Long accepted-answer feedback/Another question is incomplete: ${JSON.stringify(acceptedListState)}`)
  let currentQuickNumber = await quickQuestionNumber()
  const invalidTarget = [...practiceMetadataByQuestion.values()].find(item => item.question_number !== currentQuickNumber)
  if (!invalidTarget) throw new Error('No question remains for incorrect-answer coverage')
  await selectQuickQuestion(invalidTarget.question_number)
  await fillQuickFields(Array.from({ length: invalidTarget.required_count }, (_, index) => index === 0 ? 'clearly incorrect unrelated response' : ''))
  await quickFeedback('Incorrect')

  currentQuickNumber = await quickQuestionNumber()
  const retryTarget = [...practiceMetadataByQuestion.values()].find(item => item.question_number !== currentQuickNumber && item.question_number !== invalidTarget.question_number)
  if (!retryTarget) throw new Error('No question remains for retry coverage')
  await selectQuickQuestion(retryTarget.question_number)
  await evaluate(`(() => {const original=window.fetch.bind(window);window.__quickRetryProbe={count:0,attemptId:null,questionNumber:null,outcome:null,keys:[]};window.fetch=async(input,init)=>{const url=typeof input==='string'?input:input.url;const method=String(init?.method|| (input instanceof Request?input.method:'GET')).toUpperCase();if(method==='POST'&&url.endsWith('/rpc/record_written_answer')&&window.__quickRetryProbe.count===0){const p=JSON.parse(init.body);window.__quickRetryProbe={count:1,attemptId:p.p_attempt_id,questionNumber:p.p_question_number,outcome:p.p_outcome,keys:Object.keys(p).sort()};window.fetch=original;throw new TypeError('Synthetic one-time network interruption')}return original(input,init)}})()`)
  await clickText('Skip')
  await waitFor(`!!document.querySelector('.quick-save-error')`, 'retryable written-answer network failure')
  const writeCountBeforeRetry = uniqueWrittenCalls().length
  await clickText('Retry saving result')
  await waitFor(`!!document.querySelector('.quick-question-next')`, 'written result after network retry', 12000)
  const retryProbe = await evaluate(`window.__quickRetryProbe`)
  const uniqueCalls = uniqueWrittenCalls()
  const retryWrite = uniqueCalls.at(-1)
  if (!retryProbe || retryProbe.count !== 1 || !retryWrite || !retryWrite.codeMatchesSession || retryWrite.attemptId !== retryProbe.attemptId || retryWrite.questionNumber !== retryProbe.questionNumber || retryWrite.outcome !== retryProbe.outcome || uniqueCalls.length !== writeCountBeforeRetry + 1) throw new Error('Written-answer retry did not reuse one idempotency attempt')
  if (JSON.stringify(retryProbe.keys) !== JSON.stringify(['p_attempt_id', 'p_code', 'p_outcome', 'p_question_number'])) throw new Error('The retried written-answer payload included unexpected fields')
  const writtenHubTotals = await evaluate(`document.querySelectorAll('.learning-mode-total')[1]?.innerText||''`)
  if (!writtenHubTotals.includes('2 correct') || !writtenHubTotals.includes('2 incorrect') || !writtenHubTotals.includes('2 skipped') || !writtenHubTotals.includes('6 presentations')) throw new Error(`Written-mode totals did not update separately: ${writtenHubTotals}`)
  await assertViewport(320, 740)
  await assertViewport(390, 844)
  await assertViewport(820, 1180)
  await assertViewport(1440, 1000)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await clickText('Study Flash Cards')
  await waitFor(`!!document.querySelector('.flash-settings .flash-help')`, 'flash-card settings ready')
  if (settingsShot) {
    if (!(await evaluate(`!!document.querySelector('.flash-settings') && !document.querySelector('.secret-code')`))) throw new Error('Refusing screenshot outside safe flash settings')
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(settingsShot, Buffer.from(shot.data, 'base64'))
  }
  await assertViewport(320, 740)
  await assertViewport(390, 844)
  await assertViewport(820, 1180)
  await assertViewport(1440, 1000)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  const flashHelpButton = await evaluate(`!!document.querySelector('.flash-help')`)
  if (!flashHelpButton) throw new Error('Selection help controls are missing')
  await evaluate(`document.querySelector('.flash-help').click()`)
  await waitFor(`!!document.querySelector('.flash-help-tip')`, 'tap-opened method help')
  await evaluate(`document.querySelector('.flash-help-dismiss').click()`)
  // Chrome does not expose reliable text selection/deletion for type=number
  // through CDP. Clear through the native input setter, then type the new value
  // through Chrome's keyboard insertion path to exercise React's real handlers.
  await evaluate(`(() => {const e=document.querySelector('#flash-count');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));e.focus()})()`)
  const clearedCount = await evaluate(`document.querySelector('#flash-count').value`)
  if (clearedCount !== '') throw new Error(`Number input did not accept an empty edit value: ${clearedCount}`)
  await cdp('Input.insertText', { text: '5' })
  const typedCount = await evaluate(`({input:document.querySelector('#flash-count').value,slider:document.querySelector('input[type="range"]').value})`)
  if (typedCount.input !== '5' || typedCount.slider !== '5') throw new Error(`Keyboard count input did not synchronize after clearing: ${JSON.stringify(typedCount)}`)
  await setInput('#flash-count', 128)
  await evaluate(`document.querySelector('input[name="flash-method"][value="topic"]').click()`)
  await waitFor(`!!document.querySelector('#flash-topic')`, 'topic range synchronization')
  const topicSync = await evaluate(`({available:Number(document.querySelector('.flash-count-controls input[type="range"]').max),input:document.querySelector('#flash-count').value,slider:document.querySelector('.flash-count-controls input[type="range"]').value})`)
  if (!(topicSync.available > 0 && topicSync.available < 128) || topicSync.input !== String(topicSync.available) || topicSync.slider !== String(topicSync.available)) throw new Error(`Count controls did not clamp to the selected topic: ${JSON.stringify(topicSync)}`)
  await evaluate(`document.querySelector('input[name="flash-method"][value="random"]').click()`)
  await setInput('#flash-count', 20)
  await clickText('Start studying')
  await waitFor(`!!document.querySelector('.flashcard-surface')`, 'study flash card')
  await waitFor(`document.activeElement?.classList.contains('flashcard-surface')`, 'focus on the current flash card')
  await assertViewport(320, 740)
  await assertViewport(390, 844)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  const questionFront = await evaluate(`document.querySelector('.flashcard-surface').innerText.includes('Tap or press Enter to reveal accepted answers')`)
  if (!questionFront) throw new Error('Flash card did not start on its question front')
  if (cardShot) {
    const safe = await evaluate(`!!document.querySelector('.flashcard-surface') && !document.querySelector('.secret-code')`)
    if (!safe) throw new Error('Refusing screenshot outside safe flash-card view')
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(cardShot, Buffer.from(shot.data, 'base64'))
  }
  await evaluate(`document.querySelector('.flashcard-surface').click()`)
  await waitFor(`document.querySelector('.flashcard-surface')?.innerText.includes('ACCEPTED ANSWERS')`, 'accepted answers on card back')
  const hasSource = await evaluate(`!!document.querySelector('.flashcard-meta .source-links a') && document.querySelector('.flashcard-meta').textContent.includes('Answer reviewed')`)
  if (!hasSource) throw new Error('Study card lacks freshness date or source link')
  await evaluate(`document.querySelector('.flashcard-surface').click()`)
  await clickText('Next card')
  await clickText('Previous')
  await clickText('Change settings')
  await waitFor(`!!document.querySelector('.flash-settings .flash-help')`, 'flash settings after a card')
  await evaluate(`document.querySelector('.flash-options-group input[type="checkbox"]').click()`)
  await evaluate(`document.querySelectorAll('.flash-options-group input[type="checkbox"]')[1].click()`)
  await setInput('#flash-step', 10)
  await evaluate(`document.querySelector('input[name="flash-method"][value="range"]').click()`)
  await setInput('#flash-from', 1)
  await setInput('#flash-to', 2)
  const stepSync = await evaluate(`({input:document.querySelector('#flash-step').value,slider:document.querySelector('#flash-step').parentElement.querySelector('input[type="range"]').value})`)
  if (stepSync.input !== '2' || stepSync.slider !== '2') throw new Error(`Rolling step controls did not clamp to the selected range: ${JSON.stringify(stepSync)}`)
  await setInput('#flash-step', 1)
  const rollingEstimate = await evaluate(`document.querySelector('#flash-step').parentElement.parentElement.innerText`)
  if (!rollingEstimate.includes('3 total test presentations')) throw new Error(`Rolling presentation estimate incorrect: ${rollingEstimate}`)
  await clickText('Start studying')
  await waitFor(`!!document.querySelector('.flashcard-surface')`, 'first cumulative study round')
  const knownAnswers = {}
  const card1 = await evaluate(`document.querySelector('.flashcard-side-label').textContent.trim()`)
  await evaluate(`document.querySelector('.flashcard-surface').click()`)
  await waitFor(`document.querySelector('.flashcard-surface')?.innerText.includes('ACCEPTED ANSWERS')`, 'first test card answers')
  knownAnswers[card1.replace('QUESTION ', '')] = await evaluate(`[...document.querySelectorAll('.flashcard-surface li')].map(e=>e.textContent.trim())`)
  await evaluate(`document.querySelector('.flashcard-surface').click()`)
  await clickText('Test yourself')
  if (!(await waitBrief(`!!document.querySelector('.flash-test-view')`))) {
    const state = await evaluate(`({exists:!!document.querySelector('.flash-test-callout .button-primary'),disabled:document.querySelector('.flash-test-callout .button-primary')?.disabled,errors:document.querySelector('.flash-error')?.innerText||document.querySelector('.error-banner')?.innerText||''})`)
    if (!state.exists || state.disabled) throw new Error(`Touch did not start the test and fallback is unavailable: ${JSON.stringify({state, runtimeErrors})}`)
    await evaluate(`document.querySelector('.flash-test-callout .button-primary').click()`)
  }
  await waitFor(`!!document.querySelector('.flash-test-view')`, 'first timed practice round')
  const noKeyBeforeConfirm = await evaluate(`!document.querySelector('.flash-test-view').innerText.includes('Accepted answers:')`)
  if (!noKeyBeforeConfirm) throw new Error('Practice answer key was exposed before confirmation')
  const firstQuestion = await evaluate(`document.querySelector('.flash-test-question h1')?.textContent.trim()`)
  if (!firstQuestion || !(await evaluate(`document.querySelector('.flash-test-view').innerText.includes('QUESTION 1 OF 1')`))) throw new Error('The first timed question heading/ordinal is missing')
  const pickOption = async (questionNumber, expectedCorrect) => {
    const options = await evaluate(`([...document.querySelectorAll('.flash-answer-option')].map(label=>({text:label.querySelector('span')?.textContent.trim()||'',value:label.querySelector('input')?.value||''})))`)
    const answers = knownAnswers[String(questionNumber)] ?? []
    const normalize = value => value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '')
    const accepted = new Set(answers.map(normalize))
    const matches = options.filter(option => accepted.has(normalize(option.text)))
    const chosen = expectedCorrect ? matches[0] : options.find(option => !accepted.has(normalize(option.text)))
    if (!chosen || (expectedCorrect && matches.length !== 1)) throw new Error(`Could not safely identify a ${expectedCorrect ? 'correct' : 'incorrect'} option for question ${questionNumber}`)
    await evaluate(`(() => {const i=[...document.querySelectorAll('.flash-answer-option input')].find(input=>input.value===${JSON.stringify(chosen.value)});i.click()})()`)
  }
  await pickOption(Number(card1.replace('QUESTION ', '')), true)
  await clickText('Confirm answer')
  await waitFor(`!!document.querySelector('.flash-outcome.correct, .flash-outcome.incorrect')`, 'durably acknowledged first outcome', 20000)
  if (!(await evaluate(`!!document.querySelector('.flash-outcome.correct')`))) throw new Error('The first test answer was not recorded as correct')
  if (!(await evaluate(`document.querySelector('.flash-test-view').innerText.includes('QUESTION 1 OF 1')`))) throw new Error('Acknowledged test question ordinal changed before Continue')
  await clickText('Continue')
  await waitFor(`!!document.querySelector('.flash-results')`, 'first rolling test result')
  const result1 = await evaluate(`document.querySelector('.flash-result-stats').innerText`)
  if (!/Correct|Incorrect|Skipped/u.test(result1)) throw new Error(`First-round outcome missing: ${result1}`)
  await clickText('Study next round')
  await waitFor(`!!document.querySelector('.flashcard-surface') && document.querySelector('.flash-study-top').innerText.includes('CARD 1 OF 2')`, 'cumulative round review from the first card')
  await clickText('Next card')
  const card2 = await evaluate(`document.querySelector('.flashcard-side-label').textContent.trim()`)
  await evaluate(`document.querySelector('.flashcard-surface').click()`)
  await waitFor(`document.querySelector('.flashcard-surface')?.innerText.includes('ACCEPTED ANSWERS')`, 'second test card answers')
  knownAnswers[card2.replace('QUESTION ', '')] = await evaluate(`[...document.querySelectorAll('.flashcard-surface li')].map(e=>e.textContent.trim())`)
  await evaluate(`document.querySelector('.flashcard-surface').click()`)
  await clickText('Previous')
  await clickText('Test yourself')
  await waitFor(`!!document.querySelector('.flash-test-view')`, 'second cumulative timed test')
  await pickOption(Number(card1.replace('QUESTION ', '')), true)
  await clickText('Confirm answer')
  await waitFor(`!!document.querySelector('.flash-outcome.correct, .flash-outcome.incorrect')`, 'second round first acknowledgement', 20000)
  if (!(await evaluate(`!!document.querySelector('.flash-outcome.correct')`))) throw new Error('The second round first answer was not recorded as correct')
  await clickText('Continue')
  await waitFor(`!!document.querySelector('.flash-test-question')`, 'second round second question')
  await pickOption(Number(card2.replace('QUESTION ', '')), false)
  await clickText('Confirm answer')
  await waitFor(`!!document.querySelector('.flash-outcome.incorrect')`, 'durably acknowledged incorrect answer', 20000)
  if (!(await evaluate(`document.querySelector('.flash-test-view').innerText.includes('QUESTION 2 OF 2')`))) throw new Error('The second test question ordinal is incorrect')
  await clickText('Continue')
  await waitFor(`!!document.querySelector('.flash-results')`, 'final cumulative test results')
  const finalStats = await evaluate(`document.querySelector('.flash-result-stats').innerText`)
  if (!finalStats.includes('Incorrect') || !finalStats.includes('Correct')) throw new Error(`Distinct correct/incorrect outcomes missing from final results: ${finalStats}`)
  await clickText('Return to my hub')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'hub after flashcards')
  const cardCount = await evaluate(`document.querySelectorAll('.stat-card strong')[2]?.textContent.trim()`)
  if (!cardCount || Number(cardCount) < 2) throw new Error(`Expected the distinct Question 1 and Question 2 cards to be reviewed, got ${cardCount}`)
  const flashHistorySummary = await evaluate(`document.querySelectorAll('.stat-card')[1]?.innerText`)
  if (!flashHistorySummary.includes('3 presentations') || !flashHistorySummary.includes('2 unique questions') || !flashHistorySummary.includes('1 incorrect')) throw new Error(`Saved flash-test history summary is incomplete: ${flashHistorySummary}`)

  await clickText('Quick Quiz')
  await clickText('Reveal answers')
  const questionInfoButton = await evaluate(`!!document.querySelector('.info-button')`)
  if (!questionInfoButton) throw new Error('Question information control is missing')
  await evaluate(`document.querySelector('.info-button').click()`)
  await waitFor(`!!document.querySelector('.info-bubble')`, 'question information bubble')
  const bubbleHeading = await evaluate(`document.querySelector('.info-bubble').textContent.includes('IMPORTANT NOTICE FOR THIS QUESTION')`)
  if (!bubbleHeading) throw new Error('Question bubble lacks the required heading')
  await new Promise(resolve => setTimeout(resolve, 4800))
  let bubbleState = await evaluate(`({visible:!!document.querySelector('.info-bubble'),fading:document.querySelector('.info-bubble')?.classList.contains('fading')})`)
  if (!bubbleState.visible || bubbleState.fading) throw new Error('Question bubble did not stay fully visible for approximately five seconds')
  await new Promise(resolve => setTimeout(resolve, 350))
  bubbleState = await evaluate(`({visible:!!document.querySelector('.info-bubble'),fading:document.querySelector('.info-bubble')?.classList.contains('fading')})`)
  if (!bubbleState.visible || !bubbleState.fading) throw new Error('Question bubble did not enter its fade state after five seconds')
  await new Promise(resolve => setTimeout(resolve, 400))
  if (await evaluate(`!!document.querySelector('.info-bubble')`)) throw new Error('Question bubble did not close after its fade')
  await clickText('I knew it')
  await waitFor(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Next question'))`, 'completed one-shot self-check')
  const disabledRepeat = await evaluate(`![...document.querySelectorAll('button')].some(b=>b.textContent.includes('I knew it'))`)
  if (!disabledRepeat) throw new Error('Self-check could be submitted more than once for a displayed question')
  await clickText('Next question')
  await clickText('My hub')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'scored hub')
  const score = await evaluate(`document.querySelector('.score-card strong')?.textContent.replace(/\\s+/g,' ').trim()`)
  if (!score?.replace(/\s+/g,'').includes('1/1')) throw new Error(`Self-check aggregate missing: ${score}`)

  // Reload proves that no code was stored client-side; retain only this local
  // process variable and manually re-enter it through the normal flow.
  await cdp('Page.navigate', { url: base })
  await waitFor(`!!document.querySelector('.notice-layout')`, 'initial screen after reload')
  const storage = await evaluate(`localStorage.length+sessionStorage.length`)
  if (storage !== 0) throw new Error('Recovery capability was stored in browser storage')
  await clickText('Resume previous session')
  await waitFor(`!!document.querySelector('#recovery-code')`, 'manual recovery-code entry')
  const inputPoint = await evaluate(`(() => {const r=document.querySelector('#recovery-code').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: inputPoint.x, y: inputPoint.y, radiusX: 2, radiusY: 2, force: 1 }] })
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp('Input.insertText', { text: recoveryCode })
  await clickText('Continue to my hub')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'resumed hub', 20000)
  const resumed = await evaluate(`({score:document.querySelector('.score-card strong')?.textContent.replace(/\\s+/g,' ').trim(),cards:document.querySelectorAll('.stat-card strong')[2]?.textContent.trim(),practice:document.querySelectorAll('.stat-card')[1]?.innerText,written:document.querySelectorAll('.learning-mode-total')[1]?.innerText||''})`)
  if (!resumed.score?.replace(/\s+/g,'').includes('1/1') || resumed.cards !== cardCount) throw new Error(`Resume lost aggregate progress: ${JSON.stringify({ ...resumed, expectedCards: cardCount })}`)
  if (!resumed.practice.includes('3 presentations') || !resumed.practice.includes('2 unique questions') || !resumed.practice.includes('1 incorrect')) throw new Error(`Resume lost flash-test outcomes: ${resumed.practice}`)
  if (!resumed.written.includes('2 correct') || !resumed.written.includes('2 incorrect') || !resumed.written.includes('2 skipped') || !resumed.written.includes('6 presentations')) throw new Error(`Resume lost written outcomes: ${resumed.written}`)
  verifierList.push(createHash('sha256').update(recoveryCode, 'utf8').digest('hex'))

  // Exercise the second cohort and sole nonvoting/at-large district in the UI.
  await clickText('Return to home')
  await clickText('Continue')
  await clickText('Continue')
  await clickText('New session')
  await waitFor(`!!document.querySelector('#cohort')`, 'second cohort selector')
  await setSelect('#cohort', '2008')
  await setSelect('#jurisdiction', 'AS')
  if (await evaluate(`!!document.querySelector('#district')`)) throw new Error('Sole district incorrectly asked for a manual choice')
  await evaluate(`document.querySelector('.setup-panel .full-button').click()`)
  await waitFor(`!!document.querySelector('.secret-code')`, 'second code screen')
  recoveryCode = await evaluate(`document.querySelector('.secret-code').textContent.trim()`)
  await clickText('I saved my code')
  await waitFor(`!!document.querySelector('.hub-layout')`, '2008 at-large hub')
  const atLarge = await evaluate(`({edition:document.querySelector('.stat-place')?.textContent, questions:document.querySelector('.activity-grid')?.textContent, district:document.querySelector('.session-dates')?.textContent})`)
  if (!atLarge.edition?.includes('2008') || !atLarge.edition.includes('Samoa')) throw new Error(`2008 at-large hub failed: ${JSON.stringify(atLarge)}`)
  await waitQuickQuestionReady('2008 reviewed Quick Question')
  await assertViewport(320, 740)
  await assertViewport(390, 844)
  await assertViewport(820, 1180)
  await assertViewport(1440, 1000)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await skipQuickQuestion()
  await anotherQuickQuestion()
  await clickText('Study Flash Cards')
  await waitFor(`!!document.querySelector('.flash-settings h1')`, '2008 flash-card settings ready')
  const atLargeBank = await evaluate(`document.querySelector('.flash-settings-footer')?.innerText.includes('100 official questions')`)
  if (!atLargeBank) throw new Error('At-large 2008 study bank did not load exactly 100 questions')
  await evaluate(`document.querySelector('input[name="flash-method"][value="range"]').click()`)
  await setInput('#flash-from', 1)
  await setInput('#flash-to', 1)
  await evaluate(`document.querySelector('.flash-options-group input[type="checkbox"]').click()`)
  await clickText('Start studying')
  await waitFor(`!!document.querySelector('.flashcard-surface')`, 'single 2008 flash card')
  await clickText('Test yourself')
  await waitFor(`!!document.querySelector('.flash-test-view')`, 'single-question 2008 timed test')
  await waitFor(`!!document.querySelector('.flash-outcome.skipped')`, 'actual 15-second timeout persisted as skipped', 19000)
  const timeoutFeedback = await evaluate(`({label:document.querySelector('.flash-outcome strong')?.textContent,ordinal:document.querySelector('.flash-test-view .flash-study-top')?.innerText})`)
  if (timeoutFeedback.label !== 'Skipped' || !timeoutFeedback.ordinal.includes('QUESTION 1 OF 1')) throw new Error(`Timeout was not acknowledged on the single-question test: ${JSON.stringify(timeoutFeedback)}`)
  await clickText('Continue')
  await waitFor(`!!document.querySelector('.flash-results')`, 'timed 2008 single-question results')
  const timeoutStats = await evaluate(`document.querySelector('.flash-result-stats').innerText`)
  if (!timeoutStats.includes('Skipped') || !timeoutStats.includes('1')) throw new Error(`Timed test results omitted skipped outcome: ${timeoutStats}`)
  await clickText('Return to my hub')
  await waitFor(`!!document.querySelector('.hub-layout')`, '2008 hub after timed test')
  const timedHistory = await evaluate(`document.querySelectorAll('.stat-card')[1]?.innerText`)
  if (!timedHistory.includes('1 skipped') || !timedHistory.includes('1 presentation') || !timedHistory.includes('1 unique question')) throw new Error(`Persisted timeout totals missing from the 2008 hub: ${timedHistory}`)
  verifierList.push(createHash('sha256').update(recoveryCode, 'utf8').digest('hex'))
  console.log(JSON.stringify({ ok: true, checks: ['touch-driven new session and study/test actions + real Supabase hub', 'Quick Question: no impression writes, >15-second untimed response, correct/incorrect/skipped feedback, sparse partial multi-answer, reordered concepts, no immediate repeat, double-submit guard, transient retry reuses attempt UUID, minimal outcome-only payload', 'Quick Question long accepted-answer layout at 320px and 320/390/820/1440px in both cohorts', 'settings help by tap, flash-card flip/source/date, and rolling cumulative rounds', 'known correct and incorrect outcomes + actual 15-second timeout persisted as skipped', 'quiz single self-check + aggregate score', 'five-second question bubble/fade', '320/390/820/1440px overflow and privacy', 'reload + manual code resume with scores restored', 'keyboard focus managed by view headings', 'second 2008 cohort + Samoa at-large session'], verifiers: verifierList, screenshots: { phone: phoneShot ?? null, desktop: desktopShot ?? null, notice: noticeShot ?? null, settings: settingsShot ?? null, card: cardShot ?? null } }))
} catch (error) {
  if (recoveryCode) verifierList.push(createHash('sha256').update(recoveryCode, 'utf8').digest('hex'))
  if (error instanceof Error && error.message === 'QUICK_QUESTION_DIAGNOSTIC_COMPLETE') {
    console.log(JSON.stringify({ ok: true, diagnostic: quickDiagnostic, verifiers: [...new Set(verifierList)], screenshots: { phone: phoneShot ?? null, desktop: desktopShot ?? null, notice: noticeShot ?? null } }))
  } else {
    console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : 'browser flow failed', verifiers: [...new Set(verifierList)], screenshots: { phone: phoneShot ?? null, desktop: desktopShot ?? null, notice: noticeShot ?? null, settings: settingsShot ?? null, card: cardShot ?? null } }))
    process.exitCode = 1
  }
} finally {
  socket.close()
  await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`)
}
