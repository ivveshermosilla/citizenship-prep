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

try {
  const codeA = makeCode()
  const codeB = makeCode()
  const createdA = await request('create_game_session', {
    p_code: codeA, p_edition: '2025', p_state_code: 'UT', p_district_code: 'UT03',
  })
  const createdB = await request('create_game_session', {
    p_code: codeB, p_edition: '2008', p_state_code: 'AS', p_district_code: null,
  })
  assert(!createdA.session_id && !createdA.code_verifier && !createdA.recovery_code, 'Session RPC exposed private credential material')

  const roundId = randomUUID()
  const firstPrefix = [
    { question_number: 1, outcome: 'correct' },
    { question_number: 2, outcome: 'skipped' },
  ]
  const concurrentFirst = await Promise.all([
    request('record_flashcard_round', { p_code: codeA, p_round_id: roundId, p_results: firstPrefix }),
    request('record_flashcard_round', { p_code: codeA, p_round_id: roundId, p_results: firstPrefix }),
  ])
  for (const result of concurrentFirst) {
    assert(result.round?.answered === 2 && result.round.correct === 1 && result.round.incorrect === 0 && result.round.skipped === 1,
      'Concurrent identical-prefix round totals differ')
  }

  const fullPrefix = [...firstPrefix, { question_number: 3, outcome: 'incorrect' }]
  const concurrentAppend = await Promise.all([
    request('record_flashcard_round', { p_code: codeA, p_round_id: roundId, p_results: fullPrefix }),
    request('record_flashcard_round', { p_code: codeA, p_round_id: roundId, p_results: fullPrefix }),
  ])
  for (const result of concurrentAppend) {
    assert(result.round?.answered === 3 && result.round.correct === 1 && result.round.incorrect === 1 && result.round.skipped === 1,
      'Concurrent suffix append totals differ')
  }

  const repeated = await request('record_flashcard_round', { p_code: codeA, p_round_id: roundId, p_results: fullPrefix })
  assert(repeated.progress?.length === 3, 'Progress projection length is incorrect')
  assert(repeated.progress[0].question_number === 1 && repeated.progress[0].correct_count === 1 && repeated.progress[0].last_outcome === 'correct',
    'Question 1 retry was counted more than once')
  assert(repeated.progress[1].question_number === 2 && repeated.progress[1].skipped_count === 1 && repeated.progress[1].last_outcome === 'skipped',
    'Question 2 retry was counted more than once')
  assert(repeated.progress[2].question_number === 3 && repeated.progress[2].incorrect_count === 1 && repeated.progress[2].last_outcome === 'incorrect',
    'Appended question outcome was counted more than once')

  await request('record_flashcard_round', {
    p_code: codeA, p_round_id: roundId,
    p_results: [{ question_number: 1, outcome: 'incorrect' }, firstPrefix[1], fullPrefix[2]],
  }, { expectFailure: true })
  await request('record_flashcard_round', {
    p_code: codeA, p_round_id: roundId,
    p_results: [...fullPrefix, { question_number: 4, outcome: 'correct', selected_answer: 'private' }],
  }, { expectFailure: true })
  await request('record_flashcard_round', {
    p_code: codeA, p_round_id: roundId,
    p_results: [{ question_number: 4, outcome: 'correct' }, { question_number: 4, outcome: 'skipped' }],
  }, { expectFailure: true })
  await request('get_flashcard_progress', { p_code: 'Z'.repeat(43) }, { expectFailure: true })

  const progressA = await request('get_flashcard_progress', { p_code: codeA })
  assert(JSON.stringify(progressA) === JSON.stringify(repeated.progress), 'Readback changed progress after rejected payloads')
  const progressB = await request('get_flashcard_progress', { p_code: codeB })
  assert(Array.isArray(progressB) && progressB.length === 0, 'Flashcard progress crossed session boundary')
  const resultB = await request('record_flashcard_round', {
    p_code: codeB, p_round_id: randomUUID(), p_results: [{ question_number: 1, outcome: 'incorrect' }],
  })
  assert(resultB.progress?.length === 1 && resultB.progress[0].incorrect_count === 1, 'Second-session progress did not persist')
  assert(JSON.stringify(await request('get_flashcard_progress', { p_code: codeA })) === JSON.stringify(progressA),
    'Second-session update changed first-session progress')

  console.log(JSON.stringify({
    checks: [
      'concurrent identical prefix idempotency',
      'concurrent suffix append idempotency',
      'exact retry without double counting',
      'changed prefix rejection',
      'extra-key and duplicate-question rejection',
      'unknown-code rejection',
      'two-session isolation',
    ],
    syntheticVerifierSha256: codes.map(verifier),
  }))
} catch {
  // These digests identify only synthetic codes generated by this invocation;
  // root can use them for exact targeted cleanup. Never print the codes/config.
  console.error(JSON.stringify({ error: 'Flashcard API check failed', syntheticVerifierSha256: codes.map(verifier) }))
  process.exitCode = 1
}
