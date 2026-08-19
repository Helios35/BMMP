# Setup — BMMP project foundation

**Unit:** `b1a-setup` · **Branch:** `chore/b1a-setup`
**Version:** 1.0 · **Date:** 2026-08-19
**Owner (build):** build agent · **Owner (review):** Nathan Ivy
**Client:** Jonathan · **Phase:** B1a — Compliance Core (17 Aug – 16 Oct 2026)

**This is the first unit of work in the project. Nothing else starts until it is merged — including `b1a-00-foundation`.**

---

## Project Standards

Read **`PROJECT_SETUP_BMMP.md` v1.2 in full** before doing anything. It is the specification for this unit. Section 10 is its checklist, and this brief is the instruction to execute that checklist.

Then read **`docs/_ANCHORS.md`**. You will not write product code in this unit, but every later unit is written against it, and you are creating the repository those units live in.

## Component rules — non-negotiable

1. **Check before creating.** Search before adding.
2. **Library first.** Check installed primitives and their APIs before hand-rolling anything.
3. **Never rebuild what exists.**
4. **Extend with props, not forks.**

## Pre-flight

There is no repository yet — a remote exists but is empty. `BMMP\` on disk holds `docs/`, `briefs/` and `PROJECT_SETUP_BMMP.md`; those become the repository's contents, not a separate folder beside it.

**A previous scaffold attempt was scrapped and moved to `_to_delete\scaffold_2026-08-19\`. Do not read it, copy from it, or resurrect it.** It is not a reference implementation and it is not reviewed work. Build from `PROJECT_SETUP_BMMP.md`.

---

## The Problem

BMMP is a compliance product. It generates the documents a business is legally required to produce when it stores and ships dead lithium batteries — shipping papers, container labels, storage clocks, shipment records. A wrong document is worse than no document, because a wrong one gets filed and believed.

Thirty-two weeks of that get built by AI agents on branches, one unit at a time. **The properties that make that safe are not properties of any feature — they are properties of the repository.** Whether a fake-data record can reach a real customer, whether a screen can quietly reach past the data layer, whether a rule can harden into code where nobody can change it: those are settled once, here, or they are not settled at all.

There is no repository. Until there is one with its gates wired and proven, no feature work can start.

## The Outcome We Want

When this unit is done, all of the following are TRUE:

1. **Every box in `PROJECT_SETUP_BMMP.md` §10 that is not marked `[owner]` is checked**, and checked because it was verified — not because it was written.
2. **The application runs on fake data and cannot be made to run on anything else by accident.** `DATA_ADAPTER` selects the implementation, an unset or misspelled value stops the process rather than defaulting to fake data, and `mock` is refused outright in production.
3. **Three gates are proven to fire, not merely proven to exist.** Each is deliberately broken once, watched to fail, and restored:
   - the data-seam check, on a Supabase import placed where it does not belong
   - the adapter selector, on an unset value and on a misspelled one
   - the `src/domain/` isolation rule, on an import it must refuse

   **A gate nobody has watched fail is not a gate.** Where the proof can run automatically on every push instead of once by hand, wire it that way — a gate proven once decays silently over 32 weeks.
4. **CI runs on every push and the checks it runs are the checks branch protection will require.** A green tick means lint, formatting, types, tests, build, end-to-end and the data seam all passed.
5. **A build agent opening this repository cold meets Section 8's three rules before it meets any code.**
6. **`docs/` and `briefs/` are inside the repository**, and the formatter cannot touch them.

## Decisions already made — do not re-open these

Cite by ID. Full text in `Decision Log.md`.

- **D-27 — the stack is Next.js 16, not the 15 in older notes.** Two consequences come with it, both non-obvious and both worth knowing before you hit them: Next 16 generates route types into the build output, so type-checking a clean clone requires generating them first or it fails in CI; and the scaffold ships a font import that makes every production build depend on a live fetch to a third-party font host. **Remove that dependency.** A build that fails when someone else's CDN is slow is not a property to carry for 32 weeks. The typeface is a design-system decision belonging to `b1a-00`.
- **D-21 — staging and production are separate Vercel projects backed by separate Supabase projects.** Production credentials never exist in a preview environment. The projects themselves are an `[owner]` item; the environment configuration that assumes two of each is yours.
- **D-16 — the adapter selector fails closed, and the data-seam check is a required status check.**
- **D-15 — mock-data prototype first.** See below.
- **D-25 — the vision provider is unnamed until Gate 1.** Environment keys exist; no vendor name reaches this repository.
- **D-19 — no database migrations.** Not in this unit and not in the next one.

## The framing that governs this unit and the next several

**This product is built as a mock-data prototype first, with no backend, and the backend is written afterward.**

This is not a shortcut and it is not a demo. Real screens, real flows, real logic — running on fake data behind one swap point. **The experience is what determines the backend requirements, not the reverse.** `docs/ERD.md` is a considered design and it is a target the prototype argues with; where a screen shows a field missing, wrong-shaped or unnecessary, the ERD changes before a migration is ever written.

The consequence for this unit: **the swap point is the single most important thing you build.** If any screen can reach past it, migration means rewriting screens instead of writing one adapter, and the entire reason for prototyping first is lost. Everything else in this checklist is ordinary project hygiene. That one thing is load-bearing.

A build agent's instinct is to start with the database. Here that instinct is wrong.

## Scope Guardrails

- **No feature code.** No product screens, no routes beyond what proves the harness boots, no business rules, no authentication flow, no database access.
- **No database migrations.** Nothing may be written to the migrations folder. D-19.
- **No types derived from the ERD or the taxonomy.** That is `b1a-00`'s work and it depends on decisions D-22, D-23 and D-24. Writing them here means writing them twice.
- **Do not edit any file in `docs/`.** Those nine documents plus `_ANCHORS.md` carry **518 cross-document citations that have been verified to resolve.** Renaming an entity or renumbering a rule breaks them silently and no test catches it. If a document appears wrong, that is a judgment call — see below.
- **Do not resurrect anything from `_to_delete\`.**

## Cannot be done by a build agent — leave these and report them

These need account access. Nate does them at the merge gate. Leave the checklist boxes unchecked and name them in your build-notes:

- Connecting the remote and pushing both branches
- Branch protection and selecting the required status checks
- Creating the two Vercel projects and the two Supabase projects
- The error-tracking account and its DSN

**Do not work around a missing account by disabling the thing that needs it.**

## Known hazards

- **The repository is authored on Windows and built on Linux CI.** Without line-ending normalisation, a checkout on either side reports every file as modified and a real diff becomes unreadable.
- **A code formatter will reflow markdown.** It must not be pointed at the canonical documents — see the 518 citations above.
- **`.env.local` must be ignored before it is created**, not after.

## Verification — builder, before handing back

- Every non-`[owner]` box in §10 checked, each verified rather than assumed.
- The full CI sequence passes locally.
- Each of the three gates broken once, watched to fail, and restored — **state in the build-notes what you broke and what you saw.** "The check is wired" is not evidence.
- No secret in version control. No secret behind a browser-visible prefix.
- Working tree clean. Commits small and focused, one logical change each, per §1.

## Out of Scope — do not bundle

- Anything in `briefs/KICKOFF_b1a-00-foundation.md`. That is the next unit and it starts after this one merges.
- Any B1a feature: intake, review queue, containers, storage clock, shipments, document generation.

## What Done Looks Like

The repository exists, runs on fake data, refuses to run on anything else by accident, and every gate protecting that has been watched to fail and restored. CI is green. An agent opening it cold is told the three rules before it is told anything else.

**Reviewed and merged by Nate before `b1a-00-foundation` starts.** You do not merge your own work — D-17.

## Judgment calls come back

If this brief and `PROJECT_SETUP_BMMP.md` disagree, if a document contradicts another, or if something here cannot be done as written — **stop, state the conflict, propose a resolution, and wait.** Do not split the difference and do not pick the reading that is easier to build.

That rule is load-bearing here specifically: a settled decision resolved quietly by a builder lands in the codebase instead of in `Decision Log.md`, and the next person to ask the same question gets a different answer.

## Build notes are part of done

This unit is not finished until `briefs/BUILD_NOTES_b1a-setup.md` exists, recording what was built, what was named what, what deviated from this brief and why, what you broke to prove each gate and what you saw, and which `[owner]` items are outstanding.

`b1a-00` is written against your build-notes. Anything you leave out, it gets wrong.

## References

- `PROJECT_SETUP_BMMP.md` v1.2 — the specification for this unit
- `docs/_ANCHORS.md` — the fixed cross-document contract
- `Decision Log.md` — D-15, D-16, D-17, D-19, D-21, D-25, D-27, D-28
- `briefs/KICKOFF_b1a-00-foundation.md` — the unit that starts when this merges

---

## Verification — reviewer, at the merge gate

- [ ] A fresh clone installs and runs on fake data with no manual repair
- [ ] Each gate demonstrated failing, per the build-notes — not merely present
- [ ] Nothing in `docs/` modified; citations intact
- [ ] Migrations folder empty; no ERD-derived types; no feature code
- [ ] No secret in version control, none behind a browser-visible prefix
- [ ] Outstanding `[owner]` items named, not silently worked around

---

*Next Sketch LLC · Confidential*
