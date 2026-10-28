# Hub Quick Question and reviewed practice content

The owner approved implementation and publication of an untimed written question
directly in the hub, accepting registered answers and reviewed variants. The
owner also authorized Supabase support and quality distractors for every question,
replacing the deliberately unrelated provisional options. All implementation is
by GPT-6 Luna; root reviews, operates database changes and publishes.

## Hub behavior

- Place **Quick Question** directly in the hub, without entering another mode.
  Use the current session's edition and jurisdiction/district. Choose randomly
  from that applicable question set; avoid immediate repetition. Keep the same
  question through typing, rerenders, saves and feedback until Another question.
- No timer. One input per required distinct concept. Preserve a complete phrase
  as one concept (e.g. We the People), while two Congress parts and three branches
  need two/three separate fields even when official answers are bundled strings.
- **Check answer** evaluates the whole question. All required distinct valid
  concepts are Correct, regardless of field order. Partial/invalid responses
  are Incorrect. **Skip** records Skipped. All-empty Check can behave as Skip;
  navigating elsewhere without submitting does not create an attempt.
- Ignore case, optional hyphens, extra spacing and immaterial punctuation.
  Use reviewed aliases for numeric words/digits, appropriate abbreviations,
  optional name components and registered equivalent expressions. Preserve
  negations and meaning: no substring, bag-of-words, fuzzy/AI or unrestricted
  paraphrase grading. Never count synonymous wording twice as distinct concepts.
- After Check or Skip, freeze the inputs/outcome and flip to the accepted
  answers with the existing flashcard rotation and reduced-motion behavior.
  Show feedback for correct, incorrect and skipped submissions, all accepted
  answers, source links and actual review date/dependent-answer notice.
  Another question is available after feedback/save, draws a new random question
  and clears the input. Input taps must not flip the card while editing.
- Save each submission once; duplicate clicks/retries use one attempt UUID.
  Show a retryable save failure; preserve pending outcome instead of silently
  losing it or double counting. New question waits for durable acknowledgement.
- All typed text stays in browser memory. Send only question ID, outcome and
  attempt ID to Supabase. No raw typed answers, selected options or text-derived
  hashes, analytics, accounts, audio or microphone permissions.

## Reviewed learning metadata and distractors

- Cover both complete editions: 100 questions (2008) and 128 (2025), and all
  existing geographic projections, including vacancy/DC/territory rules.
- Create a versioned learning-content catalogue in Supabase, separate from the
  immutable official question/answer tables. Retain provenance, author/review
  status, rationale and reviewed variants/distractors for each edition/question.
  Do not alter official question text, answers, source dates or internal change
  guidance. Root reviews the content before marking it approved or serving it.
- At least three plausible, clearly incorrect complete options per question,
  using the same answer category: government forms for government forms, people
  for people, dates for dates, and so forth. Do not retain the unrelated numeric
  count versus historical-person fallback. No runtime AI generation.
- For multi-concept questions, each distractor set has the required number of
  concepts. Exactly one final option is a complete valid answer. Avoid synonyms
  of valid answers, other correct alternatives, duplicate concepts and claims
  that are merely absent from a non-exhaustive official answer list.
- Open-ended questions need provably wrong options, even where that makes them
  easy. Do not misclassify valid civic participation, concurrent government
  powers, legal freedoms or historical achievements as wrong for plausibility.
- Geographic/current-office questions may use reviewed dynamic strategies
  sourcing other jurisdictions' current holders/capitals or a candidate pool,
  excluding every currently valid answer. Never accept stale officeholder aliases
  after the canonical answer changes. Keep vacancy predecessor display separate
  from accepted current responses. Broadly exclude actual accepted variants
  from every single-concept distractor at runtime as well as in validation.
  For multi-concept options, a partially correct set may be a distractor only
  when the complete set is unambiguously incorrect. Exclude every complete set
  matching the required number of distinct accepted concepts, including aliases;
  reject repeated concepts and duplicate sets regardless of order.
- Curated answer groups must accurately split bundled answers and merge semantic
  duplicates (speech/expression), without splitting names such as Secretary of
  Health and Human Services or Martin Luther King, Jr. Day into multiple items.
- Written aliases are conditional on the current canonical answer, or are
  explicitly reviewed static groups for stable bundled questions. Do not use
  an old official's name as a permanent accepted variant.
- Persist English source content; the app remains English. Clearly describe
  multiple-choice options as NPA practice choices, not official USCIS choices.

