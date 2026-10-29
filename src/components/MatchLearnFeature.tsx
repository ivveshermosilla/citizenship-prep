import { useEffect, useMemo, useRef, useState } from 'react'
import { formatAnswers, type Question } from '../lib/domain'
import type { LearningProgress, PracticeMetadata } from '../lib/quick-question'
import { recordMatchingRound } from '../lib/supabase'
import {
  buildMatchingPlan, isBeforeDeadline, roundAllowanceSeconds, scoreMatchingBoard, summarizeMatchingOutcomes,
  matchingEligibleQuestions,
  type MatchingBoard, type MatchingOutcome, type MatchingPace, type MatchingPlan, type MatchingProgress,
  type SubmittedMatchingOutcome,
} from '../lib/matching'

type Props = {
  code: string
  questions: Question[]
  metadata: PracticeMetadata[]
  metadataLoading: boolean
  metadataError: string
  onRetryMetadata: () => void
  matchingProgress: MatchingProgress[]
  onLearningChange: (learning: LearningProgress) => void
  onExit: () => void
}

type SavedRound = { board: MatchingBoard; assignments: Record<number, string[]>; outcomes: SubmittedMatchingOutcome[] }
type FrozenSubmission = { id: string; outcomes: SubmittedMatchingOutcome[]; assignments: Record<number, string[]> }

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function MatchLearnFeature({ code, questions, metadata, metadataLoading, metadataError, onRetryMetadata, matchingProgress, onLearningChange, onExit }: Props) {
  const available = useMemo(() => matchingEligibleQuestions(questions, metadata), [questions, metadata])
  const [count, setCount] = useState(() => Math.min(12, Math.min(30, available.length)))
  const [countInput, setCountInput] = useState(() => String(Math.min(12, Math.min(30, available.length))))
  const [roundSize, setRoundSize] = useState<4 | 5>(4)
  const [pace, setPace] = useState<MatchingPace>('standard')
  const [prioritize, setPrioritize] = useState(false)
  const [plan, setPlan] = useState<MatchingPlan | null>(null)
  const [stage, setStage] = useState<'setup' | 'board' | 'round-results' | 'results'>('setup')
  const [boardIndex, setBoardIndex] = useState(0)
  const [assignments, setAssignments] = useState<Record<number, string[]>>({})
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null)
  const [selectedTile, setSelectedTile] = useState<string | null>(null)
  const [savedRounds, setSavedRounds] = useState<SavedRound[]>([])
  const [filter, setFilter] = useState<'all' | 'incorrect' | 'skipped'>('all')
  const [now, setNow] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  const [roundLocked, setRoundLocked] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [timedOut, setTimedOut] = useState(false)
  const [roundSummary, setRoundSummary] = useState<ReturnType<typeof summarizeMatchingOutcomes> | null>(null)
  const [settingMessage, setSettingMessage] = useState('')
  const [planReady, setPlanReady] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState<number | null>(null)
  const [noticeFading, setNoticeFading] = useState(false)
  const [noticeCycle, setNoticeCycle] = useState(0)
  const deadlineRef = useRef<number | null>(null)
  const frozenRef = useRef<FrozenSubmission | null>(null)
  const submitLockRef = useRef(false)
  const saveInFlightRef = useRef(false)
  const assignmentRef = useRef(assignments)
  const countTouchedRef = useRef(false)
  const minimumCount = Math.min(4, available.length)
  const maximumCount = Math.min(30, available.length)
  const countDraftValid = /^\d+$/u.test(countInput) && Number(countInput) >= minimumCount && Number(countInput) <= maximumCount
  const currentBoard = plan?.boards[boardIndex]
  const allowance = currentBoard ? roundAllowanceSeconds(currentBoard.questions.map(q => q.requiredCount), pace) : null
  const remaining = deadlineRef.current === null ? null : Math.max(0, Math.ceil((deadlineRef.current - now) / 1000))
  const finalOutcomes = savedRounds.flatMap(round => round.outcomes)
  const finalSummary = summarizeMatchingOutcomes(finalOutcomes)
  const allReviews = savedRounds.flatMap(round => round.board.questions.map(item => ({ item, round, outcome: round.outcomes.find(outcome => outcome.question_number === item.question.question_number)?.outcome ?? 'skipped' as MatchingOutcome })))
  const displayedReviews = allReviews.filter(entry => filter === 'all' ? entry.outcome !== 'correct' : entry.outcome === filter)

  useEffect(() => {
    if (countTouchedRef.current || maximumCount < 1) return
    const initialCount = Math.min(maximumCount, Math.max(minimumCount, 12))
    if (count !== initialCount || countInput !== String(initialCount)) {
      setCount(initialCount)
      setCountInput(String(initialCount))
    }
  }, [minimumCount, maximumCount, count, countInput])

  function editCountDraft(value: string) {
    countTouchedRef.current = true
    setCountInput(value)
    setPlan(null); setPlanReady(false)
    if (/^\d+$/u.test(value) && Number(value) >= minimumCount && Number(value) <= maximumCount) setCount(Number(value))
  }
  function commitCountDraft() {
    const value = /^\d+$/u.test(countInput) ? Number(countInput) : count
    const normalized = Math.min(maximumCount, Math.max(minimumCount, value))
    if (maximumCount > 0) { setCount(normalized); setCountInput(String(normalized)) }
  }

  function startPlan() {
    setError(''); setSaveError(''); setSavedRounds([]); setBoardIndex(0); setAssignments({}); assignmentRef.current = {}; setSelectedQuestion(null); setSelectedTile(null); setRoundSummary(null); setSettingMessage(''); setFilter('all')
    const result = buildMatchingPlan(questions, metadata, { questionCount: count, questionsPerRound: roundSize, pace, prioritizeMissed: prioritize }, matchingProgress)
    if (result.error || !result.boards.length) { setError(result.error ?? 'No matching boards are available.'); return }
    setCount(result.selectedCount)
    setPlan(result)
    setPlanReady(true)
  }

  useEffect(() => {
    if (stage !== 'board' || !currentBoard) { deadlineRef.current = null; return }
    // Every board, timed or untimed, starts with a fresh immutable submission slot.
    frozenRef.current = null
    submitLockRef.current = false
    saveInFlightRef.current = false
    setRoundLocked(false)
    setTimedOut(false)
    const seconds = roundAllowanceSeconds(currentBoard.questions.map(q => q.requiredCount), pace)
    if (seconds === null) { deadlineRef.current = null; return }
    deadlineRef.current = Date.now() + seconds * 1000
    setNow(Date.now())
    const tick = () => {
      const current = Date.now()
      setNow(current)
      if (deadlineRef.current !== null && current >= deadlineRef.current && !submitLockRef.current) void submit(true)
    }
    const interval = window.setInterval(tick, 200)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', tick); deadlineRef.current = null }
    // A board gets one absolute wall-clock deadline. Tab visibility never pauses it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, boardIndex, plan])

  useEffect(() => {
    if (stage === 'setup') return
    const frame = window.requestAnimationFrame(() => document.getElementById('matching-title')?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [stage, boardIndex])

  useEffect(() => {
    if (stage !== 'board') return
    const confirmLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', confirmLeave)
    return () => window.removeEventListener('beforeunload', confirmLeave)
  }, [stage])

  useEffect(() => {
    if (noticeOpen === null) return
    setNoticeFading(false)
    const fade = window.setTimeout(() => setNoticeFading(true), 5000)
    const close = window.setTimeout(() => setNoticeOpen(null), 5350)
    return () => { window.clearTimeout(fade); window.clearTimeout(close) }
  }, [noticeOpen, noticeCycle])

  function assign(questionNumber: number, tileId: string) {
    if (stage !== 'board' || submitLockRef.current) return
    if (!isBeforeDeadline(deadlineRef.current, Date.now())) { void submit(true); return }
    const next = Object.fromEntries(Object.entries(assignmentRef.current).map(([key, ids]) => [Number(key), ids.filter(id => id !== tileId)])) as Record<number, string[]>
    const item = currentBoard?.questions.find(entry => entry.question.question_number === questionNumber)
    const ids = next[questionNumber] ?? []
    if (!item || ids.length >= item.requiredCount) return
    next[questionNumber] = [...ids, tileId]
    assignmentRef.current = next
    setAssignments(next)
    setSelectedQuestion(null); setSelectedTile(null)
  }

  function selectQuestion(number: number) {
    if (selectedTile) { assign(number, selectedTile); return }
    setSelectedQuestion(current => current === number ? null : number)
  }
  function selectTile(id: string) {
    const assignedTo = Object.entries(assignments).find(([, ids]) => ids.includes(id))?.[0]
    if (assignedTo !== undefined) return
    if (selectedQuestion !== null) { assign(selectedQuestion, id); return }
    setSelectedTile(current => current === id ? null : id)
  }
  function removeAssignment(questionNumber: number, tileId: string) {
    if (submitLockRef.current) return
    if (!isBeforeDeadline(deadlineRef.current, Date.now())) { void submit(true); return }
    const next = { ...assignmentRef.current, [questionNumber]: (assignmentRef.current[questionNumber] ?? []).filter(id => id !== tileId) }
    assignmentRef.current = next
    setAssignments(next)
  }

  async function submit(automatic = false) {
    if (!currentBoard || !plan || submitLockRef.current) return
    if (!automatic && !isBeforeDeadline(deadlineRef.current, Date.now())) { void submit(true); return }
    submitLockRef.current = true
    setRoundLocked(true)
    const timeoutSubmission = automatic && deadlineRef.current !== null && Date.now() >= deadlineRef.current
    if (timeoutSubmission) setTimedOut(true)
    const frozenAssignments = Object.fromEntries(Object.entries(assignmentRef.current).map(([key, ids]) => [Number(key), [...ids]])) as Record<number, string[]>
    const outcomeRows = scoreMatchingBoard(currentBoard, frozenAssignments)
    if (!frozenRef.current) frozenRef.current = { id: uuid(), outcomes: outcomeRows, assignments: frozenAssignments }
    deadlineRef.current = null
    setNow(Date.now())
    saveInFlightRef.current = true
    setSaving(true); setSaveError(''); setError('')
    try {
      const saved = await recordMatchingRound(code, frozenRef.current.id, frozenRef.current.outcomes)
      onLearningChange(saved.learning)
      setRoundSummary(summarizeMatchingOutcomes(outcomeRows))
      setSavedRounds(current => [...current, { board: currentBoard, assignments: frozenRef.current!.assignments, outcomes: outcomeRows }])
      setStage('round-results')
      setSettingMessage(timeoutSubmission ? 'Time expired. This round was submitted automatically.' : '')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'This round was not saved. Retry to submit the same results.')
      // Keep the exact UUID and immutable outcomes for an idempotent retry.
    } finally { saveInFlightRef.current = false; setSaving(false) }
  }

  function retrySave() {
    if (!currentBoard || !frozenRef.current || saveInFlightRef.current) return
    void (async () => {
      saveInFlightRef.current = true
      setSaving(true); setSaveError('')
      try {
        const saved = await recordMatchingRound(code, frozenRef.current!.id, frozenRef.current!.outcomes)
        onLearningChange(saved.learning)
        const outcomes = frozenRef.current!.outcomes
        setRoundSummary(summarizeMatchingOutcomes(outcomes))
        setSavedRounds(current => [...current, { board: currentBoard, assignments: frozenRef.current!.assignments, outcomes }])
        setStage('round-results')
      } catch (e) { setSaveError(e instanceof Error ? e.message : 'This round was not saved. Retry again.') }
      finally { saveInFlightRef.current = false; setSaving(false) }
    })()
  }

  function nextBoard() {
    if (!plan) return
    if (boardIndex + 1 >= plan.boards.length) { setStage('results'); return }
    setBoardIndex(value => value + 1); setAssignments({}); assignmentRef.current = {}; setSelectedQuestion(null); setSelectedTile(null); setRoundSummary(null); setSettingMessage(''); setStage('board')
  }
  function leave() {
    if (saveInFlightRef.current) return
    if (stage === 'board') {
      const message = frozenRef.current
        ? 'The save could not be confirmed. This round may already be saved. Leave and clear this page, or stay to retry the same results?'
        : 'Leave this unfinished round? Its assignments will be cleared and will not count as attempts.'
      if (!window.confirm(message)) return
    }
    deadlineRef.current = null
    setPlan(null); setPlanReady(false); setSavedRounds([]); setAssignments({}); assignmentRef.current = {}; setStage('setup'); onExit()
  }
  function playAgain() {
    const replay = buildMatchingPlan(questions, metadata, { questionCount: count, questionsPerRound: roundSize, pace, prioritizeMissed: prioritize }, matchingProgress)
    if (replay.error || !replay.boards.length) { setError(replay.error ?? 'No matching boards are available.'); setStage('setup'); return }
    setPlan(replay); setPlanReady(false); setCount(replay.selectedCount); setBoardIndex(0); setSavedRounds([]); setAssignments({}); assignmentRef.current = {}; setSelectedQuestion(null); setSelectedTile(null); setRoundSummary(null); setError(''); setSaveError(''); setSettingMessage(''); setFilter('all'); setNoticeOpen(null); setStage('board')
  }
  function changeSettings() { setPlan(null); setPlanReady(false); setSavedRounds([]); setAssignments({}); assignmentRef.current = {}; setRoundSummary(null); setFilter('all'); setNoticeOpen(null); setStage('setup'); setError(''); setSaveError('') }
  function updateCount(value: number) { countTouchedRef.current = true; setCount(value); setCountInput(String(value)); setPlan(null); setPlanReady(false) }
  function updateRoundSize(value: 4 | 5) { setRoundSize(value); setPlan(null); setPlanReady(false) }
  function updatePace(value: MatchingPace) { setPace(value); setPlan(null); setPlanReady(false) }
  function updatePriority(value: boolean) { setPrioritize(value); setPlan(null); setPlanReady(false) }

  return <section className="matching-layout" aria-labelledby="matching-title">
    <div className="matching-top"><button className="back-link" disabled={saving} onClick={leave}>← My hub</button><span className="eyebrow">MATCH &amp; LEARN</span></div>
    {stage === 'setup' && <section className="panel matching-settings" data-testid="matching-settings">
      <h1 id="matching-title" tabIndex={-1}>Match &amp; Learn</h1>
      <p className="lead">Pair each question with its required answers. Multi-answer progress shows how many slots have an answer placed, not whether they are correct.</p>
      {metadataLoading && <p role="status">Loading reviewed matching content…</p>}
      {metadataError && <p className="error-inline" role="alert">{metadataError} <button className="text-button" onClick={onRetryMetadata}>Retry</button></p>}
      {!metadataLoading && !metadataError && available.length === 0 && <p className="flash-error" role="alert">Reviewed matching content is unavailable. <button className="text-button" onClick={onRetryMetadata}>Retry loading content</button></p>}
      {!metadataLoading && !metadataError && available.length > 0 && <>
        <div className="matching-setting-grid">
          <div className="field"><label htmlFor="matching-question-count">Questions to include</label><div className="matching-count-control"><input id="matching-question-count" data-testid="matching-question-count" type="number" min={minimumCount} max={maximumCount} step="1" inputMode="numeric" aria-invalid={!countDraftValid} value={countInput} onChange={event => editCountDraft(event.target.value)} onBlur={commitCountDraft}/><input aria-label="Questions to include slider" type="range" min={minimumCount} max={maximumCount} value={Math.min(maximumCount, Math.max(minimumCount, count))} disabled={!available.length} onChange={event => updateCount(Number(event.target.value))}/></div><small>Choose 4–30, up to {available.length} reviewed questions in this edition and jurisdiction. {countDraftValid ? '' : `Enter a whole number from ${minimumCount} to ${maximumCount}.`}</small></div>
          <div className="field"><label htmlFor="matching-round-size">Questions per round</label><select id="matching-round-size" data-testid="matching-round-size" value={roundSize} onChange={event => updateRoundSize(Number(event.target.value) as 4 | 5)}><option value="4">4 questions</option><option value="5">5 questions</option></select></div>
          <div className="field"><label htmlFor="matching-pace">Pace</label><select id="matching-pace" data-testid="matching-pace" value={pace} onChange={event => updatePace(event.target.value as MatchingPace)}><option value="relaxed">Relaxed</option><option value="standard">Standard</option><option value="challenge">Challenge</option><option value="untimed">Untimed</option></select></div>
        </div>
        <label className="matching-priority"><input data-testid="matching-prioritize-missed" type="checkbox" checked={prioritize} onChange={event => updatePriority(event.target.checked)}/> Prioritize missed questions <small>Uses saved question outcomes when available; selected questions stay within this edition and jurisdiction.</small></label>
        <div className="matching-help"><strong>How rounds work</strong><p>A question with more than one required answer needs one different tile for every answer slot. You can change assignments before submitting. A fully correct question is Correct. Any incorrect placed match makes the question Incorrect. An unanswered or incomplete question is Skipped only when every placed match is valid. Skipped questions count as unsuccessful in the practice percentage.</p><p>The timer continues while this tab is hidden. Detailed answer review stays on this page and clears when you leave; only question outcome counts are saved.</p></div>
        {planReady && plan && stage === 'setup' && <p data-testid="matching-plan-summary" className="matching-plan-summary">This plan contains {plan.selectedCount} questions in {plan.boards.length} rounds: {plan.boards.map((board, index) => `round ${index + 1}, ${board.questions.length} questions`).join('; ')}.</p>}
        <button className="button button-primary full-button" data-testid="matching-start" disabled={!available.length || !countDraftValid || Boolean(metadataError)} onClick={() => planReady ? setStage('board') : startPlan()}>{planReady ? 'Start round 1 →' : 'Preview rounds →'}</button>
      </>}
      {error && <p className="error-inline" role="alert">{error}</p>}
    </section>}

    {stage === 'board' && currentBoard && plan && <section className="matching-round" data-testid="matching-board">
      <div className="matching-round-head"><div><span className="eyebrow">ROUND {boardIndex + 1} OF {plan.boards.length}</span><h1 id="matching-title" tabIndex={-1}>Make the matches.</h1><p>Place every required answer slot, then submit to see results.</p></div>{remaining !== null && <div className="matching-timer" data-testid="matching-timer" role="timer" aria-label={`${remaining} seconds remaining`}><span>TIME LEFT</span><strong>{formatClock(remaining)}</strong><small>{allowance} seconds allowed</small></div>}</div>
      {timedOut && stage === 'board' && <p className="matching-timeout" role="status">Time expired. Your round is frozen and waiting to save.</p>}
      <div className="matching-board-columns"><div className="matching-cards">{currentBoard.questions.map(item => {
        const number = item.question.question_number
        const assigned = assignments[number] ?? []
        return <article className={`matching-question-card${selectedQuestion === number ? ' is-selected' : ''}`} key={number}>
          <button type="button" className="matching-question-select" data-testid={`matching-question-${number}`} disabled={roundLocked} aria-pressed={selectedQuestion === number} aria-label={`Question ${number}: ${item.question.question_text}. ${assigned.length} of ${item.requiredCount} answers placed`} onClick={() => selectQuestion(number)}><span className="matching-question-number">QUESTION {number}</span><strong>{item.question.question_text}</strong><span className="matching-progress" data-testid={`matching-progress-${number}`}>{assigned.length}/{item.requiredCount} answers placed</span></button>
          {assigned.length > 0 && <div className="matching-assigned" aria-label={`Answers placed on question ${number}`}>{assigned.map((id, index) => { const tile = currentBoard.tiles.find(value => value.id === id); return <button type="button" key={id} className="matching-assigned-chip" data-testid={`matching-remove-${number}-${index + 1}`} aria-label={`Remove ${tile?.label ?? 'answer'} from question ${number}`} disabled={roundLocked} onClick={() => removeAssignment(number, id)}>{tile?.label ?? 'Answer'} <span aria-hidden="true">×</span></button> })}</div>}
        </article>
      })}</div>
      <section className="matching-tiles" aria-labelledby="matching-tiles-title"><h2 id="matching-tiles-title">Answer tiles</h2><p>Choose a question, then a tile, or choose a tile first.</p><div className="matching-tile-grid">{currentBoard.tiles.map((tile, index) => { const assigned = Object.values(assignments).some(ids => ids.includes(tile.id)); return <button type="button" key={tile.id} className={`matching-tile${selectedTile === tile.id ? ' is-selected' : ''}${assigned ? ' is-assigned' : ''}`} data-testid={`matching-tile-${index + 1}`} disabled={roundLocked || assigned} aria-pressed={selectedTile === tile.id} onClick={() => selectTile(tile.id)}>{tile.label}{assigned && <span className="sr-only"> assigned</span>}</button> })}</div></section></div>
      <div className="matching-submit-area"><button type="button" className="button button-primary" data-testid="matching-submit" disabled={roundLocked || saving} onClick={() => void submit(false)}>{saving ? 'Saving round…' : 'Submit round'}</button><span>{currentBoard.questions.length} questions · {currentBoard.tiles.length} answer tiles · {pace === 'untimed' ? 'Untimed round' : `${allowance} seconds allowed`}</span></div>
      {saveError && <div className="quick-save-error" role="alert">{saveError} <button className="button button-secondary" data-testid="matching-retry" disabled={saving} onClick={retrySave}>{saving ? 'Retrying…' : 'Retry save'}</button></div>}
      {error && <p role="alert" className="error-inline">{error}</p>}
    </section>}

      {stage === 'round-results' && <section className="panel matching-round-results" data-testid="matching-round-results"><span className="eyebrow">ROUND {boardIndex + 1} SAVED</span><h1 id="matching-title" tabIndex={-1}>Round results</h1>{settingMessage && <p role="status">{settingMessage}</p>}<div className="matching-round-score"><strong>{roundSummary?.correct ?? 0} Correct</strong><span>{roundSummary?.incorrect ?? 0} Incorrect</span><span>{roundSummary?.skipped ?? 0} Skipped</span></div><p>Your detailed answer review appears after the last round and stays on this page.</p><div className="button-row">{plan && boardIndex + 1 < plan.boards.length ? <button className="button button-primary" data-testid="matching-next" onClick={nextBoard}>Next round →</button> : <button className="button button-secondary" data-testid="matching-view-results" onClick={() => setStage('results')}>View results</button>}</div></section>}

    {stage === 'results' && <section className="matching-final" data-testid="matching-final-results"><span className="eyebrow">MATCH &amp; LEARN · RESULTS</span><h1 id="matching-title" tabIndex={-1}>Your results</h1><div className="matching-final-score"><strong>{finalSummary.correct} Correct</strong><span>{finalSummary.incorrect} Incorrect</span><span>{finalSummary.skipped} Skipped</span><b>{finalSummary.percent}% correct</b><small>{finalOutcomes.length} questions · skipped counts as unsuccessful</small></div><p className="matching-local-review">This detailed review is saved only on this page. If you leave or reload, it clears. The anonymous session stores per-question outcome counts separated by practice activity.</p>
      <div className="matching-filters" role="group" aria-label="Filter answer review">{(['all', 'incorrect', 'skipped'] as const).map(value => <button className={filter === value ? 'active' : ''} key={value} data-testid={`matching-filter-${value}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All missed' : value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      <div className="matching-review-list">{displayedReviews.length === 0 ? <p>No questions in this filter.</p> : displayedReviews.map(({ item, round, outcome }) => {
        const number = item.question.question_number
        const assigned = round.assignments[number] ?? []
        const labels = assigned.map(id => round.board.tiles.find(tile => tile.id === id)?.label).filter((label): label is string => Boolean(label))
        const metadataItem = metadata.find(value => value.question_number === number)
        const unanswered = item.requiredCount - labels.length
        return <article className="matching-review-card" data-testid={`matching-review-${number}`} key={number}><span className={`matching-outcome outcome-${outcome}`}>{outcome}</span><h2>{item.question.question_text}</h2><p><strong>Your matches</strong>{labels.length ? <span>{labels.join('; ')}</span> : <span>No answers placed</span>}{unanswered > 0 && <small>{unanswered} answer slot{unanswered === 1 ? '' : 's'} left empty</small>}</p><p><strong>One accepted answer set</strong><span>{item.expectedConceptKeys.map(key => metadataItem?.answer_groups.find(group => group.key === key)?.display).filter(Boolean).join('; ')}</span></p><details><summary>All accepted answers</summary><ul>{formatAnswers(item.question).map(answer => <li key={answer}>{answer}</li>)}</ul></details>{(item.question.is_geography_dependent || item.question.is_time_dependent) && <><button type="button" className="matching-info-button" aria-label="IMPORTANT NOTICE FOR THIS QUESTION" aria-expanded={noticeOpen === number} onClick={() => { setNoticeOpen(number); setNoticeFading(false); setNoticeCycle(value => value + 1) }} onMouseEnter={() => { setNoticeOpen(number); setNoticeFading(false); setNoticeCycle(value => value + 1) }} onFocus={() => { setNoticeOpen(number); setNoticeFading(false); setNoticeCycle(value => value + 1) }}>ⓘ IMPORTANT NOTICE FOR THIS QUESTION</button>{noticeOpen === number && <div className={`matching-info-bubble${noticeFading ? ' fading' : ''}`} role="status"><strong>IMPORTANT NOTICE FOR THIS QUESTION</strong><br/>This answer was last updated on {item.question.answer_updated_on}. Check the official sources to confirm that the answer is current.<br/><span>This answer may depend on the applicable jurisdiction or official's term of service. This notice will close in 5 seconds.</span></div>}</>}<p className="matching-review-meta">Answer reviewed: {item.question.answer_updated_on}</p><div className="source-links">{item.question.source_urls.map(url => <a href={url} target="_blank" rel="noreferrer" key={url}>Official source ↗</a>)}</div></article>
      })}</div>
      <div className="button-row matching-final-actions"><button className="button button-primary" data-testid="matching-play-again" onClick={playAgain}>Play again</button><button className="button button-secondary" data-testid="matching-change-settings" onClick={changeSettings}>Change settings</button><button className="button button-secondary" data-testid="matching-my-hub" onClick={leave}>My hub</button></div>
    </section>}
  </section>
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
