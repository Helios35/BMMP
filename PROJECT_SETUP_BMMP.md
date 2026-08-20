# Project Setup Reference — BMMP

**Battery Material Management Platform**
**Version:** 1.2 · **Date:** 2026-08-19
**Owner:** Nathan Ivy / Next Sketch LLC · **Client:** Jonathan
**Status:** Active. This document is permanent. Bump the version in this header; never rename the file.

*Hand this to the build agent as its first instruction. Feature work does not begin until Section 10's checklist is fully checked.*

**Companion documents:** Roadmap v3.0 (2026-07-28) · Decision Log (D-1–D-11) · SOW 1 (2026-07-13)

---

## Your Role

You are setting up a production-grade project from scratch. Your job is to build the foundation correctly before touching any feature work. Follow every section in this document. Do not skip steps. Do not begin feature development until setup is complete and confirmed by the owner.

This project ships its first working slice as a **mock-data prototype** — every screen and flow running on fake data behind a single swap point — and migrates to the real backend afterward. Section 3 is where that is made mechanical. It is the load-bearing decision in this document.

---

## 1. Repository & Version Control

### Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript, `strict: true` |
| Package manager | pnpm |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Postgres via Supabase |
| Auth | Supabase Auth |
| Unit / integration tests | Vitest |
| End-to-end tests | Playwright |
| Lint / format | ESLint (flat config) + Prettier |
| CI | GitHub Actions |
| Hosting | Vercel |

### Create the repo

- Initialize a Git repository named `bmmp`
- Create `README.md` with the project name and a one-line description
- Scaffold with `pnpm create next-app@latest bmmp --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm`
- **Strip `next/font/google` from the scaffolded `layout.tsx`.** It makes every production build depend on a live fetch to `fonts.googleapis.com`. The typeface is a design-system decision belonging to unit `b1a-00`, self-hosted via `next/font/local` from `docs/UX_SPEC.md`.
- `pnpm typecheck` runs `next typegen && tsc --noEmit`. Next 16 generates `LayoutProps`/`PageProps` into `.next/types`, so a bare `tsc --noEmit` fails on a clean clone.
- Set `"strict": true` and `"noUncheckedIndexedAccess": true` in `tsconfig.json`

### Set up `.gitignore` immediately — before anything else is committed

Must include at minimum:

- Environment files: `.env`, `.env.local`, `.env.development.local`, `.env.staging`, `.env.production`, `.env*.local`
- Dependency folders: `node_modules/`, `.pnpm-store/`
- Build output: `.next/`, `out/`, `dist/`, `build/`, `.turbo/`
- Test output: `test-results/`, `playwright-report/`, `blob-report/`, `coverage/`
- Tooling: `.vercel/`, `.eslintcache`, `next-env.d.ts`
- Supabase local state: `supabase/.branches/`, `supabase/.temp/`
- System files: `.DS_Store`, `Thumbs.db`
- Editor files: `.vscode/`, `.idea/`
- Log files: `*.log`, `npm-debug.log*`, `pnpm-debug.log*`

**Rule:** If a file contains secrets, credentials, or machine-specific config — it goes in `.gitignore`. No exceptions.

**Never commit:** the Supabase service-role key, any vision-model API key, or a real battery photo containing a customer serial number.

### First commit

- Commit only the repo structure and `.gitignore`
- Commit message: `chore: initial project setup`
- Nothing else goes in this commit

### Branching rules

- `main` — production-ready code only. **Never work directly on this branch.**
- `staging` — integration branch. Code here gets tested before going to main.
- Feature branches — where all active work happens.

**Rule: one brief, one branch.** Every unit of work handed to a build agent gets its own branch, and the branch name carries the unit ID from the sprint plan so the branch, the brief, and the build-notes are traceable to each other:

```
feature/b1a-03-label-intake-form
fix/b1a-07-storage-clock-timezone
chore/b1a-01-ci-pipeline
```

### Branch protection (solo owner)

This is a **single-owner project** — Nate owns every merge. GitHub's required-reviewer rule cannot be satisfied by one person, so protection is enforced through status checks plus a hard human rule.

On `main` and `staging`, enable:

