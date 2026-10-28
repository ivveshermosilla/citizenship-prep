import test from 'node:test'
import assert from 'node:assert/strict'
import type { Question } from './domain.ts'
import {
  appendSubmittedOutcome,
  buildTestOptionSets,
  clampSelectionCount,
  createTestOptions,
  cumulativeRoundSizes,
  makeFlashcardDeck,
  outcomeAtDeadline,
  questionCount,
  requestedAnswerItemCount,
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
function numericSources() {
  return [
    q(110, 'How many amendments does the Constitution have?', ['Twenty-seven (27)'], 'Counts'),
    q(111, 'How many senators are there?', ['One hundred (100)'], 'Counts'),
    q(112, 'How many voting members are in the House?', ['Four hundred thirty-five (435)'], 'Counts'),
    q(113, 'How many justices are on the Supreme Court?', ['Nine (9)'], 'Counts'),
  ]
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

test('multi-item cardinality is explicit and does not treat unrelated numbers as requested answer counts', () => {
  assert.equal(requestedAnswerItemCount('Name two national holidays.'), 2)
  assert.equal(requestedAnswerItemCount('What are three reasons to study?'), 3)
  assert.equal(requestedAnswerItemCount('The first three words are “We the People.” What are they?'), 1)
  assert.equal(requestedAnswerItemCount('Why do we have three branches of government?'), 1)
  assert.equal(requestedAnswerItemCount('Name one of the two longest rivers.'), 1)
})

test('multiple-choice options contain exactly one complete correct set and filter aliases', () => {
  const target = q(9, 'What are two rights in the Declaration of Independence?', ['Life', 'Liberty', 'Pursuit of happiness'], 'Declaration')
  const pool = [
    target,
    ...numericSources(),
    q(13, 'What is one right from the First Amendment?', ['Speech'], 'Amendments'),
    q(14, 'What is a freedom of speech example?', ['Freedom of speech'], 'Examples'),
  ]
  const options = createTestOptions(target, pool, '2008', rng)
  assert.equal(options.options.length, 4)
  assert.equal(options.options.filter(option => option.correct).length, 1)
  assert.ok(options.options.every(option => option.label.includes('; ')), 'every option for a two-item question must include two answer items')
  assert.ok(options.options.filter(option => !option.correct).every(option => !/speech/iu.test(option.label)), 'accepted/alias rights must not become distractors')
  assert.equal(new Set(options.options.map(option => option.label.toLocaleLowerCase('en-US'))).size, 4)
})

test('official full multi-item answer strings stay intact; one bundled answer remains one item', () => {
  const branches = q(16, 'Name the three branches of government.', ['Legislative, executive, and judicial branches'], 'Government')
  const pool = [branches,
    ...numericSources(),
  ]
  const result = createTestOptions(branches, pool, '2025', rng)
  assert.equal(result.options.filter(option => option.correct).length, 1)
  assert.equal(result.options.find(option => option.correct)?.label, 'Legislative, executive, and judicial branches')
  assert.equal(requestedAnswerItemCount('The idea of self-government is in the first three words. What are they?'), 1)
})

test('accepted names and holidays stay atomic; they are not split into fake complete answer sets', () => {
  const target = q(17, 'What are the two parts of the U.S. Congress?', ['Senate and House of Representatives'], 'Congress')
  const pool = [target,
    q(36, 'Name two positions in the Cabinet.', ['Secretary of Health and Human Services', 'Secretary of the Treasury'], 'Cabinet'),
    q(100, 'Name two national U.S. holidays.', ['Martin Luther King, Jr. Day', 'Independence Day'], 'Holidays'),
    ...numericSources(),
  ]
  const options = createTestOptions(target, pool, '2008', rng)
  assert.equal(options.options.filter(option => option.correct).length, 1)
  assert.equal(options.options.find(option => option.correct)?.label, 'Senate and House of Representatives')
  assert.ok(!options.options.some(option => option.label === 'Secretary of Health and Human Services'))
  assert.ok(!options.options.some(option => option.label === 'Martin Luther King, Jr. Day'))
})

test('semantic synonyms are not used as distractors for accepted First Amendment answers', () => {
  const target = q(51, 'What are two rights of everyone in the United States?', ['Freedom of speech', 'Freedom of religion'], 'Rights')
  const pool = [target,
    q(1, 'What is an example of freedom of speech?', ['Speech'], 'Speech examples'),
    q(2, 'What freedom does the First Amendment protect?', ['Expression'], 'Speech examples 2'),
    ...numericSources(),
  ]
  const options = createTestOptions(target, pool, '2008', rng)
  assert.equal(options.options.length, 4)
  assert.ok(options.options.filter(option => !option.correct).every(option => !/\b(?:speech|expression)\b/iu.test(option.label)))
})

test('edition mappings and safe fallback never return an incomplete one-item distractor set', () => {
  const target = q(65, 'What are three rights of people living in the United States?', ['Life', 'Liberty', 'Security', 'Equality'], 'Rights')
  const pool = [target,
    ...numericSources(),
  ]
  const result = createTestOptions(target, pool, '2025', rng)
  assert.equal(result.options.length, 4)
  assert.ok(result.options.every(option => option.label.split('; ').length === 3))
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

test('option-set preflight reports questions without enough safe official-answer distractors', () => {
  const question = q(1, 'Name one thing?', ['Only answer'], 'One topic')
  const sets = buildTestOptionSets([question], '2025', rng)
  assert.equal(sets.get(1)?.options.length, 0)
  assert.match(sets.get(1)?.reason ?? '', /not enough clearly unrelated/u)
})

test('one-card practice can source clearly unrelated distractors from the full edition pool', () => {
  const target = q(1, 'What is the supreme law of the land?', ['The Constitution'], 'Principles')
  const sourcePool = [target, ...numericSources()]
  const isolated = buildTestOptionSets([target], '2025', rng)
  const fullPool = buildTestOptionSets([target], '2025', rng, sourcePool)
  assert.equal(isolated.get(1)?.options.length, 0)
  assert.equal(fullPool.get(1)?.options.length, 4)
  assert.equal(fullPool.get(1)?.options.filter(option => option.correct).length, 1)
})

test('numeric targets use historical people as clearly unrelated answer-type distractors', () => {
  const target = q(2, 'How many U.S. senators are there?', ['One hundred (100)'], 'Congress')
  const sourcePool = [target,
    q(10, 'Who wrote the Declaration of Independence?', ['(Thomas) Jefferson'], 'History'),
    q(11, 'Who was the Father of Our Country?', ['(George) Washington'], 'History'),
    q(12, 'Name one of the writers of the Federalist Papers.', ['(James) Madison', '(Alexander) Hamilton', '(John) Jay', 'Publius'], 'History'),
  ]
  const options = createTestOptions(target, sourcePool, '2025', rng)
  assert.equal(options.options.length, 4)
  assert.equal(options.options.filter(option => option.correct).length, 1)
  assert.ok(options.options.filter(option => !option.correct).every(option => !/\d/u.test(option.label)))
  assert.ok(!options.options.some(option => option.label === 'Publius'))
})
