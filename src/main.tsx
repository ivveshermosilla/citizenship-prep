import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import jurisdictions from './data/jurisdictions.json'
import districts from './data/districts.json'
import { formatAnswers, getRecoveryCode, type Edition, type Question, type Session } from './lib/domain'
import { configured, createSession, loadQuestions, recordCardReview, recordQuizCheck, resumeSession } from './lib/supabase'
import './style.css'

type Screen = 'notice' | 'setup' | 'code' | 'save-code' | 'hub' | 'cards' | 'quiz'
const notices = [
  { kicker: '01 / 03 · Before you begin', title: 'A practice tool', body: <>This app is an unofficial study aid and does not replace official sources. Study with the <a href="https://www.uscis.gov/citizenship-resource-center/naturalization-information" target="_blank" rel="noreferrer">official naturalization study materials</a> and verify current information there.</> },
    { kicker: '02 / 03 · Current answers', title: 'Place and time matter', body: <>Some answers depend on your state, territory, or district and on who holds an office when you take the test. The data includes its review date and may change before the next monthly review. Check every answer against its official sources.</> },
  { kicker: '03 / 03 · Your session', title: 'Your progress is anonymous', body: <>No account or personal information is required. We store only the minimum progress and selections needed to resume. Save your code: it is the only key, and anyone who has it can access this session. After 7 days without activity, the session expires and its progress is deleted. If you close or reload this page, you will need to enter your code again. We do not ask for identity details or use tracking analytics. Hosting and database providers may retain technical request/security logs under their own policies.</> },
]
const initialCode = ''

