# Agent instructions

## Scope and workflow

- Read this file and README.md before editing. Run `git status --short` first.
- Preserve existing user changes. Keep each change small and tied to the request.
- Work locally, verify the change, and summarize files, checks, and risks before
  publishing. Push only when authorized by the user.
- Keep public documentation in English unless the user requests otherwise.
- Do not select an application framework, license, or data model without a
  relevant user request. This repository currently contains the foundation only.
- Follow the owner's global context policy when working on their computer.
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
