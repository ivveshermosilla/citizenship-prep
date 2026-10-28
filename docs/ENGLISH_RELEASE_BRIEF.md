# English-only first publication

Owner authorization: all user-facing content must be in English. GPT-6 Luna
implements the correction; the coordinator reviews and publishes the first
GitHub/Vercel version so the owner can test on a phone. This supersedes older
Spanish UI copy and earlier publication deferrals for this first release.

## Implementation scope — Luna

- Translate every user-facing string: onboarding, controls, setup, recovery,
  dates, statuses, errors, accessibility labels, notices, clipboard feedback,
  minigames, counters, footer, HTML metadata and document title.
- Use the provisional English product name **Civic Compass**. Keep repository
  and service identifiers unchanged. Use `lang="en"` and `en-US` date formatting.
- The question notice becomes **IMPORTANT NOTICE FOR THIS QUESTION**. Preserve
  its circled-i interaction, five-second duration, fade and actual recorded dates.
- Display **Vacant (previously: NAME)** without translating canonical/source
  answers. Official questions and accepted English answers stay unchanged.
- Keep the existing anonymous-code/session/168-hour model, geography/cohort
  selection and minimal stored progress. Do not advance content verification
  dates or change question/answer facts as part of translation.
- Update app tests, browser/API scripts and canonical requirements/briefs so
  future work does not reintroduce Spanish user copy. Internal owner discussion
  and the owner's Spanish monitoring checklist may remain Spanish.
- Add a focused English-publication section to IMPLEMENTATION_CHECKLIST.md with
  implementation agent, review agent, status and evidence. Only coordinator
  marks reviewed/verified. Preserve the original 12 completed tasks.
- Prepare minimal Vercel static hosting configuration as needed for Vite:
  production build/dist, safe response headers, no analytics/telemetry scripts,
  no service secrets or personal data. Do not deploy yourself; coordinator owns
  account/project provisioning, environment setup and publication.
- All implementation, test and configuration changes remain Luna's work. Root
  may edit documentation, run verification and operate Git/Vercel, not implement
  application fixes. Do not spawn other agents.

## Verification and release

- Reuse existing Node/npm, system Chrome and CDP scripts. Typecheck/build/unit
  tests and the real browser flow must pass in English, including both cohorts,
  phone widths, recovery, score restoration, source notices and info-bubble fade.
- Include an English-copy check for user surfaces/HTML/locale. Do not classify
  historical research provenance or internal Spanish checklist text as UI.
- Keep recovery codes out of logs, URLs and screenshots; target-clean synthetic
  sessions only. Codes remain process/browser memory only.
- Coordinator will inspect provider logging/retention controls and document the
  actual privacy boundary before public launch; do not promise infrastructure-
  wide zero data collection. No tracking SDKs, external fonts or embedded assets.
- Coordinator will configure only the project-specific Supabase URL and
  publishable key on Vercel without printing credentials. Never place local
  environment values, `.vercel`, reports or private context in Git.
- Publication authorization includes a reviewed commit/push of the project
  source and the dedicated Vercel deployment. No unrelated service changes,
  account login system, custom domain, paid upgrade or license selection.

Read AGENTS.md, PRODUCT_REQUIREMENTS.md, this brief, README, and existing app
code before editing. Read relevant React/Supabase skills as applicable and
verify current Vercel/static-hosting documentation before adding configuration.
Report blockers promptly; finish the English correction without waiting on
independent hosting/account work performed by the coordinator.
