# Local MVP review — October 27, 2026

Application, database migrations, configuration and tests were implemented by
GPT-6 Luna (`/root/luna_mvp`). Codex (`/root`) defined the scope, reviewed the
implementation, requested corrections from Luna, and independently executed
verification. The coordinator did not implement application or database code.
Luna also completed the final startup-documentation correction before reaching
its usage limit. The coordinator completed this review record and checklist.

The [checklist](IMPLEMENTATION_CHECKLIST.md) records implementation and review
for every minimum-deliverable task. The local app is available at
`http://127.0.0.1:4173/` while its review server is running. See the root README
for the reproducible startup command using that same port.

## Independent coordinator verification

- `npm run build`: typechecking and production build passed.
- `npm test`: four tests passed, including expiry boundary, recovery-code
  generation/format, vacancy display, and cohort/district selection.
- `supabase/tests/verify_app_mvp.sql`: passed and rolled back. This exercises
  441 districts in both cohorts, 56 jurisdictions, projection allowlist,
  real anon/authenticated role denials, separate capabilities, bounded counters,
  wrong-code inactivity, 168-hour rejection and cleanup.
- `supabase/tests/content_fingerprints.sql`: original core contents unchanged:
  2008 `2c79ad56f1b2df4ad1be60e32fd5e405`,
  2025 `3072b66de54693a8359fe9131ea3fa54`.
- `node scripts/browser-smoke.mjs`: Chrome checks passed at 320, 390, 820 and
  1440 CSS pixels, including notice/resume controls, empty persistent browser
  storage, no third-party resource requests on entry and focus management.
- `node scripts/browser-flow.mjs`: real touch-driven creation, safe code
  acknowledgement, Supabase hub, cards/source/date, review-counter deduplication,
  one-shot quiz self-check, five-second bubble/fade, reload/manual recovery,
  score restoration, and the 2008 Samoa at-large path passed. The coordinator
  also inspected safe phone/desktop hub screenshots.
- `npm audit --audit-level=high`: zero reported vulnerabilities.
- `git diff --check`: passed. Source/publication snapshot scanning with unchanged
  Gitleaks rules found no leaks. It included tracked and nonignored untracked
  files, so the new application was covered before its first commit.
- Supabase security advisor: zero notices. Session storage remained private;
  both question-bank row counts remained 705 and 733. Synthetic browser/API
  sessions were deleted by their exact one-way verifier hashes; no probe
  sessions remained after cleanup confirmation.

The implementation checks above were completed before the final documentation
handoff. No application code changed during the closing documentation review.

## Remote persistence and retention

Local and remote migration versions agree:

- `20261027200612_citizenship_prep_anonymous_sessions`.
- `20261027200722_secure_anonymous_session_rls`.

The code's SHA-256 verifier is stored only in private session storage. Five
narrow public invoker RPCs delegate to guarded private routines; direct client
table access and verifier/cleanup helper execution are denied. The public study
projection excludes internal change guidance and session identifiers.

Sessions become unusable after 168 elapsed inactive hours. The cleanup job
`citizenship-prep-expired-sessions` is active at `17 * * * *`; deletion occurs
on the following hourly sweep. The coordinator observed an actual automatic
run with status `succeeded` at **2026-10-27 20:17:00 UTC**, in addition to testing
the cleanup function against an expired synthetic record.

## Limits and publication status

- This is a local minimum, with study cards and explicitly self-assessed quiz
  scores. It does not perform official interview grading.
- Device coverage is Chrome viewport/touch emulation and visual review, not
  verification on every browser engine or physical device.
- Provider request-log/backup retention and public-launch abuse controls still
  require review before publication. No claim of complete infrastructure-wide
  zero data collection or immediate backup erasure is made.
- The full-directory Gitleaks scan flags the intended `sb_publishable_` browser
  configuration in ignored `.env.local` as a generic API-key pattern. It is not
  a service/secret key, is untracked, and was never printed. No scanner rule or
  allowlist was weakened. Supabase documents this distinction in its
  [API-key guide](https://supabase.com/docs/guides/getting-started/api-keys).
- A new TTL index can appear as unused in performance advice while session
  storage is nearly empty; it is retained for expiry cleanup.
- No commit, push, license selection or Vercel deployment was performed. The
  base Git commit remains `8bd3e296a6c1872d493a4691f4b050e26fd73a1b`.
