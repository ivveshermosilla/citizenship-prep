// Focused real-input Match & Learn drag verification. Uses loopback CDP Chrome
// and one synthetic session; recovery codes and answer-bearing data stay in memory.
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:4173/'
const screenshots = {
  desktop: process.env.MATCHING_DRAG_SHOT_DESKTOP ?? '/tmp/citizenship-prep-matching-drag-desktop.png',
  phone: process.env.MATCHING_DRAG_SHOT_PHONE ?? '/tmp/citizenship-prep-matching-drag-phone.png',
  stress: process.env.MATCHING_DRAG_SHOT_STRESS ?? '/tmp/citizenship-prep-matching-drag-stress.png',
  activeDesktop: process.env.MATCHING_DRAG_SHOT_ACTIVE_DESKTOP ?? '/tmp/npa-matching-drag-active-desktop.png',
  activePhone: process.env.MATCHING_DRAG_SHOT_ACTIVE_PHONE ?? '/tmp/npa-matching-drag-active-phone.png',
}
for (const path of Object.values(screenshots)) if (!path.startsWith('/tmp/')) throw new Error('Drag screenshots must be saved under /tmp')
let savedActiveDesktop = false
let savedActivePhone = false

const tabResponse = await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' })
if (!tabResponse.ok) throw new Error(`Chrome tab creation failed: ${tabResponse.status}`)
const tab = await tabResponse.json()
const socket = new WebSocket(tab.webSocketDebuggerUrl)
let nextId = 0
const pending = new Map()
const codes = []
const verifierHashes = []
let activeCode = ''
const metadataRequests = new Set()
const questionRequests = new Set()
let metadata = []
let questions = []
const matchingPosts = []
let runtimeErrors = []

function hash(value) { return createHash('sha256').update(value, 'utf8').digest('hex') }
function redact(value) {
  let safe = String(value)
  for (const code of [activeCode, ...codes]) if (code) safe = safe.split(code).join('[redacted]')
  return safe.replace(/[A-Z0-9_-]{35,}/giu, '[redacted]')
}

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const settle = pending.get(message.id)
    pending.delete(message.id)
    settle(message)
  }
  if (message.method === 'Runtime.exceptionThrown' && runtimeErrors.length < 5) {
    const detail = message.params.exceptionDetails
    runtimeErrors.push(redact(detail?.exception?.description?.split('\n')[0] ?? detail?.text ?? 'Runtime exception').slice(0, 140))
  }
  if (message.method === 'Page.javascriptDialogOpening' && message.params.type === 'confirm') {
    void cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
  }
  if (message.method === 'Network.requestWillBeSent') {
    const request = message.params.request
    const requestId = message.params.requestId
    if (request.method === 'POST' && request.url.endsWith('/rpc/get_practice_metadata')) { metadata = []; metadataRequests.add(requestId) }
    if (request.method === 'POST' && request.url.endsWith('/rpc/get_practice_questions')) { questions = []; questionRequests.add(requestId) }
    if (request.method === 'POST' && request.url.endsWith('/rpc/record_matching_round')) {
      try {
        const payload = JSON.parse(request.postData ?? '{}')
        matchingPosts.push({
          keys: Object.keys(payload).sort(),
          codeHash: typeof payload.p_code === 'string' ? hash(payload.p_code) : null,
          codeMatchesSession: payload.p_code === activeCode,
          roundIdValid: typeof payload.p_round_id === 'string' && /^[0-9a-f-]{36}$/iu.test(payload.p_round_id),
          results: Array.isArray(payload.p_results) ? payload.p_results.map(row => ({
            question_number: Number.isSafeInteger(row?.question_number) ? row.question_number : null,
            outcome: ['correct', 'incorrect', 'skipped'].includes(row?.outcome) ? row.outcome : null,
            keys: row && typeof row === 'object' ? Object.keys(row).sort() : [],
          })) : null,
        })
      } catch {
        matchingPosts.push({ malformed: true })
      }
    }
  }
  if (message.method === 'Network.loadingFinished') {
    const requestId = message.params.requestId
    if (metadataRequests.delete(requestId)) void responseJson(requestId).then(value => { if (Array.isArray(value)) metadata = value }).catch(() => {})
    if (questionRequests.delete(requestId)) void responseJson(requestId).then(value => { if (Array.isArray(value)) questions = value }).catch(() => {})
  }
})

try {
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
} catch (error) {
  socket.close()
  await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`).catch(() => {})
  throw error
}

function cdp(method, params = {}) {
  const id = ++nextId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out at ${method}`)) }, 10000)
    pending.set(id, message => { clearTimeout(timeout); message.error ? reject(new Error(message.error.message)) : resolve(message.result) })
  })
}

async function responseJson(requestId) {
  const response = await cdp('Network.getResponseBody', { requestId })
  return JSON.parse(response.base64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body)
}

async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) {
    const detail = response.exceptionDetails
    throw new Error(`Page evaluation failed: ${redact(detail.exception?.description?.split('\n')[0] ?? detail.text ?? 'Evaluation failed').slice(0, 140)}`)
  }
  return response.result.value
}

function assert(condition, message) { if (!condition) throw new Error(message) }

