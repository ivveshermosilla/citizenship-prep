# Agent instructions

## Scope and workflow

- Latest owner authorization: implement and publish real mouse/touch/pen dragging
  for Match & Learn through GPT-6 Luna. Read docs/MATCHING_DRAG_BRIEF.md.
  Preserve tap/keyboard alternatives, deadline guards and minimal persistence;
  root reviews and operates publication without another confirmation.
- Latest owner authorization: develop and publish **Match & Learn** end to end
  using GPT-6 Luna. Read docs/MATCHING_IMPLEMENTATION_BRIEF.md for settings,
  unambiguous multi-concept boards, timed/untimed rounds, page-local answer
  review and private mode-separated outcomes. Root reviews and operates the
  database/Git/Vercel release; no further owner confirmation is needed.
- Latest owner authorization: implement and publish the untimed written
  **Quick Question** directly in the hub, accepted answers/reviewed variants,
  per-concept fields, feedback flips and random next question. Also populate
  Supabase with reviewed plausible distractors for every question, replacing
  provisional unrelated options. Read docs/QUICK_QUESTION_IMPLEMENTATION_BRIEF.md.
  Keep raw typed text local; store only minimal mode-specific outcomes. Luna
  implements; root reviews content, migrations, checks and publication.
- Latest owner authorization: implement and publish Study Flash Cards, selection
  settings including inclusive ranges, configurable cumulative rolling review,
  optional timed multiple-choice practice and minimal per-question progress.
  Read docs/FLASHCARDS_IMPLEMENTATION_BRIEF.md. This supersedes the earlier
  Study Cards mechanics freeze and aggregate-only history restriction for this
  scope. No raw selected answers, voice features or official exam simulation.
  GPT-6 Luna implements; root reviews migrations and operates Supabase/Git/Vercel.
- Latest owner feedback rejects the provisional Civic Compass brand and
  generated public alias. The owner explicitly selected **Naturalization
  Preparation App (NPA)** and `naturalization-preparation-app.vercel.app`.
  Read docs/BRANDING_REFRESH_BRIEF.md. Apply that approved name consistently;
  coordinator verifies URL availability and publishes the reviewed refresh.
  Use MatPro/DivisionPro styling as references, a U.S.-map/flag SVG logo,
  clearer interactive-naturalization tagline and Question Edition vocabulary.
  Preserve current Study Cards/Quick Quiz mechanics as explicitly requested.
- Current owner update: user-facing content is ENGLISH ONLY. GPT-6 Luna must
  implement all app/test/config corrections. Read docs/ENGLISH_RELEASE_BRIEF.md.
  The owner now authorizes the first reviewed GitHub source publication and
  dedicated Vercel deployment for mobile testing; this supersedes earlier
  publication deferrals for that release. Coordinator reviews and operates
  Git/hosting; never publish credentials or private context.
- The October 27, 2026 English-only release update supersedes the older Spanish
  interface requirement below. English-only copy, `lang="en"`, and `en-US`
  dates remain required. That release used the provisional Civic Compass name;
  the owner's branding decision above supersedes that name. The
  coordinator performs the authorized first GitHub publication and Vercel
  deployment after implementation review; Luna does not publish or deploy.
- Current owner authorization: implement the local MVP through GPT-6 Luna only.
  Read docs/MVP_IMPLEMENTATION_BRIEF.md and update
  docs/IMPLEMENTATION_CHECKLIST.md while working. The coordinator writes scope,
  reviews and verifies; all app/SQL/test implementation and fixes are Luna's.
  This supersedes the earlier requirements-only restrictions for this MVP only.
  Git publication and Vercel deployment were deferred at MVP stage; the English
  release update above now authorizes the reviewed first publication and
  dedicated deployment.
- Read this file and README.md before editing. Run `git status --short` first.
- Preserve existing user changes. Keep each change small and tied to the request.
- Work locally, verify the change, and summarize files, checks, and risks before
  publishing. Push only when authorized by the user.
