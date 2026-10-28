export type Edition = '2008' | '2025'
export type Question = {
  question_number: number
  question_text: string
  section?: string
  subsection?: string
  answers: string[]
  answer_display: string
  answer_updated_on: string
  next_update_on: string
  source_urls: string[]
  is_geography_dependent: boolean
  is_time_dependent: boolean
}
export type Session = {
  edition: Edition
  state_code: string
  district_code: string | null
  created_at: string
  last_active_at: string
  quiz_attempts: number
  quiz_correct: number
  cards_reviewed: number
}

export const EXPIRY_HOURS = 168
export const COHORT_CUTOFF = '2025-10-20'
export function districtIsRequired(districtCount: number): boolean { return districtCount > 1 }
export function selectEdition(cohort: Edition): Edition { return cohort }
export function isExpired(lastActiveMillis: number, nowMillis: number): boolean {
  return nowMillis - lastActiveMillis >= EXPIRY_HOURS * 60 * 60 * 1000
}
export function getRecoveryCode(cryptoApi: Pick<Crypto, 'getRandomValues'> = crypto): string {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32))
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}
export function validRecoveryCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/u.test(code)
}
export function formatAnswers(question: Pick<Question, 'answers' | 'answer_display'>): string[] {
  if (question.answer_display.startsWith('Vacant')) {
    const previous = question.answer_display.match(/^Vacant \(previously: (.+)\)$/u)?.[1]
    return [previous ? `Vacant (previously: ${previous})` : 'Vacant']
  }
  return question.answers
}
