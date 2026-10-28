# First English publication

Published October 27, 2026 (America/Denver).

- **Application:** [Civic Compass](https://citizenship-prep-sandy.vercel.app/).
- **Source:** [GitHub repository](https://github.com/ivveshermosilla/citizenship-prep).
- **Initial application commit:** [8024438](https://github.com/ivveshermosilla/citizenship-prep/commit/8024438b42d2b7a5ecbc3109eb0026a45ae2f6a5).
- **Target/status:** Vercel production, READY; Vite static output in `dist`.
- **Implementation:** GPT-6 Luna; **review/publication:** Codex coordinator.

All user-facing copy is English, including errors, accessibility labels,
metadata and dates. Official questions/answers remain unchanged. The source
repository is connected to the dedicated Vercel project for subsequent Git
deployments. This publication uses the existing Hobby plan; no paid upgrade,
custom domain or license was selected.

## Verification

The coordinator independently verified build/typechecking, four unit tests,
English-copy checks, staged/history secret scans and the successful GitHub
[Security workflow](https://github.com/ivveshermosilla/citizenship-prep/actions/runs/40610480961).

The production alias returned HTTP 200 without a login or bypass token. Its
document language/title are English, and CSP, framing, MIME, referrer,
permissions and HTTPS transport headers are present. Requests for `.env.local`,
`.git/config`, application source, the SQL seed and internal research returned
404; those files are not served as static app assets.

The real browser flow against the public URL passed: touch-driven session
creation, code acknowledgement, hub, study cards, source/date display, bounded
self-check score, five-second information bubble/fade, reload/manual recovery,
restored progress and both filing cohorts, including Samoa's at-large district.
Chrome viewport checks covered 320, 390, 820 and 1440 CSS pixels. These are
emulated-device checks; feedback on physical phones and other browser engines
is the next validation step.

Only the two exact synthetic sessions from the coordinator's public-URL test
were deleted; the follow-up confirmed zero matching probe rows. Existing
sessions were preserved. The production runtime-error query returned no entries
for its checked ten-minute window; this static app does not install client error
telemetry. The live browser check supplies client-flow verification.

## Privacy and access boundary

The app has no identity registration, tracking SDKs, Web Analytics or Speed
Insights. The project has Web Analytics disabled and no Speed Insights setup;
browser checks found no tracking resources. No external font/assets are needed.
Only the project URL and publishable Supabase key are Vercel build configuration.
Secret/service keys and account tokens are not shipped or committed.

Session storage remains private and capability-gated. A recovery code stays in
client memory and is sent only in HTTPS POST bodies, never URLs. The database
retains its one-way verifier, minimal selection/progress and timestamps. Session
access expires at 168 inactive hours; physical active-row deletion occurs at the
next hourly cleanup. This is separate from the monthly civics-content review.

Provider-managed infrastructure logs are distinct from application analytics.
The session notice now explicitly says hosting/database providers may retain
technical request/security logs under their own policies. The review found
Postgres connection/disconnection and duration logging off, ordinary statement
logging limited to DDL, and error parameter logging disabled. The app does not
print codes, requests or personal/device identifiers to logs.

Vercel/Supabase infrastructure retention and backups are provider/plan controlled;
this release does not promise infrastructure-wide zero logging or immediate
backup erasure. No additional log drains or tracking integrations were enabled.
Sources: [Vercel runtime log retention](https://vercel.com/docs/logs/runtime),
[Supabase logging controls](https://supabase.com/docs/guides/observability/configure-logging),
[Supabase backup behavior](https://supabase.com/docs/guides/platform/backups).

Standard Vercel protection remains on preview/generated deployment URLs; the
production alias above is public so users do not need a Vercel account. The
served website contains only built static assets. `.vercelignore` filters CLI
uploads; Git-linked builds use repository source as input, while `dist` controls
served output in both cases.

Continue testing on real phones, refining the UI and monitoring resource limits.
The quiz score is explicitly self-assessed practice, not official USCIS grading.