async function waitFor(expression, label, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${label}; recent page errors=${runtimeErrors.join(' | ')}`)
}

async function waitNode(predicate, label, timeout = 12000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 80))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function waitLayout() {
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
}

async function pointFor(selector, scroll = true) {
  const point = await evaluate(`(async()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return null;if(${scroll})element.scrollIntoView({behavior:'instant',block:'center',inline:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const rect=element.getBoundingClientRect();const x=Math.max(rect.left+2,Math.min(rect.right-2,rect.left+rect.width/2));const y=Math.max(rect.top+2,Math.min(rect.bottom-2,rect.top+rect.height/2));const hit=document.elementFromPoint(x,y);return {x,y,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,hit:!!hit&&(hit===element||element.contains(hit)),width:innerWidth,height:innerHeight}})()`)
  assert(point, `Missing pointer target ${selector}`)
  assert(point.hit, `Pointer target failed hit-test: ${selector}`)
  return point
}

async function centerIfVisible(selector) {
  const point = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return null;const rect=element.getBoundingClientRect();const stickyBottom=document.querySelector('.matching-top')?.getBoundingClientRect().bottom||0;const left=Math.max(2,rect.left+2),right=Math.min(innerWidth-2,rect.right-2),top=Math.max(2,rect.top+2,stickyBottom+4),bottom=Math.min(innerHeight-2,rect.bottom-2);const x=left<right?(left+right)/2:Math.max(2,Math.min(innerWidth-2,rect.left+rect.width/2));const y=top<bottom?(top+bottom)/2:Math.max(2,Math.min(innerHeight-2,rect.top+rect.height/2));const hit=document.elementFromPoint(x,y);const hitQuestion=hit?.closest('[data-matching-question-number]')?.getAttribute('data-matching-question-number')||null;const expected=element.dataset.matchingQuestionNumber;return {x,y,top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,width:innerWidth,height:innerHeight,stickyBottom,hitQuestion,hitTag:hit?.tagName||null,hitClass:String(hit?.className||'').slice(0,40),visible:rect.bottom>top&&rect.top<innerHeight-1&&rect.right>1&&rect.left<innerWidth-1&&hitQuestion===expected}})()`)
  assert(point, `Missing drop target ${selector}`)
  return point
}

async function tap(selector) {
  const point = await pointFor(selector)
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: point.x, y: point.y, radiusX: 3, radiusY: 3, force: 1 }] })
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await waitLayout()
}

