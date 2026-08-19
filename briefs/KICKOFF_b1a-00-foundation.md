# Kickoff Brief — BMMP: Foundation

**Unit:** `b1a-00-foundation` · **Branch:** `feature/b1a-00-foundation`
**Version:** 1.0 · **Date:** 2026-08-11
**Owner:** Nathan Ivy / Next Sketch LLC · **Client:** Jonathan
**Phase:** B1a — Compliance Core (17 Aug – 16 Oct 2026)

**This is the first unit of work in the project. Nothing else starts until it is merged.**

---

## Project Standards

Before writing any code, read the project setup reference in full:

`PROJECT_SETUP_BMMP.md`

Follow every convention defined there — branching, `.gitignore`, environment files, directory structure, linting, formatting, naming, testing and CI. They apply to every task in this project, starting with this one.

**Setup must be complete before this unit begins.** Section 10 of the setup reference is a checklist, and it gates all feature work including this brief. If any box is unchecked, stop and finish setup first.

Three things from that document that this unit depends on directly:

- **§3.2 — the data-layer swap point.** This unit builds it. Read it twice.
- **§8 — three project rules** that gate code review: regulatory rules are data and never code; the battery record is sized wide from the first migration; never output a probability of ignition.
- **Branching: one brief, one branch.** This unit lives on `feature/b1a-00-foundation` and reaches `main` through a pull request that a human reads and merges. You do not merge your own work.

---

## Repository Orientation

| Location | What lives there |
|---|---|
| `docs/` | The canonical documentation stack. Nine documents. Your reading list. |
| `briefs/` | Builder briefs and build-notes, one file per unit. This file is the first entry. |
| `src/types/` | Shared type definitions. **You create these.** |
| `src/data/` | The data layer and the mock/real swap point. **You create this.** |
| `src/domain/` | Business rules as pure TypeScript. **You create the primitives, not the rules.** |
| `src/components/ui/` | shadcn/ui primitives — generated, never hand-edited. |
| `src/components/` | Shared app components used in 2+ places. |
| `src/features/` | One folder per feature area. **Nothing goes here in this unit.** |
| `src/app/` | Routes. **Nothing goes here in this unit.** |
| `supabase/migrations/` | Schema migrations. **Nothing goes here in this unit. See Context.** |

---

## Context

BMMP is battery lifecycle software: identify a battery → assess its condition → grade it → route it → dispose of it or resell it. Phase B1a delivers the compliance core — a business holding dead batteries can log one and produce every document the law actually requires.

**This project ships its first working slice as a mock-data prototype.** Every screen and flow runs on fake data behind a single swap point, and the real backend is written afterward, against a contract the screens have already proven. The reason is not speed — it is that screens reveal what the data model actually needs, and building the model first means guessing and then reshaping it.

**That is why this unit writes no database migrations.** `docs/ERD.md` is a complete, considered schema design, and it is the target. It is not yet a commitment. The prototype's job over the next several units is to argue with it — and where the prototype shows a field missing, wrong-shaped or unnecessary, the ERD changes *before* migration `0001` is ever written. A build agent's instinct is to start with the database. Here that instinct is wrong, and following it forfeits the entire reason for prototyping first.

None of the B1a features — battery intake, the confidence-gated review queue, containers, the storage clock, shipments, document generation — can be built until the shared foundation they all depend on exists. **This unit creates that foundation. No pages. No routes. No features.**

**This unit must be completed and merged before any of the following start:** `b1a-01` battery intake, `b1a-02` review queue, `b1a-03` containers and storage clock, `b1a-04` shipments, `b1a-05` document engine.

---

## Before Writing Any Code

Read all nine documents in full. This is not optional context — these documents are the reason you will not have to invent anything, and every ambiguity you resolve yourself instead of reading is a place this build diverges from the one that was designed.