- Require a pull request before merging
- Require status checks to pass: `lint`, `typecheck`, `test`, `build`
- Require branches to be up to date before merging
- Block force pushes and branch deletion

**The human rule that replaces the reviewer requirement:** no agent merges its own work. Every unit ends in a PR that Nate reads the diff of and merges by hand. An agent that merges its own branch has broken the method, not just a rule.

### Commit hygiene

- Commit in small, focused chunks — one logical change per commit
- Write descriptive commit messages: what changed and why
- Never commit all changes at once in one giant commit
- Never commit broken code

---

## 2. Environment Setup

### Create environment files

In the project root:

- `.env.local` — local development values (git-ignored)
- `.env.example` — every key listed, **all values blank** (committed)

### Environment variable rules

- All secrets, API keys, database URLs and config values go in `.env.local` — never hardcoded
- Each environment (local, staging, production) has its own values, set in Vercel for the deployed ones
- Code references the variable name only; it never cares where the value comes from
- Anything prefixed `NEXT_PUBLIC_` is visible in the browser. **Never put a secret behind that prefix.**

### `.env.example`

```
# --- Data layer ---------------------------------------------------
# "mock" runs the whole app on fake in-memory data. "supabase" runs it live.
# See Section 3. This is the only switch between them.
DATA_ADAPTER=

# --- Supabase -----------------------------------------------------
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- Vision model (label reading) ---------------------------------
VISION_API_KEY=
VISION_MODEL=

# --- External services --------------------------------------------
NHTSA_RECALL_BASE_URL=

# --- App ----------------------------------------------------------
NEXT_PUBLIC_APP_URL=
```

**Rule:** Every time a new environment variable is added, update `.env.example` in the same commit.

---

## 3. Project Structure

Preserve the separation of concerns below. **Section 3.2 is not optional** — it is the mechanism that lets the mock-data prototype become the real product without rewriting screens.

### 3.1 Directory structure

```
bmmp/
├── src/
│   ├── app/                    # Next.js App Router — routes only
│   │   ├── (auth)/             # sign-in, sign-up
│   │   ├── (app)/              # authenticated application
│   │   └── api/                # route handlers
│   │
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives — generated, do not hand-edit
│   │   └── */                  # app components used in 2+ places
│   │
│   ├── features/               # one folder per feature area
│   │   └── <feature>/          # components, hooks and views used by this feature ONLY
│   │
│   ├── data/                   # ← THE SWAP POINT. See 3.2.
│   │   ├── contracts/          # the interface every adapter must satisfy
│   │   ├── mock/               # fake in-memory implementation
│   │   ├── supabase/           # real implementation
│   │   └── index.ts            # selects the adapter from DATA_ADAPTER
│   │
│   ├── domain/                 # business rules. Pure TypeScript.
│   │                           # No React, no Supabase, no fetch, no env reads.
│   │
│   ├── lib/                    # framework glue: supabase clients, auth helpers, formatting
│   ├── types/                  # shared type definitions
│   └── styles/                 # global styles only
│
├── supabase/
│   ├── migrations/             # every schema change, numbered, forward-only
│   └── seed.sql
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/                       # the canonical doc stack
│                               # builder briefs and build-notes are NOT in the
│                               # repository — see Section 9
│
├── .github/workflows/ci.yml
├── .env.local
├── .env.example
├── .gitignore
└── README.md
```

### 3.2 The data layer — mock first, one swap point

**The rule:** no screen, page, component, hook or route handler ever talks to Supabase directly. Everything goes through `src/data`.

Three parts:

1. **`contracts/`** — a TypeScript interface per entity describing what the UI can ask for and what comes back. This is the contract. It is written first, before either implementation.
2. **`mock/`** — an in-memory implementation returning realistic fake records. Includes deliberately awkward cases: a scuffed label, a swollen pack, a small mobility-scooter pack sitting next to a vehicle pack.
3. **`supabase/`** — the real implementation. Written later, against the same contract.

`index.ts` picks one based on `DATA_ADAPTER` and exports it. Nothing else in the codebase knows which is running.

