// Match & Learn browser QA. Uses system Chrome's existing loopback CDP port and
// the project's live Supabase project. Recovery codes stay in this process.
import { createHash } from 'node:crypto'

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173/'
const screenshotPaths = {
  settings: process.env.MATCHING_REVIEW_SHOT_SETTINGS,
  board: process.env.MATCHING_REVIEW_SHOT_BOARD,
  results: process.env.MATCHING_REVIEW_SHOT_RESULTS,
}
const response = await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent(base)}`, { method: 'PUT' })
if (!response.ok) throw new Error(`Chrome tab creation failed: ${response.status}`)
const tab = await response.json()
const socket = new WebSocket(tab.webSocketDebuggerUrl)
let nextId = 0
const pending = new Map()
const verifiers = []
const codes = []
let activeRecoveryCode = ''
function redactSensitiveText(value) {
  let safe = String(value)
  for (const code of [activeRecoveryCode, ...codes]) if (code) safe = safe.split(code).join('[redacted]')
  return safe.replace(/[A-Z0-9_-]{35,}/giu, '[redacted]')
}
const rpcAttempts = []
const metadataRequests = new Set()
const questionRequests = new Set()
const progressRequests = new Set()
let metadata = []
let questions = []
let latestProgress = null
let failFirstMatchingResponse = false
let interceptedResponse = false
let interceptedMatchingPostResponse = false
let failedMatchingPostResponseStatus = null
let runtimeErrors = []
let sawLeaveConfirmation = false

socket.addEventListener('message', event => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    const settle = pending.get(msg.id)
    pending.delete(msg.id)
    settle(msg)
  }
  if (msg.method === 'Runtime.exceptionThrown' && runtimeErrors.length < 6) {
    const details = msg.params.exceptionDetails
    const raw = details?.exception?.description?.split('\n')[0] ?? details?.text ?? 'Runtime exception'
    runtimeErrors.push(redactSensitiveText(String(raw).slice(0, 160)))
  }
  if (msg.method === 'Page.javascriptDialogOpening' && msg.params.type === 'confirm') {
    if (/Leave this unfinished round/i.test(msg.params.message ?? '')) sawLeaveConfirmation = true
    void cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
  }
  if (msg.method === 'Network.requestWillBeSent') {
    const request = msg.params.request
    if (request.method === 'POST' && request.url.endsWith('/rpc/get_practice_metadata')) { metadata = []; metadataRequests.add(msg.params.requestId) }
    if (request.method === 'POST' && request.url.endsWith('/rpc/get_practice_questions')) { questions = []; questionRequests.add(msg.params.requestId) }
    if (request.method === 'POST' && request.url.endsWith('/rpc/get_learning_progress')) { latestProgress = null; progressRequests.add(msg.params.requestId) }
    if (request.method === 'POST' && request.url.endsWith('/rpc/record_matching_round')) {
      try {
        const payload = JSON.parse(request.postData ?? '{}')
        rpcAttempts.push({
          requestId: msg.params.requestId,
          keys: Object.keys(payload).sort(),
          codeShapeValid: typeof payload.p_code === 'string' && payload.p_code.length === 43,
          codeMatchesSession: payload.p_code === activeRecoveryCode,
          roundId: typeof payload.p_round_id === 'string' ? payload.p_round_id : null,
          results: Array.isArray(payload.p_results) ? payload.p_results.map(item => ({
            question_number: Number.isSafeInteger(item?.question_number) ? item.question_number : null,
            outcome: ['correct', 'incorrect', 'skipped'].includes(item?.outcome) ? item.outcome : null,
            keys: item && typeof item === 'object' ? Object.keys(item).sort() : [],
          })) : null,
        })
      } catch {
        rpcAttempts.push({ requestId: msg.params.requestId, malformed: true })
      }
    }
  }
  if (msg.method === 'Fetch.requestPaused' && msg.params.responseStatusCode) {
    const isMatchingPost = msg.params.request?.method === 'POST'
      && msg.params.request?.url?.endsWith('/rpc/record_matching_round')
    if (failFirstMatchingResponse && !interceptedResponse && isMatchingPost) {
      interceptedResponse = true
      interceptedMatchingPostResponse = true
      failedMatchingPostResponseStatus = msg.params.responseStatusCode
      void cdp('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'Failed' }).catch(() => {})
    } else {
      void cdp('Fetch.continueResponse', { requestId: msg.params.requestId }).catch(() => {})
    }
  }
  if (msg.method === 'Network.loadingFinished') {
    const id = msg.params.requestId
    if (metadataRequests.delete(id)) void responseJson(id).then(value => { if (Array.isArray(value)) metadata = value }).catch(() => {})
    if (questionRequests.delete(id)) void responseJson(id).then(value => { if (Array.isArray(value)) questions = value }).catch(() => {})
    if (progressRequests.delete(id)) void responseJson(id).then(value => { latestProgress = value }).catch(() => {})
  }
})

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

function cdp(method, params = {}) {
  const id = ++nextId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out at ${method}`)) }, 10000)
    pending.set(id, msg => { clearTimeout(timeout); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result) })
  })
}

async function bringBlankTabToFront() {
  const response = await fetch('http://127.0.0.1:9223/json/new?about%3Ablank', { method: 'PUT' })
  if (!response.ok) throw new Error(`Chrome background-tab creation failed: ${response.status}`)
  const target = await response.json()
  const backgroundSocket = new WebSocket(target.webSocketDebuggerUrl)
  let commandId = 0
  const commands = new Map()
  backgroundSocket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && commands.has(message.id)) {
      const finish = commands.get(message.id)
      commands.delete(message.id)
      finish(message)
    }
  })
  await new Promise((resolve, reject) => {
    backgroundSocket.addEventListener('open', resolve, { once: true })
    backgroundSocket.addEventListener('error', reject, { once: true })
  })
  function backgroundCommand(method, params = {}) {
    const id = ++commandId
    backgroundSocket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { commands.delete(id); reject(new Error(`Background-tab CDP timed out at ${method}`)) }, 7000)
      commands.set(id, message => { clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve(message.result) })
    })
  }
  await backgroundCommand('Page.enable')
  await backgroundCommand('Page.bringToFront')
  return async () => {
    backgroundSocket.close()
    await fetch(`http://127.0.0.1:9223/json/close/${target.id}`)
  }
}

async function responseJson(requestId) {
  const { body, base64Encoded } = await cdp('Network.getResponseBody', { requestId })
  return JSON.parse(base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body)
}

