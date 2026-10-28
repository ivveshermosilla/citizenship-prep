# Minimum local deliverable — implementation brief

Owner authorization, October 27, 2026: delegate all application, SQL and test
implementation to GPT-6 Luna. The coordinator writes requirements/checklists,
reviews changes and runs checks; the coordinator does not implement fixes.
This authorization supersedes the earlier requirements-only gate for this MVP.
Preserve PRODUCT_REQUIREMENTS.md. The owner later authorized a reviewed first
GitHub source publication and dedicated Vercel static deployment for phone
testing. Luna implements and prepares configuration; the coordinator reviews
and operates Git/Vercel. Do not select a license.

## Deliverable

A real locally runnable, modern mobile-first web app using React, TypeScript,
Vite and ordinary CSS, backed by this project's existing Supabase data and
minimal anonymous session storage. Use a light dependency set with exact pinned
versions and a lockfile. Inspect existing installed tooling before adding any.
Do not scaffold over or remove the existing research, hooks, documentation,
migrations, seed, context references or uncommitted work.

Use the owner-approved name **Naturalization Preparation App (NPA)** for the
English-only interface and notices. The approved canonical host is
`naturalization-preparation-app.vercel.app`; the coordinator checks/configures
Vercel and publishes. Civic Compass and its old test alias are historical only.
Set `lang="en"` and format dates with `en-US`. Preserve official English
questions and accepted answer options exactly. Do not invent translated official answers. Use the
heading `IMPORTANT NOTICE FOR THIS QUESTION` and display vacancies as
`Vacant (previously: NAME)` while preserving canonical answers.

## User flow

1. Three concise notice screens: unofficial aid/official study sources,
   residence and changing answers, and anonymous progress/code retention.
   Each has advance and a separate resume action below it. Final choices are
   New session and Resume previous session. Resume opens code entry from
   any notice screen; valid resume goes directly to the hub.
2. New session: select filing cohort (before/on-or-after 2025-10-20), applicable
   state/territory and district when necessary. No exact filing date, address,
   age or identity input. Support all 56 jurisdictions/441 canonical districts.
   This setup-before-code order is an MVP implementation choice: create the
   session once valid selectors exist, immediately show its new secret code,
   then enter the hub after the user acknowledges saving it.
3. Generate a cryptographically random unique recovery code with at least 192
   bits of entropy (32 random bytes recommended), readable copy action and clear
   instructions: save it, do not share it, no identity-based recovery, seven-day
   inactivity expiry. No usable code in URLs, logs, analytics or database.
4. Hub shows cumulative personal score/progress, creation/latest activity dates,
   selected cohort/geography and two working activities: study cards and quiz.
   Include a safe return-to-start action without silently deleting a live session.
5. Study cards show a question, reveal all accepted options, then let the user
   advance/back to hub. Keep a cards-reviewed aggregate only; no response history.
6. Quiz presents questions with a reveal-and-self-check interaction: user thinks
   or speaks an answer, reveals accepted options, chooses I knew it or Review again.
   Explicitly label score as self-assessed practice, not USCIS grading. One
   self-check per displayed question before advancing; 1 point for I knew it,
   0 for Review again, aggregate attempts/correct only. This avoids fabricated
   distractors or claims of automatic grading of official free-form answers.
7. Add the required question title, circled-info control, recorded answer date
   and official-source notice for geography/time-dependent questions. Bubble
   responds to tap/hover/keyboard, stays 5000 ms, then fades. Support reduced
   motion. Preserve canonical Vacant and separate previous-holder display.

## Privacy, data and authorization

- No accounts/Supabase Auth identities, trackers, analytics, ads, third-party
  fonts/assets, geolocation, fingerprinting, personal identifiers or event logs.
- Keep usable code in app memory only for this minimum. Refresh/reopen requires
  manual code entry. Explain that behavior. No persistent browser code storage.
- Persist only a protected one-way code verifier, created/last-active times,
  aggregate score/attempt/card counters and the minimal cohort/state/district
  needed to resume directly into the correct hub. Storing those coarse settings
  is justified here by correct restored bank selection; no address/exact date.
- Use actual Supabase persistence and bank reads. Do not silently substitute a
  browser/local-only backend or claim fake fixtures are a real integration.
- Use only the dedicated project ID provided privately by the coordinator.
  Never touch ChampOS or other projects. Existing question tables/content and
  internal change guidance must remain intact. Exactly two question banks remain;
  a separate private session table is authorized by the owner's session feature.
