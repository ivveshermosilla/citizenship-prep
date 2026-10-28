import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').trim().split(/\r?\n/u).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index), line.slice(index + 1)]
}))
const base = env.VITE_SUPABASE_URL
const apiKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!base || !apiKey) throw new Error('Local Supabase configuration is missing')
async function rpc(name, body) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`)
  return response.json()
}
const makeCode = () => randomBytes(32).toString('base64url')
const verifier = code => createHash('sha256').update(code, 'utf8').digest('hex')
const firstCode = makeCode()
const secondCode = makeCode()
const first = await rpc('create_game_session', { p_code: firstCode, p_edition: '2025', p_state_code: 'UT', p_district_code: 'UT03' })
const second = await rpc('create_game_session', { p_code: secondCode, p_edition: '2008', p_state_code: 'AS', p_district_code: null })
if (first.session_id || first.code_verifier || first.recovery_code) throw new Error('Session creation returned private identifier material')
if (first.district_code !== 'UT03' || second.district_code !== 'AS00') throw new Error('District resolve/persist check failed')

const questions2025 = await rpc('get_practice_questions', { p_edition: first.edition, p_state_code: first.state_code, p_district_code: first.district_code })
const questions2008 = await rpc('get_practice_questions', { p_edition: second.edition, p_state_code: second.state_code, p_district_code: second.district_code })
if (questions2025.length !== 128 || questions2008.length !== 100) throw new Error('Cohort question count check failed')
const allow = new Set(['question_number', 'question_text', 'section', 'answers', 'answer_display', 'answer_updated_on', 'next_update_on', 'source_urls', 'is_geography_dependent', 'is_time_dependent'])
for (const q of [...questions2025, ...questions2008]) {
  if (Object.keys(q).some(key => !allow.has(key)) || !q.answer_updated_on || !q.next_update_on || !q.source_urls?.length) throw new Error('Question projection/source/freshness allowlist failed')
}

const afterKnown = await rpc('record_quiz_check', { p_code: firstCode, p_knew_answer: true })
const afterCard = await rpc('record_card_review', { p_code: firstCode })
if (afterCard.quiz_attempts !== 1 || afterCard.quiz_correct !== 1 || afterCard.cards_reviewed !== 1) throw new Error('Aggregate counter update failed')
const secondResume = await rpc('resume_game_session', { p_code: secondCode })
if (secondResume.quiz_attempts !== 0 || secondResume.quiz_correct !== 0 || secondResume.cards_reviewed !== 0 || secondResume.edition !== '2008') throw new Error('Session isolation check failed')
const afterSecond = await rpc('record_quiz_check', { p_code: secondCode, p_knew_answer: false })
const firstResume = await rpc('resume_game_session', { p_code: firstCode })
if (firstResume.quiz_attempts !== 1 || firstResume.quiz_correct !== 1 || firstResume.cards_reviewed !== 1 || afterSecond.quiz_attempts !== 1 || afterSecond.quiz_correct !== 0) throw new Error('Cross-session aggregate isolation failed')
const lastActiveBeforeWrongCode = firstResume.last_active_at
const invalid = await fetch(`${base}/rest/v1/rpc/resume_game_session`, {
  method: 'POST', headers: { apikey: apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: 'Z'.repeat(43) }),
})
if (invalid.ok) throw new Error('Unknown code was accepted')

for (const path of ['civics_questions_2008?select=*', 'civics_questions_2025?select=*']) {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: apiKey } })
  if (response.ok) throw new Error('Direct question-table access unexpectedly succeeded')
}
// Emit only one-way verifier hex values and the aggregate timestamp needed by
// the parent harness to inspect/expire only these identified synthetic rows.
console.log(JSON.stringify({
  checks: ['anon RPC', 'both cohorts', '100/128 question projection', 'source/freshness allowlist', 'at-large auto-resolution', 'quiz/card aggregates', 'unknown-code denial', 'session isolation', 'direct bank denial'],
  synthetic: [{ verifier: verifier(firstCode), lastActiveBeforeWrongCode }, { verifier: verifier(secondCode) }],
  final: { edition: firstResume.edition, attempts: firstResume.quiz_attempts, correct: firstResume.quiz_correct, cards: firstResume.cards_reviewed },
}))
