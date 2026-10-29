# Match & Learn implementation brief

Owner authorization: develop and publish a complete matching game in the hub,
using GPT-6 Luna for all implementation. Root defines scope, reviews, verifies,
operates Supabase/Git/Vercel, and records the release. No additional owner
decision is needed for the settings below. The app remains English and mobile
first. Preserve existing games and all privacy, cohort and geography policies.

## Product and settings

- Hub entry: **Match & Learn**, with a simple native SVG matching icon.
- Defaults: 12 distinct questions, 4 questions per round, Standard pace.
  Offer 4 or 5 questions per round and 4–30 total questions (bounded by available
  reviewed content), synchronized numeric input/slider. Offer Relaxed, Standard,
  Challenge and Untimed. Base round seconds per question: 30, 22.5 and 15,
  respectively; add 10 seconds for each required answer beyond the first.
  Round up fractional seconds and show the actual round allowance clearly.
- Optional **Prioritize missed questions** uses the aggregate saved question
  history when available. Select distinct questions randomly within the current
  session's edition and jurisdiction. No residence inference or new data bank.
- Settings explain the timer continues while the tab is hidden, the meaning of
  multi-answer progress, scoring, and page-local detailed review. Start is
  explicit. Show the actual generated number of rounds before starting.

## Round construction and ambiguity

- Left: question cards. Right: independently shuffled answer tiles. Tap either
  a question then an answer, or an answer then a question, to assign. Support
  mouse and keyboard with ordinary accessible buttons; dragging is not required.
- Use the already approved `PracticeMetadata`, selecting exactly required_count
  distinct answer groups per question. Complete phrases remain atomic. There
  are no unrelated/generated/AI answers or extra distractor tiles in this game.
- Make one answer tile per selected concept, with stable opaque local IDs.
  Prevent two questions from sharing accepted answer/alias concepts in the same
  board. Compare all approved aliases as well as displays, conservatively using
  the existing normalization; numeric aliases, government roles, people and
  synonymous expressions must not create misleading one-to-one boards.
  A visibly valid alternate mapping must never be marked wrong because of a
  hidden tile owner. Reject/regroup ambiguous boards before showing them.
- Aim for the chosen 4/5 questions, but cap answer tiles at 10 per board. Defer
  incompatible/large questions to later boards; a final/smaller board is allowed
  and announced accurately. Never silently discard selected questions. If
  needed, place a difficult-to-pair question in a smaller final board. Preserve
  all eligible questions, including the five-state question and vacancies.
- Mark question progress as **0/2**, **1/2**, **2/2**, with accessible wording
  saying answers placed. This does not reveal correctness before submission.
  Assignments can be removed/replaced before submission; a tile is used at most
  once. Full questions cannot accept more than the required number of tiles.
- Do not reveal correctness immediately. **Submit round** locks the board and
  saves one outcome per question. A real wall-clock deadline automatically
  submits current assignments. Guard clicks and timer races with refs; input
  received at or after the deadline cannot alter the frozen result.
- After saving, show round totals and **Next round** or **View results**. Retry
  failures with the exact same immutable round UUID/outcomes; do not advance or
  count twice. A hidden/reopened tab must not grant extra time. Untimed rounds
  have no deadline. Cancel/reset timers on exit, round changes and unmount.
- Leaving an unfinished round asks for confirmation and does not invent
  attempts for unsubmitted questions. Previously saved round outcomes remain.

## Scoring and final review

- Score by question. Correct requires all required, distinct valid concepts.
  Any assigned incorrect concept makes the question Incorrect. No assignments,
  or an incomplete set containing only correct concepts, makes it Skipped.
  Explain that incomplete questions count as skipped; skipped questions are
  unsuccessful in the practice percentage. Counts must sum to total questions.
- Keep actual selected tile labels and the expected selected answer set only
  in component memory. Final results show correct/incorrect/skipped counts,
  correct percentage, and filters for all missed / incorrect / skipped.
  Each missed item includes the question, **Your matches**, **One accepted
  answer set**, all official accepted alternatives in a disclosure, review date,
  source links and existing dependent-answer information behavior. Clearly show
  missing answer slots and any partially correct selection.
- The final review is page-local: navigating away or reloading clears it.
  Say this in plain English; only minimal outcome counts are resumed with the
  anonymous session. No answer text, selected tile IDs/labels, detailed review,
  raw payload or answer-text hashes are stored remotely or in web storage.
- Offer **Play again**, **Change settings** and **My hub**. No official pass/fail
  claims, voice, narration, accounts, analytics, new installs or dependencies.

## Backend/browser contract

- Reuse private learning-mode progress and bounded receipts. Add mode
  `matching`; retain every existing row, counter, receipt and RPC behavior.
- `LearningProgress` gains additive `matching: LearningQuestionProgress[]`;
  all existing fields remain unchanged. Hub separates Matching from written,
  MC and legacy self-assessed Quiz; aggregate mistakes include all modes.
- Add invoker RPC `record_matching_round(p_code text, p_round_id uuid,
  p_results jsonb)` returning `{learning: LearningProgress, round: {answered,
  correct, incorrect, skipped}}`. Results are an immutable complete array of
  1–5 unique `{question_number, outcome}` objects. Reject nulls, malformed/extra
  keys, wrong edition IDs, repeats, changed payloads and cross-mode UUID reuse.
- Lock the parent session, recheck immediate 168-hour expiry after locking,
  update aggregate and matching counts atomically. Identical retries never
  increment or refresh activity. Enforce existing 1,024 receipts and 100,000
  outcome limits. Parent deletion cascades; reuse existing hourly cleanup.
- New/changed privileged helpers stay private with fixed search_path, narrow
  grants and public invoker wrappers. Preserve RLS/direct access denial. Only
  project `xgzoxeyhavudxnvontle`; do not change question/answer/catalogue facts,
  sources, verification dates or monthly review cadence.
- Root reviews frozen CLI-generated migrations and applies them. After applying,
  match local filenames to actual remote versions without changing bytes. Any
  later fix is a new migration. No agent applies remote DDL or publishes.

## Ownership and verification

- Frontend Luna owns `src/`, package scripts, English checker, canonical product
  docs/README and active checklist rows MM01–MM08. Add implementation author
  and root reviewer columns immediately; never mark root review complete.
- Backend Luna owns `supabase/` and `scripts/api-matching.mjs`. Coordinate the
  exact contract above, implement SQL and meaningful rollback/API concurrency
  checks, and report frozen migration hashes before root operation.
- QA Luna owns only NEW `scripts/browser-matching.mjs`; reuse installed Chrome
  CDP9223 patterns without editing shared browser-flow.mjs. Do not run Chrome
  until root coordinates it. Other agents must not modify this QA script.
- Required coverage: safe boards/cardinality, no repeated questions or ambiguous
  mappings, multi-part counters, actual correct/wrong/partial/omitted scoring,
  assignment changes, timer expiry/background handling, no timer mode, retry
  idempotency/privacy, final answer review, both editions and320/390/820/1440
  widths, keyboard/touch, existing-game regression, saved progress recovery.
- Browser tracking counts POST only (OPTIONS is not a write). Wait for finite
  animations and stable layout before touch hit-testing. Screenshots only safe
  settings/boards/results, never recovery-code screens. Print only synthetic
  verifier hashes for exact cleanup, never raw recovery codes or credentials.
- Root verifies local and deployed end-to-end flows, scans staged/history with
  existing hooks, publishes main to canonical NPA hostname, and updates matching
  private context/handoff/registry. Do not load unrelated durable context.
