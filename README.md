# BMMP — Battery Material Management Platform

Software that follows a battery through the end of its life: identify, assess,
grade, route, dispose or resell.

It covers batteries from vehicles, consumer electronics, industrial equipment
and small mobility devices, and it generates the documents a business is legally
required to produce when it stores and ships them.

**Agents and new contributors: read [CLAUDE.md](CLAUDE.md) first.** It carries
the three rules that gate code review here, and they are not general practice.

## Prerequisites

Node 20+, pnpm 9+, Supabase CLI, a Supabase project.

The current toolchain is Node 22 in CI, pnpm as pinned by `packageManager` in
`package.json`. Supabase is not needed to run the prototype — the mock adapter
has no backend.

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Set `DATA_ADAPTER=mock` in `.env.local`, then:

```bash
pnpm dev
```

`http://localhost:3000` serves the app; `http://localhost:3000/api/health`
states which data adapter is live.

`DATA_ADAPTER=mock` is the prototype path and the one to use for all local work
until the Supabase adapter exists. It runs every screen and flow on fake
in-memory data with no backend behind it.

`.env.local` is git-ignored. It never holds a production value.

## Environment variables

See [`.env.example`](.env.example). Every key the application reads is listed
there, with no values.

Each environment has its own values. Staging values live in the staging Vercel
project; production values live in the production Vercel project, backed by a
separate Supabase project. Production credentials never exist in a preview
environment (D-21).

Anything prefixed `NEXT_PUBLIC_` is visible in the browser. **Never put a secret
behind that prefix.** Adding a variable means updating `.env.example` in the
same commit.

## Running tests

```bash
pnpm test          # vitest — unit and integration
pnpm test:e2e      # playwright — builds and starts the app, then drives it
pnpm lint          # eslint
pnpm format:check  # prettier; canonical documents are excluded
pnpm typecheck     # next typegen && tsc --noEmit
pnpm build         # next build
```

`pnpm typecheck` runs `next typegen` first. Next 16 generates `LayoutProps` and
`PageProps` into `.next/types`, so a bare `tsc --noEmit` fails on a clean clone.

Unit tests live in `tests/unit/` or beside the code they test; integration tests
in `tests/integration/`; end-to-end tests in `tests/e2e/`. Every feature ships
with tests.

## Branch strategy

- `main` — production-ready only. Never worked on directly.
- `staging` — integration branch.
- Feature branches — where all active work happens.

**One brief, one branch.** The branch name carries the unit ID from the sprint
plan, so the branch, the brief and the build-notes are traceable to each other:

```
feature/b1a-03-label-intake-form
fix/b1a-07-storage-clock-timezone
chore/b1a-01-ci-pipeline
```

Branch protection on `main` and `staging` requires a pull request, requires the
CI status checks, requires branches to be up to date, and blocks force pushes
and deletion. The reviewer requirement is replaced by a hard human rule: **no
agent merges its own work.** Every unit ends in a pull request whose diff the
owner reads and merges by hand (D-17).

## Data layer

**No screen, page, component, hook or route handler talks to Supabase directly.
Everything goes through `src/data`.** This is the swap point, and it is the
load-bearing decision in the project setup reference — see
[`PROJECT_SETUP_BMMP.md` §3.2](PROJECT_SETUP_BMMP.md).

| Path                  | What it is                             |
| --------------------- | -------------------------------------- |
| `src/data/contracts/` | the interface every adapter satisfies  |
| `src/data/mock/`      | fake in-memory implementation          |
| `src/data/supabase/`  | the real implementation, same contract |
| `src/data/index.ts`   | selects one from `DATA_ADAPTER`        |

Switching is one variable. Migration means writing the Supabase adapter against
the existing contract, flipping `DATA_ADAPTER`, and running the same Playwright
suite. Screens do not change. If a screen has to change, the seam leaked — fix
the seam, not the screen.

The selector **fails closed**. An unset, empty or misspelled `DATA_ADAPTER`
throws at module load rather than quietly selecting the mock, and `mock` is
refused outright when `VERCEL_ENV=production`. A silent fallback to fake data in
production means a fake legal document with a real customer name on it, and CI
structurally cannot catch that because CI cannot read the deployment platform
environment values — so the guard runs in the process serving the request
(D-16).

`pnpm check:data-seam` fails on any `@supabase/*` import in `src/` outside
`src/data/supabase/` or `src/lib/`. It runs in CI as a required status check.
It does not sweep `tests/`, where an integration test legitimately talks to a
test database.

## Deployment

CI runs on every push to any branch and on every pull request:
`lint`, `format`, `typecheck`, `test`, `build`, `e2e`, `data-seam`. These seven
are the checks branch protection requires.

- **Staging** — Vercel deploys automatically from `staging` when CI passes.
- **Production** — Vercel deploys from `main` after CI passes **and** manual
  promotion in Vercel.

Code never reaches staging or production without passing CI first. No
exceptions, no manual overrides.

## Documentation

| What                        | Where                                                    |
| --------------------------- | -------------------------------------------------------- |
| Rules for agents            | `CLAUDE.md`                                              |
| Project setup reference     | `PROJECT_SETUP_BMMP.md`                                  |
| Canonical doc stack         | `docs/`                                                  |
| Builder briefs, build-notes | `briefs/`                                                |
| Decision log                | project-level `Decision Log.md`, outside this repository |

`docs/` carries 518 verified cross-document citations. The formatter is
deliberately excluded from `docs/`, `briefs/` and `PROJECT_SETUP_BMMP.md` — a
markdown reflow breaks a citation silently and no test catches it.

---

_Next Sketch LLC · Confidential_
