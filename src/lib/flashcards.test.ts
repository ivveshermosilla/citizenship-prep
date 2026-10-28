import test from 'node:test'
import assert from 'node:assert/strict'
import type { Question } from './domain.ts'
import type { PracticeMetadata } from './quick-question.ts'
import {
  appendSubmittedOutcome,
  buildReviewedTestOptionSets,
  clampSelectionCount,
  cumulativeRoundSizes,
  makeFlashcardDeck,
  outcomeAtDeadline,
  questionCount,
  summarizeOutcomes,
  totalTestPresentations,
} from './flashcards.ts'

function q(number: number, text: string, answers: string[], subsection: string): Question {
  return {
    question_number: number,
    question_text: text,
    section: `Section ${number}`,
    subsection,
    answers,
    answer_display: answers[0] ?? '',
    answer_updated_on: '2026-10-27',
    next_update_on: '2026-11-27',
    source_urls: ['https://www.uscis.gov/'],
    is_geography_dependent: false,
    is_time_dependent: false,
  }
}
const rng = () => 0.41

test('question count, synchronized-input clamping, and inclusive ranges use real question IDs', () => {
  const questions = [q(1, 'What is a form?', ['Republic'], 'A'), q(2, 'Which river?', ['Mississippi'], 'B'), q(3, 'What is an ocean?', ['Pacific'], 'C')]
  assert.equal(questionCount(questions), 3)
  assert.equal(clampSelectionCount(20, 3), 3)
  assert.equal(clampSelectionCount(0, 3), 1)
  const range = makeFlashcardDeck(questions, { method: 'range', rangeFrom: 2, rangeTo: 3, count: 99 }, [], rng)
  assert.deepEqual(range.deck.map(question => question.question_number), [2, 3])
  const badRange = makeFlashcardDeck(questions, { method: 'range', rangeFrom: 1, rangeTo: 4, count: 4 }, [], rng)
  assert.equal(badRange.deck.length, 0)
  assert.match(badRange.error ?? '', /unavailable/u)
})

test('random is drawn once without repeats; in-order and topic selections stay eligible', () => {
  const questions = [
    { ...q(1, 'What is a form?', ['Republic'], 'Topic A'), section: 'Same section' },
    { ...q(2, 'Which river?', ['Mississippi'], 'Topic A'), section: 'Same section' },
    q(3, 'What is an ocean?', ['Pacific'], 'Topic B'),
    q(4, 'Who wrote a document?', ['Thomas Jefferson'], 'Topic B'),
  ]
  const randomDeck = makeFlashcardDeck(questions, { method: 'random', count: 3 }, [], rng).deck
  assert.equal(new Set(randomDeck.map(question => question.question_number)).size, 3)
  assert.equal(randomDeck.length, 3)
  const ordered = makeFlashcardDeck(questions, { method: 'in-order', count: 2 }, [], rng).deck
  assert.deepEqual(ordered.map(question => question.question_number), [1, 2])
  const topicKey = 'Same section\u0000Topic A'
  const topic = makeFlashcardDeck(questions, { method: 'topic', topicKey, count: 8 }, [], rng)
  assert.deepEqual(topic.deck.map(question => question.question_number), [1, 2])
  assert.equal(topic.eligibleCount, 2)
})

test('missed-question priority stays inside the selected pool and preserves range membership', () => {
  const questions = [1, 2, 3, 4].map(n => q(n, `Question ${n}?`, [`Answer ${n}`], `Topic ${n}`))
  const progress = [
    { question_number: 1, correct_count: 3, incorrect_count: 1, skipped_count: 0, last_outcome: 'correct' as const },
    { question_number: 4, correct_count: 0, incorrect_count: 0, skipped_count: 1, last_outcome: 'skipped' as const },
  ]
  const ordered = makeFlashcardDeck(questions, { method: 'in-order', count: 2, prioritizeMissed: true }, progress, rng)
  assert.deepEqual(ordered.deck.map(question => question.question_number), [1, 2])
  assert.equal(ordered.selectedMissedCount, 1)
  const range = makeFlashcardDeck(questions, { method: 'range', rangeFrom: 1, rangeTo: 2, count: 2, prioritizeMissed: true }, progress, rng)
  assert.deepEqual(range.deck.map(question => question.question_number), [1, 2])
  assert.ok(range.deck.every(question => question.question_number >= 1 && question.question_number <= 2))
})

