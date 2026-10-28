import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseQuickQuestion, gradeWrittenAnswer, normalizeWrittenAnswer, type PracticeMetadata } from './quick-question.ts'

function meta(required_count: number, answer_groups: PracticeMetadata['answer_groups']): PracticeMetadata {
  return { question_number: 1, required_count, answer_groups, distractor_sets: [], content_version: 'unit-fixture' }
}

test('written grading normalizes case, optional hyphens, punctuation, and extra spacing', () => {
  const single = meta(1, [{ key: 'vice-president', display: 'Vice President', aliases: ['Vice-President'] }])
  assert.equal(normalizeWrittenAnswer('  VICE—PRESIDENT! '), 'vice president')
  assert.equal(gradeWrittenAnswer([' vice-president  '], single), 'correct')
  assert.equal(gradeWrittenAnswer(['VICE   PRESIDENT.'], single), 'correct')
  assert.equal(gradeWrittenAnswer(['President'], single), 'incorrect')
})

test('reviewed numeric words and abbreviations are accepted only through aliases', () => {
  const groups = meta(1, [{ key: 'one', display: 'One', aliases: ['1', 'a single'] }])
  assert.equal(gradeWrittenAnswer(['1'], groups), 'correct')
  assert.equal(gradeWrittenAnswer(['a single'], groups), 'correct')
  assert.equal(gradeWrittenAnswer(['two'], groups), 'incorrect')
  const abbreviation = meta(1, [{ key: 'united-states', display: 'United States', aliases: ['U.S.', 'US'] }])
  assert.equal(gradeWrittenAnswer(['u.s.'], abbreviation), 'correct')
  assert.equal(gradeWrittenAnswer(['USA'], abbreviation), 'incorrect')
})

test('personal-name accent variants normalize without accepting spelling changes', () => {
  const name = meta(1, [{ key: 'velazquez', display: 'Nydia Velázquez', aliases: [] }])
  assert.equal(gradeWrittenAnswer(['Nydia Velazquez'], name), 'correct')
  assert.equal(gradeWrittenAnswer(['Nýdia Velázquez'], name), 'correct')
  assert.equal(gradeWrittenAnswer(['Nidia Velazquez'], name), 'incorrect')
  assert.equal(gradeWrittenAnswer(['Nydia Velazquez Jr'], name), 'incorrect')
})

test('distinct bundled concepts match in any field order but duplicates cannot fill two fields', () => {
  const congress = meta(2, [
    { key: 'senate', display: 'The Senate', aliases: ['Senate', 'U.S. Senate', 'United States Senate'] },
    { key: 'house', display: 'The House of Representatives', aliases: ['House'] },
  ])
  assert.equal(gradeWrittenAnswer(['House', 'Senate'], congress), 'correct')
  assert.equal(gradeWrittenAnswer(['Senate', 'United States Senate'], congress), 'incorrect')
  assert.equal(gradeWrittenAnswer(['Senate', 'wrong'], congress), 'incorrect')
  assert.equal(gradeWrittenAnswer(['Senate'], congress), 'incorrect')
  const lastFieldFirst = new Array<string>(2)
  lastFieldFirst[1] = 'House'
  assert.equal(gradeWrittenAnswer(lastFieldFirst, congress), 'incorrect')
})

test('reviewed synonymous expressions share one concept and cannot count twice', () => {
  const groups = meta(2, [
    { key: 'speech-expression', display: 'Freedom of speech', aliases: ['Freedom of expression'] },
    { key: 'assembly', display: 'Freedom of assembly', aliases: [] },
  ])
  assert.equal(gradeWrittenAnswer(['Freedom of expression', 'Freedom of assembly'], groups), 'correct')
  assert.equal(gradeWrittenAnswer(['Freedom of speech', 'Freedom of expression'], groups), 'incorrect')
})

test('exact matching rejects negations, unrelated names, and substring-only answers', () => {
  const groups = meta(1, [{ key: 'washington', display: 'George Washington', aliases: ['Washington'] }])
  assert.equal(gradeWrittenAnswer(['not George Washington'], groups), 'incorrect')
  assert.equal(gradeWrittenAnswer(['George Washington Carver'], groups), 'incorrect')
  assert.equal(gradeWrittenAnswer(['Washington is correct'], groups), 'incorrect')
})

test('vacancy predecessors are not accepted unless the current reviewed metadata explicitly includes them', () => {
  const current = meta(1, [{ key: 'vacant', display: 'Vacant', aliases: [] }])
  assert.equal(gradeWrittenAnswer(['Vacant'], current), 'correct')
  assert.equal(gradeWrittenAnswer(['The previous officeholder'], current), 'incorrect')
  assert.equal(gradeWrittenAnswer(['Former Officeholder'], current), 'incorrect')
})

test('all-empty check skips; partial entry and ambiguous metadata are incorrect', () => {
  const groups = meta(2, [
    { key: 'one', display: 'One', aliases: [] },
    { key: 'two', display: 'Two', aliases: [] },
  ])
  assert.equal(gradeWrittenAnswer(['', '   '], groups), 'skipped')
  assert.equal(gradeWrittenAnswer(['One', ''], groups), 'incorrect')
  const ambiguous = meta(1, [
    { key: 'a', display: 'First', aliases: ['Same'] },
    { key: 'b', display: 'Second', aliases: ['Same'] },
  ])
  assert.equal(gradeWrittenAnswer(['Same'], ambiguous), 'incorrect')
})

test('random question selection avoids the previous question when alternatives exist', () => {
  const questions = [{ question_number: 1 }, { question_number: 2 }, { question_number: 3 }]
  assert.equal(chooseQuickQuestion(questions, 2, () => 0)?.question_number, 1)
  assert.equal(chooseQuickQuestion(questions, 2, () => 0.99)?.question_number, 3)
  assert.equal(chooseQuickQuestion([{ question_number: 7 }], 7, () => 0.5)?.question_number, 7)
  assert.equal(chooseQuickQuestion([], undefined), undefined)
})
