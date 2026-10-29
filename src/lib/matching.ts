import type { Question } from './domain.ts'
import { normalizeWrittenAnswer, type LearningQuestionProgress, type PracticeMetadata } from './quick-question.ts'
import { shuffle } from './flashcards.ts'

export type MatchingPace = 'relaxed' | 'standard' | 'challenge' | 'untimed'
export type MatchingOutcome = 'correct' | 'incorrect' | 'skipped'
export type MatchingProgress = LearningQuestionProgress
export type MatchingTile = { id: string; label: string }
export type MatchingQuestion = { question: Question; requiredCount: number; expectedConceptKeys: string[]; acceptedConceptByAlias: Record<string, string> }
export type MatchingBoard = { questions: MatchingQuestion[]; tiles: MatchingTile[] }
export type MatchingPlan = { questions: MatchingQuestion[]; boards: MatchingBoard[]; availableCount: number; selectedCount: number; missedAvailableCount: number; error?: string }
export type MatchingSettings = { questionCount: number; questionsPerRound: 4 | 5; pace: MatchingPace; prioritizeMissed: boolean }
export type SubmittedMatchingOutcome = { question_number: number; outcome: MatchingOutcome }

export const PACE_SECONDS_PER_QUESTION: Record<Exclude<MatchingPace, 'untimed'>, number> = {
  relaxed: 30,
  standard: 22.5,
  challenge: 15,
}

function groupsAreSafe(metadata: PracticeMetadata): boolean {
  const { required_count: required, answer_groups: groups } = metadata
  if (!Number.isSafeInteger(required) || required < 1 || required > groups.length || groups.some(group => !group.key.trim() || !group.display.trim())) return false
  const keys = new Set(groups.map(group => group.key))
  if (keys.size !== groups.length) return false
  const aliases = new Map<string, string>()
  for (const group of groups) {
    for (const value of [group.display, ...group.aliases]) {
      const normalized = normalizeWrittenAnswer(value)
      if (!normalized) continue
      const owner = aliases.get(normalized)
      if (owner && owner !== group.key) return false
      aliases.set(normalized, group.key)
    }
  }
  return true
}

function aliasKeys(metadata: PracticeMetadata): Set<string> {
  return new Set(metadata.answer_groups.flatMap(group => [group.display, ...group.aliases]).map(normalizeWrittenAnswer).filter(Boolean))
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const key of a) if (b.has(key)) return true
  return false
}

function hasPriorMiss(progress: MatchingProgress | undefined): boolean {
  return Boolean(progress && (progress.incorrect_count > 0 || progress.skipped_count > 0))
}

export function matchingEligibleQuestions(questions: Question[], catalog: PracticeMetadata[]): Question[] {
  const metadataByNumber = new Map(catalog.map(item => [item.question_number, item]))
  const uniqueQuestions = [...new Map(questions.map(question => [question.question_number, question])).values()]
  return uniqueQuestions.filter(question => {
    const metadata = metadataByNumber.get(question.question_number)
    return Boolean(metadata && groupsAreSafe(metadata) && metadata.required_count <= 10)
  })
}

