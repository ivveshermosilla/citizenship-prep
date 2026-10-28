# Contributing

## Prerequisites

- Git and Bash.
- [Gitleaks](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), available
  as `gitleaks` on PATH. CI uses version 8.30.1. Download the appropriate official
  release for your platform and verify it against the release checksum manifest.

No application dependencies are needed at this stage.

## Setup

```sh
bash scripts/enable-git-hooks.sh
```

This sets `core.hooksPath` for this repository only. Git hooks are not activated
automatically by cloning, so run setup in every new clone. Pre-commit scans the
staged diff; pre-push scans all local refs. Both reject tracked private file paths
and fail if Gitleaks is unavailable. Other Git settings are preserved.

Use a GitHub noreply author email for commits to this public project. Configure
it locally with `git config --local user.email YOUR_GITHUB_NOREPLY_ADDRESS`.

## Change workflow

1. Inspect `git status --short` and the relevant documentation.
2. Make a focused change and stage explicit file paths.
3. Review `git diff --cached` privately. Do not paste credentials into review logs.
4. Run `git diff --cached --check` and `bash scripts/check-secrets.sh staged`.
5. Commit, then run `bash scripts/check-secrets.sh history` before an authorized push.
6. Confirm the GitHub Actions security check passes and local/remote commits agree.

Do not bypass a secret finding. Remove the sensitive material and investigate its
history. Follow [SECURITY.md](SECURITY.md) if it has already been exposed.

## Environment files

Keep `.env.example` empty or populated only with clearly nonfunctional
placeholders. When the application needs configuration, copy it to an ignored
local environment file and populate that file privately. Put deployment secrets
in the hosting provider's environment settings, with separate values per target.

Never add account administration credentials to application configuration. Never
put server secrets in variables that a framework exposes to browsers.

## Content and license

Question and answer research is stored under `research/`. Preserve original
question-only snapshots. Record source, version, verification date and
maintenance policy for every content update. Keep review suggestions separate
from factual validity and regular office-term boundaries.
Do not import personal immigration records or unrelated project data.

The project license is pending selection by the owner.
