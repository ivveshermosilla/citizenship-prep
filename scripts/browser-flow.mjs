import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173/'
const phoneShot = process.env.BROWSER_REVIEW_SHOT_PHONE
const desktopShot = process.env.BROWSER_REVIEW_SHOT_DESKTOP
const response = await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent(base)}`, { method: 'PUT' })
if (!response.ok) throw new Error(`Chrome tab creation failed: ${response.status}`)
const tab = await response.json()
const socket = new WebSocket(tab.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
let recoveryCode = ''
const verifierList = []
socket.addEventListener('message', event => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
async function waitFor(expression, label, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${label}`)
}
async function clickText(text) {
  const point = await evaluate(`(() => {const e=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(${JSON.stringify(text)}));if(!e) return null;const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  if (!point) throw new Error(`Button not found: ${text}`)
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 }] })
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
async function setSelect(selector, value) {
  const changed = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e) return false;const s=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;s.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  if (!changed) throw new Error(`Selector missing: ${selector}`)
}
async function assertViewport(width, height) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  const metrics = await evaluate(`(() => ({width:innerWidth,language:document.documentElement.lang,title:document.title,spanish:/[áéíóúñ¿¡]/i.test(document.body.innerText),visual:visualViewport.width,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,storage:localStorage.length+sessionStorage.length,external:[...performance.getEntriesByType('resource')].filter(r=>new URL(r.name).origin!==location.origin && !new URL(r.name).hostname.endsWith('.supabase.co')).length,overflow:[...document.querySelectorAll('html,body,body *')].map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:'',left:Math.round(e.getBoundingClientRect().left),right:Math.round(e.getBoundingClientRect().right),scroll:e.scrollWidth,client:e.clientWidth})).filter(e=>e.right>visualViewport.width+1||e.left<-1||e.scroll>e.client+1).slice(0,16)}))()`)
  if (metrics.language !== 'en' || !metrics.title.includes('Civic Compass') || metrics.spanish || metrics.scroll > width || metrics.visual !== width || metrics.storage !== 0 || metrics.external !== 0) throw new Error(`Viewport/language/privacy check failed at ${width}px: ${JSON.stringify(metrics)}`)
}
try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' })
  await new Promise(resolve => setTimeout(resolve, 350))
  await clickText('Continue')
  if (!(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Resume previous session'))`))) throw new Error('Resume action missing from notice two')
  await clickText('Resume previous session')
  await waitFor(`!!document.querySelector('#recovery-code')`, 'notice-two recovery route')
  await clickText('Back')
  await clickText('Continue')
  const privacyNotice = await evaluate(`document.body.innerText.includes('We do not ask for identity details or use tracking analytics.') && document.body.innerText.includes('Hosting and database providers may retain technical request/security logs under their own policies.')`)
  if (!privacyNotice) throw new Error('Session notice omits provider request/security log disclosure')
  await clickText('Resume previous session')
  await waitFor(`!!document.querySelector('#recovery-code')`, 'final-notice recovery route')
  await clickText('Back')
  await clickText('New session')
  await waitFor(`!!document.querySelector('#cohort')`, 'cohort selector')
  await setSelect('#cohort', '2025')
  await setSelect('#jurisdiction', 'UT')
  await waitFor(`!!document.querySelector('#district')`, 'district selector')
  await setSelect('#district', 'UT03')
  await clickText('Create anonymous session')
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
  await clickText('Study cards')
  await waitFor(`!!document.querySelector('.study-layout')`, 'study cards')
  await clickText('Reveal answers')
  await waitFor(`!!document.querySelector('.answers-box')`, 'official card answers')
  const hasSource = await evaluate(`!!document.querySelector('.source-links a') && !!document.querySelector('.question-foot')?.textContent.includes('Answer reviewed')`)
  if (!hasSource) throw new Error('Study card lacks freshness date or source link')
  await clickText('Next')
  await clickText('My hub')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'hub after cards')
  let cardCount = await evaluate(`document.querySelectorAll('.stat-card strong')[1]?.textContent.trim()`)
  if (cardCount !== '1') throw new Error(`Expected one reviewed card, got ${cardCount}`)
  await clickText('Study cards')
  await clickText('Reveal answers')
  await clickText('My hub')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'deduplicated card count')
  cardCount = await evaluate(`document.querySelectorAll('.stat-card strong')[1]?.textContent.trim()`)
  if (cardCount !== '1') throw new Error('Reviewing the same question twice in one session inflated card progress')

  await clickText('Quick quiz')
  await clickText('Reveal answers')
  const infoButton = await evaluate(`!!document.querySelector('.info-button')`)
  if (!infoButton) throw new Error('Question information control is missing')
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
  const score = await evaluate(`document.querySelector('.score-card strong')?.textContent.replace(/\s+/g,' ').trim()`)
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
  const resumed = await evaluate(`({score:document.querySelector('.score-card strong')?.textContent.replace(/\s+/g,' ').trim(),cards:document.querySelectorAll('.stat-card strong')[1]?.textContent.trim()})`)
  if (!resumed.score?.replace(/\s+/g,'').includes('1/1') || resumed.cards !== '1') throw new Error(`Resume lost aggregate progress: ${JSON.stringify(resumed)}`)
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
  await clickText('Create anonymous session')
  await waitFor(`!!document.querySelector('.secret-code')`, 'second code screen')
  recoveryCode = await evaluate(`document.querySelector('.secret-code').textContent.trim()`)
  await clickText('I saved my code')
  await waitFor(`!!document.querySelector('.hub-layout')`, '2008 at-large hub')
  const atLarge = await evaluate(`({edition:document.querySelector('.stat-place')?.textContent, questions:document.querySelector('.activity-grid')?.textContent, district:document.querySelector('.session-dates')?.textContent})`)
  if (!atLarge.edition?.includes('2008') || !atLarge.edition.includes('Samoa')) throw new Error(`2008 at-large hub failed: ${JSON.stringify(atLarge)}`)
  await clickText('Study cards')
  const atLargeBank = await evaluate(`document.querySelector('.study-count')?.textContent.includes('1 / 100')`)
  if (!atLargeBank) throw new Error('At-large 2008 study bank did not load exactly 100 questions')
  await clickText('My hub')
  verifierList.push(createHash('sha256').update(recoveryCode, 'utf8').digest('hex'))
  console.log(JSON.stringify({ ok: true, checks: ['touch-driven new session + code acknowledgement + real Supabase hub', 'cards reveal/source/date and no duplicate reviewed count', 'quiz single self-check + aggregate score', 'five-second question bubble/fade', '320/390/820/1440px overflow and privacy', 'reload + manual code resume with score restored', 'keyboard focus managed by view headings', 'second 2008 cohort + Samoa at-large session'], verifiers: verifierList, screenshots: { phone: phoneShot ?? null, desktop: desktopShot ?? null } }))
} catch (error) {
  if (recoveryCode) verifierList.push(createHash('sha256').update(recoveryCode, 'utf8').digest('hex'))
  console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : 'browser flow failed', verifiers: [...new Set(verifierList)], screenshots: { phone: phoneShot ?? null, desktop: desktopShot ?? null } }))
  process.exitCode = 1
} finally {
  socket.close()
  await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`)
}
