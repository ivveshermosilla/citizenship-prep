# Study Flash Cards and timed practice tests

The owner authorized implementation, verification and publication of the
following behavior after the product discussion. All user surfaces remain
English. GPT-6 Luna writes implementation; the coordinator reviews and operates
Supabase migrations, Git and Vercel. This supersedes the earlier freeze on Study
Cards mechanics and the prohibition on retaining per-question outcomes.

## Product behavior

- Replace the decorative asterisk in the colored square with a simple open-book
  outline SVG. Preserve the approved NPA map/flag brand. Native inline SVG is
  sufficient; do not add an icon dependency or copy proprietary branding.
- Add Back on notice screens two and three, going to the previous notice.
  Preserve recovery access and all existing disclaimers.
- Rename Study Cards to **Study Flash Cards** and open its settings first.
- **Number of flashcards**: synchronized integer input and slider, 1 through
  the available question count, normally default 20 (clamped if necessary).
- **Selection method**: Random, In order (1–N), By topic, Specific range.
  Random draws without duplicates once when starting; rerendering/flipping
  must not redraw the deck. In order selects official question numbers 1–N.
  Topic selection uses the actual edition's section/subsection and clamps N
  to available questions. Specific range uses inclusive official From/To
  numbers, validates bounds and automatically sets N = To - From + 1; do not
  allow a conflicting independent count. Do not silently substitute questions.
- Give each selection option an individual accessible circled-i control with
  a brief plain-English tooltip on tap, hover and keyboard focus. Keep it
  dismissible and use the existing five-second/fade behavior where suitable.
- **Include a practice test** checkbox enables the later **Test yourself**
  button. The setup action is **Start studying**, never Ready. Test yourself
  appears on the study view; the user chooses when ready, and it tests the
  entire current round, not merely whichever card is displayed.
- **Rolling review** requires the test checkbox and has synchronized integer
  input/range for **Cards added per round**, 1 through selected deck size.
  For N=8 and step=3, cumulative rounds are 1–3, 1–6, 1–8. Each round reviews
  its cumulative flashcards, then Test yourself starts that round's questions.
  Results offer the next cumulative round, until the selected deck completes.
  Keep the original chosen deck/order through all rounds. Explain the total
  repetition count (N=20, step=1 means 210 test presentations) before starting.
- When prior per-question outcomes exist, enable **Prioritize missed questions**
  and prioritize incorrect/skipped questions within the eligible selection.
  Never introduce questions outside an explicit range or selected topic.
  No invented history from old self-assessed totals. Explain unavailable
  history/empty missed-question sets. The old progress remains valid.
- Flashcards have a readable glass-like surface, question front and all accepted
  answers back; a tap/click/keyboard action flips with a CSS 3D animation.
  Support reduced motion, visible focus and sufficient contrast. Previous/Next
  change cards and reset the face. Preserve actual answer dates, official
  source links, vacancy display and the dependent-question warning/bubble.
- The test uses four complete answer options, exactly one correct, randomized
  order, temporarily sourcing distractors from answers to other questions.
  Exclude duplicates, aliases and semantically valid alternatives; questions
  asking for two/three items need complete answer sets in each option, not one
  item incorrectly graded as sufficient. No runtime AI or invented official
  answers. Use conservative clearly wrong source-answer distractors while
  realistic distractors are deferred; expose no answer key before confirmation.
- Each test question has 15 elapsed seconds; no Previous/Back/reveal action.
  Select an option and Confirm answer; Skip or timeout becomes skipped.
  Use an actual deadline, not tick-count decrement, so re-renders/background
  throttling do not grant time. A late confirmation is skipped. Lock submitted
  outcomes and wait for durable acknowledgement before advancing; retry safely
  on network failure without changing the answer or restarting its timer.
- Show Correct, Incorrect, Skipped separately, and practice percentage as
  correct / all submitted questions. Both incorrect and skipped count as
  unsuccessful for this practice percentage. Keep distinct from Quick Quiz's
  legacy self-assessed score. Distinguish repeated attempts from unique
  questions; do not imply 210 different questions were learned.
- Leaving/reloading abandons the in-memory deck/test; acknowledged outcomes
  remain saved. Do not count never-presented future questions as skipped.
  Explain this in an exit confirmation within the app. Recovery still enters
  the hub immediately, with saved aggregate/per-question progress available.
