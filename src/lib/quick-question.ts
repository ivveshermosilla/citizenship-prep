export type QuickQuestionOutcome = 'correct' | 'incorrect' | 'skipped'

export type PracticeAnswerGroup = {
  key: string
  display: string
  aliases: string[]
}

export type PracticeMetadata = {
  question_number: number
  required_count: number
  answer_groups: PracticeAnswerGroup[]
  distractor_sets: string[][]
  content_version: string
}

export type LearningQuestionProgress = {
  question_number: number
  correct_count: number
  incorrect_count: number
  skipped_count: number
  last_outcome: QuickQuestionOutcome | null
}

export type LearningProgress = {
  progress: LearningQuestionProgress[]
  multiple_choice: LearningQuestionProgress[]
  written: LearningQuestionProgress[]
  matching: LearningQuestionProgress[]
}

/**
 * Normalize typography, accents, and punctuation. The content catalogue
 * supplies every semantic/name variant; this function does not infer meaning.
 */
export function normalizeWrittenAnswer(value: string): string {
  return value.normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/\p{M}/gu, '')
    .replace(/['’‘]/gu, '')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function gradeWrittenAnswer(fields: string[], metadata: PracticeMetadata): QuickQuestionOutcome {
  const submittedFields = Array.from({ length: fields.length }, (_, index) => fields[index] ?? '')
  if (submittedFields.every(field => field.trim() === '')) return 'skipped'
  if (!Number.isSafeInteger(metadata.required_count) || metadata.required_count < 1 || fields.length !== metadata.required_count) return 'incorrect'
  if (metadata.answer_groups.length < metadata.required_count || metadata.answer_groups.some(group => !group.key || !group.display)) return 'incorrect'

  const keyByAlias = new Map<string, string | null>()
  for (const group of metadata.answer_groups) {
    for (const alias of [group.display, ...group.aliases]) {
      const normalized = normalizeWrittenAnswer(alias)
      if (!normalized) continue
      const existing = keyByAlias.get(normalized)
      if (existing === undefined) keyByAlias.set(normalized, group.key)
      else if (existing !== group.key) keyByAlias.set(normalized, null)
    }
  }

  const matchedKeys: string[] = []
  for (const field of submittedFields) {
    const normalized = normalizeWrittenAnswer(field)
    if (!normalized) return 'incorrect'
    const key = keyByAlias.get(normalized)
    if (!key || matchedKeys.includes(key)) return 'incorrect'
    matchedKeys.push(key)
  }
  return matchedKeys.length === metadata.required_count ? 'correct' : 'incorrect'
}

export function chooseQuickQuestion<T extends { question_number: number }>(
  questions: T[],
  previousQuestionNumber?: number,
  random: () => number = Math.random,
): T | undefined {
  if (questions.length === 0) return undefined
  const choices = questions.length > 1 && previousQuestionNumber !== undefined
    ? questions.filter(question => question.question_number !== previousQuestionNumber)
    : questions
  if (choices.length === 0) return undefined
  const randomValue = random()
  const index = Number.isFinite(randomValue)
    ? Math.min(choices.length - 1, Math.max(0, Math.floor(randomValue * choices.length)))
    : 0
  return choices[index]
}
