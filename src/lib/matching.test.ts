import test from 'node:test'
import assert from 'node:assert/strict'
import type { Question } from './domain.ts'
import type { LearningQuestionProgress, PracticeMetadata } from './quick-question.ts'
import { buildMatchingPlan, gradeMatchingQuestion, isBeforeDeadline, roundAllowanceSeconds, scoreMatchingBoard, summarizeMatchingOutcomes, type MatchingBoard } from './matching.ts'

function question(number: number, answers: string[] = [`Answer ${number}`]): Question {
  return {
    question_number: number, question_text: `Question ${number}?`, section: 'Test', subsection: 'Test', answers,
    answer_display: answers[0] ?? '', answer_updated_on: '2026-10-27', next_update_on: '2026-11-27',
    source_urls: ['https://www.uscis.gov/'], is_geography_dependent: false, is_time_dependent: false,
  }
}

function metadata(number: number, groups: Array<{ key: string; display: string; aliases?: string[] }>, required = groups.length): PracticeMetadata {
  return { question_number: number, required_count: required, content_version: 'reviewed-test', answer_groups: groups.map(group => ({ ...group, aliases: group.aliases ?? [] })), distractor_sets: [], }
}

const seq = (...values: number[]) => { let index = 0; return () => values[index++ % values.length] ?? 0 }
const simpleSet = (numbers: number[]) => numbers.map(number => metadata(number, [{ key: `concept-${number}`, display: `Display ${number}`, aliases: [`Alternate ${number}`] }]))

test('boards cover every selected distinct question, use distinct tiles, and stay under the 10-tile cap', () => {
  const questions = Array.from({ length: 12 }, (_, index) => question(index + 1))
  const groups = simpleSet(questions.map(item => item.question_number))
  const plan = buildMatchingPlan(questions, groups, { questionCount: 12, questionsPerRound: 5, pace: 'standard', prioritizeMissed: false }, [], seq(0.31, 0.79))
  assert.equal(plan.selectedCount, 12)
  assert.deepEqual(plan.boards.flatMap(board => board.questions.map(item => item.question.question_number)).sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index + 1))
  assert.equal(new Set(plan.boards.flatMap(board => board.questions.map(item => item.question.question_number))).size, 12)
  for (const board of plan.boards) {
    assert.ok(board.questions.length <= 5)
    assert.ok(board.tiles.length <= 10)
    assert.equal(new Set(board.tiles.map(tile => tile.id)).size, board.tiles.length)
  }
})

test('question-number duplicates in input never create repeated cards', () => {
  const first = question(1, ['First text'])
  const duplicate = question(1, ['Duplicate text'])
  const plan = buildMatchingPlan([first, duplicate, question(2)], simpleSet([1, 2]), { questionCount: 20, questionsPerRound: 4, pace: 'standard', prioritizeMissed: false }, [], seq(0.1))
  assert.equal(plan.selectedCount, 2)
  assert.equal(new Set(plan.questions.map(item => item.question.question_number)).size, 2)
})

test('multi-concept questions count each required tile, defer when needed, and preserve five-state style questions', () => {
  const questions = [question(1), question(2, ['Five states']), question(3), question(4), question(5)]
  const catalog = [
    metadata(1, [{ key: 'single-1', display: 'Answer 1' }]),
    metadata(2, Array.from({ length: 5 }, (_, index) => ({ key: `state-${index}`, display: `State ${index}`, aliases: [`State alias ${index}`] })), 5),
    ...[3, 4, 5].map(number => metadata(number, [
      { key: `answer-${number}-a`, display: `Answer ${number}A` },
      { key: `answer-${number}-b`, display: `Answer ${number}B` },
    ])),
  ]
  const plan = buildMatchingPlan(questions, catalog, { questionCount: 5, questionsPerRound: 5, pace: 'standard', prioritizeMissed: false }, [], seq(0.18, 0.62))
  assert.equal(plan.selectedCount, 5)
  assert.equal(plan.boards.flatMap(board => board.questions).some(item => item.question.question_number === 2), true)
  assert.ok(plan.boards.every(board => board.tiles.length <= 10))
  assert.equal(plan.boards.flatMap(board => board.questions).length, 5)
  assert.ok(plan.boards.some(board => board.questions.length < 5), 'the five-concept item is deferred if the total tile cap requires it')
})

test('ambiguous normalized aliases exclude questions from the same board, including across display and alternate spellings', () => {
  const questions = [question(1), question(2), question(3), question(4)]
  const catalog = [
    metadata(1, [{ key: 'president', display: 'The President', aliases: ['President'] }]),
    metadata(2, [{ key: 'president-role', display: 'President', aliases: ['The President'] }]),
    ...simpleSet([3, 4]),
  ]
  const plan = buildMatchingPlan(questions, catalog, { questionCount: 4, questionsPerRound: 4, pace: 'untimed', prioritizeMissed: false }, [], seq(0.2, 0.7))
  const sameBoard = plan.boards.find(board => board.questions.some(item => item.question.question_number === 1))
  assert.ok(sameBoard)
  assert.equal(sameBoard.questions.some(item => item.question.question_number === 2), false)
  assert.equal(plan.boards.flatMap(board => board.questions).length, 4)
})

