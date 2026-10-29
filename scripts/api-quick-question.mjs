import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const config = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/u).filter(Boolean).map(line => {
  const index = line.indexOf('=')
  return index < 0 ? [line, ''] : [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^(["'])(.*)\1$/u, '$2')]
}))
const base = config.VITE_SUPABASE_URL
const apiKey = config.VITE_SUPABASE_PUBLISHABLE_KEY
if (!base || !apiKey) throw new Error('Local Supabase configuration is missing')

const codes = []
let step = 'session creation'
const verifier = code => createHash('sha256').update(code, 'utf8').digest('hex')
const makeCode = () => {
  const code = randomBytes(32).toString('base64url')
  codes.push(code)
  return code
}

async function request(name, body, { expectFailure = false } = {}) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (expectFailure) {
    if (response.ok) throw new Error(`${name} unexpectedly accepted an invalid request`)
    return null
  }
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`)
  return response.json()
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

try {
  const codeA = makeCode()
  const codeB = makeCode()
  const createdA = await request('create_game_session', {
    p_code: codeA, p_edition: '2025', p_state_code: 'UT', p_district_code: 'UT03',
  })
  const createdB = await request('create_game_session', {
    p_code: codeB, p_edition: '2008', p_state_code: 'AS', p_district_code: null,
  })
  assert(!createdA.session_id && !createdA.code_verifier && !createdA.recovery_code,
    'Session RPC exposed private credential material')

  step = 'empty progress projection'
  const empty = { progress: [], multiple_choice: [], written: [], matching: [] }
  assert(same(await request('get_learning_progress', { p_code: codeA }), empty),
    'Empty learning projection is incorrect')
  const writtenId = randomUUID()
  const writtenBody = { p_code: codeA, p_attempt_id: writtenId, p_question_number: 1, p_outcome: 'correct' }
  step = 'concurrent written idempotency'
  const concurrentWritten = await Promise.all([
    request('record_written_answer', writtenBody),
    request('record_written_answer', writtenBody),
  ])
  for (const result of concurrentWritten) {
    assert(result.learning?.progress?.length === 1 && result.learning.progress[0].correct_count === 1,
      'Concurrent identical written attempts counted more than once')
    assert(result.learning.multiple_choice.length === 0 && result.learning.written.length === 1,
      'Written attempt was not isolated by mode')
  }
  step = 'changed written payload rejection'
  await request('record_written_answer', {
    ...writtenBody, p_outcome: 'incorrect',
  }, { expectFailure: true })

  const mcId = randomUUID()
  const mcPrefix = [{ question_number: 1, outcome: 'skipped' }]
  step = 'legacy MC round compatibility and concurrency'
  const concurrentMc = await Promise.all([
    request('record_flashcard_round', { p_code: codeA, p_round_id: mcId, p_results: mcPrefix }),
    request('record_flashcard_round', { p_code: codeA, p_round_id: mcId, p_results: mcPrefix }),
  ])
  for (const result of concurrentMc) {
    assert(result.round?.answered === 1 && result.round.skipped === 1,
      'Concurrent MC round response lost its legacy summary')
    assert(result.learning?.written?.[0]?.correct_count === 1
      && result.learning?.multiple_choice?.[0]?.skipped_count === 1,
    'MC and written mode projections were not independent')
  }

  step = 'aggregate and mode projection'
  const progressA = await request('get_learning_progress', { p_code: codeA })
  assert(progressA.progress?.[0]?.correct_count === 1 && progressA.progress[0].skipped_count === 1,
    'Aggregate learning projection is incorrect')
  assert(progressA.multiple_choice?.length === 1 && progressA.written?.length === 1,
    'Mode-separated projections are incomplete')
  const oldMcOnly = await request('get_flashcard_progress', { p_code: codeA })
  assert(oldMcOnly.length === 1 && oldMcOnly[0].skipped_count === 1 && oldMcOnly[0].correct_count === 0,
    'Legacy flashcard progress includes written outcomes')

  // Attempt identifiers are globally unique across modes within one session.
  step = 'cross-mode UUID and invalid payload rejection'
  await request('record_written_answer', {
    p_code: codeA, p_attempt_id: mcId, p_question_number: 2, p_outcome: 'correct',
  }, { expectFailure: true })
  await request('record_flashcard_round', {
    p_code: codeA, p_round_id: writtenId,
    p_results: [{ question_number: 2, outcome: 'incorrect' }],
  }, { expectFailure: true })
  await request('record_written_answer', {
    p_code: codeA, p_attempt_id: randomUUID(), p_question_number: 129, p_outcome: 'correct',
  }, { expectFailure: true })
  await request('record_written_answer', {
    p_code: codeA, p_attempt_id: randomUUID(), p_question_number: 2, p_outcome: 'raw answer text',
  }, { expectFailure: true })

  step = 'rejection integrity and session isolation'
  assert(same(await request('get_learning_progress', { p_code: codeA }), progressA),
    'Rejected attempts changed progress')
  assert(same(await request('get_learning_progress', { p_code: codeB }), empty),
    'Learning projection crossed session boundary')
  const writtenB = await request('record_written_answer', {
    p_code: codeB, p_attempt_id: randomUUID(), p_question_number: 1, p_outcome: 'incorrect',
  })
  assert(writtenB.learning?.progress?.length === 1 && writtenB.learning.progress[0].incorrect_count === 1,
    'Second-session written progress did not persist')
  assert(same(await request('get_learning_progress', { p_code: codeA }), progressA),
    'Second-session update changed first-session progress')

  console.log(JSON.stringify({
    checks: [
      'concurrent written attempt idempotency',
      'changed written payload rejection',
      'concurrent legacy MC round idempotency and response compatibility',
      'aggregate and per-mode progress isolation',
      'cross-mode UUID reuse rejection',
      'invalid outcome/question rejection',
      'two-session isolation',
    ],
    syntheticVerifierSha256: codes.map(verifier),
  }))
} catch {
  // Print only hashes of synthetic codes so root can perform exact cleanup.
  console.error(JSON.stringify({ error: 'Quick Question API check failed', step, syntheticVerifierSha256: codes.map(verifier) }))
  process.exitCode = 1
}
