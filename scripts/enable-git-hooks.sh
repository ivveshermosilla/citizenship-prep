#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo 'Install Gitleaks before enabling hooks. See CONTRIBUTING.md.' >&2
  exit 2
fi

existing_hooks="$(git config --get core.hooksPath || true)"
if [[ -n "$existing_hooks" && "$existing_hooks" != '.githooks' ]]; then
  echo 'An existing hooksPath is configured; review it before changing hooks.' >&2
  exit 2
fi

git config --local core.hooksPath .githooks
echo 'Repository-local pre-commit and pre-push secret checks enabled.'
gitleaks version
