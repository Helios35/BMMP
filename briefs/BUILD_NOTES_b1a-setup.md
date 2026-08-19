# Build notes — b1a-setup

**Unit:** `b1a-setup` · **Branch:** `chore/b1a-setup` · **Base:** `main`
**Date:** 2026-08-19 · **Built by:** build agent · **Reviewed by:** Nathan Ivy (pending)
**Brief:** `briefs/SETUP_b1a-setup.md` v1.0
**Specification:** `PROJECT_SETUP_BMMP.md` v1.2 §10

`b1a-00-foundation` is written against this file. Read the deviations and the
open items before writing that brief.

---

## Status

Every box in `PROJECT_SETUP_BMMP.md` §10 that is not marked `[owner]` is
checked — 29 of them. Of the five `[owner]` boxes, three were closed after the
brief was written because Nate granted GitHub access mid-unit; two remain open.
All five are listed at the bottom. Each checked box was verified by running the thing, not by writing
the tick.

The full CI sequence passes locally and on a fresh clone. All three gates were
broken by hand, watched to fail, and restored; all three also now fail
automatically on every push.

---

## What was built

Next.js 16.3.1, React 19.2.8, pnpm 11.21.0, TypeScript 5.9.3 strict. Sixteen
commits, one logical change each — one on `main`, fifteen on the branch.

| Commit    | What                                                          |
| --------- | ------------------------------------------------------------- |
| `13f52a8` | `chore: initial project setup` — structure and `.gitignore` only, on `main` |
| `404a4f9` | Next.js 16 scaffold, committed verbatim                       |
| `24ccd93` | `docs/`, `briefs/` and `PROJECT_SETUP_BMMP.md` into the repository |
| `d505dfc` | Google Fonts dependency removed; strict TypeScript; `typecheck` script |
| `abdb6e1` | `.env.example`                                                |
| `93e8244` | The data seam                                                 |
| `3cab896` | `src/domain` boundary lint rules and the data-seam checker     |
| `ce265c1` | Vitest and Playwright, three gates wired as tests             |
| `9213665` | Prettier, Husky, lint-staged, canonical documents excluded    |
| `7f317c8` | CI                                                            |
| `efb18dd` | `CLAUDE.md` and the full `README.md`                          |
| `736a8f3` | Data-seam sweep narrowed to `src/`                            |
| `982cd8a` | Committed format-on-save editor settings                      |
| `7f4e777` | §10 checklist checked; these build-notes                      |
| `9300dee` | Three `[owner]` items closed after GitHub access was granted  |
| _final_   | Commit table and status corrected to match                    |

`main` and `staging` both hold only `13f52a8`. Everything after the first commit
is on `chore/b1a-setup`, unmerged, awaiting Nate's review of the pull request.

### Names to know

| Name                                  | What it is                                                    |
| ------------------------------------- | -------------------------------------------------------------- |
| `src/data/contracts` → `DataAdapter`  | the interface both adapters satisfy                            |
| `AdapterDescription`, `AdapterName`   | the contract's only types so far — `{ name, kind }`, `"mock" \| "supabase"` |
| `mockAdapter`, `supabaseAdapter`      | the two implementations                                        |
| `resolveAdapter(env?)`                | the fail-closed selector, exported so it is directly testable   |
| `AdapterEnvironment`                  | the two variables the selector reads                            |
| `data`, `activeAdapterName`           | the module-level resolved adapter and its name                  |
| `GET /api/health`                     | states which adapter is live; `force-dynamic`                   |
| `scripts/check-data-seam.mjs`         | the sweep; exports `findDataSeamViolations`, `ALLOWED_PREFIXES`, `SCANNED_ROOTS` |
| `pnpm check:data-seam`                | runs it                                                         |
| `tests/setup/env.ts`                  | sets `DATA_ADAPTER=mock` so the seam module can be imported at all |
| `tests/stubs/server-only.ts`          | stub so Vitest can import the seam                              |
| CI jobs                               | `lint`, `format`, `typecheck`, `test`, `build`, `e2e`, `data-seam` |

