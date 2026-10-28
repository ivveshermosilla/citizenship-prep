import { formatAnswers, type Question } from './domain.ts'
import { normalizeWrittenAnswer, type PracticeMetadata } from './quick-question.ts'

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

function reviewedAliasIndex(metadata: PracticeMetadata): Map<string, Set<string>> {
  const aliases = new Map<string, Set<string>>()
  for (const group of metadata.answer_groups) {
    for (const value of [group.display, ...group.aliases]) {
      const normalized = normalizeWrittenAnswer(value)
      if (!normalized) continue
      const keys = aliases.get(normalized) ?? new Set<string>()
      keys.add(group.key)
      aliases.set(normalized, keys)
    }
  }
  return aliases
}

function mapsToCompleteAcceptedSet(values: string[], requiredCount: number, aliases: Map<string, Set<string>>): boolean {
  if (values.length !== requiredCount) return false
  const keys: string[] = []
  for (const value of values) {
    const matching = aliases.get(normalizeWrittenAnswer(value))
    if (!matching || matching.size !== 1) return false
    const key = [...matching][0]
    if (keys.includes(key)) return false
    keys.push(key)
  }
  return keys.length === requiredCount
}

function repeatsAcceptedConcept(values: string[], aliases: Map<string, Set<string>>): boolean {
  const keys = new Set<string>()
  for (const value of values) {
    const matching = aliases.get(normalizeWrittenAnswer(value))
    if (matching?.size !== 1) continue
    const key = [...matching][0]
    if (keys.has(key)) return true
    keys.add(key)
  }
  return false
}

export function buildReviewedTestOptionSets(
  targetQuestions: Question[],
  catalog: PracticeMetadata[],
  random: () => number = Math.random,
): Map<number, OptionSetResult> {
  const byQuestion = new Map(catalog.map(item => [item.question_number, item]))
  return new Map(targetQuestions.map(question => {
    const metadata = byQuestion.get(question.question_number)
    if (!metadata) return [question.question_number, { options: [], reason: 'Reviewed practice content is not available for this question.' }]
    const count = metadata.required_count
    const groups = metadata.answer_groups
    const groupKeys = new Set(groups.map(group => group.key))
    if (!Number.isSafeInteger(count) || count < 1 || groups.length < count || groupKeys.size !== groups.length || groups.some(group => !group.key || !group.display)) {
      return [question.question_number, { options: [], reason: 'Reviewed answer groups are incomplete for this question.' }]
    }
    const acceptedAliases = reviewedAliasIndex(metadata)
    if ([...acceptedAliases.values()].some(keys => keys.size > 1)) return [question.question_number, { options: [], reason: 'Reviewed answer aliases overlap separate concepts for this question.' }]
    const correctGroups = shuffle(groups, random).slice(0, count)
    const correctKeys = new Set(correctGroups.map(group => group.key))
    if (correctKeys.size !== count) return [question.question_number, { options: [], reason: 'Reviewed answer groups are duplicated for this question.' }]
    const correct = correctGroups.map(group => group.display).join('; ')
    const seenSets = new Set<string>()
    const distractors = metadata.distractor_sets.flatMap(set => {
      if (set.length !== count) return []
      const normalized = set.map(normalizeWrittenAnswer)
      if (normalized.some(value => !value) || new Set(normalized).size !== count) return []
      const setKey = [...normalized].sort().join('\u0000')
      if (seenSets.has(setKey) || mapsToCompleteAcceptedSet(set, count, acceptedAliases) || repeatsAcceptedConcept(set, acceptedAliases)) return []
      seenSets.add(setKey)
      return [set.join('; ')]
    })
    if (distractors.length < 3) return [question.question_number, { options: [], reason: 'Three reviewed, complete distractor sets are not available for this question.' }]
    const selected = shuffle(distractors, random).slice(0, 3)
    const options = shuffle([
      { id: 'correct', label: correct, correct: true },
      ...selected.map((label, index) => ({ id: `distractor-${index + 1}`, label, correct: false })),
    ], random)
    return [question.question_number, { options }]
  }))
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
