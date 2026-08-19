# Technical Spec — BMMP
**Version:** 1.0 · **Date:** 2026-08-11 · **Owner:** Nathan Ivy / Next Sketch LLC
**Answers:** How will it be built?
**Reads from:** `_ANCHORS.md` · `PROJECT_SETUP_BMMP.md` · `PRD.md` · `SITE_ARCHITECTURE.md` · `UX_SPEC.md` · `BUSINESS_RULES.md` · `TAXONOMY.md`  ·  **Feeds:** `ERD.md` · `RUNBOOK.md` · `briefs/`

> ## REVIEW NOTES
> None open. All review notes for this document were answered on 2026-08-19 — see `Decision Log.md` **D-20** for the full disposition, and D-21 through D-26 for the calls that carry their own rationale. Content below is unchanged.

---

## 1. System Overview

### 1.0 Where the standard sections are

The Technical Spec anatomy maps onto this document as follows. Four extra sections (§4, §5, §6, §8) exist because `_ANCHORS.md` §0 and `PROJECT_SETUP_BMMP.md` §3.2 and §8 name them as the decisions that make or break a later phase.

| Anatomy section | Here |
|---|---|
| System Overview | §1 |
| Tech Stack | §2 |
| Data Model | §3 (summary and conventions) → full schema in `ERD.md`; §4 the canonical record |
| API Design | §7 |
| Business Logic | §11 (placed after §6, §8, §9 and §10 so it can cite them rather than forward-reference them) |
| Auth and Permissions | §9 |
| Error Handling | §10 |
| Dependencies and Integrations | §12 |
| *(project-specific)* | §5 the data-layer swap point · §6 rules as data · §8 document generation |

### 1.1 What is being built

A multi-tenant Next.js application over Postgres that follows a battery through the end of its life — identify it, assess its condition, grade it, route it, dispose of it or resell it — and produces the documents the law requires at each step.

Three properties drive every technical decision in this document, and each one is load-bearing:

1. **The canonical battery record is sized wide from the first migration.** One record type holds a small mobility-device pack, a consumer cell, an industrial pack and a vehicle traction pack. See §4.2. This is why Phase B3 is four weeks.
2. **Regulatory rules are data.** `jurisdiction`, `jurisdiction_rule` and `rule_version` are real tables. Every threshold, deadline, citation and fire-code limit is a row with an effective date. Every evaluation stamps the `rule_version` it used onto the row it produced, so a decision made today can be reproduced in 2029. See §6.
3. **All data access goes through `src/data`.** The first shipped slice runs on mock data; the Supabase adapter is written later against the same contract. See §5. CI fails the build if this leaks.

### 1.2 Runtime topology

| Concern | Decision |
|---|---|
| Rendering | React Server Components by default. Client Components only for interactive widgets (forms, crop box, filters). No tenant data is fetched from the browser except through Server Actions. |
| Runtime | **Node.js runtime for every route and Server Action.** Not Edge. `@react-pdf/renderer`, `sharp` and `node:crypto` require Node APIs, and a compliance product cannot have two rendering environments with different float and font behaviour. |
| Middleware | `src/middleware.ts` runs on Edge and does exactly one thing: refresh the Supabase session cookie and redirect unauthenticated requests. It imports from `src/lib/supabase/middleware.ts`, never from `@supabase/*` directly — see §5.4. |
| Region | Single region. Vercel `iad1`, Supabase project in the same region. Cross-region latency on a document render is not worth the availability story at this stage. |
| Background work | Vercel Cron hitting authenticated route handlers (§7.2). No separate worker service in B1a. |
| File storage | Supabase Storage, private buckets only. No public bucket exists in this project. |

### 1.3 Layering

```
app/ ─────────────┐  routes, layouts, error boundaries, route handlers
features/ ────────┤  server actions, feature views, feature-only components
components/ ──────┤  shared UI
       │
       ▼
src/data (contracts) ──── the only door to persistence ────► mock | supabase
       │
       ▼
src/domain ────────────── pure TypeScript. Every business rule lives here.
                          No React. No Supabase. No fetch. No env reads.
src/lib ───────────────── framework glue: supabase clients, vision provider,
                          recall provider, pdf renderer, logger, auth helpers
```

`src/domain` receives data as arguments and returns decisions. It never reaches for anything. That is what makes every rule in `BUSINESS_RULES.md` unit-testable without a database, and it is enforced by lint rule, not by convention (§5.4).

### 1.4 Non-functional targets

| Property | Target | Why it is here |
|---|---|---|
| Intake pipeline, photo to confirmation screen | p95 under 12s | P1 is standing at a pallet with a phone. |
| Document render to stored PDF | p95 under 4s, hard timeout 30s | A failed render blocks a shipment; it must fail loudly and fast (§10.4). |
| List pages | p95 under 800ms at 50k `battery_record` rows per tenant | Ordinary index work, stated so it is not discovered late. |
| Tenant isolation | Enforced in Postgres, not in application code | §9. A leak here is fatal to the product, not inconvenient. |
| Audit completeness | Every state change produces an `audit_event`, or the transaction rolls back | §10.2. |

---

## 2. Tech Stack

Every row is fixed by `PROJECT_SETUP_BMMP.md` §1 unless marked **added here**. Nothing in this section may contradict that document.

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| Framework | **Next.js 15, App Router, React 19** | Server Components let a compliance UI read through `src/data` on the server with no client-side data layer to secure twice. Route groups map 1:1 to the access tiers in `_ANCHORS.md` §5. |
| Language | **TypeScript, `strict: true`, `noUncheckedIndexedAccess: true`** | `noUncheckedIndexedAccess` is what stops a missing extracted field being read as a value instead of `undefined` — precisely the failure mode a label reader produces. `any` is not permitted; narrow `unknown`. |
| Package manager | **pnpm** | Per setup. Lockfile is authoritative; CI uses `--frozen-lockfile`. |
| Styling | **Tailwind CSS + shadcn/ui** | shadcn components are copied into `src/components/ui` and owned, so accessibility fixes on a form P1 uses in a warehouse are ours to make. Generated files are not hand-edited. |
| Validation | **Zod** — *added here* | One schema per boundary: Server Action input, route handler body, vision provider response, `rule_version.payload`. A vision model that fabricates a field is caught by schema validation before it reaches a row. This is a named mitigation in the research sweep §2.1. |
| Database | **Postgres via Supabase** | Row-level security is the reason. Tenant isolation and P5's read-only status are database facts, not UI behaviour (§9). Also gives us exclusion constraints, generated columns and `jsonb` — all used in `ERD.md`. |
| Auth | **Supabase Auth** | Same trust boundary as the database, so `auth.uid()` is available inside every policy. No second identity system to reconcile. |
| Object storage | **Supabase Storage, private buckets** — *added here* | Photos and rendered legal documents sit behind the same identity. Signed URLs are minted server-side after an authorization check (§7.1). |
| PDF rendering | **`@react-pdf/renderer`** — *added here* | Chosen over headless Chromium. Legal documents need point-precise, reproducible layout (a marking with a minimum height, a fixed field sequence). React-pdf is pure JS, has no browser binary to ship to a serverless function, and renders identically in CI and production. Headless Chromium's layout drifts across versions, which would break §8's "a reprint proves it is the same document." |
| QR generation | **`qrcode`** — *added here* | Container labels carry a QR to the container record. Rendered to a PNG buffer and embedded in the PDF. Deterministic output for a given payload. |
| Image processing | **`sharp`** — *added here* | Server-side label crop, EXIF strip, downscale. Deterministic given the same geometry, which matters because the crop is stored as its own immutable record (§11.1). |
| Dates | **`date-fns` + `@date-fns/tz`** — *added here* | The accumulation clock has day boundaries in the storage site's timezone, not the server's or the user's (§6.4). A timezone-naive date library is how that bug ships. |
| Unit/integration tests | **Vitest** | Everything in `src/domain` is pure, so rule coverage is cheap. Target: every numbered rule in `BUSINESS_RULES.md` has at least one passing and one failing case. |
| E2E | **Playwright** | The same suite runs against `DATA_ADAPTER=mock` and `DATA_ADAPTER=supabase`. That is the proof the seam held (§5.5). |
| Lint / format | **ESLint flat config + Prettier + `prettier-plugin-tailwindcss`** | Plus two project-specific rules that enforce the layering (§5.4). |
| CI | **GitHub Actions** | Per setup §6, including the data-seam check as a required status check. |
| Hosting | **Vercel** | Staging auto-deploys, production requires manual promotion. |
| Error reporting | **Sentry, optional** — *added here* | Behind `SENTRY_DSN`. If unset, the reporter is a no-op and structured stdout logging is the whole story. Never a required dependency for a document to render. |

**Deliberately not used:** an ORM (the adapter contract is the abstraction; a second one would fight RLS), a client-side data-fetching library, Postgres `enum` types (§4.5), Edge runtime for application routes, any vision vendor SDK imported outside `src/lib/vision/providers/`.

**New environment variables introduced by this spec.** Each is added to `.env.example` in the same commit that first reads it, per setup §2.

| Key | Server only | Purpose |
|---|---|---|
| `VISION_PROVIDER` | yes | Selects the `VisionProvider` implementation. `fixture` in CI and under `DATA_ADAPTER=mock`. |
| `CPSC_RECALL_BASE_URL` | yes | Consumer/mobility recall source. Complements the existing `NHTSA_RECALL_BASE_URL` (vehicle source). Both free, both unauthenticated (§11.2). |
| `HEALTH_TESTER_WEBHOOK_SECRET` | yes | HMAC key for the B3 tester socket (§11.3). |
| `SENTRY_DSN` | yes | Optional. Unset means no-op. |

---

## 3. Data Model — summary

**The full schema is `ERD.md`.** It is the single source of truth for columns, types, keys and cardinality. This section states the shape and the conventions so the ERD reads unambiguously.

### 3.1 Shape

Thirty-two tables in `public`, grouped as `_ANCHORS.md` §3 groups them: tenancy and identity (4), battery and identification (6), storage and containers (5, including `alert`), classification and documents (5), condition (4), rules as data (6, including `format_classification`), evidence and audit (2). Supabase's `auth.users` is referenced but is not one of the thirty-two.

Every table in the first migration set — including the B1b and B2 tables — is created with its columns, its foreign keys, its RLS policies and its audit trigger from the start, and simply carries no rows until its phase. Creating them later means re-deriving the tenancy and audit wiring three times. See RN-4 in `ERD.md`.

### 3.2 Conventions, fixed

| Convention | Rule |
|---|---|
| Naming | `snake_case` tables and columns, singular table names, exactly the names in `_ANCHORS.md` §3. **`user` is a reserved word in Postgres** — the table is created as `public."user"` and every reference quotes it. It is not renamed to `users`. |
| Primary keys | `id uuid primary key default gen_random_uuid()`. `audit_event` additionally carries `sequence_no bigint generated by default as identity unique` for total ordering. |
| Timestamps | `timestamptz` always, stored UTC, defaulted `now()`. The application never supplies `created_at`. Wall-clock interpretation happens once, in the site timezone, and only where a rule says so (§6.4). |
| Numbers | `numeric(p,s)` for every quantity a rule reads or a document prints. Never `float`/`double precision`. Mass is stored in kilograms, energy in watt-hours, volume in cubic metres — SI only, one unit per concept. Rule payloads declare their own unit and conversion happens in exactly one module, `src/domain/units.ts`. |
| Text | `text`, never `varchar(n)`. |
| Codes | Classification values live in columns suffixed `_code` and typed `text`. Valid values are governed by `TAXONOMY.md` and validated by Zod in `src/domain`; they are **not** Postgres enums and **not** CHECK lists — adding a jurisdiction category must not require a migration. |
| Booleans that carry legal weight | Where an outcome is legal rather than descriptive (`ddr_flags`, `is_air_transport_prohibited`), it is a boolean set by a rule evaluation and accompanied by the `rule_version` that set it — not a free string. |
| Deletes | `on delete restrict` is the default on every foreign key. Compliance records are not deleted. Retirement is a status change plus an `audit_event`. |
| Tenancy | Every tenant-scoped table carries `organization_id uuid not null references organization(id)`. Platform tables (`jurisdiction`, `jurisdiction_rule`, `rule_version`) carry none. `catalog_entry` carries a nullable one: `null` means a platform-owned global entry. |
| Human-readable numbers | Per-organization counters (`organization.battery_record_seq`, `.container_seq`, `.lot_seq`, `.shipment_seq`) are incremented inside the same transaction as the insert, under the organization row lock. No counter table, no race, genuinely sequential. |
| Migrations | `supabase/migrations`, numbered, forward-only. A shipped migration is never edited. Reference rule data (jurisdictions, rules, versions) ships **as migrations**, not as `seed.sql` — production needs it. `seed.sql` holds only local demo tenants. **No migration ever coerces a retired taxonomy value** — see `ERD.md` §2.15. |

### 3.3 Migration order

`0001` extensions and helper functions · `0002` tenancy · `0003` rules-as-data, including `format_classification` · `0004` catalog · `0005` **battery_record, wide** · `0006` intake · `0007` storage, containers and `alert` · `0008` classification and documents · `0009` condition · `0010` producer obligations and evidence · `0011` audit triggers · `0012` storage buckets and policies · `0013` `commit_intake_confirmation` RPC · `0014`+ reference rule data.