async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) {
    const details = result.exceptionDetails
    const raw = details.exception?.description?.split('\n')[0] ?? details.text ?? 'Evaluation failed'
    throw new Error(`Page evaluation failed: ${redactSensitiveText(String(raw).slice(0, 160))}`)
  }
  return result.result.value
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitFor(expression, label, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 125))
  }
  const state = await evaluate(`({heading:document.querySelector('.shell h1')?.textContent?.trim()||'',testids:[...document.querySelectorAll('[data-testid]')].map(e=>e.dataset.testid).slice(-30),alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent.trim().slice(0,160))})`)
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify({ ...state, runtimeErrors })}`)
}

async function waitAnimations() {
  await evaluate(`(async()=>{const running=[...document.getAnimations()].filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getTiming().duration));if(running.length)await Promise.race([Promise.allSettled(running.map(a=>a.finished)),new Promise(r=>setTimeout(r,1200))]);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`)
}

async function activate(selector, mode = 'click') {
  await waitAnimations()
  const point = await evaluate(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({behavior:'instant',block:'center',inline:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const rect=e.getBoundingClientRect(),hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);if(!hit||!(hit===e||e.contains(hit)))return {blocked:true,tag:hit?.tagName||null};window.__matchingTouchHit=false;document.addEventListener('touchstart',event=>{if(event.target===e||e.contains(event.target))window.__matchingTouchHit=true},{capture:true,once:true});return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`)
  assert(point, `Missing target ${selector}`)
  assert(!point.blocked, `Target obscured at hit-test for ${selector}`)
  if (mode === 'touch') {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 }] })
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await new Promise(resolve => setTimeout(resolve, 220))
    assert(await evaluate('window.__matchingTouchHit===true'), `Touch did not reach ${selector}`)
  } else if (mode === 'keyboard') {
    const focused = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();return document.activeElement===e})()`)
    assert(focused, `Keyboard target did not receive focus: ${selector}`)
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await cdp('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 })
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  } else {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  }
}

async function activateText(text, mode = 'click') {
  const selector = await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(button=>button.textContent.includes(${JSON.stringify(text)}));if(!e)return null;e.dataset.matchingQaTarget='true';return '[data-matching-qa-target="true"]'})()`)
  assert(selector, `Missing button text ${text}`)
  await activate(selector, mode)
  await evaluate(`document.querySelector('[data-matching-qa-target="true"]')?.removeAttribute('data-matching-qa-target')`)
}

async function waitNode(predicate, label, timeout = 8000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function setValue(selector, value) {
  const ok = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;const set=Object.getOwnPropertyDescriptor(p,'value').set;set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  assert(ok, `Missing settings input ${selector}`)
}

async function typeQuestionCount(value) {
  await evaluate(`(()=>{const field=document.querySelector('[data-testid="matching-question-count"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(field,'');field.dispatchEvent(new Event('input',{bubbles:true}));field.focus()})()`)
  const cleared = await evaluate(`({value:document.querySelector('[data-testid="matching-question-count"]').value,invalid:document.querySelector('[data-testid="matching-question-count"]').getAttribute('aria-invalid'),disabled:document.querySelector('[data-testid="matching-start"]').disabled})`)
  assert(cleared.value === '' && cleared.invalid === 'true' && cleared.disabled, 'An incomplete numeric draft did not disable Preview safely')
  const typeAndCommit = async number => {
    await cdp('Input.insertText', { text: String(number) })
    await evaluate(`document.querySelector('[data-testid="matching-question-count"]').blur()`)
    return evaluate(`({value:document.querySelector('[data-testid="matching-question-count"]').value,slider:document.querySelector('[data-testid="matching-settings"] input[type="range"]').value,invalid:document.querySelector('[data-testid="matching-question-count"]').getAttribute('aria-invalid'),disabled:document.querySelector('[data-testid="matching-start"]').disabled})`)
  }
  const bounds = await evaluate(`(()=>{const field=document.querySelector('[data-testid="matching-question-count"]');return {min:Number(field.min),max:Number(field.max)}})()`)
  const alternate = value < bounds.max ? value + 1 : value - 1
  assert(alternate >= bounds.min && alternate !== value, 'Numeric count input has no adjacent valid value for a synchronization check')
  const alternateTyped = await typeAndCommit(alternate)
  assert(alternateTyped.value === String(alternate) && alternateTyped.slider === String(alternate)
    && alternateTyped.invalid === 'false' && !alternateTyped.disabled,
  `Typed numeric count did not validate and synchronize with its slider after blur: ${JSON.stringify(alternateTyped)}`)
  await evaluate(`(()=>{const field=document.querySelector('[data-testid="matching-question-count"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(field,'');field.dispatchEvent(new Event('input',{bubbles:true}));field.focus()})()`)
  assert(await evaluate(`document.querySelector('[data-testid="matching-start"]').disabled`), 'Clearing a previously valid count left Preview enabled')
  const typed = await typeAndCommit(value)
  assert(typed.value === String(value) && typed.slider === String(value) && typed.invalid === 'false' && !typed.disabled,
    `Typed numeric count did not restore the requested selection after blur: ${JSON.stringify(typed)}`)
}

async function assertViewport(width, height) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  const state = await evaluate(`(()=>({width:innerWidth,visual:visualViewport.width,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,storage:localStorage.length+sessionStorage.length,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.left<-1||r.right>visualViewport.width+1}).slice(0,8).map(e=>e.dataset.testid||e.tagName+'.'+String(e.className).slice(0,40))}))()`)
  assert(state.width === width && state.visual === state.client && state.scroll <= state.client && state.storage === 0,
    `Viewport/privacy layout failed at ${width}px: ${JSON.stringify(state)}`)
  return state
}

async function saveSafeScreenshot(path, requiredSelector) {
  if (!path) return
  assert(await evaluate(`!!document.querySelector(${JSON.stringify(requiredSelector)}) && !document.querySelector('.secret-code')`), 'Refusing screenshot outside safe Match & Learn content')
  const image = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(path, Buffer.from(image.data, 'base64'))
}

function hashCode(code) {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

async function enterNewSession(edition, jurisdiction, district = null) {
  await waitFor(`!!document.querySelector('.notice-layout')`, 'welcome notice')
  await activateText('Continue', 'touch')
  await waitFor(`document.querySelector('.step-label')?.textContent.includes('02 / 03')`, 'notice step two')
  await activateText('Continue')
  await waitFor(`document.querySelector('.step-label')?.textContent.includes('03 / 03')`, 'notice step three')
  await activateText('New session')
  await waitFor(`!!document.querySelector('#cohort')`, 'session setup')
  await setValue('#cohort', edition)
  await setValue('#jurisdiction', jurisdiction)
  if (district) { await waitFor(`!!document.querySelector('#district')`, 'district selector'); await setValue('#district', district) }
  if (!district && (jurisdiction === 'AS' || jurisdiction === 'DC')) {
    assert(!(await evaluate(`!!document.querySelector('#district')`)), `${jurisdiction} incorrectly rendered a congressional district selector`)
  }
  await activate('.setup-panel .full-button')
  await waitFor(`!!document.querySelector('.secret-code')`, 'recovery code')
  const code = await evaluate(`document.querySelector('.secret-code').textContent.trim()`)
  assert(typeof code === 'string' && code.length === 43, 'Recovery code format invalid')
  codes.push(code)
  activeRecoveryCode = code
  verifiers.push(hashCode(code))
  await activateText('I saved my code', 'touch')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'hub after code acknowledgement')
  return code
}

