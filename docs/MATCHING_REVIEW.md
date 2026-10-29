# Match & Learn release review

Status: published; the complete matching browser flow passed over public HTTPS.
GPT-6 Luna implemented the frontend, backend and browser
verification. Codex (`/root`) reviews, operates Supabase and publishes.

The game matches question cards to shuffled answer tiles using the session's
question edition and jurisdiction. Defaults are 12 questions, four per round
and Standard pace. Settings offer four/five-question rounds, 4–30 questions,
Relaxed/Standard/Challenge/Untimed and aggregate missed-question priority.
Multiple-answer questions display assigned/required counters. Incompatible
answers are placed in separate boards, with at most ten tiles per board.

Scoring is by question: complete distinct accepted concepts are Correct; any
wrong match is Incorrect; empty or incomplete, otherwise valid matches are
Skipped. Final review shows selected answers and an accepted answer set for
incorrect/skipped questions. Detailed selections stay in component memory;
only question/outcome counts and bounded idempotent receipts are stored.

## Evidence

- Root reviewed and transaction-tested migration `20261029032833` before
  applying it. SHA-256:
  `9c0e4d5a82338c992f38b8c3d7b5f4b283ef871b993c0563ffc5b160bb91227a`.
- Matching SQL checks passed: role boundaries, mode/aggregate isolation,
  immutable retries, cross-mode UUID rejection, invalid payloads, counter and
  receipt limits, immediate expiry and parent-delete cascades. Legacy MVP,
  flashcard and written-mode SQL regressions passed in rollback transactions.
- Concurrent real HTTP matching requests counted once; changed payloads,
  duplicate questions, extra keys, wrong-edition IDs and cross-mode reuse were
  rejected. Synthetic sessions were target-cleaned by verifier hashes.
- The 44 pre-existing aggregate progress rows retained the exact hash
  `f4a6eb4fea630acf5b126c630d7dfcaa` after migration and probe cleanup.
- Read-only real-content checks passed for both complete editions across
  UT/DC/AS: 486 plans, 2,934 boards and 13,716 tiles. Every visible tile mapped
  to one reviewed concept; valid assignments, wrong swaps, partial answers,
  distinct question coverage and the ten-tile bound were checked.
- Root's build/typecheck, 30 unit tests and English check passed. App bundle
  growth uses existing React/TypeScript/CSS only; no dependencies were added.
- Supabase security advisors returned no lints. Original question/answer facts,
  catalogue content and monthly verification dates were not changed.

- Root's full local matching browser flow passed 2025 UT03, 2008 American Samoa
  and 2025 D.C., touch/keyboard, responsive widths 320/390/820/1440, all scoring
  outcomes, editable assignments, multi-answer counters, exact 12-question
  completion, final selected/accepted answer review and saved progress recovery.
- Response-loss interception happened after a successful matching POST; retry
  kept the same UUID/results and counted once. A targeted Untimed regression
  and the full flow verified multiple consecutive boards and Play again remain
  usable. Real Challenge expiry and hidden-to-visible tab timing also passed.
- The complete existing-game browser flow passed both cohorts, written Quick
  Question, flashcards, timed tests, self-check Quiz and session recovery.
- Root inspected safe local board/results captures. Questions and answers stay
  in two columns at phone/tablet sizes, with a sticky scrollable answer panel.
- All reported local synthetic sessions were deleted by exact verifier hashes;
  follow-up checks returned zero matches. Official question-table fingerprints
  remain `311e7773cbc7c818de0470cf344ad796` (2008) and
  `260b0e00ea315afe6222ffd4b5db7126` (2025).

## Publication

- Live: https://naturalization-preparation-app.vercel.app/ — **Match & Learn**
  in the hub.
- Source commit: `12d10be4021e67558708b9a0e4d8b7c098fd3f19`.
- Vercel source deployment: `dpl_Aa9BrE7VpEsRjA7wvr6kbBLe8QYd`, READY for
  that exact commit. The canonical URL returned HTTP 200.
- [Source Security CI](https://github.com/ivveshermosilla/citizenship-prep/actions/runs/40815623366)
  succeeded. Staged and full-history secret scans passed, including Git hooks.
- Root reran the complete matching browser flow on the canonical HTTPS URL:
  both editions, UT03/American Samoa/D.C., four responsive widths, keyboard and
  touch, multi-concept counters, editable assignments, all scoring outcomes,
  final selected/accepted review, recovery and minimal outcome-only payloads.
  A dropped successful response retried the same immutable round and counted
  once. Real expiry, background-tab elapsed time and Untimed play passed.
- All three public matching probe sessions were removed by exact verifier
  hashes; the follow-up returned zero matches.
- The complete existing-game browser flow also passed on public HTTPS: written
  Quick Question and its retries, flashcards and rolling tests, actual 15-second
  timeout, self-check Quiz, question notices, recovery, both cohorts and four
  responsive widths. Its two probe sessions were target-cleaned as well.
- Public JavaScript/CSS bytes match the reviewed local build. SHA-256:
  `20edb2950ff9ec86403d369e5b058e0234ef746ea0d61e88e53683c61ed9cd3c`
  (JS) and
  `d6092154880c5a1295623286d04ba2ea6b08b91310a6a644d285bd72c7ab421f`
  (CSS). HTTPS security headers passed; environment, Git, source, SQL and
  catalogue paths returned 404. Root inspected public mobile board/results
  captures; Supabase security advisors returned no lints.

## Limits

Matching practice is an unofficial learning game, with client-evaluated scores.
Reviewed answer matching does not perform unrestricted semantic interpretation.
Chrome device emulation does not certify every physical phone or Safari version.
The detailed review is intentionally cleared on navigation/reload; anonymous
progress still follows the existing seven-day inactivity retention policy.