test('metadata with overlapping aliases for separate concepts fails closed', () => {
  const plan = buildMatchingPlan([question(1)], [metadata(1, [
    { key: 'a', display: 'First answer', aliases: ['Shared!'] },
    { key: 'b', display: 'Second answer', aliases: ['shared'] },
  ], 1)], { questionCount: 1, questionsPerRound: 4, pace: 'untimed', prioritizeMissed: false })
  assert.equal(plan.selectedCount, 0)
  assert.match(plan.error ?? '', /not available/u)
})

test('visible accepted labels grade by target aliases, wrong assignments are Incorrect, and omissions are Skipped', () => {
  const questions = [question(1, ['One; Two']), question(2)]
  const catalog = [
    metadata(1, [{ key: 'one', display: 'One', aliases: ['First'] }, { key: 'two', display: 'Two', aliases: ['Second'] }]),
    ...simpleSet([2]),
  ]
  const plan = buildMatchingPlan(questions, catalog, { questionCount: 2, questionsPerRound: 4, pace: 'standard', prioritizeMissed: false }, [], seq(0.99))
  const board = plan.boards[0]!
  const item = board.questions.find(value => value.question.question_number === 1)!
  const oneTile = board.tiles.find(tile => tile.label === 'One')!
  const twoTile = board.tiles.find(tile => tile.label === 'Two')!
  assert.deepEqual(scoreMatchingBoard(board, { 1: [oneTile.id, twoTile.id] }).find(value => value.question_number === 1)?.outcome, 'correct')
  assert.deepEqual(scoreMatchingBoard(board, { 1: [oneTile.id] }).find(value => value.question_number === 1)?.outcome, 'skipped')
  const foreignTile = board.tiles.find(tile => !item.acceptedConceptByAlias[tile.label.toLowerCase()])!
  assert.equal(scoreMatchingBoard(board, { 1: [oneTile.id, foreignTile.id] }).find(value => value.question_number === 1)?.outcome, 'incorrect')
  assert.equal(gradeMatchingQuestion(item, ['one', 'not-expected']), 'incorrect')
  assert.equal(gradeMatchingQuestion(item, []), 'skipped')
})

test('a valid visible reviewed concept remains correct even when it was not the sample expected set', () => {
  const target = question(1, ['One or two'])
  const catalog = [metadata(1, [
    { key: 'one', display: 'One', aliases: ['First'] },
    { key: 'two', display: 'Two', aliases: ['Second'] },
  ], 1)]
  const plan = buildMatchingPlan([target], catalog, { questionCount: 1, questionsPerRound: 4, pace: 'untimed', prioritizeMissed: false }, [], seq(0.99))
  const matchingQuestion = plan.questions[0]!
  assert.equal(matchingQuestion.expectedConceptKeys.length, 1)
  const alternateKey = matchingQuestion.expectedConceptKeys[0] === 'one' ? 'two' : 'one'
  const alternateLabel = catalog[0]!.answer_groups.find(group => group.key === alternateKey)!.display
  const board: MatchingBoard = { questions: [matchingQuestion], tiles: [{ id: 'opaque-visible-alternate', label: alternateLabel }] }
  assert.equal(scoreMatchingBoard(board, { 1: ['opaque-visible-alternate'] })[0]?.outcome, 'correct')
  assert.equal(gradeMatchingQuestion(matchingQuestion, [alternateKey]), 'correct')
})

test('prioritize missed remains randomized, bounded, and distinct within the selected question set', () => {
  const questions = Array.from({ length: 9 }, (_, index) => question(index + 1))
  const progress: LearningQuestionProgress[] = [1, 2, 3].map(number => ({ question_number: number, correct_count: 0, incorrect_count: 1, skipped_count: 0, last_outcome: 'incorrect' }))
  const plan = buildMatchingPlan(questions, simpleSet(questions.map(item => item.question_number)), { questionCount: 4, questionsPerRound: 4, pace: 'standard', prioritizeMissed: true }, progress, seq(0.2, 0.8))
  assert.equal(plan.missedAvailableCount, 3)
  assert.equal(plan.selectedCount, 4)
  assert.equal(new Set(plan.questions.map(item => item.question.question_number)).size, 4)
  assert.ok([1, 2, 3].every(number => plan.questions.some(item => item.question.question_number === number)))
})

test('pace allowance rounds fractional seconds and untimed mode has no deadline', () => {
  assert.equal(roundAllowanceSeconds([1, 2], 'relaxed'), 70)
  assert.equal(roundAllowanceSeconds([1, 2], 'standard'), 55)
  assert.equal(roundAllowanceSeconds([1, 2], 'challenge'), 40)
  assert.equal(roundAllowanceSeconds([1], 'standard'), 23)
  assert.equal(roundAllowanceSeconds([1, 2], 'untimed'), null)
  assert.equal(isBeforeDeadline(null, 99_000), true)
  assert.equal(isBeforeDeadline(10_000, 9_999), true)
  assert.equal(isBeforeDeadline(10_000, 10_000), false)
})

test('outcome totals include skipped in unsuccessful percentage', () => {
  assert.deepEqual(summarizeMatchingOutcomes([
    { question_number: 1, outcome: 'correct' }, { question_number: 2, outcome: 'incorrect' }, { question_number: 3, outcome: 'skipped' },
  ]), { total: 3, correct: 1, incorrect: 1, skipped: 1, percent: 33 })
})
