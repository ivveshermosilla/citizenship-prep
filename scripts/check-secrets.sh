#!/usr/bin/env bash
set -euo pipefail

mode="${1:-history}"
case "$mode" in
  staged|history) ;;
  *) echo 'Usage: bash scripts/check-secrets.sh [staged|history]' >&2; exit 2 ;;
esac

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo 'Gitleaks is required. See CONTRIBUTING.md for installation.' >&2
  exit 2
fi

# Reject private file paths even if someone used git add --force.
blocked=0
while IFS= read -r -d '' path; do
  case "$path" in
    .env.example|*/.env.example) continue ;;
  esac
  case "/$path" in
    */.env|*/.env.*|*/.envrc|*/.vercel/*|*/.supabase/*|*/supabase/.temp/*|*/supabase/.branches/*|*/.aws/*|*/.ssh/*|*/credentials.json|*/service-account*.json|*.pem|*.key|*.p12|*.pfx|*/private/*|*/backups/*|*/dumps/*|*.dump|*.backup|*.sqlite|*.sqlite3|*.db|*.log|*/.private-context/*)
      printf 'Blocked private file path: %q\n' "$path" >&2
      blocked=1
      ;;
  esac
done < <(git ls-files -z)
if [[ "$blocked" -ne 0 ]]; then
  echo 'Remove private files from the Git index before continuing.' >&2
  exit 1
fi

if [[ "$mode" == staged ]]; then
  exec gitleaks git --pre-commit --staged --redact=100 --no-banner .
fi
exec gitleaks git --log-opts='--all --full-history' --redact=100 --no-banner .