- Keep public documentation in English unless the user requests otherwise.
- The owner selected React, TypeScript, Vite, and ordinary CSS for the local
  MVP in docs/MVP_IMPLEMENTATION_BRIEF.md. Do not select a license. Preserve the
  documented cohort, geography, session, and privacy model.
- The current content phase is local research: official questions and current
  answers, with sources, geographic dependencies, verification dates, and
  suggested update dates for changing answers. Cover all states and congressional
  districts, including explicit vacancy and D.C./territory cases. Preserve the
  original question-only snapshot as provenance. Keep these changes local until
  the user authorizes publication or changes that scope.
  Establish the minimum dataset before connecting the application to Vercel.
- The owner subsequently authorized loading the dataset into the dedicated
  Supabase project in exactly two edition tables. Git publication and Vercel
  remain deferred. Read docs/PRODUCT_REQUIREMENTS.md before content or UI work.
- Maintenance is once per calendar month, superseding all earlier shorter or
  per-class cadences. Record actual review/update dates; importing alone does
  not make facts fresh. Vacancies use canonical "Vacant" with the prior holder
  in a parenthetical display, stored separately from accepted current values.
- Internal change expectations are required in both Supabase banks: nullable
  dates/windows, explanation, sources and per-senator candidate timelines.
  These are uncertain administrative guidance, never guaranteed answer expiry
  or an extra update schedule. See supabase/CHANGE_GUIDANCE.md. The private
  review view computes possible staleness at read time; no updater is enabled.
- Follow the owner's global context policy when working on their computer.
- Owner design policy: modern appearance, responsive across phones, tablets
  and computers, with mobile as the primary design target. Preserve all core
  functions across device sizes; support touch, keyboard and mouse, accessible
  reading/navigation and lightweight mobile performance. Implement and verify
  against the local MVP brief; browser emulation is not physical-device coverage.
- Owner policy: fully anonymous use without personal-data collection or tracking.
  No accounts, analytics, fingerprinting or identity/immigration data. Only
  minimum private game-session progress/timestamps and a protected recovery-code
  reference may be retained. Session expires after 168 hours of inactivity and
  its progress must be deleted; the retention mechanism is separate from monthly
  content review. Never promise zero stored data when retaining scores. Read
  docs/PRODUCT_REQUIREMENTS.md for onboarding/code-recovery/privacy details.
  The owner explicitly authorized session implementation and the two versioned
  migrations in the MVP brief; keep all future schema changes within that scope.
  Context loading is request-driven. Keep private context, handoff records,
  account details, and machine-specific paths outside this public repository.
- Update project documentation and authorized private handoff context after
  meaningful changes. Record exact commits, checks, remaining risks, and next steps.

## Secrets and accounts

- Never read out, log, commit, or request plaintext credentials in chat.
- Reuse authenticated tools without printing their credential stores.
- Never commit real environment values, personal data, private dumps, tokens,
  certificates, or local deployment state. Use empty environment placeholders.
- Inspect staged changes and run `bash scripts/check-secrets.sh staged` before
  committing; run `bash scripts/check-secrets.sh history` before pushing.
- Keep the repository-local Git author email set to a GitHub noreply address.
- Do not bypass hooks, suppress findings, broaden scanner allowlists, or disable
  security settings to make a check pass. Investigate the underlying finding.
- If a credential is exposed, stop publication, redact output, and report the
  affected provider and location without repeating the value. Rotation/revocation
  must be coordinated before unrelated account changes.

## Future service integration

- Use only this project's dedicated resources. Do not borrow credentials,
  schemas, code, or deployment settings from unrelated projects.
- A public source repository does not make user data public. Supabase API access
  requires deliberate grants and verified RLS policies for private user data.
- Publishable keys are client configuration; secret/service keys and database
  passwords must never enter browser bundles or public environment variables.
- Verify current official provider documentation before service changes. Inspect
  database structure and advisors before schema changes; use versioned migrations
  and verify isolation after implementing access policies.
- Treat deployment, schema changes, and publishing as separate operations with
  their own verification. Do not claim a working website before testing it online.
