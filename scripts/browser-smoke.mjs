// Small Chrome DevTools Protocol smoke test; uses the system Chrome and Node's
// built-in WebSocket so no browser automation package or screenshots are kept.
const base = process.env.APP_URL ?? 'http://127.0.0.1:4173/'
const response = await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent(base)}`, { method: 'PUT' })
if (!response.ok) throw new Error(`Chrome tab creation failed: ${response.status}`)
const tab = await response.json()
const socket = new WebSocket(tab.webSocketDebuggerUrl)
let nextId = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
})
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
function command(method, params = {}) {
  const id = ++nextId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, 7000)
    pending.set(id, message => { clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve(message.result) })
  })
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
try {
  await command('Page.enable')
  await command('Runtime.enable')
  for (const [label, width, height] of [['small-phone', 320, 740], ['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 1000]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
    await command('Page.navigate', { url: base })
    await new Promise(resolve => setTimeout(resolve, 500))
    const state = await evaluate(`(() => ({title:document.title, language:document.documentElement.lang, spanish:/[áéíóúñ¿¡]/i.test(document.body.innerText), width:innerWidth, scroll:document.documentElement.scrollWidth, heading:document.querySelector('h1')?.textContent?.trim(), resume:[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Resume previous session')), storage:localStorage.length+sessionStorage.length, external:[...performance.getEntriesByType('resource')].filter(r=>new URL(r.name).origin!==location.origin).length}))()`)
    if (!state.title.includes('Civic Compass') || state.language !== 'en' || state.spanish || state.width !== width || state.scroll > width || !state.heading || !state.resume || state.storage !== 0 || state.external !== 0) throw new Error(`${label} language/layout/privacy check failed: ${JSON.stringify(state)}`)
    console.log(`${label}: width=${state.width}, scrollWidth=${state.scroll}, resume present, browser storage empty, no third-party requests`)
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Resume previous session')).click())`)
  await new Promise(resolve => setTimeout(resolve, 100))
  const keyboard = await evaluate(`(() => ({heading:document.querySelector('h1')?.textContent?.trim(), focused:document.activeElement?.tagName==='H1', input:!!document.querySelector('#recovery-code')}))()`)
  if (!keyboard.heading?.includes('Welcome back') || !keyboard.focused || !keyboard.input) throw new Error(`Screen transition focus check failed: ${JSON.stringify(keyboard)}`)
  console.log('keyboard: resume transition moves focus to the new heading and presents code input')
} finally {
  socket.close()
  await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`)
}