/** Build a private, in-memory plan using only reviewed concept groups. */
export function buildMatchingPlan(
  questions: Question[],
  catalog: PracticeMetadata[],
  settings: MatchingSettings,
  progress: MatchingProgress[] = [],
  random: () => number = Math.random,
): MatchingPlan {
  const metadataByNumber = new Map(catalog.map(item => [item.question_number, item]))
  const eligible = matchingEligibleQuestions(questions, catalog)
  if (!eligible.length) return { questions: [], boards: [], availableCount: 0, selectedCount: 0, missedAvailableCount: 0, error: 'Reviewed matching content is not available for these questions.' }

  const progressByNumber = new Map(progress.map(item => [item.question_number, item]))
  const missed = eligible.filter(question => hasPriorMiss(progressByNumber.get(question.question_number)))
  const requested = Math.min(30, Math.max(1, Math.trunc(settings.questionCount || 1)), eligible.length)
  const chosen = settings.prioritizeMissed && missed.length
    ? [...shuffle(missed, random).slice(0, requested), ...shuffle(eligible.filter(question => !hasPriorMiss(progressByNumber.get(question.question_number))), random)].slice(0, requested)
    : shuffle(eligible, random).slice(0, requested)

  const selected: MatchingQuestion[] = chosen.map(question => {
    const metadata = metadataByNumber.get(question.question_number)!
    const selectedGroups = shuffle(metadata.answer_groups, random).slice(0, metadata.required_count)
    const acceptedConceptByAlias = Object.fromEntries(metadata.answer_groups.flatMap(group => [group.display, ...group.aliases].map(alias => [normalizeWrittenAnswer(alias), group.key] as const)).filter(([alias]) => Boolean(alias)))
    return { question, requiredCount: metadata.required_count, expectedConceptKeys: selectedGroups.map(group => group.key), acceptedConceptByAlias }
  })
  const aliasData = new Map(selected.map(item => [item.question.question_number, aliasKeys(metadataByNumber.get(item.question.question_number)!)]))
  const boards: MatchingBoard[] = []
  const perRound = settings.questionsPerRound === 5 ? 5 : 4
  let pending = [...selected]
  let localTileIndex = 0
  while (pending.length) {
    const current: MatchingQuestion[] = []
    const currentAliases = new Set<string>()
    let tileCount = 0
    for (let index = 0; index < pending.length && current.length < perRound;) {
      const candidate = pending[index]
      const aliases = aliasData.get(candidate.question.question_number)!
      if (tileCount + candidate.requiredCount <= 10 && !overlaps(currentAliases, aliases)) {
        current.push(candidate)
        for (const alias of aliases) currentAliases.add(alias)
        tileCount += candidate.requiredCount
        pending.splice(index, 1)
      } else index += 1
    }
    if (!current.length) return { questions: selected, boards, availableCount: eligible.length, selectedCount: selected.length, missedAvailableCount: missed.length, error: 'A reviewed question could not be paired safely within the 10-tile board limit.' }
    const tiles = current.flatMap(item => {
      const metadata = metadataByNumber.get(item.question.question_number)!
      return item.expectedConceptKeys.map(key => {
        const group = metadata.answer_groups.find(answer => answer.key === key)!
        localTileIndex += 1
        return { id: opaqueTileId(localTileIndex), label: group.display }
      })
    })
    boards.push({ questions: current, tiles: shuffle(tiles, random) })
  }
  return { questions: selected, boards, availableCount: eligible.length, selectedCount: selected.length, missedAvailableCount: missed.length }
}

function opaqueTileId(index: number): string {
  // IDs are only component-memory keys; the payload builder never serializes them.
  return `tile-${index}`
}

export function roundAllowanceSeconds(requiredAnswers: number[], pace: MatchingPace): number | null {
  if (pace === 'untimed') return null
  const base = PACE_SECONDS_PER_QUESTION[pace]
  return Math.ceil(requiredAnswers.reduce((sum, count) => sum + base + Math.max(0, count - 1) * 10, 0))
}

export function gradeMatchingQuestion(
  question: MatchingQuestion,
  assignedConceptKeys: string[],
): MatchingOutcome {
  const unique = new Set(assignedConceptKeys)
  const validConcepts = new Set(Object.values(question.acceptedConceptByAlias))
  const hasIncorrect = assignedConceptKeys.some(key => !validConcepts.has(key)) || unique.size !== assignedConceptKeys.length || assignedConceptKeys.length > question.requiredCount
  if (hasIncorrect) return 'incorrect'
  if (unique.size === question.requiredCount) return 'correct'
  return 'skipped'
}

export function scoreMatchingBoard(board: MatchingBoard, assignments: Record<number, string[]>): SubmittedMatchingOutcome[] {
  const tileById = new Map(board.tiles.map(tile => [tile.id, tile]))
  return board.questions.map(item => {
    // Score the visible label against the target question's reviewed aliases.
    // Tile ownership is never used as a hidden answer key.
    const assignedKeys = (assignments[item.question.question_number] ?? []).map(id => {
      const tile = tileById.get(id)
      return tile ? item.acceptedConceptByAlias[normalizeWrittenAnswer(tile.label)] ?? '__invalid__' : '__invalid__'
    })
    return { question_number: item.question.question_number, outcome: gradeMatchingQuestion(item, assignedKeys) }
  })
}

export function summarizeMatchingOutcomes(outcomes: SubmittedMatchingOutcome[]) {
  const correct = outcomes.filter(item => item.outcome === 'correct').length
  const incorrect = outcomes.filter(item => item.outcome === 'incorrect').length
  const skipped = outcomes.filter(item => item.outcome === 'skipped').length
  const total = outcomes.length
  return { total, correct, incorrect, skipped, percent: total ? Math.round(correct / total * 100) : 0 }
}

export function isBeforeDeadline(deadlineMillis: number | null, nowMillis: number): boolean {
  return deadlineMillis === null || nowMillis < deadlineMillis
}
