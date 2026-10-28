import { formatAnswers, type Edition, type Question } from './domain.ts'

export type FlashcardMethod = 'random' | 'in-order' | 'topic' | 'range'
export type FlashcardOutcome = 'correct' | 'incorrect' | 'skipped'
export type FlashcardProgress = {
  question_number: number
  correct_count: number
  incorrect_count: number
  skipped_count: number
  last_outcome: FlashcardOutcome | null
}
export type TopicChoice = { key: string; section: string; subsection: string; count: number }
export type FlashcardSelection = {
  method: FlashcardMethod
  count: number
  topicKey?: string
  rangeFrom?: number
  rangeTo?: number
  prioritizeMissed?: boolean
}
export type DeckResult = {
  deck: Question[]
  eligibleCount: number
  eligibleMissedCount: number
  selectedMissedCount: number
  error?: string
}
export type TestOption = { id: string; label: string; correct: boolean }
export type OptionSetResult = { options: TestOption[]; reason?: string }
export type SubmittedFlashcardOutcome = { question_number: number; outcome: FlashcardOutcome }

export function questionCount(questions: Question[]): number {
  return questions.length
}

export function listTopics(questions: Question[]): TopicChoice[] {
  const grouped = new Map<string, TopicChoice>()
  for (const question of questions) {
    const section = question.section?.trim()
    const subsection = question.subsection?.trim()
    if (!section || !subsection) continue
    const key = `${section}\u0000${subsection}`
    const current = grouped.get(key)
    if (current) current.count += 1
    else grouped.set(key, { key, section, subsection, count: 1 })
  }
  return [...grouped.values()].sort((a, b) => a.section.localeCompare(b.section) || a.subsection.localeCompare(b.subsection))
}

export function topicQuestionCount(questions: Question[], topicKey?: string): number {
  if (!topicKey) return 0
  return questions.filter(question => `${question.section?.trim() ?? ''}\u0000${question.subsection?.trim() ?? ''}` === topicKey).length
}

export function clampSelectionCount(count: number, available: number): number {
  if (!Number.isFinite(count) || available <= 0) return 0
  return Math.min(available, Math.max(1, Math.trunc(count)))
}

function randomIndex(random: () => number, max: number): number {
  return Math.min(max - 1, Math.max(0, Math.floor(random() * max)))
}

export function shuffle<T>(values: T[], random: () => number = Math.random): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(random, index + 1)
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

function hasPriorMiss(progress: FlashcardProgress | undefined): boolean {
  return Boolean(progress && (progress.incorrect_count > 0 || progress.skipped_count > 0))
}

export function makeFlashcardDeck(
  questions: Question[],
  selection: FlashcardSelection,
  progress: FlashcardProgress[] = [],
  random: () => number = Math.random,
): DeckResult {
  const ordered = [...questions].sort((a, b) => a.question_number - b.question_number)
  if (ordered.length === 0) return { deck: [], eligibleCount: 0, eligibleMissedCount: 0, selectedMissedCount: 0, error: 'No questions are available for this edition.' }

  const byNumber = new Map(ordered.map(question => [question.question_number, question]))
  const progressByNumber = new Map(progress.map(item => [item.question_number, item]))
  let eligible: Question[]
  let requested: number

  if (selection.method === 'topic') {
    if (!selection.topicKey) return { deck: [], eligibleCount: 0, eligibleMissedCount: 0, selectedMissedCount: 0, error: 'Choose a topic to continue.' }
    eligible = ordered.filter(question => `${question.section?.trim() ?? ''}\u0000${question.subsection?.trim() ?? ''}` === selection.topicKey)
    requested = clampSelectionCount(selection.count, eligible.length)
  } else if (selection.method === 'range') {
    const from = selection.rangeFrom
    const to = selection.rangeTo
    if (!Number.isInteger(from) || !Number.isInteger(to) || from! < 1 || to! < from!) {
      return { deck: [], eligibleCount: 0, eligibleMissedCount: 0, selectedMissedCount: 0, error: 'Enter a valid inclusive question range.' }
    }
    eligible = ordered.filter(question => question.question_number >= from! && question.question_number <= to!)
    if (eligible.length !== to! - from! + 1 || !byNumber.has(from!) || !byNumber.has(to!)) {
      return { deck: [], eligibleCount: eligible.length, eligibleMissedCount: 0, selectedMissedCount: 0, error: 'That range includes a question number unavailable in this edition.' }
    }
    requested = eligible.length
  } else if (selection.method === 'in-order') {
    requested = clampSelectionCount(selection.count, ordered.length)
    eligible = ordered.filter(question => question.question_number <= requested)
    if (eligible.length !== requested) {
      return { deck: [], eligibleCount: eligible.length, eligibleMissedCount: 0, selectedMissedCount: 0, error: 'This edition does not contain the full requested question sequence.' }
    }
  } else {
    eligible = ordered
    requested = clampSelectionCount(selection.count, eligible.length)
  }

  if (eligible.length === 0 || requested === 0) {
    return { deck: [], eligibleCount: eligible.length, eligibleMissedCount: 0, selectedMissedCount: 0, error: 'No questions match this selection.' }
  }

  const missed = eligible.filter(question => hasPriorMiss(progressByNumber.get(question.question_number)))
  let deck: Question[]
  if (selection.prioritizeMissed && missed.length > 0) {
    if (selection.method === 'in-order' || selection.method === 'range') {
      const chosen = eligible
      deck = [...missed, ...chosen.filter(question => !hasPriorMiss(progressByNumber.get(question.question_number)))]
    } else {
      const priority = shuffle(missed, random).slice(0, requested)
      const remaining = shuffle(eligible.filter(question => !hasPriorMiss(progressByNumber.get(question.question_number))), random)
      deck = [...priority, ...remaining.slice(0, requested - priority.length)]
    }
  } else if (selection.method === 'random') {
    deck = shuffle(eligible, random).slice(0, requested)
  } else {
    deck = eligible.slice(0, requested)
  }

  const selectedMissedCount = deck.filter(question => hasPriorMiss(progressByNumber.get(question.question_number))).length
  return { deck, eligibleCount: eligible.length, eligibleMissedCount: missed.length, selectedMissedCount }
}