test('cumulative rounds are rolling prefixes and presentation counts include repeats', () => {
  assert.deepEqual(cumulativeRoundSizes(8, 3, true), [3, 6, 8])
  assert.equal(totalTestPresentations(cumulativeRoundSizes(8, 3, true)), 17)
  assert.deepEqual(cumulativeRoundSizes(20, 1, true).slice(0, 3), [1, 2, 3])
  assert.equal(totalTestPresentations(cumulativeRoundSizes(20, 1, true)), 210)
  assert.deepEqual(cumulativeRoundSizes(4, Number.NaN, true), [1, 2, 3, 4])
  assert.deepEqual(cumulativeRoundSizes(4, 0, true), [1, 2, 3, 4])
  assert.deepEqual(cumulativeRoundSizes(Number.NaN, 1, true), [])
  assert.deepEqual(cumulativeRoundSizes(8, 3, false), [8])
})

test('deadline resolution and idempotent client prefixes preserve submitted outcomes', () => {
  assert.equal(outcomeAtDeadline(true, 15_000, 15_000), 'skipped')
  assert.equal(outcomeAtDeadline(false, 15_000, 14_999), 'incorrect')
  assert.equal(outcomeAtDeadline(null, 15_000, 14_999), null)
  const first = [{ question_number: 1, outcome: 'correct' as const }]
  assert.deepEqual(appendSubmittedOutcome(first, { question_number: 1, outcome: 'incorrect' }), first)
  const complete = appendSubmittedOutcome(first, { question_number: 2, outcome: 'skipped' })
  assert.deepEqual(complete, [first[0], { question_number: 2, outcome: 'skipped' }])
  assert.deepEqual(summarizeOutcomes(complete), { answered: 2, correct: 1, incorrect: 0, skipped: 1, percent: 50 })
})

test('reviewed distractor sets produce four options and exclude aliases of complete correct assignments', () => {
  const target = q(17, 'Name the two parts of Congress.', ['The Senate; The House of Representatives'], 'Congress')
  const metadata: PracticeMetadata[] = [{
    question_number: 17, required_count: 2, content_version: 'reviewed-1',
    answer_groups: [
      { key: 'senate', display: 'The Senate', aliases: ['Senate'] },
      { key: 'house', display: 'The House of Representatives', aliases: ['House'] },
      { key: 'congress', display: 'Congress', aliases: [] },
    ],
    distractor_sets: [
      ['Senate', 'House'],
      ['The Cabinet', 'The Judiciary'],
      ['The President', 'Federal agencies'],
      ['State legislatures', 'The military'],
      ['Senate', 'The Senate'],
      ['Senate'],
      ['The Cabinet', 'The Cabinet'],
    ],
  }]
  const options = buildReviewedTestOptionSets([target], metadata, rng).get(17)?.options ?? []
  assert.equal(options.length, 4)
  assert.equal(options.filter(option => option.correct).length, 1)
  assert.equal(options.filter(option => !option.correct).length, 3)
  assert.ok(!options.some(option => option.label === 'Senate; House'))
  assert.ok(options.every(option => option.label.split('; ').length === 2))
})

test('reviewed practice sets fail closed when metadata is missing or has fewer than three complete distractors', () => {
  const target = q(1, 'Name one branch.', ['Congress'], 'Government')
  const missing = buildReviewedTestOptionSets([target], [], rng).get(1)
  assert.equal(missing?.options.length, 0)
  assert.match(missing?.reason ?? '', /not available/u)
  const thin: PracticeMetadata[] = [{
    question_number: 1, required_count: 1, content_version: 'reviewed-1',
    answer_groups: [{ key: 'congress', display: 'Congress', aliases: [] }],
    distractor_sets: [['The Cabinet'], ['Senate']],
  }]
  assert.equal(buildReviewedTestOptionSets([target], thin, rng).get(1)?.options.length, 0)
})
