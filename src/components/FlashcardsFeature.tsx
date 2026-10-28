import { type FocusEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { Question, Session } from '../lib/domain'
import {
  appendSubmittedOutcome, buildReviewedTestOptionSets, cumulativeRoundSizes, displayFlashcardAnswers,
  listTopics, makeFlashcardDeck, outcomeAtDeadline, shuffle, summarizeOutcomes, totalTestPresentations,
  type FlashcardMethod, type FlashcardOutcome, type FlashcardSelection, type OptionSetResult,
  type SubmittedFlashcardOutcome, type TestOption,
} from '../lib/flashcards'
import type { LearningProgress, LearningQuestionProgress, PracticeMetadata } from '../lib/quick-question'
import { getLearningProgress, recordFlashcardRound } from '../lib/supabase'

type Props = {
  code: string
  questions: Question[]
  practiceMetadata: PracticeMetadata[]
  session: Session
  onExit: () => void
  onProgressChange: (learning: LearningProgress) => void
  onReviewCard: (questionNumber: number) => Promise<void>
}
type View = 'settings' | 'study' | 'test' | 'results'

function Info({ forMethod, text, helpFor, setHelpFor, fading }: {
  forMethod: FlashcardMethod
  text: string
  fading: boolean
  helpFor: FlashcardMethod | null
  setHelpFor: (method: FlashcardMethod | null) => void
}) {
  const wrap = useRef<HTMLSpanElement>(null)
  const open = () => setHelpFor(forMethod)
  function onBlur(event: FocusEvent<HTMLButtonElement>) {
    if (!wrap.current?.contains(event.relatedTarget as Node | null)) setHelpFor(null)
  }
  return <span className="flash-help-wrap" ref={wrap} onKeyDown={event => { if (event.key === 'Escape') setHelpFor(null) }}>
    <button type="button" className="flash-help" aria-label={`About ${forMethod === 'in-order' ? 'In order' : forMethod === 'range' ? 'Specific range' : forMethod === 'topic' ? 'By topic' : 'Random'}`} aria-expanded={helpFor === forMethod} aria-describedby={helpFor === forMethod ? `flash-help-${forMethod}` : undefined}
      onClick={open} onMouseEnter={open} onFocus={open} onBlur={onBlur}>i</button>
    {helpFor === forMethod && <><span id={`flash-help-${forMethod}`} className={`flash-help-tip${fading ? ' fading' : ''}`} role="tooltip">{text}</span><button type="button" className="flash-help-dismiss" aria-label="Dismiss help" onClick={() => setHelpFor(null)}>×</button></>}
  </span>
}

function newRoundId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function BookIcon() {
  return <svg className="flash-book-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path d="M16 8.2c-3.2-2.1-7.5-2.5-11-1.1v17.2c4.2-1.3 8-.7 11 1.6 3-2.3 6.8-2.9 11-1.6V7.1c-3.5-1.4-7.8-1-11 1.1Z" />
    <path d="M16 8.2v17.7M8 11.1c2.2-.3 4.2.1 5.8 1M24 11.1c-2.2-.3-4.2.1-5.8 1M8 15.4c2.2-.3 4.2.1 5.8 1M24 15.4c-2.2-.3-4.2.1-5.8 1" />
  </svg>
}

function SafeSources({ question }: { question: Question }) {
  return <div className="source-links">{question.source_urls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer">Official source ↗</a>)}</div>
}

export function FlashcardsFeature({ code, questions, practiceMetadata, session, onExit, onProgressChange, onReviewCard }: Props) {
  const [view, setView] = useState<View>('settings')
  const [progress, setProgress] = useState<LearningQuestionProgress[]>([])
  const [progressLoading, setProgressLoading] = useState(true)
  const [method, setMethod] = useState<FlashcardMethod>('random')
  const [count, setCount] = useState(Math.min(20, questions.length))
  const [countInput, setCountInput] = useState(String(Math.min(20, questions.length)))
  const [topicKey, setTopicKey] = useState('')
  const [rangeFrom, setRangeFrom] = useState(1)
  const [rangeTo, setRangeTo] = useState(Math.min(20, questions.length))
  const [rangeFromInput, setRangeFromInput] = useState('1')
  const [rangeToInput, setRangeToInput] = useState(String(Math.min(20, questions.length)))
  const [includeTest, setIncludeTest] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [step, setStep] = useState(1)
  const [stepInput, setStepInput] = useState('1')
  const [prioritize, setPrioritize] = useState(false)
  const [helpFor, setHelpFor] = useState<FlashcardMethod | null>(null)
  const [helpFading, setHelpFading] = useState(false)
  const [cardInfoOpen, setCardInfoOpen] = useState(false)
  const [cardInfoFading, setCardInfoFading] = useState(false)
  const [error, setError] = useState('')
  const [deck, setDeck] = useState<Question[]>([])
  const [roundSizes, setRoundSizes] = useState<number[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [cardIndex, setCardIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [testOptions, setTestOptions] = useState<Map<number, TestOption[]>>(new Map())
  const [testOutcomes, setTestOutcomes] = useState<SubmittedFlashcardOutcome[]>([])
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [deadline, setDeadline] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [sending, setSending] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [pending, setPending] = useState<SubmittedFlashcardOutcome | null>(null)
  const [acknowledged, setAcknowledged] = useState<FlashcardOutcome | null>(null)
  const [result, setResult] = useState<ReturnType<typeof summarizeOutcomes> | null>(null)
  const seenCards = useRef(new Set<number>())
  const outcomesRef = useRef<SubmittedFlashcardOutcome[]>([])
  const pendingRef = useRef<SubmittedFlashcardOutcome | null>(null)
  const roundIdRef = useRef('')
  const topics = useMemo(() => listTopics(questions), [questions])
  const selectedTopic = topics.find(topic => topic.key === topicKey)
  const effectiveAvailable = method === 'topic' ? selectedTopic?.count ?? 0 : questions.length
  const effectiveCount = method === 'range' ? Math.max(0, rangeTo - rangeFrom + 1) : Math.min(effectiveAvailable, Math.max(1, count))
  const selectedRoundSize = roundSizes[roundIndex] ?? deck.length
  const cardQuestion = deck[cardIndex]
  const testQuestion = acknowledged
    ? deck.find(question => question.question_number === testOutcomes[testOutcomes.length - 1]?.question_number)
    : deck[testOutcomes.length]
  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000))
  const testOptionSet = testQuestion ? testOptions.get(testQuestion.question_number) ?? [] : []

  useEffect(() => {
    if (!countInput || !Number.isFinite(effectiveAvailable) || effectiveAvailable < 1) return
    const value = Math.min(effectiveAvailable, Math.max(1, Number(countInput)))
    if (Number.isFinite(value) && (value !== count || String(value) !== countInput)) { setCount(value); setCountInput(String(value)) }
  }, [effectiveAvailable, countInput, count])

  useEffect(() => {
    if (!rolling || !stepInput || effectiveCount < 1) return
    const value = Math.min(effectiveCount, Math.max(1, Number(stepInput)))
    if (Number.isFinite(value) && (value !== step || String(value) !== stepInput)) { setStep(value); setStepInput(String(value)) }
  }, [rolling, effectiveCount, stepInput, step])

  useEffect(() => {
    let live = true
    void getLearningProgress(code).then(learning => { if (live) { setProgress(learning.progress); onProgressChange(learning) } }).catch(e => {
      if (live) setError(e instanceof Error ? e.message : 'Could not load question history. You can still study without prioritization.')
    }).finally(() => { if (live) setProgressLoading(false) })
    return () => { live = false }
  }, [code, onProgressChange])

  useEffect(() => {
    if (helpFor === null) return
    setHelpFading(false)
    const fade = window.setTimeout(() => setHelpFading(true), 5000)
    const close = window.setTimeout(() => setHelpFor(null), 5350)
    return () => { window.clearTimeout(fade); window.clearTimeout(close) }
  }, [helpFor])

  useEffect(() => {
    if (helpFor === null) return
    const dismissOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.flash-help-wrap')) setHelpFor(null)
    }
    document.addEventListener('pointerdown', dismissOutside)
    return () => document.removeEventListener('pointerdown', dismissOutside)
  }, [helpFor])

  useEffect(() => {
    if (!cardInfoOpen) return
    setCardInfoFading(false)
    const fade = window.setTimeout(() => setCardInfoFading(true), 5000)
    const close = window.setTimeout(() => setCardInfoOpen(false), 5350)
    return () => { window.clearTimeout(fade); window.clearTimeout(close) }
  }, [cardInfoOpen, cardIndex])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('.flash-settings h1, .flashcard-surface, .flash-test-question h1, .flash-results h1')
      if (heading) { if (!(heading instanceof HTMLButtonElement)) heading.tabIndex = -1; heading.focus({ preventScroll: true }) }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view, progressLoading, cardIndex, testOutcomes.length, roundIndex])

  useEffect(() => {
    if (view !== 'test' || acknowledged || pendingRef.current) return
    const timer = window.setInterval(() => setNow(Date.now()), 120)
    return () => window.clearInterval(timer)
  }, [view, deadline, acknowledged, pending])

  useEffect(() => {
    if (view === 'test' && deadline > 0 && now >= deadline && !acknowledged && !pendingRef.current && testQuestion) {
      void submitOutcome('skipped')
    }
  }, [view, now, deadline, acknowledged, testQuestion])

  function updateMethod(next: FlashcardMethod) {
    setMethod(next); setHelpFor(null); setError('')
    if (next === 'topic' && !topicKey && topics[0]) setTopicKey(topics[0].key)
  }

  function updateNumber(setter: (value: number) => void, value: string, max: number) {
    if (!value || !/^\d+$/u.test(value)) return
    const parsed = Number(value)
    if (Number.isFinite(parsed)) setter(Math.min(max, Math.max(1, Math.trunc(parsed))))
  }

  function selection(): FlashcardSelection {
    return { method, count: effectiveCount, topicKey, rangeFrom, rangeTo, prioritizeMissed: prioritize }
  }

  async function startStudying() {
    setError('')
    if (method === 'range' && (!rangeFromInput || !rangeToInput || !/^\d+$/u.test(rangeFromInput) || !/^\d+$/u.test(rangeToInput))) { setError('Enter both question numbers to continue.'); return }
    if (method === 'range') {
      const from = Math.min(questions.length, Math.max(1, Number(rangeFromInput)))
      const to = Math.min(questions.length, Math.max(1, Number(rangeToInput)))
      setRangeFrom(from); setRangeTo(to); setRangeFromInput(String(from)); setRangeToInput(String(to))
    }
    if (method !== 'range' && (!countInput || !/^\d+$/u.test(countInput))) { setError('Enter the number of flashcards to continue.'); return }
    if (rolling && (!stepInput || !/^\d+$/u.test(stepInput))) { setError('Enter the number of cards to add per round.'); return }
    setPreparing(true)
    await new Promise(resolve => window.setTimeout(resolve, 0))
    const selectionResult = makeFlashcardDeck(questions, selection(), progress)
    if (selectionResult.error || selectionResult.deck.length === 0) { setError(selectionResult.error ?? 'No questions match this selection.'); setPreparing(false); return }
    const sizes = includeTest ? cumulativeRoundSizes(selectionResult.deck.length, rolling ? step : selectionResult.deck.length, rolling) : []
    const allOptions: Map<number, OptionSetResult> = includeTest ? buildReviewedTestOptionSets(selectionResult.deck, practiceMetadata, Math.random) : new Map<number, OptionSetResult>()
    if (includeTest) {
      const unavailable = selectionResult.deck.find(question => !(allOptions.get(question.question_number)?.options.length))
      if (unavailable) {
        const reason = allOptions.get(unavailable.question_number)?.reason ?? 'Reviewed practice content is not available'
        setError(`${reason} (Question ${unavailable.question_number}). You can study the cards without a test or retry after content loads.`)
        setPreparing(false)
        return
      }
    }
    setDeck(selectionResult.deck); setRoundSizes(sizes); setRoundIndex(0); setCardIndex(0); setFlipped(false)
    setTestOptions(new Map([...allOptions].map(([number, result]) => [number, result.options])))
    seenCards.current.clear(); outcomesRef.current = []; setTestOutcomes([]); setResult(null)
    setPreparing(false)
    setView('study')
  }

  async function revealCard(question: Question) {
    setFlipped(value => !value)
    if (seenCards.current.has(question.question_number)) return
    seenCards.current.add(question.question_number)
    try {
      await onReviewCard(question.question_number)
    } catch (e) { seenCards.current.delete(question.question_number); setError(e instanceof Error ? e.message : 'Card review was not saved. Try again.') }
  }

  function beginTest() {
    try {
      setError(''); outcomesRef.current = []; setTestOutcomes([]); pendingRef.current = null; setPending(null)
      setSelectedOption(null); setAcknowledged(null); roundIdRef.current = newRoundId()
      const randomizedOptions = new Map([...testOptions].map(([number, options]) => [number, shuffle(options)]))
      setTestOptions(randomizedOptions)
      setDeadline(Date.now() + 15_000); setNow(Date.now()); setView('test')
    } catch { setError('A secure practice test could not start. You can continue studying or try again.') }
  }

  async function submitOutcome(outcome: FlashcardOutcome) {
    if (sending || acknowledged || !testQuestion || !roundIdRef.current) return
    let submission = pendingRef.current
    if (!submission) {
      submission = { question_number: testQuestion.question_number, outcome }
      pendingRef.current = submission; setPending(submission)
    }
    const nextPrefix = appendSubmittedOutcome(outcomesRef.current, submission)
    setSending(true); setError('')
    try {
      const saved = await recordFlashcardRound(code, roundIdRef.current, nextPrefix)
      outcomesRef.current = nextPrefix; setTestOutcomes(nextPrefix); setProgress(saved.learning.progress); onProgressChange(saved.learning)
      pendingRef.current = null; setPending(null); setAcknowledged(submission.outcome); setSelectedOption(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your answer was not saved. Retry to continue.')
    } finally { setSending(false) }
  }

  function retrySubmission() {
    const fixed = pendingRef.current
    if (fixed) void submitOutcome(fixed.outcome)
  }

  function confirmSelected() {
    const chosen = testOptionSet.find(option => option.id === selectedOption)
    const outcome = outcomeAtDeadline(chosen?.correct ?? null, deadline, Date.now())
    if (outcome) void submitOutcome(outcome)
  }

  function continueTest() {
    if (!acknowledged) return
    setAcknowledged(null); setDeadline(Date.now() + 15_000); setNow(Date.now())
    if (testOutcomes.length >= selectedRoundSize) {
      setResult(summarizeOutcomes(testOutcomes)); setView('results')
    }
  }

  function nextRound() {
    setRoundIndex(index => index + 1); setCardIndex(0); setFlipped(false); setResult(null); setView('study')
  }

  function requestExit() {
    if (window.confirm('Leave this study session? Your in-memory deck and unfinished test will be lost. Answers already confirmed and saved will remain; questions you did not reach will not be marked skipped.')) onExit()
  }

  if (progressLoading && view === 'settings') return <section className="panel flash-settings"><p>Loading your saved question history…</p></section>

  if (view === 'settings') return <section className="panel flash-settings" aria-labelledby="flash-settings-title">
    <button className="back-link" onClick={requestExit}>← My hub</button>
    <div className="flash-feature-heading"><span className="flash-book-tile"><BookIcon /></span><div><span className="eyebrow">STUDY FLASH CARDS</span><h1 id="flash-settings-title">Set up your study round.</h1></div></div>
    <p className="lead">Choose questions from the {session.edition} edition. Each card keeps the official answer, review date, and source links together.</p>
    <fieldset className="flash-setting-group"><legend>Selection method</legend>
      <div className="flash-method-grid">
        {(['random', 'in-order', 'topic', 'range'] as const).map(value => <div key={value} className={`flash-method${method === value ? ' selected' : ''}`}>
          <label><input type="radio" name="flash-method" value={value} checked={method === value} onChange={() => updateMethod(value)} />
          <span>{value === 'random' ? 'Random' : value === 'in-order' ? 'In order' : value === 'topic' ? 'By topic' : 'Specific range'}</span></label>
          <Info forMethod={value} helpFor={helpFor} setHelpFor={setHelpFor} fading={helpFading} text={value === 'random' ? 'Draws this many different questions once when you start; card flips keep the same order.' : value === 'in-order' ? 'Selects official question numbers 1 through the number you choose.' : value === 'topic' ? 'Choose an official section and subsection. The available count is limited to that topic.' : 'Choose inclusive official question numbers. The card count is calculated from From and To.'} />
        </div>)}
      </div>
    </fieldset>
    {method === 'topic' && <div className="field"><label htmlFor="flash-topic">Official topic</label><select id="flash-topic" value={topicKey} onChange={event => setTopicKey(event.target.value)}>{topics.map(topic => <option key={topic.key} value={topic.key}>{topic.section} · {topic.subsection} ({topic.count})</option>)}</select></div>}
    {method === 'range' ? <div className="flash-range-row"><div className="field"><label htmlFor="flash-from">From question</label><input id="flash-from" type="number" min="1" max={questions.length} value={rangeFromInput} onChange={event => { setRangeFromInput(event.target.value); updateNumber(setRangeFrom, event.target.value, questions.length) }} onBlur={() => { if (rangeFromInput) { const value = Math.min(questions.length, Math.max(1, Number(rangeFromInput))); setRangeFrom(value); setRangeFromInput(String(value)) } }} /></div><div className="field"><label htmlFor="flash-to">To question</label><input id="flash-to" type="number" min="1" max={questions.length} value={rangeToInput} onChange={event => { setRangeToInput(event.target.value); updateNumber(setRangeTo, event.target.value, questions.length) }} onBlur={() => { if (rangeToInput) { const value = Math.min(questions.length, Math.max(1, Number(rangeToInput))); setRangeTo(value); setRangeToInput(String(value)) } }} /></div><p className="flash-derived-count">{rangeFromInput && rangeToInput ? Math.max(0, Number(rangeToInput) - Number(rangeFromInput) + 1) : 0} cards · inclusive</p></div> : <div className="field flash-count-field"><label htmlFor="flash-count">Number of flashcards <span>1–{effectiveAvailable}</span></label><div className="flash-count-controls"><input id="flash-count" type="number" min="1" max={effectiveAvailable} value={countInput} onChange={event => { setCountInput(event.target.value); updateNumber(setCount, event.target.value, effectiveAvailable) }} onBlur={() => { if (countInput) { const value = Math.min(effectiveAvailable, Math.max(1, Number(countInput))); setCount(value); setCountInput(String(value)) } }} /><input aria-label="Number of flashcards" type="range" min="1" max={Math.max(1, effectiveAvailable)} value={effectiveCount} onChange={event => { const value = Number(event.target.value); setCount(value); setCountInput(String(value)) }} /></div></div>}
    <fieldset className="flash-setting-group flash-options-group"><legend>Practice options</legend>
      <label className="flash-check"><input type="checkbox" checked={includeTest} onChange={event => { setIncludeTest(event.target.checked); if (!event.target.checked) setRolling(false) }} /><span><strong>Include a practice test</strong><small>Test yourself when you are ready after studying.</small></span></label>
      {includeTest && <>
        <label className="flash-check"><input type="checkbox" checked={rolling} onChange={event => setRolling(event.target.checked)} /><span><strong>Rolling review</strong><small>Add new cards over cumulative rounds and test the full set each time.</small></span></label>
        {rolling && <div className="field flash-count-field"><label htmlFor="flash-step">Cards added per round <span>1–{effectiveCount}</span></label><div className="flash-count-controls"><input id="flash-step" type="number" min="1" max={effectiveCount} value={stepInput} onChange={event => { setStepInput(event.target.value); updateNumber(setStep, event.target.value, effectiveCount) }} onBlur={() => { if (stepInput) { const value = Math.min(effectiveCount, Math.max(1, Number(stepInput))); setStep(value); setStepInput(String(value)) } }} /><input aria-label="Cards added per round" type="range" min="1" max={Math.max(1, effectiveCount)} value={Math.min(step, effectiveCount)} onChange={event => { const value = Number(event.target.value); setStep(value); setStepInput(String(value)) }} /></div><small>{totalTestPresentations(cumulativeRoundSizes(effectiveCount, Math.min(step, effectiveCount), true))} total test presentations across the cumulative rounds, including repeats.</small></div>}
      </>}
      <label className={`flash-check${progress.length === 0 ? ' disabled' : ''}`}><input type="checkbox" disabled={progress.length === 0} checked={prioritize} onChange={event => setPrioritize(event.target.checked)} /><span><strong>Prioritize missed questions</strong><small>{progress.length === 0 ? 'Available after you complete a practice test.' : 'Moves questions with saved incorrect or skipped outcomes toward the front of this eligible set.'}</small></span></label>
    </fieldset>
    {error && <p className="flash-error" role="alert">{error}</p>}
    <div className="flash-settings-footer"><span>{questions.length} official questions · Question Edition {session.edition}</span><button className="button button-primary" disabled={preparing} onClick={() => void startStudying()}>{preparing ? 'Preparing practice…' : 'Start studying →'}</button></div>
    <p className="fine-print">This is an unofficial study aid. Verify answers, especially current officeholders and place-dependent questions, with the official sources.</p>
  </section>

  if (view === 'study' && cardQuestion) {
    const hasInfo = cardQuestion.is_geography_dependent || cardQuestion.is_time_dependent
    const roundQuestionCount = selectedRoundSize
    return <section className="flash-study" aria-labelledby="flash-card-question">
      <div className="flash-study-top"><button className="back-link" onClick={requestExit}>← Exit study</button><span>ROUND {roundIndex + 1}{includeTest ? ` OF ${roundSizes.length}` : ''} · CARD {cardIndex + 1} OF {roundQuestionCount}</span></div>
      <div className="flash-study-heading"><div><span className="eyebrow">QUESTION EDITION {session.edition} · {cardQuestion.section ?? 'U.S. CIVICS'}</span><h1>Study Flash Cards</h1></div><button className="button button-secondary small-button" onClick={() => { setView('settings'); setError('') }}>Change settings</button></div>
      <button className={`flashcard-surface${flipped ? ' is-flipped' : ''}`} type="button" aria-pressed={flipped} onClick={() => void revealCard(cardQuestion)}>
        <span className="flashcard-side-label">{flipped ? 'ACCEPTED ANSWERS' : `QUESTION ${cardQuestion.question_number}`}</span>
        {!flipped ? <><strong id="flash-card-question">{cardQuestion.question_text}</strong>{hasInfo && <span className="question-warning-label">Place- or time-dependent answer · verify current information</span>}</> : <ul>{displayFlashcardAnswers(cardQuestion).map(answer => <li key={answer}>{answer}</li>)}</ul>}
        <span className="flashcard-flip-hint">{flipped ? 'Tap or press Enter to see the question' : 'Tap or press Enter to reveal accepted answers'}</span>
      </button>
      <div className="flashcard-meta"><span>Answer reviewed {cardQuestion.answer_updated_on} · Next review {cardQuestion.next_update_on}</span><div className="flash-card-meta-actions"><SafeSources question={cardQuestion} />{hasInfo && <button type="button" className="info-button" aria-label="Why should I verify this answer?" aria-expanded={cardInfoOpen} onClick={() => setCardInfoOpen(value => !value)}>i</button>}</div></div>
      {hasInfo && cardInfoOpen && <div className={`info-bubble flash-card-info-bubble${cardInfoFading ? ' fading' : ''}`} role="status"><strong>IMPORTANT NOTICE FOR THIS QUESTION</strong><br/>This answer depends on the applicable jurisdiction or term of service. Verify the answer and official sources before your test.<br/><span>Reviewed: {cardQuestion.answer_updated_on}. See the official sources below. This notice will close in 5 seconds.</span></div>}
      {hasInfo && <p className="flash-current-warning"><strong>Check current information.</strong> This answer can depend on your jurisdiction or who holds an office when you take the test.</p>}
      <div className="flash-study-actions"><button className="button button-secondary" disabled={cardIndex === 0} onClick={() => { setCardIndex(index => index - 1); setFlipped(false) }}>← Previous</button><button className="button button-secondary" disabled={cardIndex + 1 >= roundQuestionCount} onClick={() => { setCardIndex(index => index + 1); setFlipped(false) }}>Next card →</button></div>
      {includeTest && <div className="flash-test-callout"><div><strong>Ready to check your recall?</strong><span>This test covers all {roundQuestionCount} cards in the current round.</span></div><button className="button button-primary" onClick={beginTest}>Test yourself →</button></div>}
      {!includeTest && <button className="button button-primary flash-finish" onClick={requestExit}>Finish studying · My hub</button>}
    </section>
  }

  if (view === 'test' && testQuestion) {
    const displayNumber = testOutcomes.length + (acknowledged ? 0 : 1)
    const savedAnswer = displayFlashcardAnswers(testQuestion)
    return <section className="flash-test-view" aria-labelledby="flash-test-question">
      <div className="flash-study-top"><button className="back-link" onClick={requestExit}>← Exit test</button><span>ROUND {roundIndex + 1} · QUESTION {displayNumber} OF {selectedRoundSize}</span></div>
      <div className="flash-test-timer" aria-live="off"><span>TIME LEFT</span><strong className={secondsLeft <= 5 ? 'urgent' : ''}>{secondsLeft}s</strong></div>
      <article className="flash-test-question"><span className="eyebrow">{testQuestion.section ?? 'U.S. CIVICS'} · QUESTION {testQuestion.question_number}</span><h1 id="flash-test-question">{testQuestion.question_text}</h1>{(testQuestion.is_geography_dependent || testQuestion.is_time_dependent) && <p className="flash-current-warning">Place- or time-dependent answer. Check current official information.</p>}</article>
      <fieldset className="flash-option-list" disabled={Boolean(acknowledged || sending || pending)}><legend>Choose one complete answer</legend>{testOptionSet.map(option => <label key={option.id} className={`flash-answer-option${selectedOption === option.id ? ' selected' : ''}${acknowledged !== null && option.correct ? ' answer-correct' : ''}`}><input type="radio" name="flash-answer" value={option.id} checked={selectedOption === option.id} onChange={() => setSelectedOption(option.id)} /><span>{option.label}</span></label>)}</fieldset>
      {error && <p className="flash-error" role="alert">{error} {pending && <button className="text-button" onClick={retrySubmission} disabled={sending}>{sending ? 'Saving…' : 'Retry saving answer'}</button>}</p>}
      {acknowledged && <div className={`flash-outcome ${acknowledged}`} role="status"><strong>{acknowledged === 'correct' ? 'Correct' : acknowledged === 'incorrect' ? 'Incorrect' : 'Skipped'}</strong><span>Accepted answer{savedAnswer.length === 1 ? '' : 's'}: {savedAnswer.join(' · ')}</span><SafeSources question={testQuestion} /><button className="button button-primary" onClick={continueTest}>Continue →</button></div>}
      {!acknowledged && <div className="flash-test-actions"><button className="button button-secondary" disabled={sending || Boolean(pending)} onClick={() => void submitOutcome('skipped')}>Skip question</button><button className="button button-primary" disabled={!selectedOption || sending || Boolean(pending)} onClick={confirmSelected}>{sending ? 'Saving answer…' : pending ? 'Retry answer below' : 'Confirm answer'}</button></div>}
      <p className="fine-print">Your selected answer stays in memory only. The app saves the question ID and correct, incorrect, or skipped outcome.</p>
    </section>
  }

  if (view === 'results' && result) return <section className="panel flash-results" aria-labelledby="flash-results-title">
    <button className="back-link" onClick={requestExit}>← Exit study</button><span className="eyebrow">ROUND {roundIndex + 1} RESULTS</span><h1 id="flash-results-title">Your practice summary.</h1>
    <div className="flash-result-score"><strong>{result.percent}%</strong><span>correct out of {result.answered} question presentations</span></div>
    <div className="flash-result-stats"><div><strong>{result.correct}</strong><span>Correct</span></div><div><strong>{result.incorrect}</strong><span>Incorrect</span></div><div><strong>{result.skipped}</strong><span>Skipped</span></div></div>
    <p className="fine-print">This practice percentage counts every presentation in this round. Questions repeated from earlier rounds are not additional unique questions. This is not a USCIS score or pass/fail result.</p>
    {roundIndex + 1 < roundSizes.length ? <div className="flash-result-actions"><p>The next cumulative round adds {roundSizes[roundIndex + 1] - roundSizes[roundIndex]} cards and will test all {roundSizes[roundIndex + 1]} cards.</p><button className="button button-primary" onClick={nextRound}>Study next round →</button></div> : <div className="flash-result-actions"><button className="button button-primary" onClick={onExit}>Return to my hub →</button></div>}
  </section>

  return <section className="panel flash-results"><h1>Study session unavailable.</h1><button className="button button-primary" onClick={onExit}>Return to my hub</button></section>
}