export function cumulativeRoundSizes(deckSize: number, addedPerRound: number, rolling: boolean): number[] {
  const size = Number.isFinite(deckSize) ? Math.max(0, Math.trunc(deckSize)) : 0
  if (size === 0) return []
  if (!rolling) return [size]
  const step = Math.max(1, clampSelectionCount(addedPerRound, size))
  const rounds: number[] = []
  for (let total = Math.min(step, size); total < size; total += step) rounds.push(total)
  rounds.push(size)
  return rounds
}

export function totalTestPresentations(roundSizes: number[]): number {
  return roundSizes.reduce((sum, count) => sum + count, 0)
}

export function requestedAnswerItemCount(questionText: string): number {
  const match = questionText.match(/\b(?:name|identify|list|give)\s+(?:the\s+)?(two|2|three|3)\b|\bwhat\s+are\s+(two|2|three|3)\b|\bwhich\s+are\s+(two|2|three|3)\b/iu)
  const cardinality = match?.[1] ?? match?.[2] ?? match?.[3]
  if (!cardinality) return 1
  return cardinality.toLowerCase() === 'three' || cardinality === '3' ? 3 : 2
}

const MULTI_ITEM_COUNTS: Record<Edition, Record<number, number>> = {
  '2008': { 9: 2, 17: 2, 36: 2, 45: 2, 51: 2, 55: 2, 64: 3, 100: 2 },
  '2025': { 10: 2, 16: 3, 19: 2, 48: 2, 65: 3, 67: 2, 69: 2, 126: 3 },
}

function requiredItems(question: Question, edition: Edition): number {
  return MULTI_ITEM_COUNTS[edition][question.question_number] ?? requestedAnswerItemCount(question.question_text)
}

const normalizedCache = new Map<string, string>()
function normalizedAnswer(value: string): string {
  const cached = normalizedCache.get(value)
  if (cached !== undefined) return cached
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/\b(?:a|an|the)\b/gu, ' ')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
  normalizedCache.set(value, normalized)
  return normalized
}

const canonicalCache = new Map<string, string>()
function canonicalAnswer(value: string): string {
  const cached = canonicalCache.get(value)
  if (cached !== undefined) return cached
  const canonical = normalizedAnswer(value)
    .replace(/\b(?:freedom of speech|freedom of expression|right to free speech|free speech|speech|expression)\b/gu, 'speech_expression')
    .replace(/\b(?:the right to vote|right to vote|voting|vote)\b/gu, 'voting_right')
    .replace(/\b(?:right to bear arms|keep and bear arms|bear arms)\b/gu, 'bear_arms_right')
  canonicalCache.set(value, canonical)
  return canonical
}

