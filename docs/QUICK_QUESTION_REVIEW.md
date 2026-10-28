# Quick Question release review

Status: published and verified on October 28, 2026.
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

## Publication

- Public URL: [Naturalization Preparation App](https://naturalization-preparation-app.vercel.app/).
- Published source: `0872c54f25733870d220ff851a5299a1b5bb73c5`.
- Vercel deployment `dpl_6wN5Xsfopk71zyzFLacSgGjKcQB4` reached READY.
- [GitHub Security CI](https://github.com/ivveshermosilla/citizenship-prep/actions/runs/40717781498)
  passed. Local staged and complete-history secret scans passed with hooks enabled.
- Root's complete HTTPS browser flow passed both editions at all four widths,
  including written feedback, reordering/partial answers, untimed waiting,
  retries, score recovery, legacy modes and the actual timed MC timeout.
  The harness records POST requests only and waits for card animations to settle
  before testing touch coordinates.
- The public JS/CSS bytes match the reviewed build. HTTPS/security headers were
  present, and environment, Git, source, seed and authoring-catalogue paths
  returned 404. The final two public probe sessions were deleted by exact
  verifier hashes; the follow-up query returned zero matches.

A documentation/test-harness follow-up records this evidence. Its deployment
must retain the same reviewed application asset bytes.

The official facts remain dated October 27, 2026. Editorial review of aliases or
distractors is not a new verification of current officeholders. Monthly content
maintenance and the existing hourly expiry cleanup retain separate purposes.