```ts
// src/data/index.ts
import { mockAdapter } from './mock'
import { supabaseAdapter } from './supabase'
import type { DataAdapter } from './contracts'

const ADAPTERS = { mock: mockAdapter, supabase: supabaseAdapter } as const

const name = (process.env.DATA_ADAPTER ?? '').trim()

// Fail closed. An unset, empty or misspelled value must NOT quietly select mock.
if (!(name in ADAPTERS)) {
  throw new Error(`DATA_ADAPTER must be 'mock' or 'supabase'; got ${JSON.stringify(process.env.DATA_ADAPTER)}`)
}
if (name === 'mock' && process.env.VERCEL_ENV === 'production') {
  throw new Error('DATA_ADAPTER=mock is refused in production.')
}

export const activeAdapterName = name
export const data: DataAdapter = ADAPTERS[name as keyof typeof ADAPTERS]
```

**This selector fails closed, and that is the point.** A ternary defaulting to the mock means an unset or misspelled variable silently serves fake data — and in production that is a fake legal document with a real customer's name on it. CI cannot catch it, because CI cannot read the deployment platform's environment values. The guard therefore runs in the process that serves the request, and `activeAdapterName` is exported so a health endpoint can state which adapter is live. Full treatment in `docs/TECHNICAL_SPEC.md` §5.1.1.

**Why this is here and not left to the builder's judgment:** the first slice of this product is a prototype on fake data whose purpose is to settle the screens before the schema exists. If any screen reaches past this seam, migrating to the real backend means rewriting screens instead of writing one adapter — and the whole reason for prototyping first is lost.

**How migration works:** write `supabase/` against the existing contract, flip `DATA_ADAPTER`, run the same Playwright suite. Screens do not change. If a screen has to change, the seam leaked — fix the seam, not the screen.

**Verification gate — enforced in CI:** a grep sweep proving zero Supabase imports outside `src/data/supabase/` and `src/lib/`. See Section 6.

### 3.3 Placement rules

- A component used in one place → lives in that `features/<feature>/` folder
- A component used in 2+ places → moves to `src/components/`
- Business logic never lives in the UI layer — it lives in `src/domain/`
- Database access never lives in the UI layer or in routes — only in `src/data/`
- `src/domain/` imports nothing from `app/`, `components/`, `features/`, `data/` or `lib/`. If a rule needs data, the data is passed in as an argument.
- If you're unsure where something goes, ask: *how widely is this used?* That determines its folder level.

---

## 4. Code Quality — Non-Negotiables

Set these up before writing any logic code.

### Linter

- ESLint flat config, extending `next/core-web-vitals` and `next/typescript`
- The linter must run and pass before any code is committed
- Fix all linter errors — do not suppress them without a comment giving the reason

### Formatter

- Prettier, with `prettier-plugin-tailwindcss` for class ordering
- Runs on save and on pre-commit via Husky + lint-staged
- Formatting must be consistent across every file in the project

### Type checking

- `tsc --noEmit` runs in CI and must pass
- `any` is not permitted in committed code. Use `unknown` and narrow it.

### Naming conventions — enforce these throughout

| Thing | Convention | Example |
|---|---|---|
| Variables and functions | `camelCase` | `getStorageClockStatus()` |
| Classes, React components, types | `PascalCase` | `BatteryRecord` |
| Files | `kebab-case` | `battery-intake-form.tsx` |
| Next.js route files | framework convention | `page.tsx`, `layout.tsx`, `route.ts` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_STORAGE_DAYS` |
| Database tables and columns | `snake_case` | `battery_record`, `intake_photo_url` |

### Function and variable naming rules

- Names describe what the thing does or contains — not how it works
- `getUserSubscriptionStatus()` is correct. `doThing()` is not.
- If you need a comment to explain what the code does, the name is wrong — rename it

### Single responsibility rule

- Every function does one thing
- Every file has one clear purpose
- If something does "this AND that" — split it into two things

### Comments

- Comments explain **why** a decision was made — not what the code does
- Good: `// Light-category path, not full hazardous — 48 states exempt these from the manifest. See Rule 3.2.`
- Bad: `// Loop through batteries`

---

## 5. Testing Setup

Set up the testing framework before writing any feature code. Tests get written alongside features — not after.

### Install

