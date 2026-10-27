# Citizenship Prep

A planned web application for practicing U.S. naturalization questions.

## Project status

The repository foundation is ready. The practice application, question bank,
authentication, database schema, and deployment are not implemented yet.

The planned platform is GitHub for source control, a dedicated Supabase project
for application data, and a dedicated Vercel project for hosting. Development
will proceed in small, verified steps. The application framework and license
are still to be selected.

## Working locally

```sh
git clone git@github.com:ivveshermosilla/citizenship-prep.git
cd citizenship-prep
# Install Gitleaks first; see CONTRIBUTING.md.
bash scripts/enable-git-hooks.sh
```

There is no application start command yet. No service credentials are required
to review this foundation or run its repository checks.

## Repository checks

```sh
bash scripts/check-secrets.sh staged   # Inspect the staged diff before committing.
bash scripts/check-secrets.sh history  # Inspect all local Git refs before pushing.
git diff --check
```

Local Git hooks run these secret checks automatically once enabled. GitHub
Actions also scans repository history on pushes and pull requests. GitHub secret
scanning and push protection provide an additional layer for supported secrets.
These checks reduce risk; they do not replace reviewing changes before publication.

## Configuration and privacy

`.env.example` contains empty placeholders only. Local `.env` files, deployment
state, credentials, and private exports must stay outside Git. Environment
variable names will be finalized when the application framework is chosen.

Only publishable Supabase configuration may reach browser code. Administrative
secrets must remain on the server. Private user data will require explicit access
grants and Row Level Security policies before application integration.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow,
[SECURITY.md](SECURITY.md) for security reporting, and [AGENTS.md](AGENTS.md)
for agent instructions.