- Browser configuration may contain only Supabase URL and publishable key. No
  service/secret key or DB password may reach source, output, or a browser build.
  Retrieve only publishable configuration if needed and place values in ignored
  .env.local without printing their content. .env.example stays empty.
- Prefer native fetch and narrow Postgres RPCs to avoid a service-role secret
  and unnecessary SDK/auth state. A code is a bearer capability: server checks
  the raw secret against a one-way verifier; a stored verifier must not itself
  become the accepted credential. Hash only server-side for this proof model.
- Keep session tables inaccessible to direct anon/authenticated reads/writes.
  RLS plus restrictive grants. Public RPCs must have explicit minimal EXECUTE
  grants, validate input/geography/cohort/code and expose an allowlisted result.
  If privilege elevation is essential, isolate it in a private schema, fix the
  search_path and fully qualify references, enforce capability authorization,
  and document why account-based auth.uid() is inapplicable to this owner policy.
  Prefer security-invoker public wrappers. No unguarded score/session listing.
- Public study data can be exposed only through a read-only allowlisted question
  projection; never expose internal change guidance or session table contents.
- Missing configuration or unavailable backend must show a useful error and a
  retry, without leaking raw errors/credentials or pretending persistence worked.

## Expiry and cleanup

Seven-day inactivity means >=168 elapsed hours since last successful resume or
genuine gameplay. No passive polling/heartbeat refresh. Expiry enforcement and
activity/score update must be atomic; a request must never revive an expired row.
Wrong-code failures do not update activity. Use server/database time.

Implement automatic cleanup of expired session state in the dedicated Supabase
project, preferably a small hourly pg_cron job if supported. This is authorized
session retention, separate from monthly content review. Reject access exactly
at expiry even before physical cleanup; document the cleanup interval/latency.
Do not claim backups or provider request logs have been erased or audited.
Validate/cap counters, request sizes and session creation/storage reasonably
without collecting IP/device identities. Document public-launch abuse controls
and provider privacy/retention settings still requiring review.

## Implementation and verification procedure

- Read AGENTS.md, PRODUCT_REQUIREMENTS.md, supabase/README.md and
  supabase/CHANGE_GUIDANCE.md first. Read applicable Supabase skill and official
  docs/changelog; inspect actual schema/advisors before changes. For React edits,
  use the available React best-practices skill. User policy overrides any generic
  skill recommendation to introduce an identity provider or analytics.
- All code, configuration, SQL migrations and tests are Luna's work, including
  fixes requested during review. Use installed Supabase CLI migration new for
  filenames; remote DDL goes through apply_migration. Align local migration
  version with actual remote history. Never reset/reseed existing banks.
- Before remote DDL, send the coordinator your proposed capability boundary,
  session fields and cleanup design; proceed with local app work while awaiting
  the coordinator's technical review. This is a review handoff, not a request
  for new user permission. Coordinator explicitly releases the remote change.
- Update IMPLEMENTATION_CHECKLIST.md at the start/end of each task and on
  meaningful milestones; include actual timestamps, files and evidence. Only
  Luna fills Codificado por; only coordinator fills Revisado por and Verificado.
  Do not mark work complete on intent or fabricate test results. Report blockers
  promptly and continue independent work. Do not delegate to more agents.
- Provide reproducible typecheck/build and meaningful tests for both filing
  cohorts, geography/district selection, code creation/resume/isolation,
  seven-day boundary, no-revival/wrong-code inactivity, aggregation and deletion,
  private table denial, public field projection and question-source preservation.
- Browser checks should cover the full real flow at phone/tablet/desktop widths,
  keyboard navigation, info-bubble timing and no horizontal overflow. Reuse
  installed Chrome; add the smallest browser automation package only if needed.
  Tests must not log recovery codes or save them in screenshots/traces; remove
  only identified synthetic test sessions after checks. No production data wipe.
- Run secret scan, diff checks and Supabase advisors; preserve the original
  question content fingerprints. Document commands and evidence for coordinator
  to reproduce. Update README with setup/start/test instructions and scope.
- Start a local server for review, provide URL/process session identifier and
  keep it available. Do not publish. Review provider/privacy limitations honestly;
  a local MVP is not yet a production privacy certification.

## Sources

- https://vite.dev/guide/
- https://react.dev/learn/creating-a-react-app
- https://supabase.com/docs (use connector search for exact current topics)

Implementation details not fixed above may be resolved conservatively by Luna
and documented. Ask the coordinator about consequential ambiguities; do not
expand into 65/20 eligibility flow, accounts, rankings, translations, PWA,
payments, AI integrations or additional game modes.