- **Vitest** for unit and integration tests
- **Playwright** for end-to-end tests, Chromium project minimum
- Commands, added to `README.md`:

```
pnpm test          # vitest, unit + integration
pnpm test:e2e      # playwright
pnpm lint
pnpm typecheck
pnpm build
```

### Test file structure

- Unit tests live next to the code they test, or in `tests/unit/`
- Integration tests live in `tests/integration/`
- End-to-end tests live in `tests/e2e/`
- Test files are named to match what they test: `storage-clock.test.ts`

### The three test types — write all three

**Unit tests** — one function, in isolation. Given a specific input, verify the output is exactly what's expected. Fast, easy to debug. Write one for every non-trivial function. **Everything in `src/domain/` gets unit tests** — it is pure functions with no dependencies, which makes it the cheapest and highest-value place to test.

**Integration tests** — multiple pieces working together. Verify two or more connected components produce the correct combined result. Use a test database — never run integration tests against real data.

**End-to-end tests** — full user flow, front to back. Simulate a real user performing a real action. Slower, but catches what unit tests miss.

**The e2e suite is stack-critical here.** It runs against `DATA_ADAPTER=mock` from day one and against `DATA_ADAPTER=supabase` after migration. **The same suite must pass both ways.** That is the proof the swap point held.

### How to write a test scenario

1. **Arrange** — set up the starting condition
2. **Act** — trigger the thing being tested
3. **Assert** — verify the result matches what's expected

Write scenarios in plain english first, then implement:

- *Given a battery logged 300 days ago, when the storage clock is checked, then it returns a 60-day warning*
- *Given a battery marked damaged, when air transport is selected, then the request is blocked with a stated reason*
- *Given a logged-out user, when they open a battery record, then they are redirected to sign-in*

**Rule:** Every new feature ships with tests. No feature is complete without them.

---

## 6. CI/CD Pipeline

Set up automation before any feature work begins. One-time setup, runs forever.

### CI — GitHub Actions, on every push to any branch

```
→ pnpm install --frozen-lockfile
→ pnpm lint
→ pnpm typecheck
→ pnpm test
→ pnpm build
→ pnpm test:e2e            (DATA_ADAPTER=mock)
→ data-seam check          (see below)
→ report pass/fail
```

**The data-seam check** is a required status check, not a nice-to-have. It fails the build if any file outside `src/data/supabase/` or `src/lib/` imports `@supabase/*`. This is what keeps Section 3.2 true over 32 weeks instead of only on day one.

### CD

- **Staging:** Vercel deploys automatically from `staging` when CI passes
- **Production:** Vercel deploys from `main` after CI passes **and** manual promotion in Vercel

### Rule

Code never reaches staging or production without passing CI first. No exceptions. No manual overrides.

---

## 7. README

Complete before setup is considered done.

```markdown
# BMMP — Battery Material Management Platform

Software that follows a battery through the end of its life: identify, assess, grade, route, dispose or resell.

## Prerequisites
Node 20+, pnpm 9+, Supabase CLI, a Supabase project.

## Setup
Step-by-step to run locally, including `DATA_ADAPTER=mock` for the prototype path.

## Environment Variables
See `.env.example`. Every key is listed there.

## Running Tests
pnpm test · pnpm test:e2e · pnpm lint · pnpm typecheck

## Branch Strategy
main / staging / feature branches. One brief, one branch. Branch names carry the unit ID.

## Data Layer
How the mock and Supabase adapters work, and how to switch. Points to Section 3.2 of the setup reference.

## Deployment
How code reaches staging and production.
```

---

## 8. Project-Specific Rules

Three rules that come from the roadmap and decision log rather than from general practice. They gate code review on this project the same way the linter does.

**8.1 — Regulatory rules are data, never code.** Fourteen states with different weight and energy thresholds, fire codes adopted 12–24 months apart by jurisdiction, and a pending federal rule that could restructure classification. Every threshold, deadline, citation and jurisdiction rule lives in a database table or a versioned data file — never in a TypeScript conditional. *A hard-coded state threshold is a review rejection.* (Roadmap Principle 5.)