const normalize = value => value.normalize('NFKD').toLocaleLowerCase('en-US').replace(/\p{M}/gu, '').replace(/['’‘]/gu, '').replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/gu, ' ').trim()

function shuffleWith(random, values) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

function matchingFirstBoardForSeed(seed) {
  let state = seed >>> 0
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296 }
  const metadataByNumber = new Map(metadata.map(item => [item.question_number, item]))
  const uniqueQuestions = [...new Map(questions.map(question => [question.question_number, question])).values()]
  const eligible = uniqueQuestions.filter(question => {
    const item = metadataByNumber.get(question.question_number)
    if (!item || !Number.isSafeInteger(item.required_count) || item.required_count < 1 || item.required_count > 10
      || item.required_count > item.answer_groups.length || item.answer_groups.some(group => !group.key?.trim() || !group.display?.trim())) return false
    const keys = new Set(item.answer_groups.map(group => group.key))
    if (keys.size !== item.answer_groups.length) return false
    const ownerByAlias = new Map()
    for (const group of item.answer_groups) for (const alias of [group.display, ...group.aliases]) {
      const key = normalize(alias)
      if (!key) continue
      const owner = ownerByAlias.get(key)
      if (owner && owner !== group.key) return false
      ownerByAlias.set(key, group.key)
    }
    return true
  })
  const chosen = shuffleWith(random, eligible).slice(0, 12)
  const aliasesByNumber = new Map(chosen.map(question => {
    const item = metadataByNumber.get(question.question_number)
    return [question.question_number, new Set(item.answer_groups.flatMap(group => [group.display, ...group.aliases]).map(normalize).filter(Boolean))]
  }))
  const board = []
  const seenAliases = new Set()
  let tileCount = 0
  const overlaps = aliases => [...aliases].some(alias => seenAliases.has(alias))
  for (const question of chosen) {
    const aliases = aliasesByNumber.get(question.question_number)
    const required = metadataByNumber.get(question.question_number).required_count
    if (board.length < 4 && tileCount + required <= 10 && !overlaps(aliases)) {
      board.push(question)
      tileCount += required
      for (const alias of aliases) seenAliases.add(alias)
    }
  }
  return board
}

function findMixedBoardSeed() {
  for (let seed = 1; seed <= 100000; seed += 1) {
    const board = matchingFirstBoardForSeed(seed)
    if (board.length === 4
      && metadata.find(item => item.question_number === board[1].question_number)?.required_count === 1
      && board.slice(2).some(question => metadata.find(item => item.question_number === question.question_number)?.required_count > 1)) {
      return { seed, numbers: board.map(question => question.question_number) }
    }
  }
  return null
}

async function currentBoard() {
  await waitFor(`!!document.querySelector('[data-testid="matching-board"]')`, 'matching board')
  await waitAnimations()
  const board = await evaluate(`(()=>{const root=document.querySelector('[data-testid="matching-board"]');const questions=[...root.querySelectorAll('[data-testid^="matching-question-"]')].map(e=>{const testid=e.getAttribute('data-testid')||'';const n=Number(testid.split('-').at(-1));const progress=document.querySelector('[data-testid="matching-progress-'+n+'"]');return {number:n,label:e.innerText.trim(),aria:e.getAttribute('aria-label')||'',progress:progress?.innerText.trim()||progress?.getAttribute('aria-label')||''}});const tiles=[...root.querySelectorAll('[data-testid^="matching-tile-"]')].map(e=>({id:e.getAttribute('data-testid'),label:e.innerText.trim(),aria:e.getAttribute('aria-label')||'',disabled:e.disabled}));return {questions,tiles,text:root.innerText.slice(0,1200)}})()`)
  assert(board.questions.length > 0 && board.tiles.length > 0 && board.tiles.length <= 10, `Unsafe board cardinality: ${JSON.stringify({ q: board.questions.length, tiles: board.tiles.length })}`)
  assert(new Set(board.questions.map(q => q.number)).size === board.questions.length,
    `Repeated question on a board: ${JSON.stringify(board.questions.map(q => ({ number: q.number, aria: q.aria })))}`)
  for (const q of board.questions) {
    const match = q.aria.match(/(\d+) answers? placed/i) || q.progress.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i)
    assert(match, `Accessible answer progress missing for question ${q.number}`)
    const required = q.progress.split('/')[1]?.trim().split(' ')[0]
    q.placed = Number(q.progress.split('/')[0])
    q.required = Number(required)
    assert(Number.isSafeInteger(q.placed) && Number.isSafeInteger(q.required) && q.aria.includes(`Question ${q.number}:`),
      `Accessible answer progress missing for question ${q.number}`)
  }
  assert(board.tiles.length === board.questions.reduce((sum, q) => sum + q.required, 0), 'Board has missing or extra answer tiles')
  assert(metadata.length > 0, 'Board appeared before reviewed matching metadata loaded')
  const owners = board.tiles.map(tile => tileOwner(tile, board))
  assert(owners.every(owner => owner !== null), 'Board contains a tile with no unique accepted-answer owner')
  for (const question of board.questions) assert(owners.filter(owner => owner === question.number).length === question.required,
    `Board is missing reviewed answer tiles for question ${question.number}`)
  return board
}

function tileOwner(tile, board) {
  const normalized = normalize(tile.label)
  const owners = board.questions.filter(question => {
    const item = metadata.find(m => m.question_number === question.number)
    return item?.answer_groups.some(group => [group.display, ...group.aliases].some(alias => normalize(alias) === normalized))
  }).map(question => question.number)
  return owners.length === 1 ? owners[0] : null
}

async function selectPair(questionNumber, tile, mode = 'click') {
  const tileButton = tile.id
  const progressSelector = `[data-testid="matching-progress-${questionNumber}"]`
  const before = await evaluate(`(()=>{const text=document.querySelector(${JSON.stringify(progressSelector)})?.innerText||'';return Number(text.split('/')[0]||-1)})()`)
  assert(before >= 0, `Missing answer-slot counter for question ${questionNumber}`)
  await activate(`[data-testid="matching-question-${questionNumber}"]`, mode)
  await activate(`[data-testid="${tileButton}"]`, 'click')
  let after = { text: '', count: -1 }
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    after = await evaluate(`(()=>{const text=document.querySelector(${JSON.stringify(progressSelector)})?.innerText.trim()||'';return {text,count:Number(text.split('/')[0]||-1)}})()`)
    if (after.count === before + 1) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert(after.count === before + 1, `Question ${questionNumber} counter did not increment from ${before}: ${JSON.stringify(after)}`)
  assert(await evaluate(`document.querySelector('[data-testid="${tileButton}"]')?.disabled===true`), 'Assigned answer tile was not locked against reuse')
}

