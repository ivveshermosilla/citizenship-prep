# Naturalization Preparation App (NPA)

English-language web app for interactive U.S. naturalization test preparation.

**Try the app:** [Naturalization Preparation App (NPA)](https://naturalization-preparation-app.vercel.app/).

The previous test URL redirects to this canonical address. The approved NPA
refresh is published and verified; see the [branding release review](docs/BRANDING_REFRESH_REVIEW.md).
The [first publication record](docs/FIRST_PUBLICATION.md) remains historical.

**Study Flash Cards is published:** configurable question selections, cumulative
rolling review and timed practice tests. See the [feature review](docs/FLASHCARDS_REVIEW.md)
for the published release record.

**Quick Question is published:** an untimed written activity in
the hub that grades only exact reviewed answers and variants, keeps entered text
in memory, and records only the question and outcome. Multiple-choice practice
uses reviewed distractors for all 228 edition-specific questions. See the
[release review](docs/QUICK_QUESTION_REVIEW.md) for verification and publication.

**Match & Learn is published:** safe question-and-answer rounds from reviewed
content support timed or untimed play and keep detailed answer review on the
results page only. Drag answer tiles onto questions or move placed answers;
tap and keyboard alternatives remain available. The round RPC persists
per-question outcomes without answer text or tile IDs. See the
[drag interaction review](docs/MATCHING_DRAG_REVIEW.md),
the [release review](docs/MATCHING_REVIEW.md), [implementation brief](docs/MATCHING_IMPLEMENTATION_BRIEF.md) and active
[implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md) for current status.

## Project status

The React/TypeScript/Vite app supports anonymous recovery-code sessions,
both filing cohorts, all jurisdictions and congressional districts, Study Flash
Cards with an optional rolling timed practice test, Match & Learn, and Quick Quiz self-checks
backed by the dedicated Supabase project. Quick Question adds written practice
and separate written/multiple-choice totals with shared missed-question review.
All user-facing app content is English.
The approved name and canonical hostname are
published; see the [implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md)
for Luna's implementation evidence and the coordinator's completed checks.
Licensing remains unselected.

The [October 27, 2026 research draft](research/2026-10-27/README.md) records the
128-question 2025 bank and the separately applicable 100-question 2008 bank.
Its [current-answer follow-up](research/2026-10-27/answers/README.md) documents
answers for all states and districts, sources, monthly review dates, and explicit
vacancy/D.C./territory cases. [Supabase documentation](supabase/README.md) covers
the private import and app access boundary. See [product requirements](docs/PRODUCT_REQUIREMENTS.md).

## Working locally

Install the pinned packages and create an ignored `.env.local` from the empty
`.env.example`. Fill only the Supabase project URL and publishable key. Never put
a secret/service key or database password in Vite browser configuration.

```sh
npm ci
test -e .env.local || cp .env.example .env.local
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY locally.
npm run dev -- --port 4173 --strictPort
```

Vite prints the local review URL. If configuration or the backend is unavailable,
the app shows a retryable error and does not substitute local mock persistence.

## Checks

```sh
npm run typecheck
npm run build
npm test
npm run test:english
npm run test:api:flashcards
npm run test:api:quick-question
npm run test:api:matching
npm run test:matching:content
npm run test:browser
npm run test:browser-flow
npm run test:browser:matching
```

The unit tests cover the 168-hour boundary, code format/entropy, English vacancy
display, cohorts, district selection, flashcard selection and ranges, cumulative
rolling rounds, strict Quick Question normalization/concepts, reviewed metadata
options, deadlines, and outcome summaries.
Match & Learn unit tests cover safe boards, alias collisions, tile caps,
question de-duplication, accepted-label grading, partial/omitted scoring,
timer allowances and outcome totals. The matching content verifier reads the
configured service without writing, walks every question in both editions for
Utah UT03, D.C. DC00, and American Samoa AS00, and checks rotated 30-question
windows across both round sizes and multiple deterministic shuffles.
The flashcard API verifier checks live RPC retry/idempotency behavior and emits
only one-way verifier hashes for synthetic-session cleanup. The Quick Question
API verifier checks mode-separated written/MC progress, written-attempt
idempotency, legacy response compatibility and session isolation; it also emits
only one-way verifier hashes for synthetic-session cleanup.
[The SQL verifier](supabase/tests/verify_app_mvp.sql)
checks all 441 districts in both cohorts and all 56 jurisdictions, allowlisted
fields, role denials, isolation, aggregate limits, expiry, and cleanup in a
rollback transaction. The API and full browser scripts use the real project and
create synthetic sessions; delete only the rows whose one-way verifier hashes
those scripts return. For example, replace the placeholders with those hashes:

```sql
DELETE FROM game_private.sessions
WHERE code_verifier IN (decode('VERIFIER_1', 'hex'), decode('VERIFIER_2', 'hex'));
```

Run browser checks in separate terminals. Keep Vite running in the first terminal
at port 4173. In a second terminal, start system Chrome with an isolated
temporary profile and loopback-only debugging port:

```sh
google-chrome --headless --no-sandbox --disable-gpu \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9223 \
  --user-data-dir=/tmp/citizenship-prep-chrome about:blank
```

Then run the checks in a third terminal:

```sh
npm run test:browser
BROWSER_REVIEW_SHOT_PHONE=/tmp/citizenship-prep-hub-phone.png \
BROWSER_REVIEW_SHOT_DESKTOP=/tmp/citizenship-prep-hub-desktop.png \
BROWSER_REVIEW_SHOT_NOTICE=/tmp/citizenship-prep-notice.png \
BROWSER_REVIEW_SHOT_SETTINGS=/tmp/citizenship-prep-settings.png \
BROWSER_REVIEW_SHOT_CARD=/tmp/citizenship-prep-card.png \
  npm run test:browser-flow
```

Chrome emulation covers 320, 390, 820, and 1440 CSS-pixel widths. It does not
replace testing other browser engines or physical devices. The browser flow
checks the new settings, keyboard-edited count/slider synchronization, card
sources/dates, rolling cumulative test, and recovery of saved outcomes. It only
saves screenshots on safe notice, settings, card, and hub screens with no
recovery code visible. Never capture the save-code screen.

For static hosting, Vercel builds `dist` with `npm run build`. `vercel.json`
sets the output directory and security response headers, including a CSP that
allows native fetch only to the app origin and Supabase. No analytics or
telemetry SDK is included. `.vercelignore` filters CLI deployment uploads;
Git-linked builds use the repository as build input, while only `dist` is
configured as the published static output.

See the [implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md) for Luna's
authorship and the coordinator's review, and the [review record](docs/MVP_REVIEW.md)
for completed checks and remaining release limitations.

## Privacy and deployment limits

The MVP does not use accounts or collect personal identifiers. It has no
analytics, advertising, geolocation, fingerprinting, session replay, or
third-party font/asset requests. Supabase stores a one-way recovery-code
verifier, creation and last-activity timestamps, aggregate Quick Quiz/card
counters, minimal per-question written and multiple-choice outcome counts and
last outcomes, and the cohort/coarse jurisdiction needed to restore the right
bank. Entered written responses, selected options, and text-derived hashes are
not stored. The usable
code stays in app memory and is never stored in browser storage or the database.
Direct table access is denied; narrow anonymous RPCs validate the code and
return only necessary fields.

The app does not ask for identity details or use tracking analytics. Hosting
and database providers may retain technical request/security logs under their
own policies; those infrastructure logs are outside the app's session data.

Sessions are rejected at 168 elapsed hours without activity. The active hourly
cleanup job deletes expired records on its next run, up to about an hour later.
Provider backup and request-log retention have not been audited. This local MVP
is not a production privacy certification; public launch still needs provider
retention and abuse-control review.

`.env.example` contains empty values only. `.env.local`, deployment state,
credentials, and private exports stay outside Git. See [CONTRIBUTING.md](CONTRIBUTING.md)
for workflow, [SECURITY.md](SECURITY.md) for reporting, and [AGENTS.md](AGENTS.md)
for repository instructions.

Secret scanning of non-ignored source files found no leaks. A full-directory scan
also flags the ignored `.env.local` publishable browser key as a generic API-key
pattern; it is intentionally public client configuration, not a service/secret
key. Do not suppress the scanner rule or commit the local file.