function equivalentAnswer(left: string, right: string): boolean {
  const a = canonicalAnswer(left)
  const b = canonicalAnswer(right)
  if (!a || !b) return true
  if (a === b) return true
  const shorter = a.length <= b.length ? a : b
  const longer = a.length > b.length ? a : b
  return shorter.length >= 5 && (` ${longer} `).includes(` ${shorter} `)
}

const numericKeyCache = new Map<string, string | null>()
function numericAnswerKey(answer: string): string | null {
  if (numericKeyCache.has(answer)) return numericKeyCache.get(answer) ?? null
  const parenthetical = answer.match(/\((\d{1,4})\)/u)?.[1]
  if (parenthetical) {
    const key = String(Number(parenthetical)); numericKeyCache.set(answer, key); return key
  }
  const onlyNumber = answer.match(/^\s*(\d{1,4})\s*$/u)?.[1]
  const key = onlyNumber ? String(Number(onlyNumber)) : null
  numericKeyCache.set(answer, key)
  return key
}

function isNumericCountSource(question: Question): boolean {
  return /\bhow many\b|\bhow much\b|\bnumber of\b/iu.test(question.question_text)
    && rawAcceptedAnswers(question).some(answer => numericAnswerKey(answer) !== null)
}

function isNumericTarget(question: Question): boolean {
  if (/\bhow many\b|\bhow much\b|\bhow long\b|\bhow old\b|\bwhat year\b|\bwhat date\b|\bwhat month\b|\bwhat day\b|\bwhen (?:was|were|did|is)\b/iu.test(question.question_text)) return true
  const answers = rawAcceptedAnswers(question)
  return answers.length > 0 && answers.every(answer => numericAnswerKey(answer) !== null)
}

function isHistoricalPersonSource(question: Question, answer: string): boolean {
  if (question.is_geography_dependent || question.is_time_dependent) return false
  if (!/\bwho\s+(?:wrote|was|is|became|led|served|founded|created)\b|\bname one of the writers\b/iu.test(question.question_text)) return false
  const cleaned = answer.replace(/[()]/gu, '').replace(/\s+/gu, ' ').trim()
  if (/\bpublius\b/iu.test(cleaned)) return false
  return /^[A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){1,4}$/u.test(cleaned)
}

const acceptedAnswerCache = new WeakMap<Question, string[]>()
function rawAcceptedAnswers(question: Question): string[] {
  const cached = acceptedAnswerCache.get(question)
  if (cached) return cached
  if (question.answer_display.startsWith('Vacant')) return ['Vacant']
  const answers = [...new Set(question.answers.map(answer => answer.trim()).filter(Boolean))]
  acceptedAnswerCache.set(question, answers)
  return answers
}

function isSafeAnswer(targetAnswers: string[], answer: string): boolean {
  if (!answer.trim() || answer.length > 110 || /\b(?:vacant|unknown|not available)\b/iu.test(answer)) return false
  if (targetAnswers.some(targetAnswer => equivalentAnswer(targetAnswer, answer))) return false
  return true
}

type DistractorAtom = { answer: string; source: Question }

const FULL_SET_QUESTIONS: Record<Edition, Set<number>> = {
  '2008': new Set([17, 45]),
  '2025': new Set([16, 19]),
}

function uniqueAcceptedItems(answers: string[]): string[] {
  const unique: string[] = []
  for (const answer of answers) {
    if (unique.some(existing => equivalentAnswer(existing, answer))) continue
    unique.push(answer)
  }
  return unique
}

function combineCorrectItems(answers: string[], itemCount: number, allowBundledFullAnswer: boolean, random: () => number): string | null {
  if (answers.length === 0) return null
  if (itemCount === 1) return answers[randomIndex(random, answers.length)]
  // These official questions publish bundled complete answers. For all other
  // cards, treat each accepted string as one atomic acceptable response; do
  // not split words such as "and" or punctuation inside names and holidays.
  const complete = allowBundledFullAnswer ? answers : []
  if (complete.length > 0) return complete[randomIndex(random, complete.length)]
  const items = shuffle(uniqueAcceptedItems(answers), random).slice(0, itemCount)
  if (items.length !== itemCount) return null
  if (items.some(item => !item.trim())) return null
  return items.join('; ')
}