**8.2 — The battery record is sized wide from the first migration.** It holds small mobility-device packs — power wheelchair and scooter batteries — alongside vehicle, consumer and industrial batteries, from the first schema migration. Phase B3 is four weeks on the assumption this was done. If the record is built narrow, B3 becomes a rebuild. (Roadmap, B1a and Risks.)

**8.3 — Never output a probability of ignition.** Hazard output is a *relative ranking with a stated basis per factor*. Not a probability, not a percentage, not a likelihood. This is legal exposure, not word choice. Applies to UI copy, API responses, exports and PDFs. (Roadmap Principle 4.)

---

## 9. Where the Documents Live

| What | Where | Created by |
|---|---|---|
| This setup reference | repo root, `PROJECT_SETUP_BMMP.md` | now |
| Canonical doc stack | `docs/` | next — one file per doc, version in header |
| Builder briefs + build-notes | planning folder, `BMMP Planning\briefs\` — **outside the repository** | one file per unit |
| Decision log | `docs/DECISION_LOG.md` | ongoing, append-only |

Every later brief points back to this document rather than restating it.

---

## 10. Setup Checklist

**Do not begin feature development until every item here is checked off.**

Items marked **[owner]** need account access a build agent does not have. Nate does those.

```
REPOSITORY
[x] Repo initialized, Next.js + TypeScript scaffolded with pnpm
[x] .gitignore created and complete
[x] .gitattributes normalises line endings (authored on Windows, built on Linux CI)
[x] First commit is structure only — no feature code
[x] main and staging branches exist
[x] Remote connected, both branches pushed                                  [owner]
[x] Branch protection on main and staging: PR required, status checks
    required, force-push and deletion blocked                               [owner]

ENVIRONMENT
[x] .env.local created
[x] .env.example committed with all keys, no values
[x] All secrets confirmed out of version control
[x] No secret sits behind a NEXT_PUBLIC_ prefix

PROJECT STRUCTURE
[x] Directory structure matches Section 3.1
[x] src/data/contracts, src/data/mock, src/data/supabase and src/data/index.ts exist
[x] No business logic in the UI layer
[x] No database access outside src/data
[x] src/domain imports nothing from app, components, features, data or lib

CODE QUALITY
[x] ESLint installed and passing
[x] Prettier installed, running on save and pre-commit
[x] Canonical documents excluded from the formatter — markdown reflow must never
    disturb the 518 cross-document citations
[x] tsc --noEmit passes with strict: true and noUncheckedIndexedAccess: true
[x] Naming conventions documented and in use

TESTING
[x] Vitest installed, pnpm test works
[x] Playwright installed, pnpm test:e2e works
[x] At least one placeholder test of each type exists and passes

CI/CD
[x] CI runs on every push: lint, format, typecheck, test, build, e2e
[x] Data-seam check wired as a required status check and proven to fail on a
    deliberate bad import — the proof runs in CI, not once by hand
[x] Adapter selector proven to throw on an unset and on a misspelled DATA_ADAPTER
[ ] Two Vercel projects and two Supabase projects, hard-isolated (D-21);
    staging auto-deploys, production requires manual promotion              [owner]
[x] Required status checks selected in branch protection                    [owner]

DOCUMENTATION
[x] README complete with all required sections
[x] docs/ holds the canonical doc stack; briefs and build-notes live in the
    planning folder outside the repository
[x] CLAUDE.md carries Section 8's three rules for every agent that opens the repo

PROJECT-SPECIFIC
[x] Section 8's three rules recorded in docs/ and cited in the kickoff brief
[ ] Error tracking wired — DSN needs an account                             [owner]
```

### Changelog

**v1.2 — 2026-08-19.** Stack moves from Next.js 15 to **Next.js 16** (D-27): `next@latest` is 16, and starting a 32-week build on the previous major buys a framework major upgrade in February, on top of B2. Checklist gains `.gitattributes`, the formatter exclusion for canonical documents, `format` and `e2e` as CI jobs, and an `[owner]` marker on the five items needing account access. Environment isolation resolved by **D-21**. `.env.example` gains `VISION_PROVIDER` (D-25) and error-tracking keys (D-20).

---

*Setup is complete when every box is checked. Only then does feature development begin.*

*Next Sketch LLC · Confidential · August 2026*
