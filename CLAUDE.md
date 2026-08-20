# BMMP — rules for any agent working in this repository

BMMP is a compliance product. It generates the documents a business is legally
required to produce when it stores and ships dead lithium batteries. **A wrong
document is worse than no document, because a wrong one gets filed and
believed.** An invalid document outranks a full outage as a severity-1 failure
throughout this product: an outage is visible, a bad shipping paper is not.

Read this before you read any code.

---

## The three rules that gate code review

These come from the roadmap and the decision log rather than from general
practice. They gate review the same way the linter does.
`PROJECT_SETUP_BMMP.md` §8.

**1 — Regulatory rules are data, never code.**
Fourteen states with different weight and energy thresholds, fire codes adopted
12–24 months apart by jurisdiction, and a pending federal rule that could
restructure classification. Every threshold, deadline, citation and jurisdiction
rule lives in a database table or a versioned data file — never in a TypeScript
conditional. **A hard-coded state threshold is a review rejection.**

**2 — The battery record is sized wide from the first migration.**
It holds small mobility-device packs — power wheelchair and scooter batteries —
alongside vehicle, consumer and industrial batteries, from the first schema
migration. Phase B3 is four weeks on the assumption this was done. Build the
record narrow and B3 becomes a rebuild.

**3 — Never output a probability of ignition.**
Hazard output is a _relative ranking with a stated basis per factor_. Not a
probability, not a percentage, not a likelihood, not "risk of fire". This is
legal exposure, not word choice. It applies to UI copy, API responses, exports
and PDFs.

Rules 1 and 3 are also `docs/_ANCHORS.md` §7.4 and §7.1; rule 2 is §0.

---

## The data seam

**No screen, page, component, hook or route handler ever talks to Supabase
directly. Everything goes through `src/data`.** §3.2, D-15, D-16.

This product is built as a mock-data prototype first — real screens, real flows,
real logic, running on fake data behind one swap point — and the backend is
written afterward. The experience determines the backend requirements, not the
reverse. `docs/ERD.md` is a considered design the prototype argues with, not a
schema commitment; where a screen shows a field missing, wrong-shaped or
unnecessary, the ERD changes before a migration is ever written (D-19).

- `src/data/contracts/` — the interface, written before either implementation
- `src/data/mock/` — fake in-memory records
- `src/data/supabase/` — the real implementation, against the same contract
- `src/data/index.ts` — selects one from `DATA_ADAPTER`, and **fails closed**

Migration means writing the Supabase adapter against the _existing_ contract and
flipping one variable. The same Playwright suite must pass both ways. **If a
screen has to change, the seam leaked — fix the seam, not the screen.**

`scripts/check-data-seam.mjs` runs in CI and fails the build on any
`@supabase/*` import anywhere in `src/` outside `src/data/supabase/` or
`src/lib/`. It does not sweep `tests/` — an integration test runs against a
test database, so an import there is legitimate.

## `src/domain` is pure

Business rules are pure TypeScript. No React, no Supabase, no `fetch`, no
environment reads, and no import from `app`, `components`, `features`, `data` or
`lib`. If a rule needs data, the data is passed in as an argument. §3.3.

Everything in `src/domain/` gets unit tests. It is the cheapest and
highest-value place in the codebase to test.

## Where things go

| Used                 | Lives in                                           |
| -------------------- | -------------------------------------------------- |
| One feature only     | `src/features/<feature>/`                          |
| Two or more places   | `src/components/`                                  |
| Business logic       | `src/domain/` — never the UI layer                 |
| Database access      | `src/data/` — never the UI layer, never a route    |
| shadcn/ui primitives | `src/components/ui/` — generated, do not hand-edit |

## The canonical documents

`docs/` holds nine documents plus `_ANCHORS.md`, carrying **518 cross-document
citations that have been verified to resolve.** Renaming an entity or
renumbering a rule breaks them silently and no test catches it.

- `docs/_ANCHORS.md` fixes persona IDs, entity names, rule section numbers and
  the B1a page list. They do not move.