- Keep Quick Quiz's existing self-check functionality. Add no exam pass/fail
  claims, speech recording, microphone permission, speech evaluation, prerecorded
  narration or official 20-question simulation yet. Record those as future work.

## Minimal private persistence and shared interface

Use only project `xgzoxeyhavudxnvontle`. Preserve both question tables, facts,
source fingerprints, internal change guidance and actual review dates. Expose
only `subsection` in addition to the existing public question projection so
the UI can use official topics. Existing clients must remain compatible.

The session code stays in memory only, never URLs/storage/logs. No selected
answer strings, wrong options, audio, accounts, personal identifiers or tracking.
Persist only question IDs, correct/incorrect/skipped counts and last outcome,
plus bounded minimal retry-deduplication records. Delete all dependent records
with the existing session at 168-hour inactivity cleanup (FK cascade). Access
must expire immediately at 168h, even before the next hourly cleanup.

Frontend/backend contract (coordinate any change before implementation):

- `get_flashcard_progress(p_code text)` returns an array of objects with
  `question_number`, `correct_count`, `incorrect_count`, `skipped_count`,
  `last_outcome` (`correct`, `incorrect` or `skipped`). Invalid/expired code is
  rejected. No UUID/verifier/internal metadata in the projection.
- `record_flashcard_round(p_code text, p_round_id uuid, p_results jsonb)` accepts
  a nonempty array of `{question_number, outcome}` in submitted order, max
  100/128 unique question IDs according to the session edition. Each call sends
  the cumulative submitted prefix for the same round ID, checkpointing after
  every question. It returns `{progress: [...], round: {answered, correct,
  incorrect, skipped}}`. Generate the round UUID locally using CSPRNG; a new
  rolling round gets a new UUID. UUID alone grants no access.
- Store a private per-session/round receipt with processed-prefix length/hash
  and counts (not answer text). Identical retries change no counters; appending
  a new suffix updates only that suffix. Reject changed prior outcomes, shrinking
  prefixes, duplicate questions, malformed/extra-key objects, out-of-edition IDs,
  invalid outcomes, invalid/expired codes and bounded-counter overflow. Serialize
  concurrent requests by locking the parent session; validate everything before
  refreshing meaningful-activity time. Bound all counters and round receipts.
- Practice outcomes are client-evaluated study data, not tamper-proof exam or
  competition results. Preserve the original self-check counters separately.
- All new tables live in game_private with RLS, no direct anon/authenticated
  access. Reuse guarded private fixed-search-path definer functions and narrow
  public invoker wrappers, with explicit execution grants/revokes. No broad
  schema/function grants, service keys or anonymous Auth identities.

## Ownership and verification

Frontend Luna owns src/, frontend/unit/browser/English scripts, package scripts
and canonical product/README documents. Backend Luna owns supabase/ migrations,
SQL verification and database docs, plus a new scripts/api-flashcards.mjs if
needed; coordinate its package-script entry with frontend. Backend sends its
draft migration to root for review before root applies it; no direct remote
DDL by subagents. Use `supabase migration new`, never invent migration filenames.
Root owns this brief, AGENTS instructions, final release review/docs, publication
and private context/registry updates. Frontend Luna is the only active writer of
the implementation checklist while agents work; backend sends progress to root.
Only root marks reviewed/verified. Do not commit/push/deploy as a subagent.

Add FC01–FC09 checklist entries with actual implementation agent and root review.
Keep it open in the existing VS Code window; do not close any tabs/windows.
Run meaningful unit tests for selection/ranges/topics/rolling boundaries,
distractor safety/full multi-answer options, timer and retry/idempotency behavior.
SQL tests must cover two-session isolation, expiry, invalid payloads, duplicate
and concurrent-style retries, partial-prefix appends, cascade cleanup and grants
in rollback transactions. Browser checks need real Supabase integration, all
selection methods, range/count synchronization, rolling step/final short round,
flip/keyboard/reduced motion, timeout/skip/correct/wrong distinctions, history
priority and code recovery, notices/sources and mobile/tablet/desktop widths.
Coordinate Chrome 9223 usage; never run browser flows concurrently. Safe notice,
settings, card and hub screenshots only; never capture recovery-code screens.
Print only one-way hashes for targeted cleanup of synthetic API/browser sessions;
never erase real users. Preserve hooks and secret scans without allowlist changes.