`src/domain/` holds no code yet — only `.gitkeep`. The first pure rules are
`b1a-00`'s work. The boundary that protects it is already enforced.

`src/data/mock/` returns no records yet. The fixtures §3.2 names — a scuffed
label, a swollen pack, a small mobility-scooter pack beside a vehicle pack —
arrive with the entities they belong to, in `b1a-00`.

---

## The three gates — what was broken, and what was seen

Each was broken once by hand and watched to fail. Each is also wired to fail
automatically on every push, because a gate proven once by hand decays silently
over 32 weeks.

### Gate 1 — the data-seam check, on an import placed where it does not belong

**Broke:** added `import { createClient } from "@supabase/supabase-js";` as line
1 of `src/app/page.tsx`, then ran `pnpm check:data-seam`.

**Saw:**

```
data-seam: FAILED

  src/app/page.tsx:1 imports @supabase/supabase-js

Only src/data/supabase/ and src/lib/ may import the Supabase client.
Everything else goes through src/data. PROJECT_SETUP_BMMP.md Section 3.2, D-16.
```

Exit code 1. Restored the file; the check returned `ok` and exit 0. Run a second
time after the sweep was narrowed to `src/` (see deviations) with the same
result.

**Automatic proof:** `tests/unit/data-seam-check.test.ts` builds a fixture tree
in a temp directory each run and asserts the checker catches static imports,
side-effect imports, re-exports, dynamic `import()` and `require()`; permits
both allowed folders; and does not fire on a prose mention of the package. Nine
assertions. If the checker ever stops detecting, `test` fails before `data-seam`
has a chance to pass vacuously.

### Gate 2 — the adapter selector, on an unset and on a misspelled value

**Broke (misspelled):** `DATA_ADAPTER=mokc pnpm build`.

**Saw:**

```
Error: Failed to collect configuration for /api/health
  [cause]: Error: DATA_ADAPTER must be 'mock' or 'supabase'; got "mokc"
> Build error occurred
```

**Broke (unset):** moved `.env.local` aside and ran `pnpm build`.

**Saw:** the same failure, `got undefined`. Restored `.env.local`; the build
succeeded. Reproduced again on a fresh clone that had no `.env.local` at all.

**Automatic proof:** `tests/unit/adapter-selector.test.ts` asserts the selector
throws on unset, empty, whitespace, wrong case and misspelled values, refuses
`mock` when `VERCEL_ENV=production`, permits `mock` outside production, and
permits `supabase` in production.

### Gate 3 — the `src/domain` isolation rule, on an import it must refuse

**Broke:** created `src/domain/__gate-proof.ts` importing `@/data` and
`../lib/nope`, then ran `pnpm lint`.

**Saw:**

```
src\domain\__gate-proof.ts
  1:1  error  '@/data' import is restricted from being used by a pattern. src/domain
              imports nothing from app, components, features, data or lib...
  2:1  error  '../lib/nope' import is restricted from being used by a pattern...

✖ 2 problems (2 errors, 0 warnings)
```

Replaced the file with a single `process.env` read and saw:

```
  1:33  error  'process.env' is restricted from being used. src/domain reads no
               environment. Pass configuration in as an argument. Section 3.1
```

Deleted the file; lint passed clean.

**Automatic proof:** `tests/unit/domain-boundary.test.ts` runs ESLint in-process
against source linted _as if_ it were a file in `src/domain`, so the rule is
exercised on every push without committing a deliberately broken file. Ten
forbidden import forms, the environment read, and two positive cases.

### Fourth proof, not required but cheap — the formatter exclusion

A deliberately mis-formatted markdown file placed inside `docs/` was left
byte-identical by `pnpm format`; the same file at the repository root was
reflowed. The exclusion is real, not vacuous. `git status` on `docs/` was clean
after every formatting run in this unit.

### Fifth proof — the same e2e suite passes both ways

`pnpm test:e2e` passes under `DATA_ADAPTER=mock` and under
`DATA_ADAPTER=supabase`. Nothing in the Playwright config or the specs hard-codes
an adapter name; they assert the app reports whichever one is configured. That
is the shape D-15 requires of the suite after migration, established now while
it is free.