async function assignScoringCases(board, roundNumber, outcomeClasses) {
  assert(metadata.length > 0, 'Reviewed answer metadata was not observed from the app')
  const owners = board.tiles.map(tile => ({ tile, owner: tileOwner(tile, board) }))
  assert(owners.every(item => item.owner !== null), 'A displayed tile could not be tied uniquely to reviewed metadata')
  for (const question of board.questions) assert(owners.filter(item => item.owner === question.number).length === question.required,
    `Question ${question.number} does not have exactly its required reviewed answer tiles`)
  const first = board.questions[0]
  const firstTiles = owners.filter(item => item.owner === first.number).map(item => item.tile)
  assert(firstTiles.length >= first.required, `Correct-case tile set incomplete for question ${first.number}`)
  if (roundNumber <= 2 || (roundNumber > 2 && !outcomeClasses.has('correct'))) {
    for (const tile of firstTiles.slice(0, first.required)) await selectPair(first.number, tile, 'keyboard')
    // Assignment changes are available until submit and must release the tile.
    if (roundNumber === 1) {
      const firstRemove = `[data-testid="matching-remove-${first.number}-1"]`
      await waitFor(`!!document.querySelector(${JSON.stringify(firstRemove)})`, 'assigned-answer remove control')
      const tileId = owners.find(item => item.tile === firstTiles[0]).tile.id
      const tileTestId = `[data-testid="${tileId}"]`
      await activate(firstRemove)
      await waitFor(`!document.querySelector(${JSON.stringify(tileTestId)})?.disabled`, 'assignment removal releases its tile')
      assert(await evaluate(`!document.querySelector(${JSON.stringify(tileTestId)})?.disabled`), 'Removing an assignment did not release its tile')
      await selectPair(first.number, firstTiles[0], 'keyboard')
    }
    if (roundNumber === 1) {
      const extraTile = owners.find(item => item.owner !== first.number && !item.tile.disabled)?.tile
      if (extraTile) {
        const before = await evaluate(`document.querySelector('[data-testid="matching-progress-${first.number}"]').innerText`)
        await activate(`[data-testid="matching-question-${first.number}"]`)
        await activate(`[data-testid="${extraTile.id}"]`)
        await new Promise(resolve => setTimeout(resolve, 120))
        const after = await evaluate(`document.querySelector('[data-testid="matching-progress-${first.number}"]').innerText`)
        assert(before === after && !(await evaluate(`document.querySelector('[data-testid="${extraTile.id}"]')?.disabled`)),
          'A full question accepted an extra answer slot')
      }
    }
  }

  let wrongTarget = null
  let wrongTile = null
  const partialTarget = board.questions.find(q => q.required > 1 && q.number !== first.number && q.number !== board.questions[1]?.number)
  if (roundNumber === 1 || board.questions.length > 1) {
    wrongTarget = board.questions.find(q => q.number !== first.number)
    const candidates = owners.filter(item => item.owner !== wrongTarget?.number && item.owner !== partialTarget?.number
      && item.owner !== first.number && item.tile.id !== firstTiles[0]?.id)
    for (const item of candidates) {
      if (await evaluate(`!document.querySelector('[data-testid="${item.tile.id}"]')?.disabled`)) { wrongTile = item.tile; break }
    }
    if (wrongTarget && wrongTile && !(roundNumber === 2 && wrongTarget.number === first.number)) await selectPair(wrongTarget.number, wrongTile)
  }

  const partial = roundNumber === 1 ? partialTarget : null
  if (partial) {
    const own = owners.filter(item => item.owner === partial.number && item.tile.id !== wrongTile?.id)
    for (const item of own) {
      if (await evaluate(`!document.querySelector('[data-testid="${item.tile.id}"]')?.disabled`)) { await selectPair(partial.number, item.tile); break }
    }
  }
  const progress = await evaluate(`(()=>[...document.querySelectorAll('[data-testid^="matching-progress-"]')].map(e=>e.innerText.trim()||e.getAttribute('aria-label')||''))()`)
  assert(progress.every(text => /\d+\s*(?:of|\/)\s*\d+/.test(text) || /\d+\/\d+/.test(text)), 'Progress counters do not expose placed/required counts')
  const partialNumber = await evaluate(`(()=>{const candidates=${JSON.stringify(board.questions.filter(q => q.required > 1 && q.number !== first.number && q.number !== wrongTarget?.number).map(q => q.number))};return candidates.find(n=>document.querySelector('[data-testid="matching-progress-'+n+'"]')?.innerText.startsWith('1/'))||null})()`)
  const omittedNumbers = await evaluate(`(()=>{const nums=${JSON.stringify(board.questions.map(q => q.number))};return nums.filter(n=>document.querySelector('[data-testid="matching-progress-'+n+'"]')?.innerText.startsWith('0/'))})()`)
  return { first: first.number, second: board.questions.find(q => q.number !== first.number)?.number ?? null, partial: partialNumber, omitted: omittedNumbers }
}

async function submitAndRead(expectedCount) {
  const before = rpcAttempts.length
  assert(!(await evaluate(`!!document.querySelector('[data-testid="matching-next"]')`)), 'Next round was available before the current round saved')
  await activate('[data-testid="matching-submit"]', 'touch')
  await waitFor(`!!document.querySelector('[data-testid="matching-round-results"]') || !!document.querySelector('[data-testid="matching-retry"]')`, 'round submission/save state', 20000)
  if (failFirstMatchingResponse && interceptedResponse) {
    await waitFor(`!!document.querySelector('[data-testid="matching-retry"]')`, 'retry action after dropped response', 12000)
    await evaluate(`(()=>{const button=document.querySelector('[data-testid="matching-retry"]');if(!button)return false;button.click();button.click();return true})()`)
  }
  await waitFor(`!!document.querySelector('[data-testid="matching-round-results"]')`, 'saved round results', 20000)
  await new Promise(resolve => setTimeout(resolve, 250))
  const calls = rpcAttempts.slice(before)
  assert(calls.length >= 1, 'No POST to record_matching_round was observed')
  const unique = [...new Map(calls.map(call => [call.requestId, call])).values()]
  const permittedKeys = ['p_code', 'p_results', 'p_round_id']
  for (const call of unique) {
    assert(JSON.stringify(call.keys) === JSON.stringify(permittedKeys), `Matching request payload keys differ: ${JSON.stringify(call.keys)}`)
    assert(call.codeShapeValid && call.codeMatchesSession && call.roundId, 'Matching request did not use the in-memory session code and stable UUID')
    assert(Array.isArray(call.results) && call.results.length === expectedCount && call.results.every(row => row.keys.join(',') === 'outcome,question_number' && row.question_number && row.outcome), 'Matching request did not contain a complete minimal per-question result array')
  }
  if (failFirstMatchingResponse && interceptedResponse) {
    assert(unique.length === 2, `Lost-response retry issued ${unique.length} matching POSTs instead of exactly two`)
    assert(unique.every(call => call.roundId === unique[0].roundId && JSON.stringify(call.results) === JSON.stringify(unique[0].results)), 'Retry changed the UUID or immutable results')
    assert(new Set(unique[0].results.map(item => item.question_number)).size === expectedCount, 'Retry payload has repeated questions')
  }
  const savedState = await evaluate(`({visible:document.querySelector('[data-testid="matching-round-results"]').innerText,next:!!document.querySelector('[data-testid="matching-next"]'),view:!!document.querySelector('[data-testid="matching-view-results"]')})`)
  assert(savedState.next || savedState.view, 'Saved matching round offers neither Next round nor View results')
  const counts = Object.fromEntries(['correct', 'incorrect', 'skipped'].map(outcome => [outcome, unique[0].results.filter(item => item.outcome === outcome).length]))
  assert(counts.correct + counts.incorrect + counts.skipped === expectedCount, 'Question outcome totals do not sum to the round size')
  for (const outcome of ['correct', 'incorrect', 'skipped']) {
    const label = outcome[0].toUpperCase() + outcome.slice(1)
    assert(savedState.visible.includes(`${counts[outcome]} ${label}`), `Round summary does not report ${label}=${counts[outcome]}`)
  }
  return { calls: unique, visible: savedState.visible, next: savedState.next, view: savedState.view }
}

async function assertUntimedBoardReady(roundNumber) {
  await waitFor(`!!document.querySelector('[data-testid="matching-submit"]') && !document.querySelector('[data-testid="matching-submit"]').disabled`, `Untimed round ${roundNumber} Submit enabled`, 8000)
  const state = await evaluate(`(()=>({disabled:document.querySelector('[data-testid="matching-submit"]')?.disabled,timer:!!document.querySelector('[data-testid="matching-timer"]'),questions:[...document.querySelectorAll('[data-testid^="matching-question-"]')].map(e=>{const n=Number((e.getAttribute('data-testid')||'').split('-').at(-1));return {number:n,progress:document.querySelector('[data-testid="matching-progress-'+n+'"]')?.innerText.trim()||'',assigned:!!document.querySelector('[data-testid^="matching-remove-'+n+'-"]')}})}))()`)
  assert(state.disabled === false && !state.timer && state.questions.length > 0
    && state.questions.every(question => /^0\/\d+/.test(question.progress) && !question.assigned),
  `Untimed round ${roundNumber} did not reset to an enabled, empty board: ${JSON.stringify(state)}`)
}