function App() {
  const [screen, setScreen] = useState<Screen>('notice')
  const [notice, setNotice] = useState(0)
  const [edition, setEdition] = useState<Edition>('2025')
  const [stateCode, setStateCode] = useState('')
  const [districtCode, setDistrictCode] = useState('')
  const [code, setCode] = useState(initialCode)
  const [newCode, setNewCode] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [cardIndex, setCardIndex] = useState(0)
  const [quizIndex, setQuizIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [bubble, setBubble] = useState(false)
  const [bubbleFading, setBubbleFading] = useState(false)
  const [bubbleCycle, setBubbleCycle] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const reviewedCards = useRef(new Set<number>())
  const availableDistricts = useMemo(() => districts.filter(d => d.jurisdiction === stateCode), [stateCode])
  const currentQuestion = questions[screen === 'cards' ? cardIndex : quizIndex]
  const reviewedOn = questions[0]?.answer_updated_on
  const nextUpdateOn = questions[0]?.next_update_on

  useEffect(() => {
    if (!bubble) return
    const fadeTimer = window.setTimeout(() => setBubbleFading(true), 5000)
    const closeTimer = window.setTimeout(() => { setBubble(false); setBubbleFading(false) }, 5350)
    return () => { window.clearTimeout(fadeTimer); window.clearTimeout(closeTimer) }
  }, [bubble, bubbleCycle])
  useEffect(() => { setBubble(false); setBubbleFading(false) }, [currentQuestion?.question_number, screen])
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('.shell h1')
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }) }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [screen, currentQuestion?.question_number])

  function startResume() { setError(''); setCode(''); setScreen('code') }
  function safeReturn() { setScreen('notice'); setNotice(0); setError('') }
  async function enterHub(nextSession: Session, recoveryCode: string) {
    setBusy(true); setError('')
    try {
      const loaded = await loadQuestions(nextSession)
      reviewedCards.current.clear()
      setSession(nextSession); setCode(recoveryCode); setQuestions(loaded); setScreen('hub')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the question bank. Please try again.') }
    finally { setBusy(false) }
  }
  async function handleCreate() {
    if (!stateCode || (availableDistricts.length > 1 && !districtCode)) return
    setBusy(true); setError('')
    const secret = getRecoveryCode()
    try {
      const result = await createSession(secret, edition, stateCode, availableDistricts.length > 1 ? districtCode : availableDistricts[0]?.code ?? null)
      reviewedCards.current.clear()
      setSession(result); setCode(secret); setNewCode(secret); setScreen('save-code')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the session. Please try again.') }
    finally { setBusy(false) }
  }
  async function handleResume() {
    setBusy(true); setError('')
    try { const result = await resumeSession(code.trim()); await enterHub(result, code.trim()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not resume the session.') }
    finally { setBusy(false) }
  }
  async function revealCard() {
    if (!code || busy) return
    setError('')
    if (!reviewedCards.current.has(currentQuestion!.question_number)) {
      setBusy(true)
      try {
        const updated = await recordCardReview(code)
        reviewedCards.current.add(currentQuestion!.question_number)
        setSession(updated)
      } catch (e) { setError(e instanceof Error ? e.message : 'Progress was not saved. Please try again.'); setBusy(false); return }
      finally { setBusy(false) }
    }
    setRevealed(true)
  }
  function moveCard(direction: -1 | 1) {
    setRevealed(false); setError(''); setCardIndex(i => Math.min(questions.length - 1, Math.max(0, i + direction)))
  }
  async function handleQuizCheck(knew: boolean) {
    if (!code || checked) return
    setBusy(true); setError('')
    try { const updated = await recordQuizCheck(code, knew); setSession(updated); setChecked(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'Your self-check was not saved. Please try again.') }
    finally { setBusy(false) }
  }
  function nextQuiz() { setQuizIndex(i => (i + 1) % questions.length); setRevealed(false); setChecked(false); setError('') }
  async function copyCode() {
    try { await navigator.clipboard.writeText(newCode); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }
    catch { setError('Could not copy the code. Select and copy it manually.') }
  }
  function openBubble() { setBubbleFading(false); setBubble(true); setBubbleCycle(n => n + 1) }
  function acknowledgeSavedCode() { if (session) void enterHub(session, newCode) }

  const resumeLink = <button className="text-button" onClick={startResume}>Resume previous session <span aria-hidden="true">↗</span></button>
  return <main className="shell">
    <header className="topbar"><button className="brand" onClick={safeReturn} aria-label="Return to home"><span className="brand-mark">C</span><span>Civic <b>Compass</b></span></button><span className="privacy-label"><span className="privacy-dot"/> Anonymous practice</span></header>
    {!configured && <div className="config-warning" role="alert"><span>The practice service is unavailable. Check your connection and try again.</span><button className="text-button" onClick={() => window.location.reload()}>Try again</button></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError('')}>×</button></div>}

    {screen === 'notice' && <section className="notice-layout" aria-labelledby="notice-title">
      <div className="notice-copy"><span className="eyebrow">U.S. CIVICS STUDY GUIDE</span><div className="notice-illustration" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span>✳</span></div>
      <p className="step-label">{notices[notice].kicker}</p><h1 id="notice-title">{notices[notice].title}</h1><p className="lead">{notices[notice].body}</p>
      <div className="notice-actions">{notice < notices.length - 1 ? <button className="button button-primary" onClick={() => setNotice(n => n + 1)}>Continue <span aria-hidden="true">→</span></button> : <div className="button-row"><button className="button button-primary" onClick={() => setScreen('setup')}>New session <span aria-hidden="true">→</span></button><button className="button button-secondary" onClick={startResume}>Resume previous session</button></div>}
        {notice < notices.length - 1 && resumeLink}
      </div><div className="progress-dots" aria-label={`Notice ${notice + 1} of 3`}>{notices.map((_, i) => <span key={i} className={i === notice ? 'active' : ''}/>)}</div></div>
      <aside className="notice-art"><div className="art-card art-back"><span className="art-stamp">STUDY<br/>AT YOUR PACE</span><div className="art-lines"/></div><div className="art-card art-front"><span className="art-spark">✳</span><span className="art-word">One question<br/><i>at a time.</i></span><span className="art-caption">YOUR PATH, YOUR PRACTICE</span></div><span className="art-orbit-label">100 / 128<br/>official questions</span></aside>
    </section>}

    {screen === 'setup' && <section className="panel setup-panel"><button className="back-link" onClick={safeReturn}>← Home</button><span className="eyebrow">NEW SESSION</span><h1>Set up your practice.</h1><p className="lead">Choose the question bank based on when you filed your application and select the jurisdiction that applies to your residence.</p>
      <div className="field"><label htmlFor="cohort">When did you file Form N-400?</label><select id="cohort" value={edition} onChange={e => setEdition(e.target.value as Edition)}><option value="2008">Before October 20, 2025 · 2008 bank (100 questions)</option><option value="2025">On or after October 20, 2025 · 2025 bank (128 questions)</option></select></div>
      <div className="field"><label htmlFor="jurisdiction">Applicable state, district, or territory</label><select id="jurisdiction" value={stateCode} onChange={e => { setStateCode(e.target.value); setDistrictCode('') }}><option value="">Select a jurisdiction</option>{jurisdictions.map(j => <option key={j.code} value={j.code}>{j.name}</option>)}</select><small>We do not ask for your address or infer your location.</small></div>
      {stateCode && availableDistricts.length > 1 && <div className="field"><label htmlFor="district">Congressional district</label><select id="district" value={districtCode} onChange={e => setDistrictCode(e.target.value)}><option value="">Select your district</option>{availableDistricts.map(d => <option key={d.code} value={d.code}>{d.name} · {d.code}</option>)}</select><small>If you do not know your district, use the <a href="https://www.house.gov/representatives/find-your-representative" target="_blank" rel="noreferrer">official representative lookup</a>.</small></div>}
      {stateCode && availableDistricts.length === 1 && <p className="auto-district">Only district for this jurisdiction: {availableDistricts[0]?.name}.</p>}
      <button className="button button-primary full-button" disabled={!stateCode || (availableDistricts.length > 1 && !districtCode) || busy || !configured} onClick={handleCreate}>{busy ? 'Creating…' : 'Create anonymous session →'}</button><p className="fine-print">After creating your session, you will see a recovery code to save before you begin.</p></section>}

    {screen === 'code' && <section className="panel code-panel"><button className="back-link" onClick={() => { setScreen('notice'); setError('') }}>← Back</button><span className="eyebrow">RESUME YOUR PROGRESS</span><h1>Welcome back.</h1><p className="lead">Enter the code you saved. If your session is still active, you will return directly to your hub.</p><div className="field"><label htmlFor="recovery-code">Recovery code</label><input id="recovery-code" autoComplete="off" spellCheck="false" inputMode="text" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleResume() }} placeholder="43 characters" maxLength={43}/></div><button className="button button-primary full-button" disabled={busy || code.trim().length !== 43 || !configured} onClick={handleResume}>{busy ? 'Looking for your session…' : 'Continue to my hub →'}</button><p className="fine-print">There is no email or identity-based recovery. An expired code cannot be reactivated.</p></section>}

    {screen === 'save-code' && <section className="panel save-panel"><span className="eyebrow">SAVE THIS BEFORE CONTINUING</span><div className="code-icon" aria-hidden="true">⌑</div><h1>Your access key.</h1><p className="lead">This code is shown only once. Save it somewhere safe; you will need it to return. Anyone who has it can access this progress.</p><div className="secret-code" aria-label="Secret code">{newCode}</div><button className="button button-secondary copy-button" onClick={() => void copyCode()}>{copied ? 'Copied ✓' : 'Copy code'}</button><p className="fine-print">There is no account-based recovery. If you lose your code, you will need to start a new session. The session expires after 7 days without activity.</p><button className="button button-primary full-button" disabled={busy} onClick={acknowledgeSavedCode}>{busy ? 'Loading questions…' : 'I saved my code · Go to my hub →'}</button></section>}

    {screen === 'hub' && session && <section className="hub-layout"><div className="hub-heading"><div><span className="eyebrow">YOUR PRACTICE HUB</span><h1>One step at a time.</h1><p>Your progress is saved in this anonymous session. Choose how you want to study today.</p></div><button className="button button-secondary small-button" onClick={safeReturn}>Return to home</button></div><div className="stats-row"><div className="stat-card score-card"><span className="stat-label">SELF-REPORTED PRACTICE</span><strong>{session.quiz_correct}<small> / {session.quiz_attempts}</small></strong><span>answers you knew · not a USCIS score</span></div><div className="stat-card"><span className="stat-label">CARDS REVIEWED</span><strong>{session.cards_reviewed}</strong><span>questions studied</span></div><div className="stat-card"><span className="stat-label">BANK AND JURISDICTION</span><strong className="stat-place">{session.edition === '2008' ? '2008' : '2025'} · {jurisdictions.find(j => j.code === session.state_code)?.name}</strong><span>{session.district_code ? `District ${session.district_code.slice(2)}` : 'Single district or no district'}</span></div></div><div className="session-dates"><span>Session created: {new Date(session.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</span><span>Last active: {new Date(session.last_active_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</span></div><div className="activity-grid"><button className="activity-card" onClick={() => { setCardIndex(0); setRevealed(false); setScreen('cards') }}><span className="activity-number">01</span><span className="activity-icon">▤</span><h2>Study cards</h2><p>Read each question, reveal the official answers, and review at your own pace.</p><span className="activity-link">Browse questions ↗</span></button><button className="activity-card activity-dark" onClick={() => { setQuizIndex(0); setRevealed(false); setChecked(false); setScreen('quiz') }}><span className="activity-number">02</span><span className="activity-icon">✳</span><h2>Quick quiz</h2><p>Think of your answer, reveal the official options, then check yourself.</p><span className="activity-link">Start practice ↗</span></button></div><p className="hub-note">Answers reviewed on {reviewedOn ? new Date(`${reviewedOn}T00:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' }) : '—'} · Next review due: {nextUpdateOn ? new Date(`${nextUpdateOn}T00:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' }) : '—'}. <a href="https://www.uscis.gov/citizenship-resource-center" target="_blank" rel="noreferrer">See official resources</a>.</p></section>}

    {(screen === 'cards' || screen === 'quiz') && currentQuestion && session && <section className="study-layout"><div className="study-top"><button className="back-link" onClick={() => { setScreen('hub'); setError('') }}>← My hub</button><span className="study-count">{screen === 'cards' ? 'STUDY CARDS' : 'QUICK QUIZ'} · {screen === 'cards' ? cardIndex + 1 : quizIndex + 1} / {questions.length}</span></div><article className="question-card"><div className="question-label"><span>{currentQuestion.section ?? 'U.S. CIVICS'}</span><div className="question-help-control">{(currentQuestion.is_geography_dependent || currentQuestion.is_time_dependent) && <span className="question-warning-label">IMPORTANT NOTICE FOR THIS QUESTION</span>}<button className="info-button" aria-label="Source and current information" aria-expanded={bubble} onClick={openBubble} onMouseEnter={openBubble} onFocus={openBubble}>i</button></div></div>{bubble && <div className={`info-bubble${bubbleFading ? ' fading' : ''}`} role="status"><strong>IMPORTANT NOTICE FOR THIS QUESTION</strong><br/>{(currentQuestion.is_geography_dependent || currentQuestion.is_time_dependent) ? 'This answer depends on the applicable jurisdiction or term of service. Verify the answer and official sources before your test.' : 'Check this answer against current official materials.'}<br/><span>Reviewed: {currentQuestion.answer_updated_on}. See the official sources below. This notice will close in 5 seconds.</span></div>}<h1>{currentQuestion.question_text}</h1><div className="question-foot"><span>Question {currentQuestion.question_number} · USCIS bank {session.edition}</span><span>Answer reviewed: {currentQuestion.answer_updated_on}</span></div></article><div className="answer-area">{!revealed ? <button className="button button-primary" disabled={busy} onClick={() => screen === 'cards' ? void revealCard() : setRevealed(true)}>{busy ? 'Saving…' : 'Reveal answers'}</button> : <div className="answers-box"><span className="answer-heading">ACCEPTED ANSWERS</span><ul>{formatAnswers(currentQuestion).map(answer => <li key={answer}>{answer}</li>)}</ul><div className="source-links">{currentQuestion.source_urls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer">Official source ↗</a>)}</div></div>}</div>{screen === 'cards' ? <div className="study-actions"><button className="button button-secondary" disabled={cardIndex === 0 || busy} onClick={() => moveCard(-1)}>← Previous</button><button className="button button-primary" disabled={busy} onClick={() => cardIndex === questions.length - 1 ? setScreen('hub') : moveCard(1)}>{cardIndex === questions.length - 1 ? 'Finish · My hub' : 'Next →'}</button></div> : <div className="study-actions quiz-actions">{!checked ? <><button className="button button-secondary" disabled={!revealed || busy} onClick={() => void handleQuizCheck(false)}>Review again</button><button className="button button-primary" disabled={!revealed || busy} onClick={() => void handleQuizCheck(true)}>I knew it ✓</button></> : <button className="button button-primary" onClick={nextQuiz}>Next question →</button>}</div>}<p className="fine-print study-disclaimer">Your self-check stores only the total correct answers and attempts; individual answers are not saved.</p></section>}
    <footer className="footer"><span>CIVIC COMPASS · UNOFFICIAL STUDY AID</span><span>No accounts · No ads · No tracking</span></footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