## Shared browser/database contract

Backend and content Luna must agree the internal seed format before mass authoring.
The browser contract is fixed; coordinate with root before changing it:

- Add public invoker RPC `get_practice_metadata(p_edition text, p_state_code text,
  p_district_code text)`, resolving the same safe edition/geography projection as
  existing questions and returning an array of `PracticeMetadata` objects:
  `question_number`, `required_count`, `answer_groups` (array of objects with
  `key`, `display`, `aliases`), `distractor_sets` (array of arrays of strings,
  each complete set of length required_count), `content_version`.
- Serve only root-reviewed content. Root review status/rationale/private session
  fields are not exposed. Correct alternatives come from distinct answer groups;
  distractor sets must not match a complete valid group assignment. Keep source
  question display unchanged. All supported projections must have complete data.
- Preserve old question RPC and existing clients during rollout. New frontend
  can fetch metadata alongside questions and attach it by question ID; failures
  must be retryable rather than silently grading from incomplete metadata or
  reusing provisional distractors.
- Add `get_learning_progress(p_code text)` returning
  `{progress: aggregate_question_array, multiple_choice: question_array,
  written: question_array}`. Each question array uses existing fields
  question_number/correct_count/incorrect_count/skipped_count/last_outcome.
- Preserve existing `get_flashcard_progress` and round RPC shape for legacy
  multiple-choice clients. Add `learning` with the above projection to the round
  write result for new clients. New `record_written_answer(p_code text,
  p_attempt_id uuid, p_question_number integer, p_outcome text)` returns
  `{learning: ...}` and is strictly idempotent for the same attempt/payload.
- Maintain one authoritative aggregate for per-question missed-review priority,
  with separate mode counters for written versus multiple choice in the hub.
  Existing saved outcomes are multiple-choice data and must remain intact.
  Bind deduplication receipts to their mode, rejecting cross-mode attempt reuse.
  Root/backend may refine the internal representation while preserving this API.
- Use only Supabase project xgzoxeyhavudxnvontle. New private tables have RLS,
  revoked direct access, fixed-search-path guarded helpers and narrow invoker
  wrappers. Enforce code ownership, immediate 168-hour expiry, atomic updates,
  bounded counts/receipts, no extra payload keys, and parent deletion cascades.
  Reuse existing hourly cleanup; content remains on monthly review, not a new
  daily/weekly updater. Do not introduce service credentials in clients.

## Work ownership and release

- Frontend Luna: src/, frontend/unit/browser scripts, package scripts, canonical
  README/product docs. Implement local typed grading, integrate reviewed options
  into existing MC tests, hub interface and mode-separated totals. Own the active
  implementation checklist, adding QQ tasks with authors and root-review fields.
- Backend Luna: supabase/ schema/functions/migrations/tests/database docs and
  API checks. Coordinate seed representation with content Luna. Draft migration
  is reviewed and applied by root, never by a subagent. Generate migration names
  with the installed Supabase CLI; do not edit an already-applied migration.
- Content Luna: versioned data catalogue/aliases/distractor sets and its content
  validation/import builder. Own only the new practice-content data directory
  and content scripts. Send sample entries/schema early, then all 228 templates
  for root's actual review. Do not mark root review complete yourself.
- Root: requirements, content/security/source review, migration operations,
  checklist verification, Git/Vercel publication, private context/registry.
  No app/SQL/test implementation by root. No subagent commits/pushes/deployments.
- Preserve current flashcards/rolling/timers, legacy Quick Quiz, anonymous
  recovery and all prior product behavior. Voice/narration/official exam simulator
  remain future work. No new dependencies unless existing capabilities lack one.
- Verify every official question and every geographic projection, normalized
  aliases/negation rejection, fixed/multi-item concepts, duplicate synonyms,
  correct/incorrect/skipped flips, no timer, random/no-immediate-repeat behavior,
  idempotent mode-specific persistence, old progress/backward compatibility and
  privacy. Validate curated distractors for semantic correctness and completeness,
  including the author's rationale; a string mismatch alone proves nothing.
- Coordinate Chrome 9223; one browser flow at a time. Prefer existing native CDP
  harness with instant scroll, ready/focus waits and structured DOM properties.
  Do not repeat whole flows for easily isolated harness parser errors. Capture
  only safe hub/study/settings/result screens, never recovery codes or typed
  personal text. Print synthetic-code verifier hashes only, and target-clean
  each test run through root. Root verifies public HTTPS after publication.