| Document | Why you read it |
|---|---|
| `docs/VISION.md` | Why this product exists and who it serves. Short. Read it first so the rest has a reason. |
| `docs/PRD.md` | What is being built, the functional and non-functional requirements, and the acceptance criteria this phase is measured against. |
| `docs/BUSINESS_RULES.md` | **The most important document in the stack.** 245 numbered rules across twelve fixed sections, plus 57 numbered edge cases. Every decision the system makes lives here. You will cite these numbers in code comments and in your build-notes. Sections 1, 2, 3, 4, 5, 6, 7 and 12 are B1a and are written to full depth. Sections 8–11 are stubs for later phases — their numbers are reserved so citations stay stable. |
| `docs/TAXONOMY.md` | 47 classification systems — every category, status, label and type in the product, each with its stored value, its display label and its definition. **§5 Label-to-Database Mapping is the section that matters most to you**, because it is the one you would otherwise invent. Stored values are stable machine values; display labels are human text; a renamed label must never require a data migration. |
| `docs/ERD.md` | 32 tables with columns, keys and relationships. Your types derive from this. **Read the never-coerce convention in §2.15** before you write a single fixture. |
| `docs/TECHNICAL_SPEC.md` | Every technical decision, already made. The `DataAdapter` contract shape, the rules-as-data model, the `RuleOutcome<T>` envelope, row-level security, the intake pipeline pattern, and §5.1.1's boot guard — which this unit implements. |
| `docs/SITE_ARCHITECTURE.md` | The eighteen B1a routes, the four core user flows, and the per-route, per-role capability map. You build the *shape* of that map in this unit, not the routes. |
| `docs/UX_SPEC.md` | The design system, component specs and states. You build base primitives from §2; you build no screens. |
| `docs/RUNBOOK.md` | How this runs in production. Read the failure modes — several of them are caused by foundation code, and knowing them changes how you write it. |

Every one of those paths exists. If one does not resolve, stop and report it rather than working around it.

**Two reading rules specific to this project:**

1. When a document tells you what a decision is, cite the rule number rather than restating the logic. `// Rule 2.14 — any low-confidence field routes the whole record to review` is right. Reimplementing the rule's prose in a comment is not.
2. Where two documents disagree, they have been reconciled — but if you find a case that survived, **it is a judgment call and it comes back to the owner.** Do not split the difference. A builder choosing between two documented behaviours is how a product ends up with both.

---

## What to Build

Outcomes. What exists when this unit is done.

**1 — Shared types, derived from the ERD and the taxonomy.**
Every entity in `docs/ERD.md` has a TypeScript type. Every classification system in `docs/TAXONOMY.md` has a typed value set using the exact stored values, with the display label as separate data rather than baked into the type. Types are `PascalCase` singular; stored values are exactly as taxonomy states them. The battery record type holds small mobility-device packs alongside vehicle, consumer and industrial batteries — that width is stated in `docs/TECHNICAL_SPEC.md` §4 with eight criteria, and narrowing it here makes a four-week phase in March a rebuild.

**2 — The `DataAdapter` contract.**
The interface every adapter must satisfy, per `docs/TECHNICAL_SPEC.md` §5. Written before either implementation, because it is the thing both implementations are held to. Every method carries the `RequestContext` the spec defines.

**3 — The mock adapter, with fixtures that are not friendly.**
A working in-memory implementation returning realistic records. The fixture set must include the cases that break naive screens: a scuffed label the extraction reads poorly, a battery with no catalog match, a small mobility-scooter pack sitting beside a vehicle pack, a swollen pack that sets the damaged-or-defective flag, a container past its accumulation period in the hard `overdue` state, and a record mid-review with per-field confidence spread across bands. Friendly fixtures produce screens that fall over on contact with real data.

**4 — The adapter selector, with the boot guard.**
`src/data/index.ts` per `docs/TECHNICAL_SPEC.md` §5.1.1 — an allow-list selector that **throws at module load** on an unset, empty or unrecognised `DATA_ADAPTER` value, and hard-refuses `mock` in production. The naive ternary in the setup reference fails open to the mock, and a production deployment silently serving fake compliance documents is the worst failure this product can have. CI cannot catch it because CI cannot see deployment environment values, so the guard runs in the process.