async function pressEnter(selector) {
  const focused = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return false;element.focus();return document.activeElement===element})()`)
  assert(focused, `Keyboard control did not receive focus: ${selector}`)
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await waitLayout()
}

async function pressEscape() {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await waitLayout()
}

async function mouseMove(x, y, buttons = 0) {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons, pointerType: 'mouse' })
}
async function mouseDown(x, y) {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0, pointerType: 'mouse' })
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' })
}
async function mouseUp(x, y) {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' })
}
async function touchStart(x, y) {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 41, x, y, radiusX: 5, radiusY: 5, force: 1 }] })
}
async function touchMove(x, y) {
  await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 41, x, y, radiusX: 5, radiusY: 5, force: 1 }] })
}
async function touchEnd() {
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
async function touchCancel() {
  await cdp('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
}

async function movePath(driver, from, to, steps = 5) {
  for (let step = 1; step <= steps; step += 1) {
    const fraction = step / steps
    const x = from.x + (to.x - from.x) * fraction
    const y = from.y + (to.y - from.y) * fraction
    await driver.move(x, y)
    await new Promise(resolve => setTimeout(resolve, 35))
  }
}

async function dragToQuestion(driverName, sourceSelector, targetNumber, { edgeScroll = false, hold = false } = {}) {
  const start = await pointFor(sourceSelector)
  const driver = driverName === 'touch'
    ? { start: touchStart, move: touchMove, end: touchEnd, cancel: touchCancel }
    : { start: mouseDown, move: (x, y) => mouseMove(x, y, 1), end: mouseUp, cancel: null }
  await driver.start(start.x, start.y)
  await new Promise(resolve => setTimeout(resolve, 40))
  let targetSelector = `[data-matching-question-number="${targetNumber}"]`
  let target = await centerIfVisible(targetSelector)
  const scrollBefore = await scrollState()
  let edgeSteps = 0
  let last = start
  if (edgeScroll || !target.visible) {
    const edgeX = target.left > target.width ? target.width - 3 : target.left + (target.right - target.left) / 2
    const edgeY = target.top < target.stickyBottom + 4 ? 3 : target.height - 3
    for (edgeSteps = 0; edgeSteps < 80 && !target.visible; edgeSteps += 1) {
      last = { x: Math.max(3, Math.min(target.width - 3, edgeX)), y: edgeY }
      await driver.move(last.x, last.y)
      await new Promise(resolve => setTimeout(resolve, 75))
      target = await centerIfVisible(targetSelector)
    }
  }
  assert(target.visible, `Question ${targetNumber} did not become reachable during the live drag`)
  const targetPoint = await centerIfVisible(targetSelector)
  assert(targetPoint.visible, `Question ${targetNumber} is outside the viewport after scrolling`)
  await movePath(driver, last, targetPoint)
  await waitFor(`!!document.querySelector('[data-testid="matching-drag-preview"]')`, `${driverName} drag preview`, 4000)
  try {
    await waitFor(`document.querySelector('[data-testid="matching-drag-preview"]')?.dataset.dropValid==='true' && document.querySelector('[data-matching-question-number="${targetNumber}"]')?.dataset.dragOver==='true'`, `valid preview over question ${targetNumber}`, 4000)
    await assertPreviewNearPointer(targetPoint)
    if (driverName === 'mouse' && !savedActiveDesktop) {
      await screenshot(screenshots.activeDesktop)
      savedActiveDesktop = true
    }
    if (driverName === 'touch' && hold && !savedActivePhone) {
      await screenshot(screenshots.activePhone)
      savedActivePhone = true
    }
  } catch (error) {
    const diagnostics = await pointerDiagnostics(targetNumber, targetPoint)
    if (await evaluate(`!!document.querySelector('[data-testid="matching-board"]') && !document.querySelector('.secret-code')`)) {
      const width = await evaluate('innerWidth')
      await screenshot(width < 600 ? screenshots.phone : screenshots.desktop)
    }
    throw new Error(`${error instanceof Error ? error.message : 'Drop target did not activate'}; safe pointer diagnostics=${JSON.stringify(diagnostics)}`)
  }
  if (hold) return { driver, start, target: targetPoint, scrollBefore, edgeSteps }
  await driver.end(targetPoint.x, targetPoint.y)
  await waitLayout()
  return { driver, start, target: targetPoint, scrollBefore, edgeSteps }
}

async function dragToPoint(driverName, sourceSelector, destination) {
  const start = await pointFor(sourceSelector)
  const driver = driverName === 'touch'
    ? { start: touchStart, move: touchMove, end: touchEnd, cancel: touchCancel }
    : { start: mouseDown, move: (x, y) => mouseMove(x, y, 1), end: mouseUp, cancel: null }
  await driver.start(start.x, start.y)
  await new Promise(resolve => setTimeout(resolve, 40))
  await movePath(driver, start, destination)
  await waitFor(`!!document.querySelector('[data-testid="matching-drag-preview"]')`, `${driverName} preview for invalid drop`, 4000)
  await waitFor(`document.querySelector('[data-testid="matching-drag-preview"]')?.dataset.dropValid==='false'`, 'invalid preview state', 4000)
  const target = await evaluate(`document.elementFromPoint(${destination.x},${destination.y})?.closest('[data-matching-question-number]')?.getAttribute('data-matching-question-number')||null`)
  assert(target === null, 'Outside-drop test point unexpectedly landed on a question')
  await driver.end(destination.x, destination.y)
  await waitLayout()
  return { driver, start }
}

async function dragToFullQuestion(sourceSelector, fullQuestionNumber) {
  const start = await pointFor(sourceSelector)
  const targetSelector = `[data-matching-question-number="${fullQuestionNumber}"]`
  const target = await centerIfVisible(targetSelector)
  assert(target.visible, `Full question ${fullQuestionNumber} is not visible for overflow test`)
  await mouseDown(start.x, start.y)
  await movePath({ move: (x, y) => mouseMove(x, y, 1) }, start, target)
  await waitFor(`document.querySelector('[data-testid="matching-drag-preview"]')?.dataset.dropValid==='false' && document.querySelector('${targetSelector}')?.dataset.dropEligible==='false'`, 'full target is visibly unavailable', 4000)
  await mouseUp(target.x, target.y)
  await waitLayout()
}

async function dragEscapeOnAssignedChip(selector, targetNumber) {
  const start = await pointFor(selector)
  const target = await centerIfVisible(`[data-matching-question-number="${targetNumber}"]`)
  assert(target.visible, `Escape target ${targetNumber} is not visible`)
  await mouseDown(start.x, start.y)
  await movePath({ move: (x, y) => mouseMove(x, y, 1) }, start, target)
  await waitFor(`document.querySelector('[data-testid="matching-drag-preview"]')?.dataset.dropValid==='true'`, 'assigned chip drag preview', 4000)
  await pressEscape()
  await waitFor(`!document.querySelector('[data-testid="matching-drag-preview"]')`, 'Escape clears assigned-chip preview', 4000)
  const returnToSource = await pointFor(selector, false)
  await mouseMove(returnToSource.x, returnToSource.y, 1)
  await new Promise(resolve => setTimeout(resolve, 900))
  await mouseUp(returnToSource.x, returnToSource.y)
  await new Promise(resolve => setTimeout(resolve, 120))
}

async function scrollState() {
  return evaluate(`(()=>{const scrollables=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+2).map((e,i)=>({key:e.dataset.testid||e.className?.toString().slice(0,30)||String(i),top:e.scrollTop,height:e.scrollHeight,client:e.clientHeight}));return {windowY:window.scrollY,docY:document.scrollingElement?.scrollTop||0,scrollables}})()`)
}

function hasScrollChanged(before, after) {
  if (before.windowY !== after.windowY || before.docY !== after.docY) return true
  const oldByKey = new Map(before.scrollables.map(item => [item.key, item.top]))
  return after.scrollables.some(item => oldByKey.has(item.key) && oldByKey.get(item.key) !== item.top)
}

async function viewport(width, height) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  await waitLayout()
  const state = await evaluate(`({width:innerWidth,height:innerHeight,visual:visualViewport.width,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,storage:localStorage.length+sessionStorage.length})`)
  assert(state.width === width && state.client <= width && width - state.client <= 32
    && Math.abs(state.visual - state.client) <= 32 && state.scroll <= state.client && state.storage === 0,
  `Responsive board dimensions or browser storage failed: ${JSON.stringify({ requested: { width, height }, measured: state })}`)
  return state
}

async function screenshot(path) {
  const safe = await evaluate(`!!document.querySelector('[data-testid="matching-board"]') && !document.querySelector('.secret-code')`)
  assert(safe, 'Refusing screenshot outside a safe matching board')
  const image = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(path, Buffer.from(image.data, 'base64'))
}

async function installPointerTrace() {
  await evaluate(`(()=>{window.__matchingDragTrace=[];window.__matchingDragOrigin=null;const types=['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','mousedown','mousemove','mouseup','click'];for(const type of types)document.addEventListener(type,event=>{const target=event.target instanceof Element?event.target:null;if(type==='pointerdown')window.__matchingDragOrigin=target?.closest('[data-matching-draggable]')||null;const origin=window.__matchingDragOrigin;const id=event.pointerId;const captures=id===undefined?[]:[...document.querySelectorAll('[data-matching-draggable]')].filter(element=>element.hasPointerCapture?.(id)).map(element=>element.dataset.testid||element.className?.toString().slice(0,30)||'draggable');window.__matchingDragTrace.push({t:Math.round(performance.now()),type,isTrusted:event.isTrusted,pointerId:Number.isInteger(id)?id:null,pointerType:event.pointerType||null,button:Number.isInteger(event.button)?event.button:null,buttons:Number.isInteger(event.buttons)?event.buttons:null,x:Number.isFinite(event.clientX)?Math.round(event.clientX*10)/10:null,y:Number.isFinite(event.clientY)?Math.round(event.clientY*10)/10:null,targetTag:target?.tagName||null,targetClass:String(target?.className||'').slice(0,40),targetTestId:target?.getAttribute('data-testid')||null,targetQuestion:target?.closest('[data-matching-question-number]')?.getAttribute('data-matching-question-number')||null,originTestId:origin?.getAttribute('data-testid')||null,originHasCapture:id!==undefined&&!!origin?.hasPointerCapture?.(id),captures});if(window.__matchingDragTrace.length>120)window.__matchingDragTrace.shift();if(type==='pointerup'||type==='pointercancel')window.__matchingDragOrigin=null},true);return true})()`)
}

async function pointerDiagnostics(targetNumber, point) {
  return evaluate(`(()=>{const x=${point.x},y=${point.y},hit=document.elementFromPoint(x,y),preview=document.querySelector('[data-testid="matching-drag-preview"]'),target=document.querySelector('.matching-question-card[data-matching-question-number="${targetNumber}"]');return {point:{x,y},hit:{tag:hit?.tagName||null,class:String(hit?.className||'').slice(0,40),testid:hit?.getAttribute('data-testid')||null,question:hit?.closest('[data-matching-question-number]')?.getAttribute('data-matching-question-number')||null},preview:preview?{valid:preview.dataset.dropValid,rect:(()=>{const r=preview.getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)}})(),inline:{left:preview.style.left,top:preview.style.top,transform:preview.style.transform}}:null,target:target?{eligible:target.dataset.dropEligible,over:target.dataset.dragOver}:null,scrollY:window.scrollY,width:innerWidth,height:innerHeight,trace:(window.__matchingDragTrace||[]).slice(-28)}})()`)
}

async function assertPreviewNearPointer(point) {
  const placement = await evaluate(`(()=>{const element=document.querySelector('[data-testid="matching-drag-preview"]');if(!element)return null;const rect=element.getBoundingClientRect(),dx=Math.max(rect.left-${point.x},0,${point.x}-rect.right),dy=Math.max(rect.top-${point.y},0,${point.y}-rect.bottom);return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight,distance:Math.hypot(dx,dy)}})()`)
  assert(placement && placement.left >= -1 && placement.top >= -1
    && placement.right <= placement.viewportWidth + 1 && placement.bottom <= placement.viewportHeight + 1
    && placement.distance <= 32,
  `Drag preview is outside the viewport or too far from the pointer: ${JSON.stringify(placement)}`)
}

async function setValue(selector, value) {
  const set = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return false;const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(prototype,'value').set;setter.call(element,${JSON.stringify(String(value))});element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  assert(set, `Missing settings control ${selector}`)
  await waitLayout()
}

async function enterSession() {
  await waitFor(`!!document.querySelector('.notice-layout')`, 'welcome notice')
  await tapText('Continue')
  await waitFor(`document.querySelector('.step-label')?.textContent.includes('02 / 03')`, 'welcome step two')
  await tapText('Continue')
  await waitFor(`document.querySelector('.step-label')?.textContent.includes('03 / 03')`, 'welcome step three')
  await tapText('New session')
  await waitFor(`!!document.querySelector('#cohort')`, 'session setup')
  await setValue('#cohort', '2025')
  await setValue('#jurisdiction', 'UT')
  await waitFor(`!!document.querySelector('#district')`, 'Utah district selector')
  await setValue('#district', 'UT03')
  await tap('.setup-panel .full-button')
  await waitFor(`!!document.querySelector('.secret-code')`, 'recovery code')
  const code = await evaluate(`document.querySelector('.secret-code').textContent.trim()`)
  assert(typeof code === 'string' && code.length === 43, 'Synthetic recovery code format invalid')
  codes.push(code)
  activeCode = code
  verifierHashes.push(hash(code))
  await tapText('I saved my code')
  await waitFor(`!!document.querySelector('.hub-layout')`, 'hub after code acknowledgement')
}

async function tapText(text) {
  const selector = await evaluate(`(()=>{const element=[...document.querySelectorAll('button')].find(button=>button.textContent.includes(${JSON.stringify(text)}));if(!element)return null;element.dataset.dragQaTarget='true';return '[data-drag-qa-target="true"]'})()`)
  assert(selector, `Missing onboarding button: ${text}`)
  await tap(selector)
  await evaluate(`document.querySelector('[data-drag-qa-target="true"]')?.removeAttribute('data-drag-qa-target')`)
}

function normalize(value) {
  return value.normalize('NFKD').toLocaleLowerCase('en-US').replace(/\p{M}/gu, '').replace(/['’‘]/gu, '').replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function shuffleWith(random, values) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

function firstBoardForSeed(seed) {
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
    const owners = new Map()
    for (const group of item.answer_groups) for (const alias of [group.display, ...group.aliases]) {
      const key = normalize(alias)
      if (!key) continue
      const owner = owners.get(key)
      if (owner && owner !== group.key) return false
      owners.set(key, group.key)
    }
    return true
  })
  const selected = shuffleWith(random, eligible).slice(0, 4)
  const board = []
  let tileCount = 0
  const aliasesSeen = new Set()
  for (const question of selected) {
    const item = metadataByNumber.get(question.question_number)
    const aliases = new Set(item.answer_groups.flatMap(group => [group.display, ...group.aliases]).map(normalize).filter(Boolean))
    if (board.length < 4 && tileCount + item.required_count <= 10 && ![...aliases].some(alias => aliasesSeen.has(alias))) {
      board.push(question)
      tileCount += item.required_count
      for (const alias of aliases) aliasesSeen.add(alias)
    }
  }
  return board
}

function findDragSeed() {
  for (let seed = 1; seed <= 100000; seed += 1) {
    const board = firstBoardForSeed(seed)
    const counts = board.map(question => metadata.find(item => item.question_number === question.question_number)?.required_count)
    if (board.length === 4 && counts[0] === 1 && counts[1] === 1 && counts[2] > 1) {
      return { seed, numbers: board.map(question => question.question_number) }
    }
  }
  return null
}

async function boardSnapshot() {
  await waitFor(`!!document.querySelector('[data-testid="matching-board"]')`, 'matching board')
  const snapshot = await evaluate(`(()=>{const questions=[...document.querySelectorAll('.matching-question-card[data-matching-question-number]')].map(e=>{const number=Number(e.dataset.matchingQuestionNumber),progress=document.querySelector('[data-testid="matching-progress-'+number+'"]')?.innerText.trim()||'';const chips=[...document.querySelectorAll('[data-testid^="matching-remove-'+number+'-"]')].map(button=>({testid:button.dataset.testid,label:button.innerText.trim().replace(/\s*×$/u,'').trim()}));const [placed,required]=progress.split('/').map(part=>Number(part.trim().split(' ')[0]));return {number,progress,placed,required,chips,eligible:e.dataset.dropEligible,over:e.dataset.dragOver}});const tiles=[...document.querySelectorAll('[data-testid^="matching-tile-"]')].map(e=>({testid:e.dataset.testid,label:e.innerText.trim(),disabled:e.disabled,pressed:e.getAttribute('aria-pressed')}));return {questions,tiles,preview:!!document.querySelector('[data-testid="matching-drag-preview"]'),announcement:document.querySelector('[data-testid="matching-drag-announcement"]')?.innerText.trim()||'',timer:document.querySelector('[data-testid="matching-timer"]')?.getAttribute('aria-label')||'',boardWidth:document.querySelector('[data-testid="matching-board"]')?.getBoundingClientRect().width||0,storage:localStorage.length+sessionStorage.length}})()`)
  assert(snapshot.questions.length === 4 && new Set(snapshot.questions.map(item => item.number)).size === 4,
    `Expected a four-question board, got ${snapshot.questions.length}`)
  assert(snapshot.tiles.length <= 10 && snapshot.tiles.length === snapshot.questions.reduce((sum, item) => sum + item.required, 0),
    'Seeded board violated the ten-tile or required-answer count')
  assert(snapshot.storage === 0, 'Matching drag board created browser storage')
  return snapshot
}

function tileOwner(label, board) {
  const needle = normalize(label)
  const owners = board.questions.filter(question => {
    const item = metadata.find(value => value.question_number === question.number)
    return item?.answer_groups.some(group => [group.display, ...group.aliases].some(alias => normalize(alias) === needle))
  }).map(question => question.number)
  return owners.length === 1 ? owners[0] : null
}

async function tileTestIdsForOwner(questionNumber, board, onlyAvailable = true) {
  const current = await boardSnapshot()
  const ids = current.tiles.filter(tile => (!onlyAvailable || !tile.disabled) && tileOwner(tile.label, board) === questionNumber).map(tile => tile.testid)
  return ids
}

async function progress(questionNumber) {
  return evaluate(`document.querySelector('[data-testid="matching-progress-${questionNumber}"]')?.innerText.trim()||''`)
}

async function assignedLabels(questionNumber) {
  return evaluate(`([...document.querySelectorAll('[data-testid^="matching-remove-${questionNumber}-"]')].map(button=>button.innerText.trim().replace(/\s*×$/u,'').trim()))`)
}

async function assertNoSelection() {
  const selected = await evaluate(`!!document.querySelector('[data-testid^="matching-question-"][aria-pressed="true"],[data-testid^="matching-tile-"][aria-pressed="true"]')`)
  assert(!selected, 'A canceled/invalid drag left a tap selection active')
}

async function runDragChecks() {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Page.bringToFront')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' })
  await enterSession()
  await waitFor(`!!document.querySelector('[data-testid="match-learn-entry"]')`, 'Match & Learn entry')
  await tap('[data-testid="match-learn-entry"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-settings"]')`, 'matching settings')
  await setValue('[data-testid="matching-question-count"]', 4)
  await setValue('[data-testid="matching-round-size"]', 4)
  await setValue('[data-testid="matching-pace"]', 'challenge')
  await waitNode(() => metadata.length > 0 && questions.length > 0, 'real reviewed questions and metadata')
  const seed = findDragSeed()
  assert(seed, 'No real-data seed created a four-question board with single-answer move targets and a multi-answer question')
  const seeded = await evaluate(`(()=>{const start=document.querySelector('[data-testid="matching-start"]');if(!start)return false;let state=${seed.seed}>>>0;const old=Math.random;Math.random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296};try{start.click();return true}finally{Math.random=old}})()`)
  assert(seeded, 'Could not produce deterministic plan from live reviewed content')
  await waitFor(`!!document.querySelector('[data-testid="matching-plan-summary"]')`, 'matching plan preview')
  await tap('[data-testid="matching-start"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-timer"]') && /seconds remaining/.test(document.querySelector('[data-testid="matching-timer"]').getAttribute('aria-label')||'')`, 'Challenge deadline initialized on the first board', 10000)
  await waitNode(() => metadata.length > 0, 'matching metadata')
  let board = await boardSnapshot()
  assert(JSON.stringify(board.questions.map(question => question.number)) === JSON.stringify(seed.numbers),
    'Actual first board differs from the real-data seeded board')
  assert(board.questions[1].required === 1 && board.questions[2].required > 1,
    'Seed did not retain the intended single and multi-answer targets')
  await installPointerTrace()
  const numbers = board.questions.map(question => question.number)
  const [first, second, multi, fourth] = numbers
  const initialTimer = board.timer
  assert(/seconds remaining/.test(initialTimer), 'Challenge round does not show a live timer')
  const allowanceText = await evaluate(`document.querySelector('[data-testid="matching-timer"]')?.innerText||''`)
  assert(/seconds allowed/.test(allowanceText), 'Challenge timer does not disclose the board allowance')
  await viewport(1440, 1000)
  await screenshot(screenshots.desktop)

  const firstTileIds = await tileTestIdsForOwner(first, board)
  assert(firstTileIds.length === 1, 'First single-answer question did not have exactly one reviewed answer tile')
  const firstTileId = firstTileIds[0]
  const firstTileLabel = (await boardSnapshot()).tiles.find(tile => tile.testid === firstTileId).label
  await dragToQuestion('mouse', `[data-testid="${firstTileId}"]`, first)
  await waitFor(`document.querySelector('[data-testid="matching-progress-${first}"]')?.innerText.trim()==='1/1 answers placed'`, 'mouse tile placement counter')
  assert(JSON.stringify(await assignedLabels(first)) === JSON.stringify([firstTileLabel]), 'Mouse tile drop did not create the visible assigned chip')
  assert((await boardSnapshot()).tiles.find(tile => tile.testid === firstTileId).disabled, 'Dragged tile remained available after successful placement')
  await waitFor(`!document.querySelector('[data-testid="matching-drag-preview"]')`, 'mouse preview clears after drop')
  assert(!await evaluate(`!!document.querySelector('.matching-outcome')`), 'Correctness was revealed during an active round')

  // Escape a real assigned-chip drag. Keep the physical mouse held for >800ms
  // after Escape, return to its source, and prove the compatibility click is ignored.
  const originalChipSelector = `[data-testid="matching-remove-${first}-1"]`
  await dragEscapeOnAssignedChip(originalChipSelector, second)
  assert((await progress(first)).startsWith('1/1') && (await progress(second)).startsWith('0/1'), 'Escape changed an assigned chip before release')
  assert((await assignedLabels(first)).join('|') === firstTileLabel, 'Escape drag removed or moved the original chip after delayed mouseup')
  assert(/canceled/i.test(await evaluate(`document.querySelector('[data-testid="matching-drag-announcement"]')?.innerText||''`)), 'Escape did not announce cancellation')
  await assertNoSelection()
  await tap(originalChipSelector)
  await waitFor(`document.querySelector('[data-testid="matching-progress-${first}"]')?.innerText.trim()==='0/1 answers placed'`, 'deliberate tap removes assigned chip')
  assert((await boardSnapshot()).tiles.find(tile => tile.testid === firstTileId).disabled === false,
    'Deliberate tap did not release the previously assigned tile')

  const secondTileIds = await tileTestIdsForOwner(second, board)
  assert(secondTileIds.length === 1, 'Second single-answer question did not have exactly one reviewed answer tile')
  const secondTileId = secondTileIds[0]
  const secondTileLabel = (await boardSnapshot()).tiles.find(tile => tile.testid === secondTileId).label

  // Tap fallback remains a real touch sequence.
  await tap(`[data-testid="${secondTileId}"]`)
  assert(await evaluate(`document.querySelector('[data-testid="${secondTileId}"]')?.getAttribute('aria-pressed')==='true'`), 'Tap fallback did not select an available tile')
  await tap(`[data-testid="matching-question-${first}"]`)
  await waitFor(`document.querySelector('[data-testid="matching-progress-${first}"]')?.innerText.trim()==='1/1 answers placed'`, 'tap fallback assignment')
  assert((await assignedLabels(first)).join('|') === secondTileLabel, 'Tap fallback placed the wrong visible tile')
  await assertNoSelection()

  // Dropping an assigned chip outside the cards must preserve the chip and all
  // independent tap selections; no compatibility click may remove it.
  const firstChip = `[data-testid="matching-remove-${first}-1"]`
  const outside = await evaluate(`({x:innerWidth-3,y:innerHeight-3})`)
  await dragToPoint('mouse', firstChip, outside)
  assert((await progress(first)).startsWith('1/1') && (await assignedLabels(first)).join('|') === secondTileLabel,
    'Outside drop changed the chip source placement')
  assert(/assignments were kept/i.test(await evaluate(`document.querySelector('[data-testid="matching-drag-announcement"]')?.innerText||''`)), 'Outside drop did not announce preserved assignments')
  await assertNoSelection()

  // A full target remains ineligible and cannot take another answer.
  await dragToFullQuestion(`[data-testid="${firstTileId}"]`, first)
  assert((await progress(first)).startsWith('1/1') && (await progress(second)).startsWith('0/1'), 'Full target accepted an overflow tile')
  assert((await boardSnapshot()).tiles.find(tile => tile.testid === firstTileId).disabled === false,
    'Rejected full-target tile was not returned to the available pool')
  await assertNoSelection()

  // Move the assigned chip with a true touch drag. The source slot stays intact
  // during hover and only changes on release over the eligible second question.
  const moveChip = `[data-testid="matching-remove-${first}-1"]`
  const moveStart = await pointFor(moveChip)
  const secondPoint = await centerIfVisible(`[data-matching-question-number="${second}"]`)
  assert(secondPoint.visible, 'Second question is not visible for chip movement')
  await touchStart(moveStart.x, moveStart.y)
  await new Promise(resolve => setTimeout(resolve, 40))
  await movePath({ move: touchMove }, moveStart, secondPoint)
  await waitFor(`document.querySelector('[data-testid="matching-drag-preview"]')?.dataset.dropValid==='true' && document.querySelector('[data-matching-question-number="${second}"]')?.dataset.dragOver==='true'`, 'touch chip move preview')
  assert((await progress(first)).startsWith('1/1') && (await progress(second)).startsWith('0/1'), 'Assigned source slot changed before a valid drop')
  assert((await assignedLabels(first)).join('|') === secondTileLabel, 'Assigned chip disappeared during move preview')
  await touchEnd()
  await waitFor(`document.querySelector('[data-testid="matching-progress-${first}"]')?.innerText.trim()==='0/1 answers placed' && document.querySelector('[data-testid="matching-progress-${second}"]')?.innerText.trim()==='1/1 answers placed'`, 'touch chip move counters')
  await new Promise(resolve => setTimeout(resolve, 120))
  assert((await assignedLabels(second)).join('|') === secondTileLabel && (await assignedLabels(first)).length === 0,
    'Touch chip move did not relocate the actual chip exactly once')
  assert(/moved to question/i.test(await evaluate(`document.querySelector('[data-testid="matching-drag-announcement"]')?.innerText||''`)), 'Touch move announcement did not identify the destination')

  // Keyboard fallback is also delivered as a native key sequence.
  await pressEnter(`[data-testid="${firstTileId}"]`)
  assert(await evaluate(`document.querySelector('[data-testid="${firstTileId}"]')?.getAttribute('aria-pressed')==='true'`), 'Keyboard fallback did not select an available tile')
  await pressEnter(`[data-testid="matching-question-${first}"]`)
  await waitFor(`document.querySelector('[data-testid="matching-progress-${first}"]')?.innerText.trim()==='1/1 answers placed'`, 'keyboard fallback assignment')
  assert((await assignedLabels(first)).join('|') === firstTileLabel, 'Keyboard fallback placed a different answer')
  await assertNoSelection()

  // On a narrow phone viewport, move a held touch along the answer panel edge.
  // At least one real document or panel scroll position must change.
  await viewport(320, 360)
  await screenshot(screenshots.stress)
  const multiTileIds = await tileTestIdsForOwner(multi, board)
  assert(multiTileIds.length === board.questions.find(question => question.number === multi).required,
    'Multi-answer question did not have all reviewed answer tiles')
  const secondMultiTile = multiTileIds[1]
  const edgeStart = await pointFor(`[data-testid="${secondMultiTile}"]`)
  await touchStart(edgeStart.x, edgeStart.y)
  await new Promise(resolve => setTimeout(resolve, 40))
  await touchMove(edgeStart.x, edgeStart.y + 12)
  await waitFor(`!!document.querySelector('[data-testid="matching-drag-preview"]')`, 'touch preview for edge scrolling', 4000)
  const edgeBefore = await scrollState()
  const panel = await evaluate(`(()=>{const element=document.querySelector('.matching-tiles');const r=element.getBoundingClientRect();return {x:r.left+r.width/2,y:Math.min(innerHeight-3,r.bottom-3),width:innerWidth,right:r.right,bottom:r.bottom}})()`)
  for (let step = 0; step < 12; step += 1) {
    await touchMove(Math.min(panel.width - 3, panel.x), panel.y)
    await new Promise(resolve => setTimeout(resolve, 85))
  }
  const edgeAfter = await scrollState()
  assert(hasScrollChanged(edgeBefore, edgeAfter), 'Touch drag at the edge did not scroll the document or answer panel')
  await touchCancel()
  await waitFor(`!document.querySelector('[data-testid="matching-drag-preview"]')`, 'pointer cancellation clears edge-scrolling drag', 4000)
  assert((await progress(multi)).startsWith('0/'), 'Canceled edge drag assigned a tile')
  assert((await boardSnapshot()).tiles.find(tile => tile.testid === secondMultiTile).disabled === false,
    'Canceled edge drag consumed the available tile')
  assert(/canceled/i.test(await evaluate(`document.querySelector('[data-testid="matching-drag-announcement"]')?.innerText||''`)), 'Edge-drag cancellation was not announced')

  await viewport(390, 844)
  await screenshot(screenshots.phone)
  const firstMultiTile = multiTileIds[0]
  const multiBefore = await progress(multi)
  await dragToQuestion('touch', `[data-testid="${firstMultiTile}"]`, multi, { edgeScroll: true })
  const requiredMulti = board.questions.find(question => question.number === multi).required
  await waitFor(`document.querySelector('[data-testid="matching-progress-${multi}"]')?.innerText.trim().startsWith('1/${requiredMulti} answers placed')`, 'touch multi-answer partial counter')
  const partialLabels = await assignedLabels(multi)
  assert(partialLabels.length === 1 && (await progress(multi)) !== multiBefore, 'Touch drag did not create one visible partial answer assignment')
  assert((await boardSnapshot()).tiles.find(tile => tile.testid === firstMultiTile).disabled, 'Touch-dragged answer remained available')

  // Complete the fourth question through real keyboard activations so the one
  // eventual round write contains both correct and incomplete outcomes.
  const fourthTiles = await tileTestIdsForOwner(fourth, board)
  assert(fourthTiles.length === board.questions.find(question => question.number === fourth).required,
    'Fourth question did not have all reviewed answer tiles')
  for (const testid of fourthTiles) {
    await pressEnter(`[data-testid="${testid}"]`)
    await pressEnter(`[data-testid="matching-question-${fourth}"]`)
  }
  await waitFor(`document.querySelector('[data-testid="matching-progress-${fourth}"]')?.innerText.trim()==='${fourthTiles.length}/${fourthTiles.length} answers placed'`, 'keyboard complete answer set')
  assert((await assignedLabels(fourth)).length === fourthTiles.length, 'Keyboard fallback did not create each visible chip')
  assert(matchingPosts.length === 0, 'A drag, move, cancellation or fallback interaction submitted a round')
  assert(!(await evaluate(`!!document.querySelector('.matching-outcome')`)), 'Correctness appeared before manual/deadline submit')

  // Hold the remaining multi-answer tile over its target until the real timer
  // expires. The saved result must retain the one-answer incomplete snapshot.
  const lateTile = secondMultiTile
  const lateTileLabel = (await boardSnapshot()).tiles.find(tile => tile.testid === lateTile).label
  const lateDrag = await dragToQuestion('touch', `[data-testid="${lateTile}"]`, multi, { hold: true })
  await waitFor(`document.querySelector('[data-testid="matching-progress-${multi}"]')?.innerText.trim().startsWith('1/${requiredMulti} answers placed')`, 'multi-answer source remains partial during held drag')
  assert(await evaluate(`document.querySelector('[data-testid="matching-drag-preview"]')?.dataset.dropValid==='true'`), 'Late drag was not held over a valid target')
  const remainingSeconds = Number((await evaluate(`document.querySelector('[data-testid="matching-timer"]')?.getAttribute('aria-label')||''`)).match(/(\d+) seconds remaining/)?.[1])
  assert(Number.isFinite(remainingSeconds) && remainingSeconds > 0, 'Challenge deadline was not active at late-drag start')
  await waitFor(`!!document.querySelector('[data-testid="matching-round-results"]')`, 'deadline submits while touch pointer remains down', remainingSeconds * 1000 + 15000)
  assert(!(await evaluate(`!!document.querySelector('[data-testid="matching-drag-preview"]')`)), 'Deadline transition left a drag preview visible')
  await lateDrag.driver.end(lateDrag.target.x, lateDrag.target.y)
  await new Promise(resolve => setTimeout(resolve, 180))
  assert(await evaluate(`!!document.querySelector('[data-testid="matching-round-results"]')`), 'Late release changed the saved round view')
  assert(matchingPosts.length === 1, `Expected one round write after deadline, observed ${matchingPosts.length}`)
  const post = matchingPosts[0]
  const expectedKeys = ['p_code', 'p_results', 'p_round_id']
  assert(JSON.stringify(post.keys) === JSON.stringify(expectedKeys) && post.codeMatchesSession && post.roundIdValid,
    'Deadline round write did not use the session and minimal matching contract')
  assert(Array.isArray(post.results) && post.results.length === 4 && post.results.every(result => result.keys.join(',') === 'outcome,question_number'),
    'Deadline round write was not one minimal outcome per visible question')
  assert(new Set(post.results.map(result => result.question_number)).size === 4
    && post.results.some(result => result.question_number === multi && result.outcome === 'skipped'),
  'Deadline snapshot changed the partial multi-answer result or repeated questions')
  await tap('[data-testid="matching-view-results"]')
  await waitFor(`!!document.querySelector('[data-testid="matching-final-results"]')`, 'deadline result review')
  const finalText = await evaluate(`document.querySelector('[data-testid="matching-final-results"]')?.innerText||''`)
  assert(/\b4 questions\b/i.test(finalText), 'Deadline review did not show exactly four selected questions')
  const reviewState = await evaluate(`(()=>{const row=document.querySelector('[data-testid="matching-review-${multi}"]');const paragraph=[...row?.querySelectorAll('p')||[]].find(p=>p.textContent.includes('Your matches'));return {outcome:row?.querySelector('.matching-outcome')?.textContent.trim().toLowerCase()||'',your:paragraph?.innerText||''}})()`)
  assert(reviewState.outcome === 'skipped' && reviewState.your.includes(partialLabels[0])
    && !reviewState.your.includes(lateTileLabel),
  'Final review shows a late post-deadline placement or lost the frozen partial assignment')
  return { dragInteractions: true, boards: 1, matchingPosts: matchingPosts.length }
}

try {
  await runDragChecks()
  console.log(JSON.stringify({
    ok: true,
    checks: [
      'real mouse/touch pointer drags, preview/highlight, and visible assignment counters/chips',
      'assigned-chip move, outside/full drop rejection, delayed Escape cancel, touch cancellation, and click/keyboard fallback',
      '320/390/1440 responsive layouts and measured live edge auto-scroll',
      'one minimal actual deadline save freezes the incomplete multi-answer state against late release',
    ],
    matchingPostAttempts: matchingPosts.length,
    syntheticVerifierSha256: [...new Set(verifierHashes)],
    screenshots,
  }))
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    message: error instanceof Error ? redact(error.message) : 'matching drag browser flow failed',
    matchingPostAttempts: matchingPosts.length,
    syntheticVerifierSha256: [...new Set(verifierHashes)],
    screenshots,
  }))
  process.exitCode = 1
} finally {
  socket.close()
  await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`)
}