- The formatter is excluded from `docs/` and `PROJECT_SETUP_BMMP.md`. Do not
  remove that exclusion.
- A rule may move **within its section only**, and the PRD is updated in the
  same commit.
- If a document appears wrong, that is a judgment call. Stop and raise it. Do
  not split the difference.

## Where the planning record lives

**This repository holds the product — code and specifications. The planning
folder holds the record of how the product got decided — briefs, build-notes
and the decision log.** The planning folder is outside this repository:

```
C:\Users\nteiv\Documents\Claude\Projects\Jonathan AI Platforms\BMMP Planning\
```

Briefs and build-notes live in its `briefs/` subfolder, not here. A
specification belongs beside the code that implements it and versions with the
branch that changes it; a brief does not — it is written before the work
exists, it is read by people who never check out the repo, and it accumulates
for the life of the engagement rather than the life of a branch.

`docs/`, `PROJECT_SETUP_BMMP.md` and this file stay in the repository.

## Decisions

Settled decisions are cited by ID (`D-16`, `D-27`) and live in the project-level
`Decision Log.md`, outside this repository. **A settled decision resolved
quietly by a builder lands in the codebase instead of in the log, and the next
person to ask the same question gets a different answer.** If this file and a
brief disagree, or a document contradicts another, stop and say so.

## Branching

`main` is production-ready and is never worked on directly. `staging` is the
integration branch. **One brief, one branch**, and the branch name carries the
unit ID: `feature/b1a-03-label-intake-form`, `chore/b1a-01-ci-pipeline`.

**No agent merges its own work.** Every unit ends in a pull request whose diff
Nate reads and merges by hand. An agent that merges its own branch has broken
the method, not just a rule. D-17.

Every unit ends with `BUILD_NOTES_<unit>.md`, written to the planning folder's
`briefs/` — never into this repository. The next unit is written against it.

## Naming conventions

| Thing                            | Convention           | Example                   |
| -------------------------------- | -------------------- | ------------------------- |
| Variables and functions          | `camelCase`          | `getStorageClockStatus()` |
| Classes, React components, types | `PascalCase`         | `BatteryRecord`           |
| Files                            | `kebab-case`         | `battery-intake-form.tsx` |
| Next.js route files              | framework convention | `page.tsx`, `route.ts`    |
| Constants                        | `UPPER_SNAKE_CASE`   | `MAX_STORAGE_DAYS`        |
| Database tables and columns      | `snake_case`         | `battery_record`          |

Names say what the thing does or contains, not how it works. If a comment is
needed to explain what the code does, the name is wrong — rename it. Comments
explain **why**.

`any` is not permitted. Use `unknown` and narrow it.

## Before you add anything

1. **Check before creating.** Search before adding.
2. **Library first.** Check installed primitives and their APIs before
   hand-rolling anything.
3. **Never rebuild what exists.**
4. **Extend with props, not forks.**

## Commands

```
pnpm dev              # local dev server
pnpm lint             # eslint
pnpm format:check     # prettier, canonical documents excluded
pnpm typecheck        # next typegen && tsc --noEmit
pnpm test             # vitest, unit + integration
pnpm test:e2e         # playwright, builds and starts the app
pnpm build            # next build
pnpm check:data-seam  # no @supabase/* import outside src/data/supabase or src/lib
```

All seven run in CI on every push and are the checks branch protection requires.
Run them before handing work back.

## Environment

`DATA_ADAPTER` must be `mock` or `supabase`. Unset, empty or misspelled throws
at module load, and `mock` is refused outright when `VERCEL_ENV=production`. It
never falls back — a silent fallback to fake data in production is a fake legal
document with a real customer name on it.

Every key lives in `.env.example` with no value. Adding a variable means
updating that file in the same commit. Anything prefixed `NEXT_PUBLIC_` is
visible in the browser; **never put a secret behind that prefix**.

No vision vendor name belongs anywhere outside `src/lib/vision/providers/`
(D-25).