`0005` is the one that must be right the first time. See §4.2.

---

## 4. The canonical battery record

### 4.1 Battery Pass is adopted, not reinvented

Per Roadmap Principle 6, the [Battery Pass data model](https://github.com/batterypass/BatteryPassDataModel) (CC-BY-4.0, ships JSON Schema, OpenAPI and JSON-LD) is adopted as the backbone of `battery_record` rather than designing a schema from scratch.

**What is adopted directly**, with Battery Pass attribute names carried across into `snake_case` columns: general battery and manufacturer information (category, status, manufacturer identity and place, manufacturing date, brand, model, mass, chemistry, form factor); performance and durability nameplate values (nominal/min/max voltage, rated capacity, rated energy, original power, expected lifetime in cycles, operating temperature range, internal resistance, C-rate); materials and composition, carbon footprint, circularity and dismantling information (`jsonb`, since no BMMP rule reads inside them in B1a); labels and conformity (certification marks, UN 38.3 test summary availability, separate collection symbol).

**Why adopt it:** it is free, it is public, and it is the schema a European passport export would have to produce anyway. Adopting it now makes that export a serialisation exercise instead of a rebuild — which is the entire point of Principle 6, and it costs nothing today. It also means the column names have an external definition, so two engineers cannot disagree about what `rated_energy_wh` means.

**Where BMMP extends it, and why each extension exists:**

| Extension | Why Battery Pass does not cover it |
|---|---|
| `state_of_charge_percent_at_intake` + source + assessed-at | Battery Pass describes a battery in service. BMMP needs the charge state at the moment of intake because it drives storage and transport handling. |
| `assessed_condition` + `condition_confirmed_by` / `_at` | Battery Pass has no end-of-life condition concept. Note the word: **assessed**, never *measured*. BMMP integrates third-party health testers (§12.4); it does not measure health itself. |
| `ddr_flags`, `is_air_transport_prohibited` | Transport-regulatory outcomes, set by rule evaluation, not product attributes. |
| `date_code_raw` + `date_code_decode_id` | Battery Pass has a manufacturing date; it has no notion of a printed code that must be decoded and whose decode must be auditable. |
| `source_device_*` provenance block (device type, identifier/VIN, make, model, model year, recorded-at, source) | The named failure mode in this industry is that the link between a pack and the device it came out of gets severed. Being the system that preserves it is a durable advantage. Battery Pass assumes that link. |
| `removability` | Statutory criteria in the state producer-obligation rules that B1b evaluates. Battery Pass records them for design purposes, not for threshold evaluation. |
| Chemistry provenance: `chemistry_source`, `chemistry_confirmed_by`, `chemistry_confirmed_at`, `catalog_entry_id` | Battery Pass states a chemistry as fact. BMMP must record **how it was established** — matched from the catalog and confirmed by a human. Chemistry is never inferred from an image. |
| Tenancy, lifecycle, containment: `organization_id`, `record_number`, `status`, `container_id`, `intake_session_id` | Application concerns Battery Pass has no opinion on. |
| `passport_extension jsonb` | Battery Pass attributes no BMMP rule reads and no BMMP document prints. See RN-5 in `ERD.md` for the boundary rule. |

### 4.2 Sized wide from the first migration — and what that means concretely

`battery_record` holds a 24-volt sealed lead-acid power-wheelchair pack, a mobility scooter pack, a single consumer cell, an industrial pack and a vehicle traction pack **in the same table, from migration `0005`**. Phase B3 is a four-week phase on that assumption. If this record is built narrow, B3 is a rebuild, not an activation (Roadmap, B3 and Risks; setup §8.2).

Built wide means all of the following, verifiable by reading `ERD.md`:

1. **No column is named or scaled for one battery class.** `battery_mass_kg` is `numeric(10,3)` — it holds a 0.045 kg coin cell and a 600 kg traction pack without a second column and without loss. `rated_energy_wh` is `numeric(12,3)`, spanning a mobility pack and a vehicle pack.
2. **No CHECK constraint assumes a minimum size, a chemistry, or a form factor.** There is no `check (battery_mass_kg > 5)` anywhere, and there never will be. Size-based behaviour is a rule row, not a constraint.
3. **`application_class` includes the medium-format category that covers scooter and mobility packs from `0005`.** It is not added at B3. Values are governed by `TAXONOMY.md`; the base set is adopted from the Battery Pass battery-category attribute and extended by BMMP.
4. **Lead-acid is a first-class chemistry from day one**, not a lithium schema with an exception. Mobility devices are mid-transition between sealed lead-acid and lithium, so both appear in the same tenant simultaneously and both must classify, store, ship and document correctly. Nothing in the schema assumes lithium.
5. **Cell/module structure is nullable, not required.** `cell_count`, `module_count`, `cell_form_factor` are nullable because a consumer cell has no modules and a mobility pack rarely publishes cell counts. A NOT NULL here would force fake data.
6. **Provenance covers devices, not just vehicles.** `source_device_identifier` is `text` and holds a VIN, a wheelchair serial, a scooter serial or an equipment asset tag. It is not named `vin`.
7. **Air-transport fields exist from `0005`.** Mobility packs travel by air with their owner; B3's air-travel documentation reads `rated_energy_wh`, `ddr_flags` and `is_air_transport_prohibited`, all of which exist already.
8. **Every jurisdiction rule that will ever apply to a mobility pack can be evaluated against columns that already exist** — mass, energy, voltage, chemistry, category, removability, replaceability. B3 activates rule rows; it does not add columns.

**The rule for builders, stated so there is no room for interpretation:** widening `battery_record` after `0005` for a battery class that was known in August 2026 is a defect, not a feature. If a B3 brief needs a new column on `battery_record` for a mobility pack, this specification failed and the gap is escalated at the gate rather than patched.

---

## 5. The data layer — the swap point

This section implements `PROJECT_SETUP_BMMP.md` §3.2 and may not contradict it.

### 5.1 The rule

No page, layout, component, hook, Server Action or route handler talks to Supabase. Everything goes through `src/data`. `src/data/index.ts` selects an adapter from `DATA_ADAPTER` and exports it; nothing else in the codebase knows which is running.

`DATA_ADAPTER` is read in exactly one file — `src/data/index.ts`. A second read anywhere is a lint failure (§5.4).

### 5.1.1 The boot guard — `DATA_ADAPTER` fails closed, never open

`PROJECT_SETUP_BMMP.md` §3.2 sketches the selector as `process.env.DATA_ADAPTER === 'supabase' ? supabaseAdapter : mockAdapter`. **Shipped literally, that ternary fails open:** an unset, empty, misspelled or wrongly-cased value silently selects the mock adapter, and a production deployment serves fake batteries, fake storage clocks and fake shipping papers to a real customer with no error anywhere. On a compliance product that is the worst available failure mode — it looks like it is working.

**CI structurally cannot catch this.** GitHub Actions cannot read Vercel's environment values, so the data-seam check in §5.4 proves the *seam* holds and can say nothing about which adapter a deployed instance actually chose. The guard therefore has to run at boot, in the process that will serve the request.

```ts
// src/data/index.ts — the ONLY file that reads DATA_ADAPTER
import { mockAdapter } from './mock'
import { supabaseAdapter } from './supabase'
import type { DataAdapter } from './contracts'

const ADAPTERS = { mock: mockAdapter, supabase: supabaseAdapter } as const
type AdapterName = keyof typeof ADAPTERS

const raw = process.env.DATA_ADAPTER

function selectAdapter(): DataAdapter {
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      'BOOT: DATA_ADAPTER is not set. There is no default. ' +
      `Set it to one of: ${Object.keys(ADAPTERS).join(', ')}.`,
    )
  }
  const name = raw.trim()
  if (!(name in ADAPTERS)) {
    throw new Error(
      `BOOT: DATA_ADAPTER="${name}" is not a recognised adapter. ` +
      `Expected one of: ${Object.keys(ADAPTERS).join(', ')}. ` +
      'Refusing to start rather than falling back to mock data.',
    )
  }
  // Belt and braces: mock data must never reach a production deployment.
  if (name === 'mock' && process.env.VERCEL_ENV === 'production') {
    throw new Error(
      'BOOT: DATA_ADAPTER=mock in a production deployment. Refusing to start.',
    )
  }
  return ADAPTERS[name as AdapterName]
}

export const data: DataAdapter = selectAdapter()
export const activeAdapterName: AdapterName = (raw as AdapterName)?.trim?.() as AdapterName
```

Four properties, each load-bearing:

1. **No default and no fallback branch.** Unset throws. Unrecognised throws. There is no `else` that quietly picks one, and `'Supabase'`, `'supabse'` and `' supabase'`-with-whitespace are all caught — the first two by the allow-list, the third by the trim.
2. **Fails closed at boot, not at first query.** The throw happens at module load, so the deployment fails visibly instead of serving convincing fake data for a week.
3. **A production deployment can never run on mock**, independent of anyone remembering to set the value correctly.
4. **`activeAdapterName` is surfaced by `GET /api/health` (§7.2)** so which adapter a running instance chose is externally checkable — the property `RUNBOOK.md`'s monitoring section needs and the one CI cannot supply. A production health check reporting `mock` is a page-someone alert, not a log line.

The same fail-closed discipline applies to `VISION_PROVIDER` in `src/lib/vision/index.ts`: unrecognised throws at boot rather than defaulting to the fixture provider, because a production instance quietly serving canned extraction results is the same defect wearing different clothes.

### 5.2 The contract shape

`src/data/contracts/` holds one file per entity plus `index.ts` composing them. Every method takes a `RequestContext` as its first argument. **This is not optional and it is the reason the swap works:** the mock adapter has no row-level security, so it must enforce tenant scope and role in code, or the Playwright suite passes on mock and leaks on Supabase.

```ts
// src/data/contracts/context.ts
export interface RequestContext {
  readonly userId: string
  readonly organizationId: string      // the active organization for this request
  readonly role: RoleCode              // TAXONOMY role code for this user in this org
  readonly isPlatformAdmin: boolean
  readonly correlationId: string       // threads one user action through logs and audit_event
}
```

```ts
// src/data/contracts/repository.ts
export interface Page<T> { readonly items: readonly T[]; readonly total: number; readonly cursor: string | null }
export interface PageRequest { readonly limit: number; readonly cursor?: string | null }

/** Standard mutable entity. */
export interface Repository<T, TCreate, TUpdate, TQuery> {
  list(ctx: RequestContext, query: TQuery & PageRequest): Promise<Page<T>>
  get(ctx: RequestContext, id: string): Promise<T | null>
  create(ctx: RequestContext, input: TCreate): Promise<T>
  update(ctx: RequestContext, id: string, input: TUpdate): Promise<T>
}

/** Append-only entity. Structurally cannot be updated: there is no update method. */
export interface AppendOnlyRepository<T, TCreate, TQuery> {
  list(ctx: RequestContext, query: TQuery & PageRequest): Promise<Page<T>>
  get(ctx: RequestContext, id: string): Promise<T | null>
  append(ctx: RequestContext, input: TCreate): Promise<T>
}
```

**Which entities get which interface.** `AppendOnlyRepository`: `audit_event`, `tos_acceptance`, `intake_photo`, `label_extraction`, `date_code_decode`, `classification_decision`, `format_classification`, `shipping_paper`, `container_label`, `document_render`, `damage_assessment`, `storage_event`, `grade`, `hazard_ranking`. `Repository`: everything else. A correction to an append-only record is a **new row** carrying `supersedes_*_id`; the superseded row stays and stays readable. Immutability is expressed three times — no method on the contract, no UPDATE/DELETE policy in Postgres, and a trigger that raises even for the service role (§9.5).

```ts
// src/data/contracts/index.ts
export interface DataAdapter {
  readonly organizations: Repository<Organization, CreateOrganization, UpdateOrganization, OrganizationQuery>
  readonly users: Repository<User, CreateUser, UpdateUser, UserQuery>
  readonly memberships: Repository<Membership, CreateMembership, UpdateMembership, MembershipQuery>
  readonly tosAcceptances: AppendOnlyRepository<TosAcceptance, CreateTosAcceptance, TosAcceptanceQuery>

  readonly batteryRecords: Repository<BatteryRecord, CreateBatteryRecord, UpdateBatteryRecord, BatteryRecordQuery>
  readonly catalogEntries: CatalogRepository            // Repository + findCandidates, see §11.1
  readonly intakeSessions: IntakeRepository             // Repository + commitConfirmation, see below
  readonly intakePhotos: AppendOnlyRepository<IntakePhoto, CreateIntakePhoto, IntakePhotoQuery>
  readonly labelExtractions: AppendOnlyRepository<LabelExtraction, CreateLabelExtraction, LabelExtractionQuery>
  readonly dateCodeDecodes: AppendOnlyRepository<DateCodeDecode, CreateDateCodeDecode, DateCodeDecodeQuery>

  readonly containers: Repository<Container, CreateContainer, UpdateContainer, ContainerQuery>
  readonly lots: Repository<Lot, CreateLot, UpdateLot, LotQuery>
  readonly storageClocks: Repository<StorageClock, CreateStorageClock, UpdateStorageClock, StorageClockQuery>
  readonly storageEvents: AppendOnlyRepository<StorageEvent, CreateStorageEvent, StorageEventQuery>
  readonly alerts: Repository<Alert, CreateAlert, AcknowledgeAlert, AlertQuery>   // update = acknowledge/resolve only

  readonly classificationDecisions: AppendOnlyRepository<ClassificationDecision, CreateClassificationDecision, ClassificationDecisionQuery>
  readonly shipments: ShipmentRepository                // Repository + offer(), see §7.3
  readonly shippingPapers: AppendOnlyRepository<ShippingPaper, CreateShippingPaper, ShippingPaperQuery>
  readonly containerLabels: AppendOnlyRepository<ContainerLabel, CreateContainerLabel, ContainerLabelQuery>
  readonly documentRenders: DocumentRenderRepository    // AppendOnly + readBytes/verify, see §8

  readonly damageAssessments: AppendOnlyRepository<DamageAssessment, CreateDamageAssessment, DamageAssessmentQuery>
  readonly grades: AppendOnlyRepository<Grade, CreateGrade, GradeQuery>                       // B2
  readonly hazardRankings: AppendOnlyRepository<HazardRanking, CreateHazardRanking, HazardRankingQuery> // B2
  readonly recallMatches: Repository<RecallMatch, CreateRecallMatch, UpdateRecallMatch, RecallMatchQuery> // B2

  readonly jurisdictions: Repository<Jurisdiction, CreateJurisdiction, UpdateJurisdiction, JurisdictionQuery>
  readonly jurisdictionRules: Repository<JurisdictionRule, CreateJurisdictionRule, UpdateJurisdictionRule, JurisdictionRuleQuery>
  readonly ruleVersions: RuleVersionRepository          // AppendOnly once published, + resolve(), see §6.2
  readonly formatClassifications: AppendOnlyRepository<FormatClassification, CreateFormatClassification, FormatClassificationQuery>
  readonly producerObligations: Repository<ProducerObligation, CreateProducerObligation, UpdateProducerObligation, ProducerObligationQuery>   // B1b
  readonly obligationDeadlines: Repository<ObligationDeadline, CreateObligationDeadline, UpdateObligationDeadline, ObligationDeadlineQuery>   // B1b
  readonly evidencePacks: Repository<EvidencePack, CreateEvidencePack, UpdateEvidencePack, EvidencePackQuery>                                  // B1b

  readonly auditEvents: AppendOnlyRepository<AuditEvent, CreateAuditEvent, AuditEventQuery>

  /** Object storage. Same seam — no bucket name reaches a feature file. */
  readonly objects: ObjectStore
}
```

**Four repositories are wider than CRUD, and each one is wider for a stated reason.** These are the operations that must be atomic; splitting them into separate calls is how a half-committed intake or a shipment with no paper reaches production.

```ts
export interface IntakeRepository extends Repository<IntakeSession, CreateIntakeSession, UpdateIntakeSession, IntakeSessionQuery> {
  /** One transaction: writes battery_record, links catalog_entry, records confirmations,
   *  inserts date_code_decode + damage_assessment + classification_decision, starts the
   *  storage_clock, closes the session, and writes every audit_event. All or nothing. */
  commitConfirmation(ctx: RequestContext, input: IntakeConfirmation): Promise<BatteryRecord>
}

export interface CatalogRepository extends Repository<CatalogEntry, CreateCatalogEntry, UpdateCatalogEntry, CatalogQuery> {
  /** Retrieval only. Ranking is pure domain code — see §11.1. */
  findCandidates(ctx: RequestContext, filter: CatalogCandidateFilter): Promise<readonly CatalogEntry[]>
}

export interface ShipmentRepository extends Repository<Shipment, CreateShipment, UpdateShipment, ShipmentQuery> {
  /** Transitions a shipment to offered only if a shipping_paper and its document_render exist.
   *  The database enforces this too (§10.4); the contract makes it a single call so the UI
   *  cannot construct the invalid intermediate state. */
  offer(ctx: RequestContext, shipmentId: string, input: OfferShipment): Promise<Shipment>
}

export interface DocumentRenderRepository extends AppendOnlyRepository<DocumentRender, CreateDocumentRender, DocumentRenderQuery> {
  readBytes(ctx: RequestContext, id: string): Promise<{ bytes: Uint8Array; contentHash: string; byteSize: number }>
  verify(ctx: RequestContext, id: string): Promise<DocumentVerification>   // §8.4
}

export interface RuleVersionRepository extends AppendOnlyRepository<RuleVersion, CreateRuleVersion, RuleVersionQuery> {
  /** Resolves a rule for a jurisdiction chain at a point in time. Deterministic. §6.2 */
  resolve(ctx: RequestContext, req: RuleResolutionRequest): Promise<ResolvedRuleSet>
  publish(ctx: RequestContext, id: string): Promise<RuleVersion>           // P6 only, one-way
}

export interface ObjectStore {
  put(ctx: RequestContext, req: { bucket: BucketKey; path: string; bytes: Uint8Array; contentType: string; immutable: true }): Promise<StoredObject>
  get(ctx: RequestContext, req: { bucket: BucketKey; path: string }): Promise<Uint8Array>
  signedUrl(ctx: RequestContext, req: { bucket: BucketKey; path: string; ttlSeconds: number }): Promise<string>
}
```

**Contract hygiene rules, binding:**

- Contracts import from `src/types` and from each other. They import **nothing** from `@supabase/*`, from `next/*`, or from `src/lib`. A Supabase type in a contract is the leak.
- Every method is `async` and returns a plain serialisable object. No cursors, no query builders, no lazy relations.
- Query objects are explicit typed shapes (`BatteryRecordQuery { status?: string; containerId?: string; search?: string; requiresReview?: boolean; ... }`). No adapter accepts a raw filter string.
- `create`/`append` inputs never include `id`, `organization_id`, `created_at` or `created_by`. The adapter sets them from `ctx`. A caller cannot write into another tenant even by accident.
- Errors are thrown as the `AppError` subclasses in §10.1, by both adapters, with the same codes. A test that asserts on an error code passes on both.

### 5.3 The two implementations

**`src/data/mock/`** — in-memory, seeded from typed fixtures in `src/data/mock/fixtures/`. It enforces `ctx.organizationId` on every read and write and rejects writes from a role that Postgres would reject, using the same role sets as §9.3. Per setup §3.2 the fixtures include the awkward cases deliberately: a scuffed label that fails the confidence gate, a swollen pack that is damaged/defective and blocks air transport, and a small mobility-scooter pack sitting in the same list as a vehicle pack. Fixture images live in `public/fixtures/intake/` and are synthetic — no real battery photo, no real serial number, ever (setup §1).

**`src/data/supabase/`** — the real implementation, written later against the same contract. Uses `@supabase/ssr` server clients that carry the caller's JWT so RLS applies. **The service-role key is used in exactly two places: the audit export job and the platform-admin rule publication path, both of which are server-only route handlers, both of which still write `audit_event`.** It is never used to satisfy an ordinary user request; doing so would silently disable every policy in §9.

### 5.4 Enforcement — CI and lint

Per setup §6, the data-seam check is a required status check, not a nice-to-have. `scripts/check-data-seam.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
fail=0

# 1. Zero Supabase imports outside src/data/supabase and src/lib.
if rg -n --glob 'src/**/*.{ts,tsx}' \
      --glob '!src/data/supabase/**' --glob '!src/lib/**' \
      "from ['\"]@supabase/" ; then
  echo "FAIL: @supabase import outside src/data/supabase/ and src/lib/"; fail=1
fi

# 2. DATA_ADAPTER is read in exactly one file.
if [ "$(rg -l 'DATA_ADAPTER' src | grep -v '^src/data/index.ts$' | wc -l)" -ne 0 ]; then
  echo "FAIL: DATA_ADAPTER read outside src/data/index.ts"; fail=1
fi

# 3. src/domain is pure: no framework, no I/O, no env.
if rg -n --glob 'src/domain/**/*.ts' \
      "from ['\"](next|react|@supabase|@/data|@/lib|@/app|@/components|@/features)|process\.env|fetch\(" ; then
  echo "FAIL: src/domain reached outside itself"; fail=1
fi

exit $fail
```

The same three boundaries are duplicated as ESLint `no-restricted-imports` zones so a developer sees the failure in the editor, not in CI. **The check must be proven to fail on a deliberate bad import before setup is considered complete** (setup §10). Both mechanisms exist because the grep catches what lint's module resolution misses, and lint catches it faster.

### 5.5 How migration works

Exactly as setup §3.2 states, restated here because it is the thing most likely to be improvised:

1. Write `src/data/supabase/` against the **existing, unchanged** contract.
2. Flip `DATA_ADAPTER` from `mock` to `supabase`.
3. Run the same Playwright suite. **It must pass both ways.**
4. Screens do not change. **If a screen has to change, the seam leaked — fix the seam, not the screen.**

CI runs the e2e suite against `mock` on every push from day one, and adds a second `supabase` job against an ephemeral seeded project once `0005` lands. Both are required before the migration is considered done. The suite is written to assert on visible behaviour and on containment rather than on result ordering, because full-text ranking legitimately differs between an in-memory scorer and Postgres — an ordering assertion would make a green mock suite lie.

---

## 6. Rules as data

This is the highest-value structural decision in the schema. Setup §8.1 makes a hard-coded threshold a review rejection; this section is how that is made mechanically impossible rather than merely forbidden.

### 6.1 Why, in one paragraph

Fourteen states plus DC carry battery producer obligations with different weight and energy thresholds and forty-plus dated obligations running to 2035. Fire codes are adopted 12–24 months apart by jurisdiction and some measure by volume while others measure by energy. A federal rule that could restructure lithium classification is proposed and unpublished. Anything expressed as a literal in a TypeScript conditional needs rewriting within eighteen months, and worse, cannot answer the only question that matters at audit: *what rule was in force on the day this decision was made?*

### 6.2 The three tables and how resolution works

**`jurisdiction`** — a governing scope, with `parent_jurisdiction_id` forming a chain from the most specific upward (city → state → federal). An organization points at its most specific jurisdiction; the chain is walked, not enumerated.

**`jurisdiction_rule`** — the stable identity of a rule: `jurisdiction_id`, a `rule_key` unique within the jurisdiction, the business-rules section it serves, a title, and the battery categories it governs — **including the medium-format category that covers scooter and mobility packs, present from the first reference-data migration, not added at B3.**

**`rule_version`** — the versioned payload: `effective_on`, nullable `expires_on`, a **mandatory** `citation` and `citation_url`, the thresholds and operators as `jsonb`, the Zod schema key that validates that payload, `supersedes_rule_version_id`, and `published_at` / `published_by`.

Three constraints do the real work:

1. `citation` is `not null`. A rule with no citation cannot be created, because a decision that cannot be cited cannot be defended.
2. A **GiST exclusion constraint** forbids two published versions of the same `jurisdiction_rule` from having overlapping effective date ranges. Ambiguity about which version applied on a given date is structurally impossible, not merely unlikely.
3. A published `rule_version` is immutable — a trigger permits `UPDATE` only while `published_at is null`. Amending a published rule means publishing a new version with a new effective date. History is never rewritten.

**`format_classification`** — the fourth rules-as-data table, and the one a builder is most likely to collapse into a column. It holds the size/format band a battery falls into **for one jurisdiction under one rule version** (`TAXONOMY.md` T-06, whose values include `medium_format`, the band covering scooter and mobility packs). It is keyed on `(battery_record, jurisdiction, rule_version)`.

**It is never a column on `battery_record`.** The same physical battery classifies into a different statutory band in one state than in another, and a single column can hold only one state's answer — which makes every other state's answer wrong. That divergence *is* Phase B1b's product (Rules 8.1, 8.2), and Phase B3 activates the `medium_format` band rather than creating it (Rules 8.3, 11.2). A build agent that adds `battery_record.format_category` has broken the multi-state model; `TAXONOMY.md` T-06 records that as a review rejection. A new rule version writes a **new row**; existing rows are never mutated, because the classification that produced a filed document must stay readable exactly as it was (Rule 12.22).

**Resolution** is one function, `src/domain/rules/resolve.ts`, and it is pure:

```ts
resolveRules(request: {
  ruleKeys: readonly RuleKey[]
  jurisdictionChain: readonly Jurisdiction[]   // most specific first
  asOf: Date
  batteryCategoryCode?: string
}, candidates: readonly RuleVersionWithRule[]): ResolvedRuleSet
```

Most specific jurisdiction wins; within a jurisdiction, the single version whose effective range contains `asOf` wins; if no version exists anywhere in the chain the function returns a `RuleResolutionError` rather than a default. **There is no default.** A missing rule is a loud failure that routes the user to a stated blocker (§10.3), because silently applying a fallback threshold to a compliance decision is worse than refusing to decide.

Note the argument shape: the adapter fetches candidate rows, the domain resolves. That keeps resolution identical on mock and Supabase, and keeps it unit-testable without a database.

### 6.3 Every evaluation stamps its rule version

Every rule evaluator in `src/domain` returns the same envelope. This is the mechanism that makes "which rule version applied" impossible to forget:

```ts
export interface AppliedRuleVersion {
  readonly jurisdictionRuleId: string
  readonly ruleVersionId: string
  readonly ruleKey: string
  readonly versionLabel: string
  readonly citation: string
  readonly inputs: Readonly<Record<string, unknown>>
  readonly outcome: string
}

export interface RuleOutcome<T> {
  readonly result: T
  readonly reasoning: string                                   // plain language, shown to the user and printed on exports
  readonly ruleVersionsApplied: readonly AppliedRuleVersion[]  // never empty
  readonly inputsSnapshot: Readonly<Record<string, unknown>>
}
```

Every table that stores a decision — `classification_decision`, `format_classification`, `storage_clock`, `shipping_paper`, `container_label`, `damage_assessment`, `alert`, `producer_obligation`, `obligation_deadline`, `grade`, `hazard_ranking` — carries `governing_rule_version_id` (named `rule_version_id` on `format_classification`, where it is part of the key) (a real FK, indexed, for querying "show me everything decided under version X") **and** an `evaluation_trace jsonb` holding the full `ruleVersionsApplied` array with its citations frozen at decision time. The FK survives; the trace is the reproduction.

An auditor in 2029 asking why a battery logged in October 2026 was routed the way it was gets: the inputs, the reasoning sentence, the rule key, the version label, the citation text as it read that day, and the row that proves nobody edited it since.

### 6.4 The one-year accumulation clock, as data

**Rule 4.6 is the one to read twice: the clock never pauses.** There is no hold, freeze, suspend or extension anywhere in the schema or the API — a container in dispute, under inspection or awaiting a carrier keeps counting, and the absence of a pause column is the enforcement. `storage_clock.max_duration_days` is **copied from the resolved rule version at the moment the clock starts**, alongside `governing_rule_version_id` and the computed `due_at`. A later rule change does not silently move a running clock; it applies to clocks started after its effective date. Alert offsets (the 30/60/90-day sequence per `BUSINESS_RULES.md` §4) come from the same rule payload and are materialised into `alert_schedule jsonb` plus an indexed `next_alert_at`.

Day boundaries are evaluated in **the storage site's IANA timezone** — `container.site_time_zone`, defaulting from `organization.time_zone` — not the server's and not the browser's. A clock that starts on 3 March in Denver is due on 3 March, whatever timezone the Vercel function happens to run in. This is specified because it is the exact bug the setup document's own example branch name anticipates.

The same pattern governs retention: `shipment.retention_expires_on` is computed at ship time from the resolved retention rule version and stamped on the row. **Three-year retention on shipment records is not a constant in code — it is the payload of a federal rule row.** A jurisdiction that requires longer simply carries a different payload and works with no code change. A trigger blocks deletion of any `shipment` before `retention_expires_on`, and the guard has no override path in application code.

---

## 7. API Design

### 7.1 The shape, and why it is split

Two mechanisms, with a hard rule for choosing between them so a builder never has to decide:

- **Server Actions** for every mutation initiated from the BMMP UI. They are typed end to end, they cannot be called without a session, and they keep the tenant context server-side.
- **Route handlers** (`src/app/api/**/route.ts`) **only** where one of three things is true: the response is not JSON (PDF bytes, CSV export), the caller is not the BMMP UI (webhook, cron), or the request is a multipart upload.

Everything else is a Server Component reading through `src/data` directly. There is no REST layer duplicating the data layer for our own UI, because a second surface is a second place to get tenancy wrong.

**Every Server Action returns a discriminated union and never throws across the boundary** (except `redirect`):

```ts
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; field?: string; correlationId: string } }
```

**Every Server Action follows the same five steps, in order:** (1) resolve `RequestContext` via `src/lib/auth/context.ts`; (2) parse input with its Zod schema from `src/features/<feature>/schemas.ts`; (3) authorize — the role check is asserted here *and* enforced by RLS underneath; (4) call `src/domain` for the decision and `src/data` for persistence; (5) `revalidatePath` and return. A handler that skips step 3 still cannot leak, because step 4 hits a policy — but the explicit check produces a better error than a policy denial.

### 7.2 Route handlers

| Method · Path | Purpose | Accepts | Returns | Access |
|---|---|---|---|---|
| `POST /api/intake/photos` | Upload an intake photo. Strips EXIF, records orientation and capture time, stores to the private bucket, appends `intake_photo`. | `multipart/form-data`: `file`, `intakeSessionId`, `photoKindCode` | `201` `{ intakePhotoId, storagePath, width, height, contentHash }` | P1, P4, P6 |
| `GET /api/documents/[id]/pdf` | Stream stored PDF bytes for view, print or reprint. **Never re-renders.** Writes a `document.reprinted` audit event when `?reprint=1`. | — | `200 application/pdf`, `Content-Disposition`, `ETag: <content_hash>`, `Cache-Control: private, no-store` | any member of the owning org |
| `GET /api/documents/[id]/verify` | Proof that a reprint is the same document (§8.4). | — | `200` `{ id, contentHash, byteSize, renderedAt, inputSnapshotHash, verificationCode, supersededByDocumentRenderId }` | any member; P5 included |
| `GET /api/exports/audit` | Audit log export, filtered. Streams CSV or JSON. | query: `from`, `to`, `entityTable`, `actionCode`, `format` | `200` `text/csv` or `application/json` | P2, P5, P6 |
| `GET /api/exports/evidence-pack/[id]` | Evidence pack download (B1b). | — | `200 application/pdf` or `application/zip` | P2, P5, P6 |
| `POST /api/webhooks/health-tester` | Third-party battery-health tester socket (B3, §11.3). | JSON + `X-BMMP-Signature` HMAC-SHA256 + `X-Idempotency-Key` | `202 { accepted: true, damageAssessmentId }` | signature only, no session |
| `POST /api/jobs/storage-clock-alerts` | Cron. Fires each due storage-clock alert from that clock's rule-sourced `alert_schedule`. | — | `200 { evaluated, fired }` | `CRON_SECRET` bearer |
| `POST /api/jobs/recall-sync` | Cron (B2). Refreshes recall sources, re-matches open records. | — | `200 { checked, matched }` | `CRON_SECRET` bearer |
| `GET /api/health` | Liveness. No tenant data, no database write. Reports the **active adapter name** so a production instance running on mock data is externally detectable (§5.1.1). | — | `200 { status, version, adapter, visionProvider }` | public |

Route-handler errors are **RFC 9457 `application/problem+json`**: `{ type, title, status, code, detail, correlationId }`. No stack traces, ever.

### 7.3 Server Actions

Named, grouped by feature. Each has a Zod schema and a role set; the role set matches §9.3 and the page access rules in `_ANCHORS.md` §5.

| Action | Feature | Effect | Roles |
|---|---|---|---|
| `startIntakeSession` | intake | Creates `intake_session`. **Blocked if the organization has no current `tos_acceptance` with training rights** (`BUSINESS_RULES.md` §7) — checked in domain and re-checked by a DB trigger. | P1, P4, P6 |
| `runLabelExtraction` | intake | Steps 2–4 of the pipeline: crop, extract, match, gate (§11.1). Appends `label_extraction`. | P1, P4, P6 |
| `setLabelCropRegion` | intake | Human fallback when automatic region detection returns nothing or low confidence. Produces the crop as a new `intake_photo`. | P1, P4, P6 |
| `confirmIntake` | intake | The human gate. Calls `intakeSessions.commitConfirmation` — one transaction (§11.1). | P1, P4, P6 |
| `sendToReview` / `resolveReviewItem` | review | Moves a session in and out of `/review`; records who resolved it and how. | P1, P6 |
| `createContainer`, `updateContainer`, `closeContainer` | containers | Container lifecycle. Closing seals the accumulation period. | P1, P2, P6 |
| `assignBatteryToContainer` | containers | Sets `battery_record.container_id`; writes `storage_event`. | P1, P2, P6 |
| `generateContainerLabel` | containers | Renders the label, appends `container_label` + `document_render` (§8). | P1, P2, P6 |
| `createLot`, `updateLot` | lots | Groups containers for handling and reporting. | P1, P2, P6 |
| `createShipment`, `addContainersToShipment` | shipments | Builds a shipment. Selecting a lot in the UI adds its containers — shipment membership has exactly one storage path (§3.2, `ERD.md` §4). | P1, P6 |
| `generateShippingPaper` | shipments | Renders the shipping paper with emergency response information and the 24-hour number (§8.3). | P1, P6 |
| `offerShipment` | shipments | `shipments.offer()`. Refuses without a successful render; the database refuses too (§10.4). | P1, P6 |
| `recordDamageAssessment` | condition | Appends `damage_assessment`; may set `ddr_flags` and `is_air_transport_prohibited` (`BUSINESS_RULES.md` §6). | P1, P2, P6 |
| `updateOrganizationProfile` | settings | Org profile, jurisdiction profile, emergency-response defaults. | P2, P6 |
| `inviteMember`, `changeMemberRole`, `revokeMembership` | settings | Membership lifecycle. Cannot grant a role above the caller's own. | P2, P6 |
| `proposeCatalogEntry` | catalog | Tenant-scoped proposal (`catalog_entry.organization_id` set). | P1, P2, P6 |
| `publishCatalogEntry`, `upsertJurisdictionRule`, `publishRuleVersion` | admin | Platform data. `publishRuleVersion` is one-way and immutable after (§6.2). | P6 only |
| `acceptTerms` | auth | Appends `tos_acceptance` with the document hash and the training-rights grant. | any authenticated user |

**P5 appears in no row of this table.** That is not an omission; it is the design (§9.4).

---

## 8. Document generation

Shipping papers and container labels are legal documents. They are treated as artifacts, not as views.

### 8.1 Rendering

Templates are React components under `src/features/documents/templates/`, rendered by `@react-pdf/renderer` in `src/lib/pdf/render.ts`. Each template declares `templateKey` and `templateVersion`; both are stored on the render. A template change bumps `templateVersion` — it never silently alters what a previously issued document would look like.

Renders must be **byte-deterministic for identical inputs**. That means: fonts embedded from files committed to the repo (never system fonts, never fetched at runtime), PDF metadata `creationDate` and `producer` set explicitly from the input snapshot rather than from the clock, no non-deterministic ids, and every timestamp printed on the page taken from the snapshot. Without this, §8.4's proof is theatre.

Rendering is a two-stage function with a hard boundary: `src/domain/documents/build-<type>-payload.ts` builds and validates the payload — pure, unit-tested, returns `RuleOutcome<DocumentPayload>` — and `src/lib/pdf/render.ts` turns a validated payload into bytes. **The renderer never reads the database and never decides anything.** If a required field is missing, the domain builder fails before a renderer is invoked.

### 8.2 Immutable storage and linkage

On success, in one transaction: hash the bytes with SHA-256, `put` them to the private `documents` bucket at `org/{organization_id}/{document_type}/{document_render_id}.pdf` with overwrite disabled, then append `document_render` carrying `content_hash`, `byte_size`, `page_count`, `template_key`, `template_version`, `renderer_name`, `renderer_version`, `rendered_at`, `rendered_by`, the full `input_snapshot jsonb`, and the applied rule versions. `document_render` is append-only in the contract, in RLS and by trigger.

**Linkage to the record that produced it** is an exclusive arc of real foreign keys — exactly one of `shipment_id`, `container_id`, `battery_record_id`, `evidence_pack_id` is non-null, enforced by CHECK. Not a polymorphic string pair. `shipping_paper` and `container_label` each carry a `not null` FK to their `document_render`, so a legal record cannot exist without the bytes that were issued, and the bytes cannot exist unattached.

**Corrections never mutate.** A changed shipment produces a **new** `document_render` with `supersedes_document_render_id` pointing at the old one; the old row and the old bytes remain readable forever and the viewer marks them superseded. Nothing is overwritten, because the superseded copy may be the one in a regulator's file.

### 8.3 What a shipping paper must carry

`shipping_paper` stores the fields that make it valid, as columns rather than as prose inside a blob: `un_identifier`, `proper_shipping_name`, `hazard_class`, `packing_group`, the assembled `basic_description` in the required sequence, `number_and_type_of_packages`, `total_quantity_description`, the shipper certification text, signature name and signed-at, and — mandatory — **`emergency_response_phone` and `emergency_response_contract_ref`, plus `emergency_response_guide_number`.**

The 24-hour emergency contact number and the emergency response information are `not null` on the table and validated by the domain builder before any render is attempted. If the organization has no emergency-response default configured and none is supplied, **the render does not happen and the shipment cannot be offered** — the user gets a blocking, explicit error naming the missing field and pointing at `/settings/organization`, and an `audit_event` records the refusal. This is the single most common real-world defect on this document and it is designed out rather than validated politely. Requirements are cited from `BUSINESS_RULES.md` §5; the specific values (which guide number, which phrasing, which jurisdictions vary) are `rule_version` payloads, never literals.

Container labels carry the regulatory phrase, the chemistry text, the accumulation start date, the handler identifier, and a QR whose payload is a permanent URL to `/containers/[id]`. Requirements cited from `BUSINESS_RULES.md` §4.

### 8.4 How a reprint proves it is the same document

Four mechanisms, and the first one is the important one:

1. **A reprint never re-renders.** `GET /api/documents/[id]/pdf` streams the stored bytes. There is no code path in the product that regenerates a PDF for an existing `document_render.id`.
2. **The stored SHA-256 `content_hash` is served as the `ETag`** and displayed in the document viewer. Any two downloads of the same id are byte-identical or the platform is broken and says so — `readBytes` re-hashes on read and raises `DocumentIntegrityError` on mismatch rather than serving a document it cannot vouch for.
3. **The PDF footer prints the `document_render.id` and a `verification_code`** — the first twelve characters of the SHA-256 of the `input_snapshot`, computed *before* rendering. It is printed on the page rather than the content hash, because printing the content hash inside the content would be circular. A holder of a paper copy can type the code into the viewer and be told whether it matches.
4. **`GET /api/documents/[id]/verify`** returns the id, content hash, byte size, render time, input-snapshot hash, verification code and whether it has been superseded. This is the endpoint an auditor or underwriter is pointed at.

Every download and every reprint appends an `audit_event` (`document.viewed`, `document.reprinted`) with actor, time and correlation id. `document_render` itself carries no reprint counter, because a counter would require updating an immutable row.

---

## 9. Auth and Permissions

### 9.1 Identity

Supabase Auth. Every route and action requires an authenticated session except sign-in, sign-up and invitation acceptance (**Rule 1.7**), and those three are the only ways into an organization (**Rule 1.8**). Email and password for ordinary sign-in; invitations via `/invite/[token]`, where the token is 32 random bytes, stored only as a SHA-256 hash on `membership.invite_token_hash`, single-use, expiring in seven days. Sessions are cookie-based via `@supabase/ssr`, refreshed in middleware. `public."user"` holds the profile and carries `is_platform_admin`; `auth.users` holds credentials. They share a primary key.

**Active organization.** A user may belong to several organizations (**Rule 1.5**), but acts in exactly one at a time and the switch is recorded (**Rule 1.3**). The active one is a signed cookie validated against `membership` on every request while building `RequestContext` — access is re-checked per request, never only at sign-in (**Rule 1.28**). RLS is the floor — it permits every organization the user actually belongs to — and the application narrows to the active one. Both layers, always. Never one.

### 9.2 Role codes

`membership.role` stores the role code defined in `TAXONOMY.md` (T-37), one-to-one with the persona IDs in `_ANCHORS.md` §2. A membership carries exactly one role and a user cannot hold two in the same organization (**Rule 1.4**); a role value mapping to no persona is a taxonomy defect, not licence to invent behaviour (**Rule 1.6**). Throughout this specification and in the policy expressions below, roles are written as their persona ID; the build agent substitutes the corresponding `TAXONOMY.md` code. If `TAXONOMY.md` is not yet written when this is built, the stored codes are the persona IDs themselves.

**P6 is not a membership role.** Platform Admin is Next Sketch side and is expressed as `public."user".is_platform_admin = true`. That is deliberate: P6 must administer the catalog and jurisdiction rules for every tenant, and modelling it as a per-tenant membership would mean granting it thirty times and revoking it twenty-nine.

**But platform scope alone confers no tenant data access (Rule 1.17).** Acting inside a tenant requires a recorded support grant naming reason, scope and expiry (**Rule 1.18**), every action under it is marked in the audit log as a platform action (**Rule 12.7**), and access to one organization never implies access to a second (**Rule 1.22**). Three things P6 can never do, enforced rather than documented: accept a tenant's Terms of Service (**Rules 1.19, 7.4**), clear an air-transport block (**Rules 1.20, 6.8**), or edit or delete an audit event (**Rules 1.21, 12.4**).

### 9.3 Helper functions

Created in migration `0001`, in an `app` schema. They are `security definer` with a pinned `search_path` — **without which a policy on `membership` that reads `membership` recurses**, which is the single most common way Supabase RLS is got wrong.

```sql
create schema if not exists app;

create or replace function app.member_org_ids() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(m.organization_id), '{}')
  from membership m
  where m.user_id = auth.uid() and m.revoked_at is null and m.accepted_at is not null;
$$;

create or replace function app.is_member(org uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select org = any(app.member_org_ids());
$$;

create or replace function app.has_role(org uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from membership m
    where m.user_id = auth.uid() and m.organization_id = org
      and m.revoked_at is null and m.accepted_at is not null
      and m.role = any(roles)
  );
$$;

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select u.is_platform_admin from "user" u where u.id = auth.uid()), false);
$$;
```

Writer sets, defined once and referenced everywhere:

| Set | Members | Governs |
|---|---|---|
| `W_INTAKE` | P1, P4 | `intake_session`, `intake_photo`, `label_extraction`, `date_code_decode`, `battery_record`, `damage_assessment` |
| `W_STORAGE` | P1, P2 | `container`, `lot`, `storage_clock`, `storage_event`, `container_label` |
| `W_SHIP` | P1 | `shipment`, `shipping_paper`, `classification_decision` |
| `W_ORG` | P2 | `organization`, `membership` |
| `W_PRODUCER` | P3 | `producer_obligation`, `obligation_deadline`, `evidence_pack` (B1b) |
| `R_AUDIT` | P2, P5 | `audit_event` read |

Every policy is `... or app.is_platform_admin()`, so P6 needs no membership. **P5 appears in no writer set. That is the enforcement, not a convention.**

### 9.4 P5 is read-only in the database

**Rule 1.14** — P5 is read-only, externally, everywhere, always, and no state, setting, grant or role change makes it otherwise. **Rule 1.15** requires every P5 grant to carry a scope and an expiry, and a grant without one cannot be created. **Rule 1.16** requires every denied P5 write to be surfaced with a stated reason *and* written to the audit log — a silent denial fails the rule as surely as a permitted write does. Enforced in four independent places, because the UI is the weakest of them:

1. **No INSERT, UPDATE or DELETE policy on any table names P5.** With RLS enabled and no permissive policy for a command, Postgres denies it. P5's write is refused by the database whether it arrives from the UI, a Server Action, a crafted request or a stolen anon key.
2. **`revoke insert, update, delete` on the append-only tables from `authenticated`**, so even a policy authored wrongly in future cannot grant what the grant does not allow.
3. **Mutation triggers** on append-only tables raise on `UPDATE`/`DELETE` regardless of role, which is what stops the service-role key — the one credential that bypasses RLS entirely (§9.5).
4. **The role check in every Server Action** (§7.1 step 3), which produces a clear message naming the reason and, where one governs, the rule (**Rules 1.26, 1.16**) rather than a bare denial. **A silently disabled control is a defect, not a safe default** (Rule 1.26).

The UI hiding a button is a fifth layer and is not counted among the four.

### 9.5 Policy matrix

`R` = `app.is_member(organization_id) or app.is_platform_admin()`. `PA` = `app.is_platform_admin()`. Every INSERT policy additionally carries `with check (organization_id = any(app.member_org_ids()))` so a row cannot be written into another tenant. Every table has `alter table ... enable row level security` and `force row level security`.

| Table | Tenancy col | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `organization` | `id` | `R` | `PA` | `W_ORG` ∨ `PA` | none |
| `user` | — | self ∨ shares an org ∨ `PA` | via Auth trigger | self ∨ `PA` | none |
| `membership` | `organization_id` | `R` | `W_ORG` ∨ `PA` | `W_ORG` ∨ `PA` | none (revoke sets `revoked_at`) |
| `tos_acceptance` | `organization_id` | `R` | self, any authenticated | **none** | **none** |
| `battery_record` | `organization_id` | `R` | `W_INTAKE` ∨ `PA` | `W_INTAKE` ∨ `PA` | none |
| `catalog_entry` | `organization_id` nullable | `organization_id is null` ∨ `R` | `W_INTAKE` ∨ `W_STORAGE` ∨ `PA` (tenant rows only) | own tenant rows ∨ `PA` | none |
| `intake_session` | `organization_id` | `R` | `W_INTAKE` ∨ `PA` | `W_INTAKE` ∨ `PA` | none |
| `intake_photo` | `organization_id` | `R` | `W_INTAKE` ∨ `PA` | **none** | **none** |
| `label_extraction` | `organization_id` | `R` | `W_INTAKE` ∨ `PA` | **none** | **none** |
| `date_code_decode` | `organization_id` | `R` | `W_INTAKE` ∨ `PA` | **none** | **none** |
| `container` | `organization_id` | `R` | `W_STORAGE` ∨ `PA` | `W_STORAGE` ∨ `PA` | none |
| `lot` | `organization_id` | `R` | `W_STORAGE` ∨ `PA` | `W_STORAGE` ∨ `PA` | none |
| `storage_clock` | `organization_id` | `R` | `W_STORAGE` ∨ `PA` | `W_STORAGE` ∨ `PA` (stop only) | none |
| `storage_event` | `organization_id` | `R` | `W_STORAGE` ∨ `PA` | **none** | **none** |
| `alert` | `organization_id` | `R` | system ∨ `PA` | `W_STORAGE` ∨ `W_PRODUCER` ∨ `PA` — **acknowledge/resolve only**, rest frozen by trigger | none — an alert is evidence (Rule 12.9) |
| `classification_decision` | `organization_id` | `R` | `W_SHIP` ∨ `W_INTAKE` ∨ `PA` | **none** | **none** |
| `shipment` | `organization_id` | `R` | `W_SHIP` ∨ `PA` | `W_SHIP` ∨ `PA` | none (retention trigger) |
| `shipping_paper` | `organization_id` | `R` | `W_SHIP` ∨ `PA` | **none** | **none** |
| `container_label` | `organization_id` | `R` | `W_STORAGE` ∨ `PA` | **none** | **none** |
| `document_render` | `organization_id` | `R` | `W_SHIP` ∨ `W_STORAGE` ∨ `PA` | **none** | **none** |
| `damage_assessment` | `organization_id` | `R` | `W_INTAKE` ∨ `W_STORAGE` ∨ `PA` | **none** | **none** |
| `grade` (B2) | `organization_id` | `R` | `W_INTAKE` ∨ `PA` | **none** | **none** |
| `hazard_ranking` (B2) | `organization_id` | `R` | `W_INTAKE` ∨ `PA` | **none** | **none** |
| `recall_match` (B2) | `organization_id` | `R` | system ∨ `PA` | `W_INTAKE` ∨ `PA` (confirm/dismiss) | none |
| `jurisdiction` | — | any authenticated | `PA` | `PA` | none |
| `jurisdiction_rule` | — | any authenticated | `PA` | `PA` | none |
| `rule_version` | — | any authenticated | `PA` | `PA` **only while `published_at is null`** | none |
| `format_classification` | `organization_id` | `R` | `W_INTAKE` ∨ `W_PRODUCER` ∨ `PA` | **none** | **none** |
| `producer_obligation` (B1b) | `organization_id` | `R` | `W_PRODUCER` ∨ `PA` | `W_PRODUCER` ∨ `PA` | none |
| `obligation_deadline` (B1b) | `organization_id` | `R` | `W_PRODUCER` ∨ `PA` | `W_PRODUCER` ∨ `PA` | none |
| `evidence_pack` (B1b) | `organization_id` | `R` ∧ (`W_PRODUCER` ∨ `R_AUDIT` ∨ `PA`) | `W_PRODUCER` ∨ `PA` | `W_PRODUCER` ∨ `PA` | none |
| `audit_event` | `organization_id` | `R_AUDIT` ∨ `PA` | trigger only (`security definer`) | **none** | **none** |

Three notes the matrix cannot show. `audit_event` is written by triggers running `security definer`, not by user statements — a user cannot forge or suppress an audit row (**Rules 12.3, 12.4**). `audit_event` SELECT is limited to P2, P5 and P6 per **Rule 12.8**; P1, P3 and P4 see the history of records they can already open, built from `storage_event`, `classification_decision`, `damage_assessment`, `alert` and `document_render` rather than from the raw log. And no table carries a DELETE policy, because **Rule 1.13** deactivates members rather than deleting them and **Rule 12.12** forbids hard deletion inside a retention period — the absence of the policy is the enforcement.

**Storage buckets** carry the same rule. Two private buckets, `intake-photos` and `documents`, both keyed on an `org/{organization_id}/...` prefix, with storage policies allowing access only when that path segment is in `app.member_org_ids()`. No public bucket exists. Bytes are served through `/api/documents/[id]/pdf` after an authorization check, or via a signed URL with a 60-second TTL minted server-side. A signed URL is never logged.

---

## 10. Error Handling

A compliance product must never silently fail a document generation. The rules below are ordered from that requirement backwards.

### 10.1 The taxonomy

`src/lib/errors.ts` defines `AppError` — `code`, `httpStatus`, `userMessage`, `severity`, `retryable`, `correlationId`, `context` — and its subclasses. Both adapters throw the same codes, so a test asserting on `TENANT_SCOPE` passes on mock and on Supabase.

| Class | Code | Status | What the user sees |
|---|---|---|---|
| `ValidationError` | `VALIDATION` | 400 | Field-level messages inline. Nothing is submitted. |
| `AuthError` | `UNAUTHENTICATED` | 401 | Redirect to `/sign-in` with a return path. |
| `PermissionError` | `FORBIDDEN` | 403 | "Your role cannot do this," naming the role, the rule and who to ask (**Rule 1.26**). Denials are audited (**Rules 1.16, 12.6**). |
| `NotFoundError` | `NOT_FOUND` | 404 | Not-found page. Never distinguishes "absent" from "another tenant's" (**Rule 1.2**). |
| `ConflictError` | `CONFLICT` | 409 | "This changed while you were working," with a refresh action. |
| `TenantScopeError` | `TENANT_SCOPE` | 403 | Generic forbidden. **Logged at `error` and alerted on — this should be unreachable.** |
| `RuleResolutionError` | `RULE_UNRESOLVED` | 422 | "No rule is on file for <jurisdiction> covering <topic> as of <date>." Blocks the action, names the gap, points at P6. **Never a default** — **Rules 3.10** (no jurisdiction profile blocks, never defaults) and **3.4** (a missing input blocks rather than being assumed). |
| `IntegrationError` | `INTEGRATION` | 502 | Which service, whether it will retry, what still works. |
| `DocumentRenderError` | `DOCUMENT_RENDER` | 500 | §10.4. Blocking, explicit, with a correlation id. |
| `DocumentIntegrityError` | `DOCUMENT_INTEGRITY` | 500 | "This document failed its integrity check and will not be served." Alerts immediately. |
| `DataIntegrityError` | `DATA_INTEGRITY` | 500 | Generic failure to the user, full detail to logs, alert. |

**The rule: nothing is swallowed.** Every `catch` either rethrows an `AppError` or records an `audit_event`. An empty catch block, a bare `catch { return null }`, and `catch { /* ignore */ }` are review rejections. Where a failure is genuinely tolerable — a recall check that could not reach the government API — it is recorded as a *pending* state on the row with a reason, never as an absent one. Every denied or blocked action produces an `audit_event`, because an attempt is evidence (**Rule 12.6**): a blocked air-transport selection (**Rule 6.7**), a rejected P5 write (**Rule 1.16**) and a prohibited-activity attempt (**Rule 3.22**) are all audited, not merely refused.

### 10.2 What gets logged

`src/lib/log.ts` writes single-line JSON to stdout (Vercel captures it) with a fixed field set: `ts`, `level`, `event`, `correlationId`, `organizationId`, `userId`, `role`, `entity`, `entityId`, `action`, `durationMs`, `errorCode`, `outcome`. `correlationId` is minted once per user action in `RequestContext` and threads through every log line, every `audit_event` and every provider call, so one user complaint resolves to one filterable trace.

**Never logged at any level:** photo bytes, signed URLs, invite tokens, service-role keys, provider API keys, session cookies. `serial_number` and email addresses are redacted below `warn` — intake photographs and the fields read off them carry customer identifying content (**Rule 7.21**). `src/lib/log.ts` owns a redaction list so this is one function, not a habit.

**Logged, and also written to `audit_event`:** every state change, per §10.5 and **Rule 12.1**.

**Logged and alerted:** `TENANT_SCOPE`, `DOCUMENT_INTEGRITY`, `DATA_INTEGRITY`, any `DOCUMENT_RENDER`, and any `RULE_UNRESOLVED` (which means reference data is missing, which means a customer is blocked).

### 10.3 What the user sees

`error.tsx` per route group, `global-error.tsx` at the root, `not-found.tsx` for 404s. Server Action failures surface inline at the field or as a banner — never a page replacement, because losing a half-filled intake form to an error page is a real cost to P1 standing at a pallet.

Four copy rules, binding on every message in the product:

1. Say what failed, what state the record is now in, and what to do next.
2. Show the correlation id on any 5xx so support can find it.
3. Never expose a stack trace, a SQL error, a provider name or an internal id other than the correlation id.
4. **Never state or imply a compliance outcome the system did not compute.** "We could not classify this battery" is correct; "this battery is exempt" when the rule failed to resolve is a legal problem, not a copy problem (**Rules 3.10, 3.12** — the gap is stated, never silent). And per **Rules 1.25, 10.3** and `_ANCHORS.md` §7.1, no error, tooltip, notification, export or PDF ever expresses a probability of ignition — the only permitted shape is a relative ranking with a stated basis per factor (**Rule 10.4**).

### 10.4 Document generation never fails silently

The strongest guarantee in this section, implemented in five parts:

1. **Preconditions are checked in the domain builder before a renderer is invoked**, and **Rule 5.3** requires each unmet one to be listed *by name* rather than reported as a single failure. A missing or unverified 24-hour emergency number (**Rules 5.6, 5.7**), an unresolved rule, an unconfirmed identification (**Rule 2.34**) or an absent classification decision each fails as a `ValidationError` or `RuleResolutionError` naming the exact missing field and who can fix it.
2. **`document_render` rows are inserted only on success.** There is no pending or failed render row, because the table is immutable and a failed row could never be corrected. A failure is instead recorded as `audit_event` with `event_type = 'document.render_failed'`, the full input snapshot, the error code and the correlation id — so a failed render is as auditable as a successful one.
3. **The user gets a blocking error, never a partial success.** No optimistic "generating…" state resolves silently to nothing. The shipment stays in its prior status and the UI says so.
4. **The database refuses the invalid state independently of the UI.** A trigger on `shipment` blocks the transition to offered or shipped unless a `shipping_paper` exists with a `document_render` whose `content_hash` is non-null (**Rules 5.4, 5.3**). The same trigger blocks any air transport mode when any battery in any container on that shipment carries a non-empty `ddr_flags` (**Rules 6.7, 6.13**) — and because **Rule 6.8** admits no override for any role, there is no bypass parameter, no service-role path and no support-grant path through it. A bug in a Server Action cannot produce a shipment without a paper.
5. **Storage failure is treated as render failure.** If bytes cannot be written to the bucket, the transaction rolls back and no `document_render` row exists. There is never a row pointing at bytes that are not there.

### 10.5 Audit logging

`audit_event` captures every state change: **who, what, when, before, after, and which rule version applied.** Columns: `actor_user_id`, `actor_type` (values in `TAXONOMY.md`), `event_type`, `entity_table`, `entity_id`, `occurred_at`, `before_state jsonb`, `after_state jsonb`, `changed_fields text[]`, `governing_rule_version_id`, `rule_versions_applied jsonb`, `correlation_id`, `ip_address`, `user_agent`, `reason`.

**How it is written.** A single `security definer` trigger function, `app.write_audit_event()`, attached `after insert or update` on every tenant table in migration `0011`. **Rule 12.2** fixes the payload and **Rule 12.5** requires automated pipeline steps to write events exactly as human actions do, identified as the step that ran and carrying the model or rule version used. It diffs `OLD` and `NEW`, drops unchanged columns, and reads actor and correlation id from `set_config` locals set at the start of each request. Two consequences worth stating: audit coverage is not a thing a builder can forget to add to a new action, and if the audit insert fails the surrounding transaction fails with it — an unauditable state change does not happen.

**Immutability**, three ways: no UPDATE/DELETE policy; `revoke update, delete ... from authenticated`; and `app.forbid_mutation()` as a `before update or delete` trigger that raises unconditionally, which is the only one of the three that also stops the service-role key. Append-only means append-only.

**Retention.** `shipment` and its documents are retained under §6.4's rule-sourced `retention_expires_on`, with a deletion guard (**Rules 12.10, 12.11, 12.12**). Records are voided or superseded rather than deleted and stay fully readable with reason, actor and timestamp (**Rule 12.13**). `audit_event` is not deleted at all; the export at `/audit` is how it leaves the system, every export is scoped to what the requester could already open individually (**Rule 12.17**) and is itself an audited act (**Rule 12.18**). Offboarding removes access and retains data — it is not deletion (**Rule 12.21**).

---

## 11. Business Logic

Rules are cited by the **fixed section numbers** in `_ANCHORS.md` §4. Sub-numbers (`5.3`) are assigned in `BUSINESS_RULES.md`; where this spec needs a specific rule it names the rule's subject alongside its section so the citation resolves unambiguously. **This document does not restate rules.** It states where each section is implemented, what shape it takes, and what proves it ran.

Every rule evaluator is a pure function in `src/domain`, takes `(input, ResolvedRuleSet)`, returns `RuleOutcome<T>` (§6.3), and is unit-tested with at least one passing and one failing case per numbered rule.

| § | Area | Implemented in | Persisted to | Proof it ran |
|---|---|---|---|---|
| **§1** | Access, tenancy and roles | RLS policies (§9.5), `app.has_role`, `src/lib/auth/context.ts` | `membership` | **Rules 1.1, 1.2** at the data layer not the screen; **1.3** active-org switch recorded; **1.4, 1.5** one role per membership; **1.7** session required; **1.12** last binding-authority member blocked; **1.14, 1.16** P5 denial audited; **1.17, 1.18** P6 support grant marked; **1.23** rules-as-data; **1.26** denial states a reason; **1.28** re-checked every request |
| **§2** | Battery intake and identification | `src/domain/intake/*` — `confidence-gate.ts`, `field-validation.ts`, `date-code.ts`; `src/domain/catalog/match.ts` | `intake_session`, `intake_photo`, `label_extraction`, `date_code_decode`, `battery_record` | **Rules 2.2, 2.3** fixed order; **2.4** every step audited; **2.7** per-field confidence, no blended score; **2.8** extraction is a proposal; **2.9, 2.10** chemistry never from a photograph; **2.11, 2.12** unread beats guessed; **2.13, 2.17** gate is hard and un-bypassable; **2.14** the record routes, not the field; **2.15** chemistry/model/condition never auto-commit; **2.18, 2.19** never auto-selects a candidate; **2.21** per-field attributable confirmation; **2.23** two exits only; **2.24** deterministic date-code decode; **2.32** correction re-opens the gate; **2.33** bulk gates individually |
| **§3** | Waste classification — light category vs full hazardous | `src/domain/classification/evaluate.ts`, `handler-size.ts`, `prohibited-activity.ts`, `override.ts` | `classification_decision`, `format_classification` | **Rules 3.1** exactly one active decision; **3.3** blocked until identification confirmed; **3.4** a missing input blocks rather than defaults; **3.5** site jurisdiction governs, not headquarters; **3.6** the version in force on the intake date; **3.7, 3.8** inputs, versions and citations recorded; **3.10** no jurisdiction profile means blocked, never defaulted; **3.11, 3.12** manifest-required is stated, never silent; **3.14** supersede, never overwrite; **3.26–3.28** the P6-only override, which supersedes rather than edits and records the rule gap it exposed; **3.16** a departed shipment is never re-classified; **3.18–3.20** handler size latch; **3.21, 3.22** prohibited activities unreachable |
| **§4** | Storage, containers and the one-year clock | `src/domain/storage/clock.ts`, `alerts.ts`, `consolidation.ts` | `storage_clock`, `storage_event`, `alert`, `container_label` | **Rules 4.4** start is first placement; **4.5** period read from the rule, never a number; **4.6** the clock never pauses — no hold, freeze or extension exists in the schema; **4.9–4.12** start dates travel, and moving, consolidating or splitting can only ever inherit the earliest; **4.13, 4.14** alert ladder is data, routed to P1/P2; **4.15, 4.16** overdue is a hard state that accepts nothing; **4.19, 4.21, 4.22** label must match or the container cannot ship; **4.28** one segregation class per container; **4.29** site-local time zone; **4.30** containers are retired, never deleted |
| **§5** | Transport documentation and shipping papers | `src/domain/transport/basic-description.ts`, `packaging-exception.ts`, `src/domain/documents/build-shipping-paper-payload.ts` | `shipment`, `shipping_paper`, `document_render` | **Rule 5.3** every precondition named to the user; **5.4** a light-category outcome still needs a paper; **5.5–5.7** emergency response information and the verified 24-hour number, never omitted and never a placeholder; **5.9** identifiers derived, never free-typed; **5.12** renders immutable; **5.13, 5.14** a contents change voids the paper and the void is retained; **5.15** corrections supersede; **5.28** a draft render is never a document — watermarked, satisfies no obligation, closes no precondition; **5.17** departure closes the clocks; **5.19, 5.20** packaging exception never assumed; **5.21, 5.22** artwork version is the one in force at print; **5.24, 5.25** one organization, one open shipment per record |
| **§6** | Damage, defect and the air-transport prohibition | `src/domain/condition/damage.ts` | `damage_assessment`, `battery_record.ddr_flags`, `is_air_transport_prohibited` | **Rules 6.1** no assessment means no shipment; **6.2, 6.6** a model proposes, a human sets; **6.4, 6.5** the DDR set and recall parity; **6.7, 6.8** hard block with no override for any role — there is no acknowledge-and-proceed path in the schema or the API; **6.9, 6.10** what the user sees and the three permitted paths; **6.11** only a new assessment clears it; **6.12** superseded assessments stay visible; **6.13, 6.14** blocked at assembly and auto-removed after the fact; **6.17, 6.18** quarantine routing; **6.19** no clock relief; **6.20** re-classification triggered; **6.21** every change audited; **6.23, 6.24** who may record and remove a recall association, and that removal is not a route around the air block |
| **§7** | Data capture, consent and training rights | `src/domain/consent/require-training-grant.ts`, `eligibility.ts` | `tos_acceptance`, `intake_photo.data_use_eligibility` | **Rules 7.1, 7.2** consent before capture, intake blocked org-wide until then; **7.3, 7.4** binding authority only, never P6 on a tenant's behalf; **7.5** acceptance never edited; **7.6, 7.7** eligibility stamped once at capture and permanently immutable; **7.8** ineligible is still fully usable; **7.9** unconfirmed is not a label; **7.10, 7.11** both halves of the pair or neither; **7.13, 7.15** grace-window records bind to the prior version; **7.16** the record remembers its version forever; **7.17** never retroactive; **7.21** redaction before any export; **7.23** imports default ineligible; **7.24** eligibility travels with the data |
| **§8** | Producer obligations and state registration — B1b | `src/domain/producer/*` | `producer_obligation`, `obligation_deadline`, `format_classification` | **Rule 8.2** the same battery classifies differently by state, expressed as data and never as per-state branching; **8.3** the medium-format band exists from the first migration; **8.4** obligations are dated, cited, versioned evidence; **8.5** P3 holds P1-equivalent permissions until Gate 2 and no producer surface exists |
| **§9** | Insurance evidence and fire-code volume — B1b | `src/domain/storage/volume.ts`, `src/domain/evidence/*` | `evidence_pack`, `storage_event`, `alert` | **Rule 9.2** per-jurisdiction versioning is a day-one property, which is why `rule_version` ships in `0003`; **9.3** a gap appears in the pack as a gap; **9.4** never a probability of ignition; **9.5** B1a warns on a crossed limit (Rule 4.26) and does no more |
| **§10** | Grading, damage triage and hazard ranking — B2 | `src/domain/grading/*`, `src/domain/hazard/*` | `grade`, `hazard_ranking`, `recall_match` | **Rules 10.3, 10.5** the absolute prohibition, in force now and binding on B1a work — enforced in the schema by the absence of any probability column; **10.4** relative ranking with a stated basis per factor; **10.6** BMMP's own published scheme, no false claim of conformance; **10.7** a recall association is advisory until confirmed, but a confirmed one triggers §6 immediately; **10.8** improved label reading is still label reading; **10.9** provenance binding |
| **§11** | Mobility and small-battery coverage — B3 | No new machinery. Category rows, rule rows, catalog rows. | Existing tables | **Rule 11.2** B3 activates, it never widens — a builder widening `battery_record` or the rules model here has found a B1a/B1b defect and raises it; **11.3** a damaged mobility pack is hard-blocked from air exactly like any other; **11.4** the allowance figure is rule data; **11.5** measured condition stays separate from assessed condition and never merges; **11.6** no hardware, any phase. The absence of a schema change is the proof (§4.2) |
| **§12** | Audit, retention and export | `app.write_audit_event()`, retention guard trigger, `/api/exports/audit` | `audit_event` | **Rules 12.1** every state change; **12.2** actor, org, entity, timestamp, before, after, governing rule; **12.3, 12.4** append-only with no edit path for any role including P6; **12.5** pipeline steps audited like humans, carrying the model or rule version; **12.6** denials audited because attempts are evidence; **12.7** platform actions distinguishable; **12.8, 12.9** P2/P5/P6 see the org-wide log; **12.10–12.12** rule-sourced retention, nothing hard-deleted inside it; **12.15, 12.16** the stored rule version is the answer to “why”; **12.17, 12.18** exports scoped and themselves audited; **12.20** every timestamp carries a zone; **12.22** rule versions never edited in place; **12.24** training exports verify eligibility per record |

### 11.1 The intake pipeline — Sequential (pipeline)

**Pattern: Sequential (pipeline), code-orchestrated, human gate at the end.** Per `_ANCHORS.md` §6 and the orchestration cheat sheet.

```
intake_photo → label crop → vision extraction → catalog match → CONFIDENCE GATE → human confirmation (P1)
     │             │              │                   │                │                    │
     └─────────────┴──────────────┴───────────────────┴────────────────┴────────────────────┘
                        orchestrated by code, every step appended to audit_event
```

The orchestrator is `src/features/intake/server/intake-pipeline.ts`. Decisions are pure functions in `src/domain/intake/` and `src/domain/catalog/`. The vision provider lives behind an interface in `src/lib/vision/`. Persistence is `src/data`. Nothing in the pipeline talks to Supabase.

**Why Sequential, and why not the others:**

- **Not Handoff.** Handoff has no persistent orchestrator; each agent decides who runs next, and the path adapts mid-run. That is precisely what this pipeline must not do. The order here is fixed by the physics of the task and by the audit requirement: a decision made today must be reproducible in three years, which requires a fixed, code-owned order. A step that could re-route the pipeline could route *around* the confidence gate — and an unconfirmed chemistry reaching a shipping paper is the failure mode this product exists to prevent. Handoff also has no central state, which is exactly the debugging property a compliance trail cannot afford.
- **Not Hierarchical.** Hierarchical exists to plan across multiple domains and adjust as specialists report back. There is no planning problem here: one input, one known sequence, one output. Adding a planner would insert a non-deterministic component into a regulated path and buy nothing. Setup §8 and `_ANCHORS.md` §6 both put this beyond a builder's discretion.
- **Not Group chat.** Nothing here benefits from models challenging each other. The arbiter is the catalog and a human (P1), not a debate, and a conversation with no guaranteed termination has no place between a user and a document they need in the next two minutes.
- **Not Concurrent.** The steps are genuinely dependent: the crop needs the photo, extraction needs the crop, matching needs the extracted fields, the gate needs the match score. Per the cheat sheet, dependent steps are sequential by definition; running them concurrently is not an optimisation, it is a category error.

One more thing worth stating plainly: **there is exactly one model call in this pipeline** (extraction), plus an optional region-detection call. The "agents" are pipeline steps orchestrated by ordinary code. No model has write authority; models return data, and code decides what is persisted.

**Step 1 — the photo.** At least one photo is required before extraction runs (**Rule 2.5**); where a label is absent or destroyed the record takes the manual path with a stated reason and the photos are still retained, because an unreadable label is itself a useful example (**Rules 2.29, 2.20**). `POST /api/intake/photos` accepts the upload, reads orientation and capture time, **strips EXIF** (GPS and device identifiers are customer data we have no reason to hold), downscales the long edge to 2048px with `sharp` while keeping the original, computes SHA-256, and stores to `intake-photos/org/{organization_id}/{intake_session_id}/{intake_photo_id}.{ext}` in the private bucket. `intake_photo` is appended with the storage path, content hash, dimensions, `photo_type`, `captured_at` and `taken_by`. The row is immutable. Under `DATA_ADAPTER=mock`, the object store returns paths into `public/fixtures/intake/` and no upload occurs.

**Step 2 — the label crop.** The crop is produced server-side and stored as its **own** `intake_photo` row with `parent_intake_photo_id` set, `photo_type` marking it a label crop, and `crop_geometry jsonb` recording `{x, y, width, height, sourceWidth, sourceHeight}` plus `crop_method`. The original is never modified.

Geometry comes from one of two sources, in order: `VisionProvider.detectLabelRegion()` returns a bounding box with a confidence; if it returns `null` or falls below the detection threshold, **the UI asks P1 to drag a box** and geometry comes from the human. The manual path is always available, never hidden, and is not an error state — a scuffed label on a mobility pack is an ordinary Tuesday. `sharp` performs the crop deterministically, so the same geometry always yields the same bytes.

**Step 3 — what the vision model is asked for, and what shape comes back.** The provider sits behind an interface in `src/lib/vision/provider.ts`. **No vendor name appears anywhere except `src/lib/vision/providers/`.**

```ts
// The closed vocabulary is TAXONOMY.md T-09. A new extracted field is a taxonomy
// addition, never a new free-text key. These values are generated from T-09.
export type LabelFieldKey =
  | 'manufacturer' | 'model' | 'chemistry_code' | 'voltage' | 'capacity_ah'
  | 'energy_wh' | 'date_code' | 'serial_number' | 'certification_marks'
  | 'transport_test_marking' | 'assessed_condition'

/** T-09's hard-gated fields. No confidence band auto-commits these (Rule 2.15). */
export const HARD_GATED_FIELDS = ['model', 'chemistry_code', 'assessed_condition'] as const

export interface LabelFieldResult<T> {
  readonly value: T | null                       // null = not extracted (Rule 2.11)
  readonly confidence: number                    // 0..1, per field, required — mapped to a
                                                 // T-10 band before storage; the raw score is
                                                 // kept for audit and never shown as a percentage
  readonly evidence?: {
    readonly boundingBox?: readonly [number, number, number, number]
    readonly rawText?: string                    // the characters actually read
  }
}

export interface LabelExtractionResult {
  readonly schemaVersion: string
  readonly fields: { readonly [K in LabelFieldKey]: LabelFieldResult<unknown> }
  readonly providerCode: string
  readonly modelIdentifier: string
  readonly promptVersion: string
  readonly rawResponse: unknown                  // stored verbatim for audit
  readonly usage?: { inputTokens: number; outputTokens: number; costUsd?: number }
}

export interface VisionProvider {
  readonly code: string
  detectLabelRegion(req: RegionRequest): Promise<{ box: BoundingBox; confidence: number } | null>
  extractLabelFields(req: ExtractionRequest): Promise<LabelExtractionResult>
}
```

**The model is asked to read characters, not to conclude anything.** The instruction is transcription with schema-constrained output: for each requested field return the value as printed, a confidence, and the raw text it read. **Rule 2.11** makes unread the correct output for an illegible field — never guessed, never interpolated from a similar product, never filled from a catalog entry the record has not matched to — and **Rule 2.12** requires every value to pass shape validation before a human sees it, with the raw text retained for the reviewer. It is explicitly told to return `null` with low confidence rather than guess — the documented failure mode of these models is fabricating a plausible value on a low-confidence extraction, and per-field confidence plus schema validation plus a human gate is the stated mitigation.

Note the field key `chemistry_code`. It is the chemistry designation **printed on the label**, read as characters, and its name is T-09's — it feeds catalog resolution and by itself sets nothing. It is not a chemistry determination. **Chemistry is matched from the catalog and confirmed by a human; it is never detected from a photograph** (`_ANCHORS.md` §7.2). No provider is ever asked what chemistry a battery is, and `battery_record.chemistry` is never written from an extraction — **Rule 2.10** admits exactly two sources, a matched catalog entry or direct human entry, and **Rule 2.9** forbids the inference outright. Form factor may be proposed from the image and still passes the gate, and it never contributes to a chemistry determination (**Rule 2.25**).

The response is validated against a Zod schema before anything else happens; a malformed response is an `IntegrationError` and routes the session to `/review` — never a silent pass. The result is appended to `label_extraction` as **one row per field** (T-09), each carrying its own `field_value`, `confidence_band` (T-10), raw score, band cutoffs, evidence box and raw text, alongside the run's `extraction_run_id`, provider, model identifier, prompt version, latency, token usage and cost. There is no aggregate confidence column anywhere — **Rule 2.7** forbids a blended score standing in for a weak field.

Provider selection is `VISION_PROVIDER`. **`fixture` is the default in CI and under `DATA_ADAPTER=mock`**, returning canned results keyed by fixture image, so the e2e suite is deterministic, offline and free.

**Step 4 — catalog matching.** The split matters: **the adapter retrieves candidates, the domain ranks them.**

**Rule 2.18** permits pre-filling only from an unambiguously resolved single entry, and **Rule 2.19** forbids auto-selecting a top candidate or silently narrowing a list to one — several plausible entries are presented and a human picks. `catalogEntries.findCandidates(ctx, {manufacturerNormalized, partNumberNormalized, voltageV, energyWh, limit})` returns a bounded candidate set. `src/domain/catalog/match.ts` then scores every candidate in pure TypeScript: exact match on normalised part number (uppercase, separators stripped) scores highest; otherwise a deterministic string-similarity score over part number and model name within the manufacturer, plus numeric agreement on voltage, capacity and energy within a tolerance carried in the rule payload. It returns a ranked list with `matchScore` in 0..1 and a `matchMethodCode`.

Ranking is in the domain rather than in SQL for one specific reason: if ranking were a Postgres trigram query, the mock adapter would have to approximate it in JavaScript, the two would diverge, and the Playwright suite would pass on mock while behaving differently on Supabase. **One pure scorer means both adapters produce identical rankings**, which is what makes §5.5's "the same suite must pass both ways" a real test rather than a hope.

**Step 5 — the confidence gate.** `src/domain/intake/confidence-gate.ts`. **Rule 2.13** makes the gate's existence non-negotiable — the threshold value is data, the gate itself is not — and **Rule 2.17** puts it beyond every role: no bulk-confirm, no trusted-supplier setting and no import path skips it. It evaluates three things: every extracted field's confidence against `MIN_FIELD_CONFIDENCE`; the top candidate's `matchScore` against `MIN_MATCH_SCORE`; and the delta between the top two candidates against `MIN_MATCH_SEPARATION` — two near-identical catalog entries are an ambiguous match even when both score highly, and ambiguity is a review case.

**Any gated field not at the top confidence band routes the whole record to `/review` (Rules 2.14, T-10).** Not the field — the record, because a bad read on one field is evidence the read as a whole is unreliable. `intake_session.is_review_required` is set true with `review_reason_codes`, and `intake_session.gate_thresholds_applied` plus each field row's `confidence_band` and `band_cutoffs_applied` are stored so the decision reproduces even after the cutoffs change (**Rule 2.16**).

The thresholds are constants in `src/domain/intake/thresholds.ts`. They are **not** environment variables, **not** per-tenant settings, and **not** admin-editable. Per `_ANCHORS.md` §6 the gate is a hard rule, not a tunable default; changing it requires a code change, a PR and a Decision Log entry. They are also not jurisdiction rules — they are not regulatory, so they do not belong in `rule_version`, and putting them there would blur the boundary that makes §6 credible.

**And the gate never auto-commits.** Passing routes to the ordinary confirmation screen with values pre-filled; failing routes to `/review`. **Human confirmation of chemistry, model and condition is required on both paths** — they are the hard-gated fields in `TAXONOMY.md` T-09, and **Rule 2.15** holds even at perfect confidence. The gate decides which queue, not whether a human is involved. A record leaves the queue only by confirmation or by a stated void; it never times out into a confirmed state (**Rule 2.23**).

**Step 6 — human confirmation, and how it is recorded.** `confirmIntake` calls `intakeSessions.commitConfirmation()`, which is **one transaction** — in the Supabase adapter a `security invoker` Postgres function, `app.commit_intake_confirmation(payload jsonb)`, so RLS still applies to every statement inside it. In the mock adapter it is an atomic in-memory operation. It performs, all or nothing:

1. Insert or update `battery_record` with the confirmed values, allocating `record_number` from the organization counter under its row lock. Confirmation is per field and attributable — **Rule 2.21** forbids "confirmed by the system" as a value.
2. Set `chemistry_source`, `chemistry_confirmed_by`, `chemistry_confirmed_at`; set `condition_confirmed_by`, `condition_confirmed_at`; link `catalog_entry_id` and `intake_session_id`.
3. Append `date_code_decode` if a date code was read — deterministic rules in `src/domain/intake/date-code.ts`, versioned by `decoder_version`, no machine learning. Per **Rule 2.24** a decode never overrides a human-entered date and a failure is recorded as undecodable rather than as an approximate date.
4. Append `damage_assessment` if condition indicators were captured, setting `ddr_flags` and `is_air_transport_prohibited` per `BUSINESS_RULES.md` §6.
5. Append `classification_decision` per §3, with its rule version and reasoning.
6. Start the `storage_clock` per §4, stamping `max_duration_days`, `due_at` and the rule version — the start date is the first placement into the container (**Rule 4.4**) and the period is read from the rule in force on that date (**Rule 4.5**).
7. Close `intake_session` and clear `is_review_required`.
8. Write an `audit_event` for each of the above, sharing one `correlation_id`.

If any step fails, none of it happened. There is no state in which a battery has a shipping-ready record but no classification decision or no running clock.

**The captured asset.** After confirmation, `intake_photo` (original) → `intake_photo` (label crop) → `label_extraction` → `battery_record.catalog_entry_id` forms the linked triple of photo, crop and human-confirmed answer that D-2 and D-7 identify as the durable asset. It is a byproduct of ordinary use, it is independently useful the day it is captured, and per RN-3 it is only ever assembled into a corpus through a consent-gated export — never through a cross-tenant query.

### 11.2 Classification, storage and transport

**§3 classification.** `evaluateClassification(input, rules)` takes the battery's category, chemistry, mass, energy, condition and the organization's jurisdiction chain, resolves the classification rule keys, and returns `RuleOutcome<ClassificationResult>` with a plain-language `reasoning` string. It is appended to `classification_decision` with `governing_rule_version_id`, `evaluation_trace`, `inputs_snapshot`, `basis_codes` (T-14) and `status` (T-45). Re-deciding inserts a new row with `supersedes_classification_decision_id`; nothing is edited (**Rule 3.14**). Exactly one row per record sits at `status = 'active'`, enforced by a partial unique index rather than asserted (**Rule 3.1**).

**The P6 classification override (Rules 3.26–3.28).** P6, and only P6, may set an outcome directly where the jurisdiction rule data is wrong for one specific record and correcting the rule version would wrongly move every other record in that jurisdiction. **The ordinary fix remains correcting the rule data and letting Rules 3.15 and 3.17 re-derive; an override is the exception, not the tool.** It is implemented as a supersession, never an edit: the override row carries `is_override`, `override_reason`, `overridden_by`, the `manual_override` basis code, and `derived_waste_classification` — the outcome the rules produced, stored beside the human's substitute so an auditor reads both from one row (**Rule 3.27**). A CHECK constraint makes an override without its superseded decision impossible to insert. Where the override moves the record to a **less** regulated outcome, `is_less_regulated_than_derived` is set and the rule gap is recorded at `rule_gap_reported_at`, staying open until `rule_gap_closed_by_rule_version_id` names the corrected version — a partial index over that pair is the standing backlog, so overriding toward less regulation without fixing the underlying rule is visible rather than habitual (**Rule 3.28**). `/audit` filters on `is_override` to answer "show me every classification a person set by hand" as one indexed query. Where the outcome is the fully-regulated path — a jurisdiction that treats these batteries as fully hazardous rather than under the lighter category — B1a records the decision, its reasoning and its citation, and surfaces it as a stated terminal state with an export. **B1a generates no hazardous waste manifest**; that is a deferred item and its absence is a recorded decision, not an oversight (Decision Log D-6, Roadmap §4).

**§4 storage.** Clocks, alerts and timezone handling per §6.4. `POST /api/jobs/storage-clock-alerts` runs on Vercel Cron, selects clocks where `next_alert_at <= now()` and `stopped_at is null`, inserts an `alert` row (**Rule 4.13**, routed to P1 and P2 per **Rule 4.14**), appends `storage_event`, advances `next_alert_at` and `alert_band`, and writes `audit_event`. Moving, consolidating or splitting containers can only ever inherit the earliest accumulation start date (**Rules 4.9–4.12**) — the schema offers no path that produces a later one, which is what makes restarting a clock impossible rather than merely discouraged. Alert firing is idempotent — a double cron run cannot fire the same alert twice, because advancing `next_alert_at` happens in the same transaction as the event append.

**§5 transport.** `buildShippingPaperPayload` assembles the basic description in the required sequence from the classification decision and the catalog entry, validates the emergency-response fields, and returns `RuleOutcome<ShippingPaperPayload>`. Rendering, storage and immutability per §8.

**§6 damage and air transport.** `assessDamage` maps captured findings (T-29) to `damage_assessment.status` (T-46), `battery_record.ddr_flags` (T-30) and `is_air_transport_prohibited`. **Neither assessed state is terminal** — **Rule 6.11** is the only clearing path, and it requires a superseding human assessment finding no indicator present, a stated reason, and at least one supporting photograph, which the schema enforces with a CHECK rather than trusting the form. Both assessments stay visible side by side, permanently and in every export (**Rule 6.12**). Recording a recall association is open to P1, P2 and P6 because the handler is who receives the notice and the effect is to *increase* restrictions (**Rule 6.23**); removing one is held to Rule 6.11's discipline — stated reason, attributable, never deleted, and air does not return until damage and recall are both clear (**Rule 6.24**). The word is **assessed**, never *measured* (`_ANCHORS.md` §7.5). The air-transport block is enforced at three layers: the UI does not offer the mode, the Server Action refuses it, and a database trigger raises on the shipment transition. The third is the one that matters, because it holds when the first two have a bug.

### 11.3 Assessment — Concurrent (fan-out / fan-in), B2

**Pattern: Concurrent fan-out / fan-in over one record, then a sequential grading step, human gate at the end.** Per `_ANCHORS.md` §6.

Damage triage, recall matching and hazard ranking run independently on the same `battery_record` and are reassembled; grading then consumes all three. **Concurrent is correct here for the exact reason it was wrong in §11.1: none of the three reads another's output.** Damage triage reads photos, recall matching reads identity fields against an external source, hazard ranking reads charge state, chemistry, damage indicators, age, recall status, certification marks and storage density. They share an input record and nothing else.

Grading is a **sequential** step after fan-in because it genuinely depends on all three, and it ends at a **human gate** — a grade is a commercial and safety claim and is confirmed by a person before it leaves the system.

`hazard_ranking` stores `rank_position`, `band`, a `basis_statement`, and `factors jsonb` where every factor carries its value, its weight and **its stated evidence basis**. There is no column named `probability`, `likelihood`, `risk_score` or `ignition_*`, and none may be added. Output is **a relative ranking with a stated basis per factor — never a probability of ignition** (`_ANCHORS.md` §7.1, setup §8.3, Roadmap Principle 4). This constraint binds UI copy, API responses, exports and PDFs equally.

---

## 12. Dependencies and Integrations

### 12.1 Platform dependencies

| Service | Used for | Failure posture |
|---|---|---|
| **Supabase** | Postgres, Auth, Storage | Hard dependency. Database unavailable is a full outage; the UI says so rather than showing empty lists. An empty list and an unreachable database must never look alike. |
| **Vercel** | Hosting, Cron | Hard dependency for delivery. Cron failure delays alerts; missed alerts are detected on the next run because `next_alert_at` is in the past, not lost. |
| **Sentry** | Optional error reporting | Soft. Unset `SENTRY_DSN` is a no-op. Never gates a render. |

### 12.2 Vision model provider

Interface and usage in §11.1. Integration properties:

- **Swappable by design.** `VisionProvider` in `src/lib/vision/provider.ts`; implementations in `src/lib/vision/providers/<code>.ts`; selection by `VISION_PROVIDER` in `src/lib/vision/index.ts`. Nothing outside that folder names a vendor, imports a vendor SDK, or knows a model identifier. Adding a second provider is one new file. See RN-1.
- **Timeout 45s, two retries** with jitter on 429 and 5xx, no retry on 4xx. Exhausted retries route the session to `/review` with a stated reason — **never a silent pass and never a fabricated field**.
- **Cost and latency are recorded per call** on `label_extraction`, so provider comparison at Gate 3 is a query rather than a procurement conversation.
- **`fixture` provider** is the CI and mock default. No test spends money or requires network.
- **Keys** live in `VISION_API_KEY`, server-only, never behind `NEXT_PUBLIC_`, never logged.

### 12.3 Government recall API

Free, public, **no authentication** — so there is no key to leak and no per-tenant credential to manage.

Two sources behind one interface, because the product covers two worlds: `NHTSA_RECALL_BASE_URL` for vehicle-derived packs and `CPSC_RECALL_BASE_URL` for consumer and mobility-device products. `RecallProvider` in `src/lib/recalls/provider.ts` exposes `search(query): Promise<RecallHit[]>`; the caller does not know which source answered.

Matching (B2) runs on intake and nightly via `POST /api/jobs/recall-sync`, writing `recall_match` with `source`, `provider_record_id`, `matched_on jsonb` (which fields produced the match), `match_confidence`, recall number, title, URL, publication date and remedy summary. **A match is a candidate, not a fact** — it is surfaced to a human to confirm or dismiss, and `confirmed_by` / `dismissed_reason` record which happened.

**Unavailability never blocks intake.** A failed check records a pending state with a reason and is retried by the next job run. Rate limiting is respectful: bounded concurrency, exponential backoff, and results cached — an unauthenticated public service is a courtesy, and hammering it is how it stops being one.

### 12.4 Third-party battery-health tester hook — build the socket, choose the tester later

Roadmap Principle 7 and Decision D-11: BMMP integrates health measurement, it does not build it. The vendor is an open decision at Gate 3 (Roadmap §7, decision 6). **This spec fixes the socket now so that choosing a vendor later is a configuration exercise, not a schema change.**

Two directions, both behind `HealthTesterAdapter` in `src/lib/health-tester/adapter.ts`:

```ts
export interface HealthTesterReading {
  readonly vendorCode: string
  readonly instrumentModel: string
  readonly instrumentSerial: string
  readonly deviceIdentifier: string        // what the tester was clipped to
  readonly readAt: string                  // ISO 8601
  readonly measurements: Readonly<Record<string, number | string | null>>
  readonly vendorRaw: unknown              // stored verbatim
}

export interface HealthTesterAdapter {
  readonly code: string
  parseWebhook(body: unknown, headers: Headers): HealthTesterReading      // push
  fetchReading(deviceIdentifier: string): Promise<HealthTesterReading>    // pull
}
```

- **Push:** `POST /api/webhooks/health-tester`, authenticated by HMAC-SHA256 over the raw body using `HEALTH_TESTER_WEBHOOK_SECRET`, with `X-Idempotency-Key` so a retried delivery cannot produce a duplicate assessment. Signature verification happens before parsing, on the raw bytes.
- **Pull:** for testers that expose an API instead of webhooks. Same adapter, same landing place.

Readings land on `damage_assessment` via `instrument_vendor`, `instrument_model`, `instrument_serial`, `instrument_read_at` and `instrument_reading jsonb`, with `assessment_method` marking the row as instrument-sourced. No new entity is created for this in B1a — see **RN-2**.

**Language, binding:** the output is `assessed_condition`. Not measured condition. BMMP records what a third-party instrument reported, with the instrument's identity attached, and it never presents that as BMMP's own measurement (`_ANCHORS.md` §7.5, Roadmap Principle 7).

### 12.5 Package dependencies

Runtime: `next`, `react`, `react-dom`, `zod`, `@supabase/supabase-js`, `@supabase/ssr`, `tailwindcss`, the shadcn/radix set, `@react-pdf/renderer`, `qrcode`, `sharp`, `date-fns`, `@date-fns/tz`, `@sentry/nextjs` (optional).
Development: `typescript`, `vitest`, `@playwright/test`, `eslint` + `@next/eslint-plugin-next` + `typescript-eslint`, `prettier` + `prettier-plugin-tailwindcss`, `husky`, `lint-staged`, `msw` (for provider-level integration tests without network), `supabase` CLI.

**The rule for adding a dependency:** it earns its place by removing a decision or a class of defect, and anything touching a vendor API is imported only inside its `src/lib/<integration>/providers/` folder. A dependency that crosses the data seam or the domain boundary is rejected regardless of merit.

---

*Next Sketch LLC · Confidential · August 2026*
