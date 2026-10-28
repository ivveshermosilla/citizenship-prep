import type { Edition, Question, Session } from './domain'
import { validRecoveryCode } from './domain'
import type { FlashcardProgress, SubmittedFlashcardOutcome } from './flashcards'

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/u, '')
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const configured = Boolean(projectUrl && publishableKey)

type RpcError = { message?: string; code?: string }
async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!projectUrl || !publishableKey) throw new Error('The service is not configured. Check the local environment setup and try again.')
  let response: Response
  try {
    response = await fetch(`${projectUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Could not connect. Check your connection and try again.')
  }
  if (!response.ok) {
    let message = 'The request could not be completed. Please try again.'
    try {
      const detail = await response.json() as RpcError
      if (detail.code === 'P0002') message = 'This code was not found or the session has expired. Start a new session.'
      if (detail.code === '22023') message = 'Check the code or selection and try again.'
    } catch { /* Keep the safe message. */ }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export async function createSession(code: string, edition: Edition, state: string, district: string | null): Promise<Session> {
  if (!validRecoveryCode(code)) throw new Error('Could not create a secure recovery code. Please try again.')
  return rpc('create_game_session', { p_code: code, p_edition: edition, p_state_code: state, p_district_code: district })
}
export async function resumeSession(code: string): Promise<Session> {
  if (!validRecoveryCode(code)) throw new Error('The code must be 43 characters. Check that you copied all of it.')
  return rpc('resume_game_session', { p_code: code })
}
export async function recordQuizCheck(code: string, knewAnswer: boolean): Promise<Session> {
  return rpc('record_quiz_check', { p_code: code, p_knew_answer: knewAnswer })
}
export async function recordCardReview(code: string): Promise<Session> {
  return rpc('record_card_review', { p_code: code })
}
export async function loadQuestions(session: Session): Promise<Question[]> {
  return rpc('get_practice_questions', {
    p_edition: session.edition, p_state_code: session.state_code, p_district_code: session.district_code,
  })
}

export type FlashcardRoundResult = {
  answered: number
  correct: number
  incorrect: number
  skipped: number
}

export async function getFlashcardProgress(code: string): Promise<FlashcardProgress[]> {
  return rpc('get_flashcard_progress', { p_code: code })
}

export async function recordFlashcardRound(
  code: string,
  roundId: string,
  results: SubmittedFlashcardOutcome[],
): Promise<{ progress: FlashcardProgress[]; round: FlashcardRoundResult }> {
  return rpc('record_flashcard_round', { p_code: code, p_round_id: roundId, p_results: results })
}
