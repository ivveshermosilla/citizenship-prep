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

  const roundId = randomUUID()
  const results = [
    { question_number: 1, outcome: 'correct' },
    { question_number: 2, outcome: 'incorrect' },
    { question_number: 3, outcome: 'skipped' },
  ]
  const body = { p_code: codeA, p_round_id: roundId, p_results: results }
  step = 'concurrent matching round idempotency'
  const concurrent = await Promise.all([
    request('record_matching_round', body),
    request('record_matching_round', body),
  ])
  for (const result of concurrent) {
    assert(same(result.round, { answered: 3, correct: 1, incorrect: 1, skipped: 1 }),
      'Concurrent matching round summaries differ')
    assert(result.learning?.matching?.length === 3,
      'Matching progress projection is missing matching outcomes')
    assert(result.learning.multiple_choice?.length === 0 && result.learning.written?.length === 0,
      'Matching outcomes leaked into another learning mode')
  }

  step = 'retry and aggregate progress shape'
  const progress = await request('get_learning_progress', { p_code: codeA })
  assert(same(progress, concurrent[0].learning), 'Progress readback differs from matching write')
  assert(progress.progress?.length === 3 && progress.progress[0].correct_count === 1
    && progress.progress[1].incorrect_count === 1 && progress.progress[2].skipped_count === 1,
  'Aggregate progress omitted matching outcomes')
  const repeated = await request('record_matching_round', body)
  assert(same(repeated.learning, progress), 'Exact retry incremented matching outcomes')
  assert(same(await request('get_flashcard_progress', { p_code: codeA }), []),
    'Matching outcomes leaked into the legacy multiple-choice view')

  step = 'invalid payload and UUID reuse rejection'
  await request('record_matching_round', {
    ...body, p_results: [{ question_number: 1, outcome: 'correct', selected_answer: 'private' }],
  }, { expectFailure: true })
  await request('record_matching_round', {
    ...body, p_results: [...results, { question_number: 4, outcome: 'correct' }],
  }, { expectFailure: true })
  await request('record_matching_round', {
    ...body, p_results: [{ question_number: 4, outcome: 'correct' }, { question_number: 4, outcome: 'skipped' }],
  }, { expectFailure: true })
  await request('record_matching_round', {
    ...body, p_results: [{ question_number: 129, outcome: 'correct' }],
  }, { expectFailure: true })
  await request('record_matching_round', {
    ...body, p_results: [{ question_number: 1, outcome: 'correct' }, { question_number: 2, outcome: 'incorrect' }, { question_number: 3, outcome: 'incorrect' }],
  }, { expectFailure: true })
  await request('record_flashcard_round', {
    p_code: codeA, p_round_id: roundId, p_results: [{ question_number: 4, outcome: 'correct' }],
  }, { expectFailure: true })

  step = 'edition and session isolation'
  const resultB = await request('record_matching_round', {
    p_code: codeB, p_round_id: randomUUID(),
    p_results: [{ question_number: 100, outcome: 'correct' }],
  })
  assert(resultB.learning?.matching?.length === 1 && resultB.learning.matching[0].question_number === 100,
    '2008 edition matching result did not persist')
  assert(same(await request('get_learning_progress', { p_code: codeA }), progress),
    'Second session changed the first session progress')

  console.log(JSON.stringify({
    checks: [
      'concurrent identical complete-round idempotency',
      'matching, aggregate, multiple-choice and written progress isolation',
      'exact retry without double counting',
      'extra-key, six-item, duplicate-question and out-of-edition rejection',
      'changed-payload and cross-mode UUID rejection',
      '2008 and 2025 session isolation',
    ],
    syntheticVerifierSha256: codes.map(verifier),
  }))
} catch {
  // Print only synthetic verifier hashes so root can clean exact probe rows.
  console.error(JSON.stringify({ error: 'Matching API check failed', step, syntheticVerifierSha256: codes.map(verifier) }))
  process.exitCode = 1
}
