# Quick Question release review

Status: local review complete; public deployment verification pending.
Implementation is by GPT-6 Luna; independent review, database
operations and publication are by Codex (`/root`).

The approved scope adds an untimed written question to the hub and replaces
provisional multiple-choice distractors with a versioned, reviewed catalogue for
both complete question editions. Written input remains in browser memory; only
question numbers, outcomes and idempotent attempt identifiers are transmitted.
Existing anonymous sessions, geography selection and seven-day retention apply.

## Review findings

- The first content draft used broad topic pools and generic rationales. It was
  rejected for publication. The replacement must establish that each complete
  option is incorrect for its particular question, including open-ended prompts.
- Written grading must handle partially filled, out-of-order fields without
  throwing, and reject duplicate synonyms as separate concepts.
- Current officeholder and party aliases must derive from current canonical
  values. Static former-holder aliases must never remain accepted after updates.
- Multi-concept distractors may contain correct components only when the entire
  option is incorrect; a complete set of distinct accepted concepts is excluded.
- Long accepted-answer lists must not make the unanswered card unnecessarily
  tall. Hidden card faces must remain inaccessible to keyboard and screen readers.
- Vacancy feedback must retain the prior-holder display while accepting only
  the canonical vacancy response.

## Release evidence

- Root reviewed all 228 templates, accepted concept groups, aliases and complete
  distractors, including non-exhaustive historical and civic prompts. Approved
  catalogue SHA-256:
  `3827b9a844403c5b03e9039dd1d477a9d9400b5d2f7cf2fba73873fbdc6082cf`.
- Root applied migrations `20261028151527`, `20261028151954` and
  `20261028152907`, and activated the hash-gated catalogue in the dedicated
  Supabase project. The existing 30 progress rows were backfilled into the
  multiple-choice projection with an identical hash; real sessions were retained.
- All 1,438 question/geography rows passed 25 bounded read-only verification
  batches. Actual metadata RPCs returned complete 100/128-question projections
  for Utah, D.C. and American Samoa. Current absence responses, vacancies,
  canonical freshness, private grants and distractor exclusion were checked.
- Legacy MVP/flashcard SQL regressions and new mode/metadata rollback checks
  passed. Real HTTP concurrent duplicate submissions, mode isolation, changed
  payload rejection and legacy response compatibility passed.
- Root checked every returned alias and complete four-option set in both
  editions for Utah, D.C. and American Samoa. Negated variants were rejected;
  options remained complete with exactly one correct choice across three draws.
- Build, typecheck, 20 unit tests and English checks passed. Luna's complete
  local Chrome flow passed both editions at 320/390/820/1440 widths, including
  untimed written input beyond 15 seconds, partial/reordered concepts, retry,
  duplicate clicks, feedback, recovery and legacy modes. Root inspected safe
  screenshots. Browser emulation does not replace physical-device feedback.
- Root target-cleaned reported synthetic sessions by exact verifier hashes and
  confirmed zero matches. Question-table fingerprints remain unchanged:
  `311e7773cbc7c818de0470cf344ad796` (2008) and
  `260b0e00ea315afe6222ffd4b5db7126` (2025). Security advisors returned no lints.

Pending: staged/history secret scans, production deployment, public browser
verification and GitHub CI. Publication evidence will be recorded here after
the deployed site has been checked.

The official facts remain dated October 27, 2026. Editorial review of aliases or
distractors is not a new verification of current officeholders. Monthly content
maintenance and the existing hourly expiry cleanup retain separate purposes.