---

## Verification run

Full sequence, in the working tree, in CI order:

```
lint              PASS
format:check      PASS
typecheck         PASS
test              PASS   (35 tests, 4 files)
build             PASS
test:e2e          PASS   (2 tests, chromium)
check:data-seam   PASS
```

Working tree clean.

**Fresh clone** into a temp directory, `pnpm install --frozen-lockfile`, then:

- `pnpm typecheck` passes on a clean clone — this is D-27's second consequence
  working. `next typegen` runs first; a bare `tsc --noEmit` would fail.
- `pnpm build` with no `.env.local` fails closed with
  `DATA_ADAPTER must be 'mock' or 'supabase'; got undefined`. **This is the
  intended behaviour, not a defect.** A clone runs after the documented setup
  step (`cp .env.example .env.local`, set `DATA_ADAPTER=mock`) and not before.
  Committing a default would be the exact silent fallback D-16 forbids.
- With `.env.local` in place, all seven checks pass on the clone.

Only `.env.example` is tracked under any `.env*` name. No secret sits behind a
`NEXT_PUBLIC_` prefix — the three prefixed keys are the Supabase URL, the
Supabase anon key (publishable by design, guarded by RLS) and the app URL. The
service-role key, the vision key and the error-tracking DSN are all server-side.

---

## Deviations from the brief and the setup reference

Everything below is a place the instruction was ambiguous, self-contradictory,
or would have produced a worse repository read literally. Nothing here is a
scope change.

### 1. Repository location — raised, and decided by Nate

