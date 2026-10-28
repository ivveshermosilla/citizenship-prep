import { useEffect, useMemo, useRef, useState } from 'react'
import { formatAnswers, type Question } from '../lib/domain'
import { chooseQuickQuestion, gradeWrittenAnswer, type LearningProgress, type PracticeMetadata, type QuickQuestionOutcome } from '../lib/quick-question'
import { recordWrittenAnswer } from '../lib/supabase'

type Props = {
  code: string
  edition: '2008' | '2025'
  questions: Question[]
  metadata: PracticeMetadata[]
  metadataLoading: boolean
  metadataError: string
  onRetryMetadata: () => void
  onLearningChange: (learning: LearningProgress) => void
}

function newAttemptId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function QuickQuestionFeature({ code, edition, questions, metadata, metadataLoading, metadataError, onRetryMetadata, onLearningChange }: Props) {
  const [questionNumber, setQuestionNumber] = useState(() => chooseQuickQuestion(questions)?.question_number ?? null)
  const question = questions.find(item => item.question_number === questionNumber)
  const questionMetadata = useMemo(() => metadata.find(item => item.question_number === questionNumber), [metadata, questionNumber])
  const [fields, setFields] = useState<string[]>(() => {
    const initialCount = metadata.find(item => item.question_number === questionNumber)?.required_count ?? 0
    return Array.from({ length: initialCount }, () => '')
  })
  const [outcome, setOutcome] = useState<QuickQuestionOutcome | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoFading, setInfoFading] = useState(false)
  const [infoCycle, setInfoCycle] = useState(0)
  const attemptRef = useRef<{ id: string; outcome: QuickQuestionOutcome } | null>(null)
  const requestInFlight = useRef(false)
  const savedRef = useRef(false)
  const feedbackRef = useRef<HTMLHeadingElement>(null)
  const focusFirstAfterNext = useRef(false)

  useEffect(() => {
    if (!questionMetadata) return
    setFields(current => Array.from({ length: questionMetadata.required_count }, (_, index) => current[index] ?? ''))
  }, [questionMetadata, questionNumber])

  useEffect(() => {
    if (!flipped) return
    const frame = window.requestAnimationFrame(() => feedbackRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [flipped])

  useEffect(() => {
    if (!focusFirstAfterNext.current || questionNumber === null) return
    focusFirstAfterNext.current = false
    const frame = window.requestAnimationFrame(() => document.getElementById(`quick-answer-${questionNumber}-0`)?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [questionNumber])

  useEffect(() => {
    setInfoOpen(false)
    setInfoFading(false)
  }, [questionNumber])

  useEffect(() => {
    if (!infoOpen) return
    setInfoFading(false)
    const fade = window.setTimeout(() => setInfoFading(true), 5000)
    const close = window.setTimeout(() => setInfoOpen(false), 5350)
    return () => { window.clearTimeout(fade); window.clearTimeout(close) }
  }, [infoOpen, infoCycle])

  function openInfo() { setInfoFading(false); setInfoOpen(true); setInfoCycle(value => value + 1) }

  async function submit(nextOutcome: QuickQuestionOutcome) {
    if (!question || !questionMetadata || requestInFlight.current || savedRef.current) return
    const attempt = attemptRef.current ?? { id: newAttemptId(), outcome: nextOutcome }
    attemptRef.current = attempt
    requestInFlight.current = true
    setOutcome(attempt.outcome)
    setFlipped(true)
    setSaving(true)
    setError('')
    try {
      const result = await recordWrittenAnswer(code, attempt.id, question.question_number, attempt.outcome)
      onLearningChange(result.learning)
      savedRef.current = true
      setSaved(true)
    } catch {
      setError('Your response could not be saved. Retry to keep this result before choosing another question.')
    } finally { requestInFlight.current = false; setSaving(false) }
  }

  function checkAnswer() {
    if (!questionMetadata || saved || saving) return
    void submit(gradeWrittenAnswer(fields, questionMetadata))
  }

  function anotherQuestion() {
    const next = chooseQuickQuestion(questions, questionNumber ?? undefined)
    if (!next) return
    setQuestionNumber(next.question_number)
    setFields([])
    setOutcome(null)
    setFlipped(false)
    setSaved(false)
    savedRef.current = false
    requestInFlight.current = false
    setSaving(false)
    setError('')
    attemptRef.current = null
    focusFirstAfterNext.current = true
  }

  const dependent = Boolean(question?.is_geography_dependent || question?.is_time_dependent)
  const ready = Boolean(question && questionMetadata && questionMetadata.required_count > 0 && questionMetadata.answer_groups.length >= questionMetadata.required_count)

  return <section className="quick-question" aria-labelledby="quick-question-title">
    <div className="quick-question-heading">
      <div><span className="eyebrow">UNTIMED WRITTEN PRACTICE</span><h2 id="quick-question-title">Quick Question</h2><p>Type the accepted answer or one distinct concept in each field.</p></div>
      <span className="quick-question-edition">QUESTION EDITION {edition}{question && ` · QUESTION ${question.question_number}`}</span>
    </div>
    {metadataError ? <div className="quick-question-unavailable" role="alert"><p>{metadataError}</p><button className="button button-secondary" onClick={onRetryMetadata} disabled={metadataLoading}>{metadataLoading ? 'Loading…' : 'Retry reviewed answers'}</button></div> : metadataLoading || !ready ? <div className="quick-question-unavailable" role="status"><p>{metadataLoading ? 'Loading reviewed answer content…' : 'Reviewed answer content for this question is not available yet.'}</p>{!metadataLoading && <button className="button button-secondary" onClick={onRetryMetadata}>Retry reviewed answers</button>}</div> : <>
      <div className="quick-card-scene">
        <div className={`quick-card-rotator${flipped ? ' is-flipped' : ''}`}>
          <section className="quick-card-face quick-card-front" aria-hidden={flipped} inert={flipped}>
            <span className="flashcard-side-label">QUESTION {question?.question_number}</span>
            <h3>{question?.question_text}</h3>
            {dependent && <div className="question-help-control quick-question-help"><span className="question-warning-label">IMPORTANT NOTICE FOR THIS QUESTION</span><button type="button" className="info-button" aria-label="Source and current information" aria-expanded={infoOpen} aria-describedby={infoOpen ? 'quick-question-info' : undefined} onClick={openInfo} onMouseEnter={openInfo} onFocus={openInfo} onKeyDown={event => { if (event.key === 'Escape') setInfoOpen(false) }}>i</button></div>}
            <div className="quick-answer-fields">
              {Array.from({ length: questionMetadata!.required_count }, (_, index) => <div className="field" key={index}>
                <label htmlFor={`quick-answer-${question?.question_number}-${index}`}>{questionMetadata!.required_count === 1 ? 'Your answer' : `Answer ${index + 1} · enter one distinct concept`}</label>
                <input id={`quick-answer-${question?.question_number}-${index}`} autoComplete="off" spellCheck={false} value={fields[index] ?? ''} disabled={saving || saved} onChange={event => setFields(current => { const updated = [...current]; updated[index] = event.target.value; return updated })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (index + 1 < questionMetadata!.required_count) document.getElementById(`quick-answer-${question?.question_number}-${index + 1}`)?.focus(); else checkAnswer() } }} />
              </div>)}
            </div>
            <div className="quick-question-actions"><button className="button button-secondary" disabled={saving || saved} onClick={() => void submit('skipped')}>Skip</button><button className="button button-primary" disabled={saving || saved} onClick={checkAnswer}>{saving ? 'Checking…' : 'Check answer'}</button></div>
          </section>
          {flipped && <section className="quick-card-face quick-card-back" aria-hidden={!flipped} inert={!flipped}>
            <span className="flashcard-side-label">ACCEPTED ANSWERS</span>
            <h3 ref={feedbackRef} tabIndex={-1} className={`quick-question-outcome ${outcome ?? ''}`}>{outcome === 'correct' ? 'Correct' : outcome === 'incorrect' ? 'Incorrect' : 'Skipped'}</h3>
            {question && <ul className="quick-accepted-groups">{formatAnswers(question).map((answer, index) => <li key={`${index}-${answer}`}><strong>{answer}</strong></li>)}</ul>}
            {error && <p className="quick-save-error" role="alert">{error}</p>}
            {error && <button className="button button-secondary" disabled={saving} onClick={() => void submit(attemptRef.current?.outcome ?? outcome ?? 'skipped')}>{saving ? 'Saving…' : 'Retry saving result'}</button>}
          </section>}
        </div>
      </div>
      {dependent && infoOpen && <div id="quick-question-info" className={`info-bubble quick-question-info${infoFading ? ' fading' : ''}`} role="status"><strong>IMPORTANT NOTICE FOR THIS QUESTION</strong><br/>This answer depends on your jurisdiction or on who holds an office when you take the test. Check the official sources to confirm it is current.<br/><span>Answer reviewed: {question?.answer_updated_on}. This notice will close in 5 seconds.</span><button className="quick-info-dismiss" aria-label="Dismiss question notice" onClick={() => setInfoOpen(false)}>×</button></div>}
      <div className="flashcard-meta quick-question-meta"><span>Answer reviewed: {question?.answer_updated_on}</span><div className="source-links">{question?.source_urls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer">Official source ↗</a>)}</div></div>
      {dependent && <p className="quick-question-warning"><strong>IMPORTANT NOTICE FOR THIS QUESTION</strong> Verify current, place-dependent information with the official sources above.</p>}
      {saved && <div className="quick-question-next"><span>Your written result was saved. Your answer text was not stored.</span><button className="button button-primary" onClick={anotherQuestion}>Another question →</button></div>}
    </>}
  </section>
}