async function runUntimedOnly() {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Page.bringToFront')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' })
  await enterNewSession('2025', 'UT', 'UT03')
  await waitFor(`!!document.querySelector('[data-testid="match-learn-entry"]')`, 'Match & Learn hub entry')
  await activate('[data-testid="match-learn-entry"]', 'touch')
  await waitFor(`!!document.querySelector('[data-testid="matching-settings"]')`, 'untimed matching settings')
  await setValue('[data-testid="matching-question-count"]', 12)
  await setValue('[data-testid="matching-round-size"]', 4)
  await setValue('[data-testid="matching-pace"]', 'untimed')
  await activate('[data-testid="matching-start"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-plan-summary"]')`, 'untimed plan summary')
  const summary = await evaluate(`document.querySelector('[data-testid="matching-plan-summary"]').innerText`)
  assert(/12/.test(summary) && /round/i.test(summary), `Untimed plan summary omitted the selected total or round count: ${summary}`)
  await activate('[data-testid="matching-start"]')

  const selected = []
  let boardCount = 0
  while (boardCount < 12) {
    const board = await currentBoard()
    boardCount += 1
    await assertUntimedBoardReady(boardCount)
    selected.push(...board.questions.map(question => question.number))
    const saved = await submitAndRead(board.questions.length)
    const savedNumbers = saved.calls[0].results.map(row => row.question_number).sort((a, b) => a - b)
    const visibleNumbers = board.questions.map(question => question.number).sort((a, b) => a - b)
    assert(JSON.stringify(savedNumbers) === JSON.stringify(visibleNumbers),
      `Untimed round ${boardCount} did not save exactly its visible questions: saved=${savedNumbers.length}, visible=${visibleNumbers.length}`)
    if (saved.view) break
    assert(saved.next, `Untimed round ${boardCount} did not expose Next or View results`)
    await activate('[data-testid="matching-next"]')
    await currentBoard()
    await assertUntimedBoardReady(boardCount + 1)
  }
  assert(boardCount >= 2 && selected.length === 12 && new Set(selected).size === 12,
    `Untimed plan did not save exactly 12 unique questions across multiple boards: boards=${boardCount}, selected=${selected.length}`)
  assert(await evaluate(`!!document.querySelector('[data-testid="matching-view-results"]')`), 'Last Untimed board did not expose View results')
  await activate('[data-testid="matching-view-results"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-final-results"]')`, 'untimed final review')
  const finalText = await evaluate(`document.querySelector('[data-testid="matching-final-results"]').innerText`)
  assert(/\b12 questions\b/i.test(finalText), `Untimed final results did not include exactly 12 questions: ${finalText.slice(0, 200)}`)
  await activate('[data-testid="matching-play-again"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-board"]')`, 'untimed Play again board')
  await assertUntimedBoardReady(1)
  assert(!await evaluate(`!!document.querySelector('[data-testid="matching-final-results"]')`), 'Untimed Play again retained the previous review')
  return { boards: boardCount, questions: selected.length }
}

async function run() {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Page.bringToFront')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' })
  const code = await enterNewSession('2025', 'UT', 'UT03')
  await waitFor(`!!document.querySelector('[data-testid="match-learn-entry"]')`, 'Match & Learn hub entry')
  await assertViewport(320, 740); await assertViewport(390, 844); await assertViewport(820, 1180); await assertViewport(1440, 1000)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await activate('[data-testid="match-learn-entry"]', 'touch')
  await waitFor(`!!document.querySelector('[data-testid="matching-settings"]')`, 'matching settings')
  const defaults = await evaluate(`(()=>({count:document.querySelector('[data-testid="matching-question-count"]')?.value,round:document.querySelector('[data-testid="matching-round-size"]')?.value,pace:document.querySelector('[data-testid="matching-pace"]')?.value,summary:document.querySelector('[data-testid="matching-plan-summary"]')?.innerText||'',controls:[...document.querySelectorAll('[data-testid="matching-settings"] input,[data-testid="matching-settings"] select')].map(e=>({type:e.type,min:e.min,max:e.max,value:e.value}))}))()`)
  assert(String(defaults.count) === '12' && String(defaults.round) === '4' && defaults.pace === 'standard', `Unexpected matching defaults: ${JSON.stringify(defaults)}`)
  assert(/timer|hidden/i.test(await evaluate(`document.querySelector('[data-testid="matching-settings"]').innerText`)), 'Settings do not disclose hidden-tab timer behavior')
  await saveSafeScreenshot(screenshotPaths.settings, '[data-testid="matching-settings"]')
  await typeQuestionCount(12)
  await setValue('[data-testid="matching-round-size"]', 4)
  await setValue('[data-testid="matching-pace"]', 'standard')
  const synchronizedCount = await evaluate(`({count:document.querySelector('[data-testid="matching-question-count"]').value,slider:document.querySelector('[data-testid="matching-settings"] input[type="range"]').value})`)
  assert(synchronizedCount.count === synchronizedCount.slider, 'Numeric question count and slider are not synchronized')
  const roundSizes = await evaluate(`([...document.querySelector('[data-testid="matching-round-size"]').options].map(o=>o.value))`)
  const countInput = await evaluate(`(()=>{const e=document.querySelector('[data-testid="matching-question-count"]');return {min:Number(e.min),max:Number(e.max)}})()`)
  assert(JSON.stringify(roundSizes) === JSON.stringify(['4', '5']) && countInput.min === 4 && countInput.max === 30,
    `Question selection bounds or round-size options differ: ${JSON.stringify({ roundSizes, countInput })}`)
  await waitNode(() => questions.length > 0 && metadata.length > 0, 'edition and jurisdiction content for deterministic board selection')
  const mixedBoardSeed = findMixedBoardSeed()
  assert(mixedBoardSeed, 'No real-data plan seed produced a four-question first board with a distinct multi-answer partial case')
  const seedClick = await evaluate(`(()=>{const button=document.querySelector('[data-testid="matching-start"]');if(!button)return false;let state=${mixedBoardSeed.seed}>>>0;const original=Math.random;Math.random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296};try{button.click();return true}finally{Math.random=original}})()`)
  assert(seedClick, 'Could not preview the deterministic real-data plan')
  await waitFor(`!!document.querySelector('[data-testid="matching-plan-summary"]')`, 'matching generated-round summary')
  const planSummary = await evaluate(`document.querySelector('[data-testid="matching-plan-summary"]').innerText`)
  assert(/\d+\s+round/i.test(planSummary) && /12/.test(planSummary), `Plan summary omits generated rounds or selected count: ${planSummary}`)
  await activate('[data-testid="matching-start"]')
  const plannedFirstBoard = await currentBoard()
  assert(JSON.stringify(plannedFirstBoard.questions.map(q => q.number)) === JSON.stringify(mixedBoardSeed.numbers),
    'Seeded first board did not match the deterministic plan derived from live question and metadata rows')
  await waitNode(() => metadata.length > 0, 'reviewed matching metadata')

  const outcomeClasses = new Set()
  let roundNumber = 0
  let requiredRetry = true
  const selectedRoundNumbers = []
  const primaryResults = []
  const primaryAssignments = new Map()
  let observedPartialSkip = false
  while (roundNumber < 12) {
    const board = await currentBoard()
    roundNumber += 1
    selectedRoundNumbers.push(...board.questions.map(q => q.number))
    assert(board.questions.length <= 4, 'Question-per-round setting was not applied')
    await saveSafeScreenshot(roundNumber === 1 ? screenshotPaths.board : undefined, '[data-testid="matching-board"]')
    if (roundNumber === 1) {
      const allowance = Math.ceil(board.questions.reduce((sum, question) => {
        const required = metadata.find(item => item.question_number === question.number)?.required_count
        assert(Number.isSafeInteger(required), `Missing reviewed answer count for question ${question.number}`)
        return sum + 22.5 + Math.max(0, required - 1) * 10
      }, 0))
      const timerText = await evaluate(`document.querySelector('[data-testid="matching-timer"]')?.innerText||''`)
      assert(timerText.includes(`${allowance} seconds allowed`), `Standard round allowance was inaccurate: expected ${allowance}`)
    }
    const assignedCases = await assignScoringCases(board, roundNumber, outcomeClasses)
    const assignedLabels = await evaluate(`(()=>{const numbers=${JSON.stringify(board.questions.map(question => question.number))};return Object.fromEntries(numbers.map(number=>[number,[...document.querySelectorAll('[data-testid^="matching-remove-'+number+'-"]')].map(button=>button.innerText.trim().replace(/\s*×$/u,'').trim())]))})()`)
    for (const [number, labels] of Object.entries(assignedLabels)) primaryAssignments.set(Number(number), labels)
    if (roundNumber === 1) assert(assignedCases.omitted.length > 0 && assignedCases.partial !== null,
      'First board needs a partially answered multi-part question and an omitted question')
    assert(!(await evaluate(`!!document.querySelector('[data-testid="matching-round-results"]') || !!document.querySelector('.matching-outcome')`)),
      'The board revealed correctness before submission')
    if (roundNumber === 1 && requiredRetry) {
      failFirstMatchingResponse = true
      await cdp('Fetch.enable', { patterns: [{ urlPattern: '*://*/rest/v1/rpc/record_matching_round', requestStage: 'Response' }] })
    }
    const submission = await submitAndRead(board.questions.length)
    for (const call of submission.calls) for (const row of call.results ?? []) outcomeClasses.add(row.outcome)
    primaryResults.push(...submission.calls[0].results)
    if (assignedCases.partial && submission.calls[0].results.some(row => row.question_number === assignedCases.partial && row.outcome === 'skipped')) observedPartialSkip = true
    if (roundNumber === 1) {
      const firstOutcomes = submission.calls[0].results
      assert(firstOutcomes.some(row => row.question_number === assignedCases.first && row.outcome === 'correct'), 'First board did not save an actual Correct outcome')
      assert(firstOutcomes.some(row => row.outcome === 'incorrect'), 'First board did not save an actual Incorrect outcome')
      assert(firstOutcomes.some(row => row.question_number === assignedCases.partial && row.outcome === 'skipped'), 'First board partial answer did not save as Skipped')
      assert(assignedCases.omitted.every(number => firstOutcomes.some(row => row.question_number === number && row.outcome === 'skipped')),
        'First board omitted answers did not save as Skipped')
    }
    if (roundNumber === 1 && requiredRetry) {
      assert(interceptedResponse && interceptedMatchingPostResponse && failedMatchingPostResponseStatus >= 200 && failedMatchingPostResponseStatus < 300,
        'A successful committed matching POST response was not dropped for retry')
      failFirstMatchingResponse = false
      await cdp('Fetch.disable')
      requiredRetry = false
    }
    assert(submission.calls[0].results.length === board.questions.length, 'Saved round count does not equal visible board question count')
    const next = await evaluate(`!!document.querySelector('[data-testid="matching-next"]')`)
    const view = await evaluate(`!!document.querySelector('[data-testid="matching-view-results"]')`)
    if (view) { assert(!next, 'Final round exposed Next instead of View results'); break }
    assert(next, 'Intermediate saved round omits Next round')
    await activate('[data-testid="matching-next"]')
  }
  assert(roundNumber <= 12, 'Round flow did not finish within bounded selected plan')
  assert(selectedRoundNumbers.length === 12 && new Set(selectedRoundNumbers).size === 12,
    `The selected plan repeated or omitted a question: count=${selectedRoundNumbers.length}, unique=${new Set(selectedRoundNumbers).size}`)
  await activate('[data-testid="matching-view-results"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-final-results"]')`, 'final matching results')
  const finalText = await evaluate(`document.querySelector('[data-testid="matching-final-results"]').innerText`)
  assert(/page|reload|navigate/i.test(finalText), 'Final review does not explain its page-local lifetime')
  assert(/correct|incorrect|skipped/i.test(finalText) && /%/.test(finalText), 'Final results omit outcome counts or percentage')
  assert(/\b12 questions\b/i.test(finalText), `Final results do not show exactly the selected question total: ${finalText.slice(0, 240)}`)
  const correctTotal = primaryResults.filter(row => row.outcome === 'correct').length
  const incorrectTotal = primaryResults.filter(row => row.outcome === 'incorrect').length
  const skippedTotal = primaryResults.filter(row => row.outcome === 'skipped').length
  const percentCorrect = Math.round(correctTotal / primaryResults.length * 100)
  assert(finalText.includes(`${correctTotal} Correct`) && finalText.includes(`${incorrectTotal} Incorrect`)
    && finalText.includes(`${skippedTotal} Skipped`) && finalText.includes(`${percentCorrect}% correct`)
    && correctTotal + incorrectTotal + skippedTotal === 12,
  'Final results counts or skipped-inclusive percentage differ from the saved question outcomes')
  await saveSafeScreenshot(screenshotPaths.results, '[data-testid="matching-final-results"]')
  assert(outcomeClasses.has('correct') && outcomeClasses.has('incorrect') && outcomeClasses.has('skipped'), `All scoring outcomes were not exercised: ${[...outcomeClasses]}`)
  const filterExpectations = {
    all: primaryResults.filter(row => row.outcome !== 'correct').length,
    incorrect: primaryResults.filter(row => row.outcome === 'incorrect').length,
    skipped: primaryResults.filter(row => row.outcome === 'skipped').length,
  }
  for (const filter of ['all', 'incorrect', 'skipped']) {
    await activate(`[data-testid="matching-filter-${filter}"]`)
    await waitAnimations()
    const filtered = await evaluate(`(()=>{const button=document.querySelector('[data-testid="matching-filter-${filter}"]');const rows=[...document.querySelectorAll('[data-testid^="matching-review-"]')];return {pressed:button?.getAttribute('aria-pressed'),count:rows.length,outcomes:rows.map(row=>row.querySelector('.matching-outcome')?.textContent.trim().toLowerCase()||'')}})()`)
    assert(filtered.pressed === 'true' && filtered.count === filterExpectations[filter], `${filter} review filter returned the wrong rows: ${JSON.stringify(filtered)}`)
    if (filter !== 'all') assert(filtered.outcomes.every(outcome => outcome === filter), `${filter} review filter included a different outcome`)
    else assert(filtered.outcomes.every(outcome => outcome === 'incorrect' || outcome === 'skipped'), 'All missed review included a Correct question')
  }
  const reviews = await evaluate(`(()=>[...document.querySelectorAll('[data-testid^="matching-review-"]')].map(e=>{const paragraphs=[...e.querySelectorAll('p')];return {number:Number(e.getAttribute('data-testid').split('-').at(-1)),your:paragraphs.find(p=>p.textContent.includes('Your matches'))?.innerText||'',accepted:paragraphs.find(p=>p.textContent.includes('One accepted answer set'))?.innerText||'',details:!!e.querySelector('details summary'),reviewed:e.querySelector('.matching-review-meta')?.innerText||'',sources:e.querySelectorAll('.source-links a').length}}))()`)
  if (outcomeClasses.has('incorrect') || outcomeClasses.has('skipped')) assert(reviews.length > 0, 'Missed-question results contain no page-local review rows')
  for (const row of reviews) assert(row.your.includes('Your matches') && row.accepted.includes('One accepted answer set')
    && row.accepted.trim().length > 'One accepted answer set'.length && row.details && row.reviewed.includes('Answer reviewed') && row.sources > 0,
  'Missed-question review omits selected matches, accepted set, alternatives, review date, or sources')
  for (const row of reviews) {
    const actual = primaryAssignments.get(row.number) ?? []
    const displayed = row.your.split('\n').slice(1).join('\n').trim()
    const expected = actual.length ? actual.join('; ') : 'No answers placed'
    assert(displayed.startsWith(expected), `Review did not show the actual selected answers for question ${row.number}`)
  }
  await activate('[data-testid="matching-change-settings"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-settings"]')`, 'Change settings returns to setup')
  assert(!(await evaluate(`!!document.querySelector('[data-testid="matching-final-results"]')`)), 'Change settings did not clear page-local review')
  await activateText('← My hub')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'hub after matching')
  await new Promise(resolve => setTimeout(resolve, 250))
  const recovered = await evaluate(`({text:document.body.innerText,storage:localStorage.length+sessionStorage.length})`)
  assert(recovered.storage === 0 && !recovered.text.includes(code), 'Recovery code or game answers leaked to browser storage or hub UI')
  // The code is retained only in memory here for safe resume; no raw value is logged.
  await cdp('Page.reload')
  await waitFor(`!!document.querySelector('.notice-layout')`, 'notice on reload')
  await activateText('Continue')
  await waitFor(`document.querySelector('.step-label')?.textContent.includes('02 / 03')`, 'resume notice step')
  await activateText('Continue')
  await waitFor(`document.querySelector('.step-label')?.textContent.includes('03 / 03')`, 'resume notice step three')
  const resume = await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Resume previous session')))?.textContent||''`)
  assert(resume.includes('Resume previous session'), 'Reload cannot access anonymous session recovery')
  await activateText('Resume previous session')
  await waitFor(`!!document.querySelector('#recovery-code')`, 'recovery code input')
  await evaluate(`(()=>{const e=document.querySelector('#recovery-code');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(code)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await activateText('Continue to my hub')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'resumed hub')
  await waitNode(() => latestProgress && Array.isArray(latestProgress.matching), 'matching progress recovery')
  assert(latestProgress?.matching && Array.isArray(latestProgress.matching), 'Saved matching history did not recover through get_learning_progress')
  const expectedSummary = Object.fromEntries(['correct', 'incorrect', 'skipped'].map(outcome => [outcome, primaryResults.filter(item => item.outcome === outcome).length]))
  const matchingHubText = await evaluate(`([...document.querySelectorAll('.learning-mode-total')].find(e=>e.querySelector('span')?.textContent.trim()==='Match & Learn')?.innerText)||''`)
  for (const outcome of ['correct', 'incorrect', 'skipped']) assert(matchingHubText.includes(`${expectedSummary[outcome]} ${outcome}`),
    `Hub did not recover Match & Learn ${outcome} totals: ${matchingHubText}`)
  assert(matchingHubText.includes(`${primaryResults.length} presentations`) && matchingHubText.includes(`${new Set(primaryResults.map(item => item.question_number)).size} unique questions`),
    'Hub did not recover Match & Learn presentation and unique-question totals')
  assert(outcomeClasses.has('correct') && outcomeClasses.has('incorrect') && outcomeClasses.has('skipped'), `Browser session exercised too few outcome classes: ${[...outcomeClasses]}`)
  assert(observedPartialSkip, 'A partially correct but incomplete multi-answer question was not scored as Skipped')
  for (const result of primaryResults) {
    const saved = latestProgress.matching.find(item => item.question_number === result.question_number)
    assert(saved && saved[`${result.outcome}_count`] === 1
      && ['correct', 'incorrect', 'skipped'].filter(outcome => outcome !== result.outcome).every(outcome => saved[`${outcome}_count`] === 0),
    `Recovered matching history duplicated or changed question ${result.question_number}`)
  }

  // Untimed mode has no deadline and remains active beyond the longest pace.
  await activate('[data-testid="match-learn-entry"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-settings"]')`, 'untimed matching settings')
  assert(!(await evaluate(`!!document.querySelector('[data-testid="matching-final-results"]')`)), 'Detailed review persisted after navigating away from Match & Learn')
  await setValue('[data-testid="matching-question-count"]', 12)
  await setValue('[data-testid="matching-round-size"]', 4)
  await setValue('[data-testid="matching-pace"]', 'untimed')
  await activate('[data-testid="matching-prioritize-missed"]')
  assert(await evaluate(`document.querySelector('[data-testid="matching-prioritize-missed"]').checked`), 'Prioritize missed option did not toggle')
  await activate('[data-testid="matching-start"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-plan-summary"]')`, 'untimed plan summary')
  await activate('[data-testid="matching-start"]')
  await currentBoard()
  assert(!(await evaluate(`!!document.querySelector('[data-testid="matching-timer"]')`)), 'Untimed round rendered a timer')
  const untimedWritesBefore = rpcAttempts.length
  await new Promise(resolve => setTimeout(resolve, 16000))
  assert(await evaluate(`!!document.querySelector('[data-testid="matching-board"]')`) && rpcAttempts.length === untimedWritesBefore,
    'Untimed round expired or submitted after 16 wall-clock seconds')
  const prioritizedNumbers = []
  let untimedBoardCount = 0
  while (true) {
    const board = await currentBoard()
    untimedBoardCount += 1
    prioritizedNumbers.push(...board.questions.map(question => question.number))
    await submitAndRead(board.questions.length)
    if (await evaluate(`!!document.querySelector('[data-testid="matching-view-results"]')`)) break
    await activate('[data-testid="matching-next"]')
  }
  const missedNumbers = new Set(primaryResults.filter(item => item.outcome !== 'correct').map(item => item.question_number))
  assert(prioritizedNumbers.length === 12 && new Set(prioritizedNumbers).size === 12
    && (missedNumbers.size >= 12 ? prioritizedNumbers.every(number => missedNumbers.has(number)) : [...missedNumbers].every(number => prioritizedNumbers.includes(number))),
  'Prioritize missed did not select the available saved missed questions first')
  assert(untimedBoardCount >= 2, `Untimed 12-question plan covered fewer than two boards: ${untimedBoardCount}`)
  await activate('[data-testid="matching-view-results"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-final-results"]')`, 'untimed final answer review')
  const beforeReplay = rpcAttempts.length
  await activate('[data-testid="matching-play-again"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-board"]')`, 'Play again immediately starts a new round')
  assert(!(await evaluate(`!!document.querySelector('[data-testid="matching-final-results"]')`)), 'Play again left the previous final review open')
  const replayBoard = await currentBoard()
  assert(replayBoard.questions.every(question => /^0\/\d+/.test(question.progress))
    && replayBoard.tiles.every(tile => !tile.disabled)
    && !(await evaluate(`!!document.querySelector('[data-testid^="matching-remove-"]')`)),
  'Play again did not reset counters, assignments, and available tiles')
  await activateText('← My hub')
  assert(sawLeaveConfirmation && rpcAttempts.length === beforeReplay, 'Leaving an unfinished replay did not confirm or invented a matching attempt')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'hub after untimed session')

  // This second session checks the 2008 edition's at-large jurisdiction and a
  // genuine elapsed wall-clock expiry (the timer is never synthetically moved).
  await activateText('Return to home')
  const secondCode = await enterNewSession('2008', 'AS')
  await waitFor(`document.querySelector('.stat-place')?.textContent.includes('2008') && document.querySelector('.stat-place')?.textContent.includes('Samoa')`, '2008 Samoa at-large hub')
  await activate('[data-testid="match-learn-entry"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-settings"]')`, 'Challenge settings')
  await setValue('[data-testid="matching-question-count"]', 4)
  await setValue('[data-testid="matching-round-size"]', 4)
  await setValue('[data-testid="matching-pace"]', 'challenge')
  await activate('[data-testid="matching-start"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-plan-summary"]')`, 'Challenge plan summary')
  await activate('[data-testid="matching-start"]')
  await waitNode(() => metadata.length > 0, '2008 reviewed matching metadata')
  const expiryBoard = await currentBoard()
  assert(expiryBoard.questions.length <= 4 && expiryBoard.tiles.length <= 10, 'Challenge round exceeds card/tile limits')
  const challengeAllowance = Math.ceil(expiryBoard.questions.reduce((sum, question) => {
    const required = metadata.find(item => item.question_number === question.number)?.required_count
    assert(Number.isSafeInteger(required), `Missing 2008 reviewed answer count for question ${question.number}`)
    return sum + 15 + Math.max(0, required - 1) * 10
  }, 0))
  const challengeTimerText = await evaluate(`document.querySelector('[data-testid="matching-timer"]')?.innerText||''`)
  assert(challengeTimerText.includes(`${challengeAllowance} seconds allowed`), `Challenge allowance was inaccurate: expected ${challengeAllowance}`)
  const initialTimer = await evaluate(`document.querySelector('[data-testid="matching-timer"]')?.getAttribute('aria-label')||''`)
  assert(/\d+ seconds remaining/.test(initialTimer), 'Challenge round does not show a real countdown')
  const restoreForegroundTab = await bringBlankTabToFront()
  try {
    const visibility = await evaluate('document.visibilityState')
    assert(visibility === 'hidden', `Opening another tab did not hide the matching tab: ${visibility}`)
    await new Promise(resolve => setTimeout(resolve, 2200))
  } finally { await restoreForegroundTab() }
  assert(await evaluate('document.visibilityState') === 'visible', 'Matching tab did not return to the foreground')
  const visibleTimer = await evaluate(`document.querySelector('[data-testid="matching-timer"]')?.getAttribute('aria-label')||''`)
  assert(Number(visibleTimer.match(/(\d+) seconds/)?.[1]) < Number(initialTimer.match(/(\d+) seconds/)?.[1]), 'Hidden-tab time did not continue to elapse')
  await waitFor(`!!document.querySelector('[data-testid="matching-round-results"]')`, 'real Challenge wall-clock expiry', 240000)
  const expiryText = await evaluate(`document.querySelector('[data-testid="matching-round-results"]')?.innerText||''`)
  assert(/Time expired/i.test(expiryText), 'Deadline did not automatically submit with expiry feedback')
  const expiryCall = rpcAttempts.at(-1)
  assert(expiryCall?.codeShapeValid && expiryCall.codeMatchesSession && expiryCall.results?.length === expiryBoard.questions.length
    && expiryCall.results.every(item => item.outcome === 'skipped'), 'Unanswered expiry was not saved as skipped in the second session')
  let challengeTotal = expiryBoard.questions.length
  while (await evaluate(`!!document.querySelector('[data-testid="matching-next"]')`)) {
    await activate('[data-testid="matching-next"]')
    const board = await currentBoard()
    challengeTotal += board.questions.length
    await submitAndRead(board.questions.length)
  }
  assert(challengeTotal === 4, `Challenge plan submitted ${challengeTotal} of four selected questions`)
  assert(await evaluate(`!!document.querySelector('[data-testid="matching-view-results"]')`), 'Final Challenge board omitted View results')
  await activate('[data-testid="matching-view-results"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-final-results"]')`, 'expiry final review')
  await activate('[data-testid="matching-my-hub"]')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'hub after timer expiry')
  assert(secondCode !== code, 'The 2008 test did not create an independent synthetic session')

  // D.C. has no district picker and uses the same matching contracts as a
  // state district session. Finish its small untimed plan to keep it safe.
  await activateText('Return to home')
  const dcCode = await enterNewSession('2025', 'DC')
  await waitFor(`document.querySelector('.stat-place')?.textContent.includes('2025') && document.querySelector('.stat-place')?.textContent.includes('District of Columbia')`, '2025 D.C. hub')
  await activate('[data-testid="match-learn-entry"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-settings"]')`, 'D.C. matching settings')
  await setValue('[data-testid="matching-question-count"]', 5)
  await setValue('[data-testid="matching-round-size"]', 5)
  await setValue('[data-testid="matching-pace"]', 'untimed')
  await activate('[data-testid="matching-start"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-plan-summary"]')`, 'D.C. matching plan')
  await activate('[data-testid="matching-start"]')
  await waitNode(() => metadata.length > 0, 'D.C. reviewed matching metadata')
  let dcQuestions = 0
  while (true) {
    const board = await currentBoard()
    dcQuestions += board.questions.length
    await submitAndRead(board.questions.length)
    if (await evaluate(`!!document.querySelector('[data-testid="matching-view-results"]')`)) break
    await activate('[data-testid="matching-next"]')
  }
  assert(dcQuestions === 5, `D.C. five-question round size did not include all five selected questions: ${dcQuestions}`)
  await activate('[data-testid="matching-view-results"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-final-results"]')`, 'D.C. final results')
  await activate('[data-testid="matching-my-hub"]')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'hub after D.C. matching')
  assert(dcCode !== code && dcCode !== secondCode, 'D.C. test did not use an independent synthetic session')
}

try {
  const untimedOnly = process.env.MATCHING_UNTIMED_ONLY === '1'
  await (untimedOnly ? runUntimedOnly() : run())
  console.log(JSON.stringify({
    ok: true,
    checks: untimedOnly ? [
      '12-question Untimed game saves each visible board across Next navigation',
      'Submit remains enabled with empty counters on every new Untimed board and after Play again',
      'final results include exactly 12 unique questions',
    ] : [
      'safe board cardinality, distinct questions, and unique reviewed metadata owners',
      'matching defaults, plan rounds, progress counters, keyboard and touch interaction',
      'correct/wrong/partial/skipped scoring, mutable assignments, locked save state and final review',
      'dropped response retries same UUID and immutable minimal outcomes without duplicate progress',
      'timed Standard and real Challenge expiry, continued background timer, and >15-second Untimed mode',
      '2025 UT03, 2008 Samoa at-large and D.C. cases, responsive layout, and saved progress recovery',
    ],
    matchingPostAttempts: rpcAttempts.length,
    syntheticVerifierSha256: [...new Set(verifiers)],
    screenshots: screenshotPaths,
  }))
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    message: error instanceof Error ? redactSensitiveText(error.message) : 'matching browser flow failed',
    matchingPostAttempts: rpcAttempts.length,
    syntheticVerifierSha256: [...new Set(verifiers)],
    screenshots: screenshotPaths,
  }))
  process.exitCode = 1
} finally {
  socket.close()
  await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`)
}