function allDistinctDistractorSets(atoms: DistractorAtom[], itemCount: number, random: () => number): string[] {
  const results: string[] = []
  const resultKeys = new Set<string>()
  const atomKeys = new Set<string>()
  const uniqueAtoms = shuffle(atoms.filter(item => {
    const key = canonicalAnswer(item.answer)
    if (!key || atomKeys.has(key)) return false
    atomKeys.add(key)
    return true
  }), random)
  const chosen: DistractorAtom[] = []
  function visit(start: number) {
    if (results.length >= 32) return
    if (chosen.length === itemCount) {
      const label = chosen.map(item => item.answer).join('; ')
      const key = chosen.map(item => canonicalAnswer(item.answer)).sort().join(';')
      if (!resultKeys.has(key)) { resultKeys.add(key); results.push(label) }
      return
    }
    for (let index = start; index < uniqueAtoms.length && results.length < 32; index += 1) {
      const candidate = uniqueAtoms[index]
      if (chosen.some(item => item.source.question_number === candidate.source.question_number || equivalentAnswer(item.answer, candidate.answer))) continue
      chosen.push(candidate)
      visit(index + 1)
      chosen.pop()
    }
  }
  visit(0)
  return results
}

export function createTestOptions(
  target: Question,
  questionPool: Question[],
  edition: Edition,
  random: () => number = Math.random,
): OptionSetResult {
  const answers = rawAcceptedAnswers(target)
  const itemCount = requiredItems(target, edition)
  const correct = combineCorrectItems(answers, itemCount, FULL_SET_QUESTIONS[edition].has(target.question_number), random)
  if (!correct) return { options: [], reason: `This question does not have ${itemCount} complete accepted answer${itemCount === 1 ? '' : 's'} for a safe practice option.` }

  const atoms: DistractorAtom[] = []
  const targetUsesNumbers = !isNumericTarget(target)
  for (const source of questionPool) {
    if (source.question_number === target.question_number || source.answer_display.startsWith('Vacant') || source.is_geography_dependent) continue
    const sourceAnswers = rawAcceptedAnswers(source)
    for (const answer of sourceAnswers) {
      const sameAnswerType = targetUsesNumbers
        ? isNumericCountSource(source) && numericAnswerKey(answer) !== null
        : isHistoricalPersonSource(source, answer)
      if (sameAnswerType && isSafeAnswer(answers, answer)) atoms.push({ source, answer })
    }
  }

  const pool = itemCount === 1 ? [...new Set(atoms.map(item => item.answer))] : allDistinctDistractorSets(atoms, itemCount, random)
  const candidates = [...pool]
    .filter(value => !equivalentAnswer(correct, value))
    .filter((value, index, all) => all.findIndex(other => equivalentAnswer(other, value)) === index)
  const distractors = shuffle(candidates, random).slice(0, 3)
  if (distractors.length !== 3) {
    return { options: [], reason: 'There are not enough clearly unrelated accepted answers to create four safe options for this question.' }
  }
  const options = shuffle([
    { id: 'correct', label: correct, correct: true },
    ...distractors.map((label, index) => ({ id: `distractor-${index + 1}`, label, correct: false })),
  ], random)
  return { options }
}

export function buildTestOptionSets(targetQuestions: Question[], edition: Edition, random: () => number = Math.random, sourcePool: Question[] = targetQuestions): Map<number, OptionSetResult> {
  return new Map(targetQuestions.map(question => [question.question_number, createTestOptions(question, sourcePool, edition, random)]))
}

export function outcomeAtDeadline(
  selectedOptionCorrect: boolean | null,
  deadlineMillis: number,
  nowMillis: number,
): FlashcardOutcome | null {
  if (nowMillis >= deadlineMillis) return 'skipped'
  if (selectedOptionCorrect === null) return null
  return selectedOptionCorrect ? 'correct' : 'incorrect'
}

export function appendSubmittedOutcome(
  prefix: SubmittedFlashcardOutcome[],
  outcome: SubmittedFlashcardOutcome,
): SubmittedFlashcardOutcome[] {
  if (prefix.some(item => item.question_number === outcome.question_number)) return [...prefix]
  return [...prefix, outcome]
}

export function summarizeOutcomes(outcomes: SubmittedFlashcardOutcome[]) {
  const correct = outcomes.filter(item => item.outcome === 'correct').length
  const incorrect = outcomes.filter(item => item.outcome === 'incorrect').length
  const skipped = outcomes.filter(item => item.outcome === 'skipped').length
  return { answered: outcomes.length, correct, incorrect, skipped, percent: outcomes.length === 0 ? 0 : Math.round(correct / outcomes.length * 100) }
}

export function displayFlashcardAnswers(question: Question): string[] {
  return formatAnswers(question)
}