**5 — Domain primitives, not domain rules.**
The `RuleOutcome<T>` envelope from `docs/TECHNICAL_SPEC.md` §6, which makes recording the applied rule version structurally unavoidable, and the lookup shape for reading a `jurisdiction_rule` at the version in force on a given date. **The rules themselves are not in this unit.** You are building the thing rules will be written into. `src/domain/` imports nothing from `app`, `components`, `features`, `data` or `lib`.

**6 — Base UI primitives.**
shadcn/ui installed and configured. The design tokens from `docs/UX_SPEC.md` §Design System Reference — this is a tool used all day in a warehouse and on a phone in a storage room, so the contrast, type scale and touch-target rules there are requirements, not preferences. The shared components that more than one future screen needs: a status badge that renders any taxonomy status from its stored value, a confidence-band display, an alert card. Each renders in isolation with every state from the UX spec. **No screen assembles them.**

**7 — The role→capability map, as a shape.**
Per `docs/SITE_ARCHITECTURE.md`, a per-route, per-role map of `none` / `read` / `write` — not booleans. A boolean map cannot express P2's view-only access to the review queue and would be rewritten within one phase. Build the structure and its type. **No route consumes it yet.**

**8 — The test harness, proven.**
One unit test, one integration test and one end-to-end test that each genuinely exercise something and pass. The e2e runs against `DATA_ADAPTER=mock`. The CI data-seam check from the setup reference is wired and **proven to fail** on a deliberate bad import, then reverted — a gate nobody has watched fail is not a gate.

---

## Not in This Unit

- **No pages and no routes.** Nothing in `src/app/` beyond what the scaffold created.
- **No features.** Nothing in `src/features/`.
- **No Supabase adapter.** The contract exists; the real implementation is written after the prototype settles the screens.
- **No database migrations.** Nothing in `supabase/migrations/`. See Context — this is deliberate and it is the point.
- **No business rules implemented.** The primitives that rules will use, not the rules.
- **No vision model, no label extraction, no catalog matching.** The intake pipeline is a later unit.
- **No authentication flow.** The role and capability *types* exist; sign-in does not.
- **No document generation.**

If any of these appears in the diff, the unit is not done — it is two units, and the second one was never briefed.

---

## Definition of Done

- Every entity in `docs/ERD.md` has a type; every system in `docs/TAXONOMY.md` has a typed value set using its exact stored values.
- The `DataAdapter` contract compiles and the mock adapter satisfies it completely — no method stubbed with a `TODO`.
- The boot guard throws on an unrecognised `DATA_ADAPTER`, and there is a test proving it.
- Every base component renders in isolation with every state the UX spec defines for it.
- Gates pass: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm test:e2e` · the data-seam check.
- No `any` in committed code.
- A pull request is open against `staging` for a human to read and merge. You do not merge it.
- **Build-notes written to `briefs/BUILD_NOTES_b1a-00-foundation.md`:** what was created, what was named what, and any deviation from the documents — flagged, not silently resolved. The next five briefs depend on your naming, and they will cite your build-notes rather than re-reading your code.

---

## Judgment Calls

Anything ambiguous comes back to the owner with a recommendation. It does not get silently resolved.

This applies with particular force to three things:

1. **A gap in the documents.** If the ERD, the taxonomy and the business rules do not between them tell you what to name something or how it behaves, that is a documentation defect and the fix belongs in the document, not in your code. Report it.
2. **A contradiction between documents.** They have been reconciled across a full sweep, but if one survived, report it. Do not choose.
3. **Anything that would narrow the battery record**, hard-code a jurisdiction threshold, or express a hazard as a probability. Those three are review rejections, not preferences. If a document appears to ask for one, the document is wrong — report it.

A "hold" from the owner is a full stop.

---

*Next Sketch LLC · Confidential · August 2026*