Two folders named `BMMP` existed. The brief describes the one holding `docs/`,
`briefs/` and `PROJECT_SETUP_BMMP.md`; the session's working directory was an
empty `BMMP` under OneDrive created the same afternoon. Raised rather than
guessed. **Nate chose the OneDrive path**, so `docs/`, `briefs/` and
`PROJECT_SETUP_BMMP.md` were **moved** (copied, checksum-verified, originals
removed) to `C:\Users\nteiv\OneDrive\Documents\Projects\BMMP\`, which is now the
repository root.

`Jonathan AI Platforms\BMMP\` no longer exists. A pointer, `BMMP_MOVED.md`, was
left in its parent so anyone landing there finds the repository. There is no
second copy of the doc stack — a divergent copy is the fastest way to break the
518 citations.

**Carried hazard:** `node_modules/` and `.next/` now live inside a OneDrive-synced
folder. Both are git-ignored but not sync-ignored, and OneDrive file locking is a
known cause of intermittent `pnpm install` failures. Worth excluding the folder
from sync in the OneDrive client.

### 2. `Decision Log.md` stayed outside the repository

§9 names `docs/DECISION_LOG.md` as its home. The actual log is a **project-level**
document covering BMMP *and* MIP and sits beside the roadmap and the SOW. Moving
it would scope it wrongly; copying it would fork an append-only log. Left where
it is, and `CLAUDE.md` says so explicitly. **If you want it inside the repo, that
is a decision to record, not a build fix.**

### 3. `.env.example` — raised, and decided by Nate

D-21 says "`.env.example` carries both sets of keys as separate names", which read
literally means staging and production Supabase keys side by side in one local
file — contradicting §2 ("code references the variable name only; it never cares
where the value comes from") and putting two environments' credentials in one
place. Raised. **Nate's ruling: follow the setup reference.** One set of names;
isolation comes from the two Vercel projects, which is what D-21 actually buys.
A comment in the file states the rule.

Two keys were added beyond the §2 block, on the authority of the v1.2 changelog
and the decisions behind it: `VISION_PROVIDER` (D-25) and `ERROR_TRACKING_DSN`.
The changelog cites D-20 for the error-tracking keys; D-20 is the review-note
batch and D-20's actual error-tracking reference is elsewhere. **The key name is
mine and provisional** — no vendor has been chosen, and no vendor name was put
in the repository.

### 4. Branch protection needs seven checks, not the four §1 lists

§1 and D-17 name `lint`, `typecheck`, `test`, `build`. That list predates
`format`, `e2e` and `data-seam` as jobs, and D-16 already adds `data-seam` on top
of it. The brief's outcome 4 is explicit that the CI checks and the required
checks are the same set. **The seven CI job names are the required set.** Listed
under open items.

### 5. The data-seam sweep covers `src/` only

Originally `src/` and `tests/`. Two problems. The checker's own test fixtures are
literal import statements, so the check flagged the test proving it works. More
importantly §5 has integration tests running against a **test database**, so a
Supabase import in `tests/` is legitimate — sweeping it would have made the gate
wrong rather than noisy. §3.2 states the rule over source. A test asserts `tests/`
is left alone, so the narrowing stays deliberate and visible. `scripts/` is
excluded because the checker names the package it looks for.

### 6. `DataAdapter` has one method and no entities

`describe()` only. Typing the entities is `b1a-00`'s work and the contract covers
B1a entities only when it gets them (D-24). Writing entity methods here would
have written them twice and broken the brief's scope guardrail.

### 7. `server-only` was added to the seam

Not in the specification. Importing `src/data` from a client component is now a
build error, so the seam cannot leak into the browser bundle by accident. One
dependency, no runtime cost. Vitest maps it to an empty stub because there is no
bundler under test.

### 8. `resolveAdapter` takes its environment as an argument

§3.2's reference code resolves at module load only. Kept — the module still
resolves at load and still throws — but the logic was factored into an exported
function taking an `AdapterEnvironment`. Two reasons: the failure modes become
directly testable without mutating `process.env` across test files, and Next
augments `NodeJS.ProcessEnv` so that `NODE_ENV` is required, which makes a
two-key test environment unassignable to it.

### 9. `globals.css` moved to `src/styles/`

§3.1 puts global styles in `src/styles/`; the scaffold puts them in `src/app/`.
Followed §3.1. If `b1a-00` prefers the framework convention when it brings in the
design system, moving it back is a one-line change.

### 10. The first commit is on `main`

A repository needs a root commit before any branch can exist, so
`chore: initial project setup` is on `main` and `staging` and `chore/b1a-setup`
were branched from it. Everything else is on the branch. No agent has merged
anything.

### 11. Editor settings are committed

§10 requires Prettier "running on save"; §1 ignores `.vscode/` wholesale.
Resolved by narrowing the ignore to `.vscode/*` with exceptions for
`settings.json` and `extensions.json`. §1's stated rule is that secrets,
credentials and machine-specific config go in `.gitignore`, and a formatter
setting is none of those. The enforceable guarantee is still pre-commit and CI.

### 12. Smaller things

- `vitest.config.mts`, not `.ts` — Vite warns about ESM syntax in a file loaded
  as CommonJS otherwise.
- `AGENTS.md` is kept and committed. `next dev` writes and re-adds the block
  between its markers; deleting it just recreates an uncommitted change. BMMP
  content was appended below the end marker and points at `CLAUDE.md`.
- `supabase/migrations/` holds only `.gitkeep` and `supabase/seed.sql` is a
  comment explaining why it is empty. **Zero migrations, per D-19.**
- The scaffold's marketing page and its unreferenced SVGs were deleted. `/`
  renders a heading and one line and does nothing else.
- `testTimeout` is 30s. The domain-boundary gate loads the ESLint flat config
  in-process, which costs several seconds on the first call.
- CI runs on Node 22 and pins `DATA_ADAPTER=mock` and `VISION_PROVIDER=fixture`,
  so no job reaches a real backend and no test spends money (D-25).
- **CI triggers on `push` only, with no `pull_request` trigger.** Both triggers
  fire for the same commit on a branch with an open pull request. Whichever run
  concurrency cancels leaves cancelled check runs behind under the same seven
  names, and branch protection will not treat a required context as passing
  while a cancelled run for it exists — so the pull request blocks on checks
  that passed. Found the hard way on PR #1. `strict` branch protection already
  requires branches to be up to date with base, which is what a merge-preview
  run would otherwise buy. **A pull request from a fork would not run CI**;
  there are no forks, and changing that is a decision to record.
- **Every job has a `timeout-minutes`** — 10, and 20 for `e2e`. Added after
  `playwright install --with-deps chromium` hung for 34 minutes against
  GitHub's six-hour default. `--with-deps` shells out to `apt-get` and buys
  nothing on `ubuntu-latest`; it was removed and `e2e` now finishes in 48s.

---

## Not built, and deliberately so

- **shadcn/ui.** It is in the §1 stack table but has no §10 checklist box, and
  installing it means choosing design tokens. That is `b1a-00`'s work. Tailwind
  4 is installed and configured; `src/components/ui/` exists and is empty.
- **A typeface.** `next/font/google` was stripped per D-27 and nothing replaced
  it. `b1a-00` self-hosts one with `next/font/local` from `docs/UX_SPEC.md`.
- **Supabase local tooling.** No `supabase/config.toml`, no CLI init. Nothing in
  §10 asks for it and D-19 means there is nothing to migrate.
- **Any entity type, mock fixture, business rule, feature screen, route beyond
  `/` and `/api/health`, auth flow, or database access.** Scope guardrails.

---

## `[owner]` items — three closed, two open

None was substituted with a lesser thing, and nothing was disabled to avoid
needing an account.

### Closed after the brief was written

Nate granted GitHub access mid-unit, so three items that a build agent normally
cannot do were done and verified.

1. **Remote connected, both branches pushed.** ✅
   `git@github.com:Helios35/BMMP.git`. `main`, `staging` and `chore/b1a-setup`
   are pushed; default branch is `main`. **The repository is public**, which was
   raised before pushing — the `docs/` stack, `PROJECT_SETUP_BMMP.md` and every
   brief carry a confidentiality line — and Nate directed the push as public
   anyway. Recorded here because it is a standing property of the repository,
   not a one-time choice: every later unit publishes the same way.
2. **Branch protection on `main` and `staging`.** ✅ Pull request required,
   status checks required, branches must be up to date (`strict`), force pushes
   and deletion blocked, conversation resolution required, stale reviews
   dismissed. Required approvals is **0** — a solo owner cannot approve his own
   pull request, so the reviewer requirement is replaced by the human rule
   (D-17), not weakened.
   **`enforce_admins` is off.** With one owner and no second admin, locking
   admins out of their own repository has no one to fall back on. Flip it if you
   want "no manual overrides" enforced mechanically:
   `gh api -X POST repos/Helios35/BMMP/branches/main/protection/enforce_admins`
3. **Required status checks selected.** ✅ All seven by name: `lint`, `format`,
   `typecheck`, `test`, `build`, `e2e`, `data-seam`. See deviation 4 — this is
   more than the four §1 lists. First run on `chore/b1a-setup` was green on all
   seven (run `32299720499`).

Note that `main` and `staging` sit at the structure-only first commit, which
predates `.github/workflows/ci.yml`, so no CI run exists on those branches yet.
The required checks evaluate against a pull request's head, which does carry the
workflow, so this resolves itself on the first merge.

### Still open


4. **Two Vercel projects and two Supabase projects, hard-isolated (D-21).**
   Staging auto-deploys from `staging`; production requires manual promotion.
   Each Vercel project needs `DATA_ADAPTER` set explicitly — an unset value stops
   the deployment rather than serving fake data, which is the intended behaviour
   and will look like a failed deploy the first time.
5. **Error tracking.** `ERROR_TRACKING_DSN` is in `.env.example` and nothing
   reads it. No vendor chosen, none named in the repository.

---

## For whoever writes `b1a-00`

- The contract is the thing to extend. Add entity methods to
  `src/data/contracts`, implement them in `src/data/mock` with the awkward
  fixtures §3.2 names, and leave `src/data/supabase` alone.
- Types for all 32 entities; `DataAdapter` methods for B1a entities only (D-24).
- The first files in `src/domain/` land under a boundary that is already
  enforced and already tested. Pass data in as arguments.
- Every unit ends in a PR whose diff Nate reads. Nobody merges their own work.

---

_Next Sketch LLC · Confidential_
