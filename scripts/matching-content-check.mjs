import { readFileSync } from 'node:fs'
import { buildMatchingPlan, matchingEligibleQuestions, scoreMatchingBoard } from '../src/lib/matching.ts'
import { normalizeWrittenAnswer } from '../src/lib/quick-question.ts'

const started = Date.now()
const config = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/u).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=')
  return index < 0 ? [line.trim(), ''] : [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^(?:(["'])(.*)\1)$/u, '$2')]
}))
const baseUrl = config.VITE_SUPABASE_URL?.replace(/\/$/u, '')
const publishableKey = config.VITE_SUPABASE_PUBLISHABLE_KEY
if (!baseUrl || !publishableKey) {
  console.error(JSON.stringify({ error: 'Matching content check could not start: local service configuration is missing.' }))
  process.exit(1)
}

class CheckFailure extends Error {
  constructor(message, context = {}) { super(message); this.context = context }
}

function assert(condition, message, context) {
  if (!condition) throw new CheckFailure(message, context)
}

async function rpc(name, body, context) {
  let response
  try {
    response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new CheckFailure('Matching content check could not reach the practice service.', { ...context, stage: name })
  }
  if (!response.ok) throw new CheckFailure(`Matching content RPC ${name} returned HTTP ${response.status}.`, { ...context, stage: name })
  try { return await response.json() }
  catch { throw new CheckFailure(`Matching content RPC ${name} returned invalid JSON.`, { ...context, stage: name }) }
}

function seededRandom(seed) {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function aliasesOf(group) {
  return new Set([group.display, ...group.aliases].map(normalizeWrittenAnswer).filter(Boolean))
}

function assertBoard(board, catalogByNumber, context) {
  const boardNumbers = board.questions.map(item => item.question.question_number)
  const questionNumbers = [...new Set(boardNumbers)]
  assert(questionNumbers.length === boardNumbers.length, 'A board repeats a question.', { ...context, questionNumbers: boardNumbers })
  assert(board.tiles.length <= 10, 'A board exceeds ten answer tiles.', { ...context, questionNumbers })
  assert(new Set(board.tiles.map(tile => tile.id)).size === board.tiles.length, 'A board repeats a tile ID.', { ...context, questionNumbers })

  for (const item of board.questions) {
    const number = item.question.question_number
    const metadata = catalogByNumber.get(number)
    assert(Boolean(metadata), 'A selected question has no metadata row.', { ...context, questionNumbers: [number] })
    assert(item.expectedConceptKeys.length === item.requiredCount, 'A question has the wrong number of selected answer groups.', { ...context, questionNumbers: [number] })
    assert(new Set(item.expectedConceptKeys).size === item.requiredCount, 'A question repeats a selected answer group.', { ...context, questionNumbers: [number] })
    assert(item.expectedConceptKeys.every(key => metadata.answer_groups.some(group => group.key === key)), 'A selected answer group reference is invalid.', { ...context, questionNumbers: [number] })
  }

  for (const tile of board.tiles) {
    const normalized = normalizeWrittenAnswer(tile.label)
    const mappings = new Set()
    for (const item of board.questions) {
      const number = item.question.question_number
      const metadata = catalogByNumber.get(number)
      for (const group of metadata.answer_groups) {
        if (aliasesOf(group).has(normalized)) mappings.add(`${number}\u0000${group.key}`)
      }
    }
    assert(mappings.size === 1, 'A displayed tile does not map to exactly one question concept.', { ...context, questionNumbers })
  }

  const assignments = Object.fromEntries(board.questions.map(item => {
    const ids = board.tiles.filter(tile => Boolean(item.acceptedConceptByAlias[normalizeWrittenAnswer(tile.label)]))
      .map(tile => tile.id)
    const keys = ids.map(id => {
      const tile = board.tiles.find(value => value.id === id)
      return item.acceptedConceptByAlias[normalizeWrittenAnswer(tile.label)]
    })
    assert(ids.length === item.requiredCount, 'A question has an incomplete set of valid displayed tiles.', { ...context, questionNumbers: [item.question.question_number] })
    assert(new Set(keys).size === item.requiredCount, 'A valid tile assignment repeats a concept.', { ...context, questionNumbers: [item.question.question_number] })
    return [item.question.question_number, ids]
  }))
  const correctRows = scoreMatchingBoard(board, assignments)
  assert(correctRows.every(row => row.outcome === 'correct'), 'A complete valid tile assignment did not grade entirely correct.', { ...context, questionNumbers: correctRows.filter(row => row.outcome !== 'correct').map(row => row.question_number) })

  if (board.questions.length >= 2) {
    const first = board.questions[0]
    const second = board.questions.find(item => first && item.question.question_number !== first.question.question_number
      && (assignments[item.question.question_number] ?? []).length > 0)
    if (first && second) {
      const wrongAssignments = Object.fromEntries(Object.entries(assignments).map(([number, ids]) => [number, [...ids]]))
      const firstIds = wrongAssignments[first.question.question_number]
      const secondIds = wrongAssignments[second.question.question_number]
      if (firstIds?.length && secondIds?.length) {
        ;[firstIds[0], secondIds[0]] = [secondIds[0], firstIds[0]]
        const wrongRows = scoreMatchingBoard(board, wrongAssignments)
        assert(wrongRows.find(row => row.question_number === first.question.question_number)?.outcome === 'incorrect'
          && wrongRows.find(row => row.question_number === second.question.question_number)?.outcome === 'incorrect',
        'A wrong tile swap was not graded incorrect.', { ...context, questionNumbers: [first.question.question_number, second.question.question_number] })
      }
    }
  }

  const multi = board.questions.find(item => item.requiredCount > 1)
  if (multi) {
    const partial = board.tiles.filter(tile => Boolean(multi.acceptedConceptByAlias[normalizeWrittenAnswer(tile.label)])).slice(0, 1).map(tile => tile.id)
    const partialRows = scoreMatchingBoard(board, { [multi.question.question_number]: partial })
    assert(partialRows.find(row => row.question_number === multi.question.question_number)?.outcome === 'skipped',
      'A partially filled multi-answer question with valid matches was not skipped.', { ...context, questionNumbers: [multi.question.question_number] })
  }

  return {
    questionCount: board.questions.length,
    tileCount: board.tiles.length,
    validSwapsChecked: board.questions.length >= 2 ? 1 : 0,
    partialChecks: board.questions.some(item => item.requiredCount > 1) ? 1 : 0,
  }
}

const locations = [
  { state: 'UT', district: 'UT03' },
  { state: 'DC', district: 'DC00' },
  { state: 'AS', district: 'AS00' },
]
const editions = ['2008', '2025']
const rotations = [0, 11, 23]
const draws = [0x103, 0x205, 0x3ff]
const report = []
let activeContext = {}

try {
  for (const edition of editions) {
    for (const location of locations) {
      activeContext = { edition, state: location.state, stage: 'load questions' }
      const context = { edition, state: location.state }
      const [questions, metadata] = await Promise.all([
        rpc('get_practice_questions', { p_edition: edition, p_state_code: location.state, p_district_code: location.district }, context),
        rpc('get_practice_metadata', { p_edition: edition, p_state_code: location.state, p_district_code: location.district }, context),
      ])
      assert(Array.isArray(questions) && Array.isArray(metadata), 'The practice service did not return question and metadata arrays.', context)
      const eligible = matchingEligibleQuestions(questions, metadata)
      const excluded = questions.filter(question => !eligible.some(item => item.question_number === question.question_number)).map(question => question.question_number)
      assert(eligible.length === questions.length && new Set(eligible.map(question => question.question_number)).size === questions.length,
        'One or more official questions were unavailable to matching.', { ...context, questionNumbers: excluded.length ? excluded : questions.map(question => question.question_number) })

      const metadataByNumber = new Map(metadata.map(item => [item.question_number, item]))
      const coverage = new Set()
      let planRuns = 0
      let boardsChecked = 0
      let tileCount = 0
      let validSwapsChecked = 0
      let partialChecks = 0
      const hasMultiAnswerQuestions = metadata.some(item => item.required_count > 1 && eligible.some(question => question.question_number === item.question_number))
      for (const rotation of rotations) {
        const rotated = [...eligible.slice(rotation), ...eligible.slice(0, rotation)]
        const windows = []
        for (let start = 0; start < rotated.length; start += 30) windows.push(rotated.slice(start, start + 30))
        for (const window of windows) {
          for (const questionsPerRound of [4, 5]) {
            for (const seed of draws) {
              activeContext = { edition, state: location.state, stage: 'plan verification', questionNumbers: window.map(question => question.question_number) }
              const plan = buildMatchingPlan(window, metadata, {
                questionCount: window.length,
                questionsPerRound,
                pace: 'untimed',
                prioritizeMissed: false,
              }, [], seededRandom(seed + rotation + (questionsPerRound * 100)))
              assert(!plan.error, 'A safe reviewed question window could not be planned.', activeContext)
              const requestedNumbers = new Set(window.map(question => question.question_number))
              const selectedNumbers = plan.questions.map(item => item.question.question_number)
              assert(plan.selectedCount === window.length && selectedNumbers.length === window.length
                && new Set(selectedNumbers).size === selectedNumbers.length
                && selectedNumbers.every(number => requestedNumbers.has(number)),
              'The planner did not retain every requested question exactly once.', { ...activeContext, questionNumbers: selectedNumbers })
              for (const number of selectedNumbers) coverage.add(number)
              planRuns += 1
              for (const board of plan.boards) {
                assert(board.questions.length <= questionsPerRound, 'A board exceeds its configured question count.', { ...activeContext, questionNumbers: board.questions.map(item => item.question.question_number) })
                const result = assertBoard(board, metadataByNumber, activeContext)
                boardsChecked += 1
                tileCount += result.tileCount
                validSwapsChecked += result.validSwapsChecked
                partialChecks += result.partialChecks
              }
            }
          }
        }
      }
      assert(coverage.size === questions.length && questions.every(question => coverage.has(question.question_number)),
        'Rotated question windows did not cover the complete edition selection.', { ...context, questionNumbers: questions.filter(question => !coverage.has(question.question_number)).map(question => question.question_number) })
      assert(validSwapsChecked > 0, 'No board supported a wrong-swap verification.', context)
      assert(!hasMultiAnswerQuestions || partialChecks > 0, 'No multi-answer board supported a partial-answer verification.', context)
      report.push({ edition, state: location.state, questions: questions.length, metadataRows: metadata.length, rotatedWindowsCovered: coverage.size, planRuns, boardsChecked, tilesChecked: tileCount, validSwapsChecked, partialChecks })
    }
  }
  console.log(JSON.stringify({ checks: [
    'complete six edition/jurisdiction content coverage',
    'rotated windows of up to 30 distinct questions with round sizes 4 and 5 and three fixed random draws',
    'ten-tile board limit and valid group references',
    'every displayed tile maps uniquely to one question concept',
    'all valid assignments grade correct, wrong swaps incorrect, partial valid multi-answer matches skipped',
  ], datasets: report, elapsedMs: Date.now() - started }))
} catch (error) {
  const safe = error instanceof CheckFailure ? error : new CheckFailure('Matching content verification encountered a runtime error.', activeContext)
  console.error(JSON.stringify({ error: safe.message, ...safe.context, elapsedMs: Date.now() - started }))
  process.exitCode = 1
}
