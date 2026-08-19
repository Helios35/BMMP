# Site Architecture — BMMP
**Version:** 1.0 · **Date:** 2026-08-11 · **Owner:** Nathan Ivy / Next Sketch LLC
**Answers:** How is the product structured — what pages exist, how they connect, and who can reach them?
**Reads from:** `_ANCHORS.md` · `PROJECT_SETUP_BMMP.md` · `VISION.md` · `PRD.md` · Roadmap v3.0 (2026-07-28) · Decision Log D-1–D-11  ·  **Feeds:** `UX_SPEC.md` · `TECHNICAL_SPEC.md` · `ERD.md` · builder briefs

> ## REVIEW NOTES
> None open. All review notes for this document were answered on 2026-08-19 — see `Decision Log.md` **D-20** for the full disposition, and D-21 through D-26 for the calls that carry their own rationale. Content below is unchanged.

---

## Changelog

*Resolved judgment calls, kept rather than deleted so the reasoning survives the decision.*

**CL-1 · 2026-08-11 · `/review` is reachable by P2, view-only. RN-3 resolved — against this document's original recommendation.**

`_ANCHORS.md` §5 now reads `/review` → **"P1, P6 resolve · P2 view-only"**, and `BUSINESS_RULES.md` Rule 2.22 stands as written. This document previously recommended the opposite, on the grounds that P2's dashboard count was sufficient visibility. The owner's call, and the reasoning that overrides it:

> A battery that has not cleared the confidence gate has **no confirmed chemistry** (Rule 2.8). Without confirmed chemistry it cannot be classified (Rule 3.3), and without a classification it cannot be correctly segregated (Rule 4.28) or clocked against the right accumulation period (Rule 4.5). **A backing-up review queue is therefore a storage-compliance problem**, and storage compliance is P2's job — she answers to the fire marshal and the insurer for it. The dashboard count tells her the queue is growing; it does not tell her **which** of the batteries sitting in her containers are the unidentified ones, which is the question she actually has to answer. Blocking her from the list means she finds out through a segregation violation instead.

**Viewing is not confirming.** Rule 2.22 already forbids P2 confirming, and §5.2 below encodes view-only rather than write. The original instinct behind RN-3 — that a builder must not split the difference between two disagreeing documents — was right, and is why this is now written in one place instead of inferred in three.

---

## 0. How to read this document

**Scope.** B1a (17 Aug – 16 Oct 2026). Every route in this document is one of the FIXED routes in `_ANCHORS.md` §5. None have been added, renamed or dropped. B1b, B2 and B3 surfaces are named where a B1a screen has to leave room for them, and are marked `[B1b]`, `[B2]`, `[B3]`.

**What this document owns.** Structure: what pages exist, how they nest, how a user moves between them, and who can reach them.

**What it does not own.**

| If you are looking for… | Read instead |
|---|---|
| What a screen looks like, its states, its components | `UX_SPEC.md` |
| Whether a decision is allowed, and on what basis | `BUSINESS_RULES.md` (sections FIXED in `_ANCHORS.md` §4) |
| The valid values of a status, category or label | `TAXONOMY.md` |
| Tables, columns, endpoints | `TECHNICAL_SPEC.md` / `ERD.md` |

**Citation convention.** `Rule n.m` = that numbered rule in `BUSINESS_RULES.md`; `BR §n` = the whole section, where the point is the area rather than one rule. Section numbers are FIXED per `_ANCHORS.md` §4 and do not move.

**Build context.** The first shipped slice is a **mock-data prototype**. Every route in this document reads its data through `src/data` and the `DataAdapter` contract (`PROJECT_SETUP_BMMP.md` §3.2). **No page, layout, component or route handler in this architecture talks to Supabase directly.** The routes and the navigation are identical either side of the adapter swap; if a route has to change when `DATA_ADAPTER` flips, the seam leaked.

**Language rules that bind this document** (`_ANCHORS.md` §7): a label is *read*, chemistry is *matched from the catalog and confirmed by a human*; condition is *assessed*, never *measured*; hazard is a *relative ranking with a stated basis per factor*, never a probability or percentage of ignition; no jurisdiction threshold, deadline or citation appears as a literal anywhere — those are data.

---

## 1. Sitemap

### 1.1 Route tree

Route groups follow `PROJECT_SETUP_BMMP.md` §3.1. `(auth)` and `(app)` are organizational groups and contribute no URL segment.

```
src/app/
│
├── (auth)/                                   PUBLIC — no app shell, no nav
│   ├── layout.tsx                            centered card, product mark, no chrome
│   ├── sign-in/page.tsx ─────────────────▶   /sign-in
│   ├── sign-up/page.tsx ─────────────────▶   /sign-up
│   └── invite/[token]/page.tsx ──────────▶   /invite/[token]
│
├── (app)/                                    AUTHENTICATED — app shell
│   ├── layout.tsx                            sidebar / bottom bar, top bar, org switcher,
│   │                                         alert bell, command palette, toaster
│   │
│   ├── page.tsx ─────────────────────────▶   /                        Dashboard
│   │
│   ├── batteries/
│   │   ├── page.tsx ─────────────────────▶   /batteries              List
│   │   ├── new/page.tsx ─────────────────▶   /batteries/new          Intake — 3 steps
│   │   └── [id]/page.tsx ────────────────▶   /batteries/[id]         Record detail
│   │
│   ├── review/page.tsx ──────────────────▶   /review                 Confidence-gated queue
│   │
│   ├── containers/
│   │   ├── page.tsx ─────────────────────▶   /containers             List
│   │   └── [id]/page.tsx ────────────────▶   /containers/[id]        Detail + label
│   │
│   ├── shipments/
│   │   ├── page.tsx ─────────────────────▶   /shipments              List
│   │   ├── new/page.tsx ─────────────────▶   /shipments/new          Build a shipment
│   │   └── [id]/page.tsx ────────────────▶   /shipments/[id]         Detail + shipping paper
│   │
│   ├── documents/[id]/page.tsx ──────────▶   /documents/[id]         Viewer / print / download
│   │
│   ├── catalog/
│   │   ├── page.tsx ─────────────────────▶   /catalog                Browse + search
│   │   └── [id]/page.tsx ────────────────▶   /catalog/[id]           Entry detail
│   │
│   ├── settings/
│   │   ├── organization/page.tsx ────────▶   /settings/organization  Org + jurisdiction profile
│   │   ├── users/page.tsx ───────────────▶   /settings/users         Members and roles
│   │   └── catalog/page.tsx ─────────────▶   /settings/catalog       Propose / edit entries
│   │
│   └── audit/page.tsx ───────────────────▶   /audit                  Audit log + export
│
└── api/                                      route handlers only — no UI
```

**20 routes. That is the complete B1a surface.** Anything a user needs to do in B1a happens on one of these twenty pages. If a build brief implies a twenty-first, that is a decision-log entry, not a builder's call.

### 1.2 Depth

Nothing sits more than three segments deep. There are no nested detail-within-detail routes: a battery opened from a container detail navigates to `/batteries/[id]` with a breadcrumb back, it does not open at `/containers/[id]/batteries/[id]`.

### 1.3 Modal vs. route

| Interaction | Treatment | Why |
|---|---|---|
| Intake (photo → review → confirm) | **Route** `/batteries/new`, 3 steps, step in the URL as `?step=` | Long-running, resumable, deep-linkable from `/review`, survives a phone locking |
| Building a shipment | **Route** `/shipments/new`, 3 steps | Same — multi-select then commit, must survive interruption |
| Resolving one review item | **Route** `/review` with the item selected via `?item=` | Deep-linkable from the dashboard and from a notification |
| Editing an assessed condition on an existing record | **Dialog** on `/batteries/[id]` | Short, single-purpose, no navigation cost |
| Recording a storage event | **Dialog** on `/containers/[id]` | Short |
| Inviting a member, editing a role | **Dialog** on `/settings/users` | Short |
| Confirming a destructive or blocking outcome | **AlertDialog** | Requires an explicit second act |
| Viewing any generated document | **Route** `/documents/[id]` | Printable, shareable, addressable, retained for audit |

**Rule:** if the thing produces a durable artifact or takes more than one screenful of decisions, it is a route. Everything else is a dialog.

---

## 2. Navigation Structure

### 2.1 Primary navigation — desktop (≥1024px)

Left sidebar, 240px, collapsible to a 64px icon rail. Persistent across every `(app)` route. Current route highlighted; the highlight is a filled background plus a 3px left bar, never colour alone.

| Order | Item | Route | Badge | Visible to |
|---|---|---|---|---|
| 1 | Dashboard | `/` | — | P1 P2 P3 P4 P5 P6 |
| 2 | Batteries | `/batteries` | — | P1 P2 P3 P4 P5 P6 |
| 3 | Review | `/review` | open-item count | P1 P2 P6 |
| 4 | Containers | `/containers` | alerting-container count | P1 P2 P3 P4 P5 P6 |
| 5 | Shipments | `/shipments` | — | P1 P2 P3 P4 P5 P6 |
| 6 | Catalog | `/catalog` | — | P1 P2 P3 P4 P5 P6 |
| 7 | Audit | `/audit` | — | P2 P5 P6 |
| 8 | Settings ▸ | group | — | P2 P6 (P6 only sees Catalog) |
| 8a | ↳ Organization | `/settings/organization` | — | P2 P6 |
| 8b | ↳ Users | `/settings/users` | — | P2 P6 |
| 8c | ↳ Catalog | `/settings/catalog` | — | P6 |

**Rule: a nav item the current role cannot reach is not rendered.** No greyed-out nav, no dead links, no "upgrade" affordances. The Settings group renders only if the role can reach at least one child, and renders only the children it can reach.

### 2.2 Primary navigation — mobile (<768px)

Bottom tab bar, fixed, safe-area inset, five slots. This is the warehouse and storage-room form factor and it is the default the intake flow is designed against.

| Slot | P1 / P6 | P2 | P3 / P4 / P5 |
|---|---|---|---|
| 1 | Home `/` | Home `/` | Home `/` |
| 2 | Batteries `/batteries` | Containers `/containers` | Batteries `/batteries` |
| 3 (centre, raised, primary) | **Log** → `/batteries/new` | Containers filter: alerting | Shipments `/shipments` |
| — | *(Review is in More)* | **Review `/review` is in More, view-only** | — |
| 4 | Containers `/containers` | Batteries `/batteries` | Containers `/containers` |
| 5 | More (Sheet) | More (Sheet) | More (Sheet) |

The centre slot is the single most-used action for that role. For P1 and P6 that is logging a battery; the tab is a raised primary button, 64px, reachable one-handed.

**More** opens a `Sheet` from the bottom containing every route the role can reach that is not on the bar, plus the organization switcher, the signed-in identity and Sign out.

### 2.3 Tablet (768–1023px)

Sidebar collapses to the 64px icon rail with tooltips. No bottom bar. Content uses the full remaining width.

### 2.4 Global chrome — present on every `(app)` route

| Element | Behaviour |
|---|---|
| **Organization switcher** | Top-left. Rendered only when the signed-in user holds more than one `membership`. Switching re-scopes every query and returns to `/`. |
| **Global search / command palette** | `⌘K` / `Ctrl K` on desktop; a search icon in the top bar on mobile. Searches battery records (ID, serial, model), containers (label ID), shipments (number) and catalog entries, and navigates to pages. **Results are role-filtered** — a role that cannot reach `/containers/[id]` gets no container results. |
| **Alert bell** | Count of open `alert` records for this role. Opens a popover with the five most urgent and "View all" → `/`. Alert kinds: storage-clock tiers, overdue containers, over-limit container quantity, open review items. **An alert is a stored `alert` record, not view state computed on render** — that is what gives it a raised-at time, a target role, an addressable identity for a deep link, and an audit trail when it is raised, re-tiered or resolved. |
| **User menu** | Identity, active role, Sign out. |
| **Toaster** | Bottom-centre on mobile, bottom-right on desktop. |
| **Breadcrumbs** | On every detail and multi-step route. Never on list routes. |

### 2.5 Secondary navigation — within a route

| Route | Tabs |
|---|---|
| `/batteries/[id]` | Overview · Photos & extraction · Documents · History |
| `/containers/[id]` | Contents · Label · History |
| `/shipments/[id]` | Shipping paper · Contents · History |
| `/batteries/new` | Stepper: 1 Photo · 2 Extraction review · 3 Confirm & place |
| `/shipments/new` | Stepper: 1 Contents · 2 Transport · 3 Review & generate |
| `/settings/*` | Section list (sidebar sub-nav on desktop, segmented control on mobile) |
| `/catalog/[id]` | none — single page |

Tab state lives in the URL (`?tab=`) so a link into a specific tab works from a document, an alert or an audit row.

### 2.6 Cross-route entry points

The paths a user actually takes. Every one of these is a required link, not an optional nicety.

| From | To | Trigger |
|---|---|---|
| `/` alert | `/containers?filter=alerting` | Storage-clock alert card |
| `/` alert | `/review` | Open review items card — P1 and P6 to resolve, P2 to see which of her containers hold them (CL-1) |
| `/` | `/batteries/new` | "Log a battery" primary action (P1, P6) |
| `/batteries` row | `/batteries/[id]` | Row click |
| `/batteries` | `/batteries/new` | Header primary action (P1, P6) |
| `/batteries/new` step 2 | `/review` | "Save to review queue" on a low-confidence read |
| `/batteries/new` step 2 | `/catalog?q=` | "Search the catalog" on a catalog miss |
| `/batteries/new` commit | `/batteries/[id]` | Success |
| `/review` item | `/batteries/[id]` | After the item is resolved and committed |
| `/batteries/[id]` | `/containers/[id]` | "In container" link (P1, P2, P6 only — see §5.2) |
| `/batteries/[id]` | `/catalog/[id]` | "Matched catalog entry" link |
| `/batteries/[id]` | `/documents/[id]` | Any linked document |
| `/batteries/[id]` | `/shipments/[id]` | The shipment this record travelled on |
| `/containers` row | `/containers/[id]` | Row click (P1, P2, P6 only) |
| `/containers/[id]` | `/documents/[id]` | "Generate / print container label" |
| `/containers/[id]` | `/shipments/new?containers=` | "Ship this container" (P1, P6 only) |
| `/containers/[id]` | `/batteries/[id]` | Contents row |
| `/shipments` | `/shipments/new` | Header primary action (P1, P6) |
| `/shipments/new` commit | `/shipments/[id]` | Success |
| `/shipments/[id]` | `/documents/[id]` | Shipping paper, container labels |
| `/shipments/[id]` | `/batteries/[id]` | Contents row |
| `/catalog` row | `/catalog/[id]` | Row click |
| `/catalog/[id]` | `/settings/catalog?entry=` | "Edit this entry" (P6) |
| `/audit` row | the referenced record | Entity link, role-filtered |
| Any blocked action | the record that caused the block | Inline link inside the block message |

---

## 3. User Flows

Each flow lists the actor, the entry point, every step with its route, the branches, and what is written. Entities are the FIXED names from `_ANCHORS.md` §3. Steps that invoke a decision cite the owning Business Rules section.

The intake pipeline referenced in Flow A is **sequential, code-orchestrated, with a human gate at the end** (`_ANCHORS.md` §6). Fixed order. No step chooses the next step. Every step writes an `audit_event`.

---

### Flow A — P1 logs a battery, photo to confirmed record

**Actor:** P1 Compliance Handler (P6 may also run it). **Form factor:** phone, standing at the pallet. **Entry:** `/` "Log a battery", `/batteries` header action, or the centre tab on mobile.

| # | Route | Actor does | System does |
|---|---|---|---|
| A1 | `/batteries/new?step=1` | Photographs the **label**. Optionally adds a whole-pack photo and, if relevant, a damage photo. | Creates a draft `intake_session`; stores each capture as an `intake_photo`. Draft is resumable — locking the phone does not lose it. |
| A2 | `/batteries/new?step=1` (working state) | Waits, or cancels. | Runs the pipeline in fixed order: label crop → vision extraction producing **per-field values and per-field confidence** → catalog match → **confidence gate**. Writes `label_extraction`. Decodes any date code into a manufacture date via `date_code_decode` (deterministic rules, not a model). |
| A3 | `/batteries/new?step=2` | Reviews every extracted field. Corrects what is wrong. **Confirms** the values. | Presents each field with its value, its confidence and **where the value came from** — read from the label, matched from the catalog, decoded, or entered by hand. Chemistry is shown as *matched from the catalog entry*, never as read from the image, and is unconfirmed until P1 confirms it (`_ANCHORS.md` §7.2). |
| A4 | `/batteries/new?step=3` | Records state of charge at intake and **assessed condition**. Assigns a `container`, or creates/joins a `lot`. | Runs the light-waste-category vs full-hazardous determination — only after identification is confirmed (Rule 3.3) — and shows the outcome **with its recorded reasoning** (Rule 3.7). Shows which `storage_clock` the record will join. Blocks rather than defaults if the site has no jurisdiction profile (Rule 3.10). |
| A5 | commit | Presses **Confirm and log battery**. | Writes `battery_record`; stores photo + label crop + confirmed facts as a **linked set** (D-2, D-7); writes `classification_decision` with reasoning; starts or joins the container's `storage_clock` and writes a `storage_event`; writes `audit_event` for every pipeline step and for the human confirmation. |
| A6 | `/batteries/[id]` | — | Redirects with a success toast and a **Log another** action that returns to step 1 with the container context retained. |

**Hard gate (`_ANCHORS.md` §6; Rules 2.13, 2.15, 2.17).** **Chemistry, model and condition cannot be committed without explicit human confirmation, at any confidence level.** The gate's *existence* is not a setting, a default or a feature flag; only its threshold *value* is data. No role may disable, bypass, defer or lower it — not P1, not P2, not P6 (Rule 2.17). Only P1 and P6 may confirm an identification (Rule 2.22). Commit is unavailable until all three are confirmed by a person.

#### Branch A-a — low confidence → `/review`

Triggered when **any single** field falls below the applicable threshold — and the **whole record** routes to review, not just that field (Rule 2.14). The threshold value is read from configuration (Rule 2.16); it is never a literal in a component.

1. At step 2 the record carries a "Needs review" state. **Nothing auto-commits** — not the low-confidence field, not the rest of the record.
2. P1 gets exactly two paths, and both are always offered:
   - **Resolve now** — correct and confirm the flagged fields inline, in the same review component, and continue to step 3.
   - **Save to review queue** — the `intake_session` persists with its extraction, the flow exits, and the item appears on `/review`. The `/review` nav badge and the dashboard count both increment.
3. Abandoning the flow (closing the tab, locking the phone, losing signal) has the same effect as *Save to review queue*. Work is never lost and never silently committed.
4. Later, from `/review?item=<id>`, P1 or P6 opens the item in the same review component, corrects, confirms the three gated fields, and commits. On commit the item leaves the queue and the flow resumes at A5/A6. **An item leaves the queue in exactly two ways: a human confirms it, or a human voids it with a stated reason. It never times out into a confirmed state and never ages out** (Rule 2.23).
5. The person who confirms is recorded on the `label_extraction` and in `audit_event`. The original extracted value is retained alongside the corrected value — that pair is what the B2 label-image corpus is made of (D-7).
6. **P2 sees the item too, view-only** (CL-1). An unconfirmed record has no confirmed chemistry, so it cannot be classified, segregated or clocked correctly — which makes a backing-up queue P2's problem as much as P1's. She sees which of her containers hold unidentified records and can open the record and the container; she cannot confirm or void (Rule 2.22). P3, P4 and P5 do not reach `/review` at all.

#### Branch A-b — catalog miss, no match found

1. Step 2 shows a **No catalog match** state, distinct from a low-confidence state.
2. P1 may: search the catalog by hand (opens the command palette scoped to `catalog_entry`, or `/catalog?q=` in a new tab); enter the identifying fields manually; or **propose a new catalog entry**, which queues for P6 at `/settings/catalog`.
3. A record may be committed with no catalog match, on the manual entry path, marked as manually identified (Rule 2.20). Chemistry is then a **manual entry confirmed by a human** (Rule 2.10), and the record still classifies (BR §3) and still gets a storage clock.
4. **But it cannot ship yet.** Shipping identifiers are derived from the matched catalog entry together with the active classification decision; they are never free-typed and never guessed. A record with no shipping identifiers **blocks shipping-paper generation** (Rule 5.9). The intake screen must say so at the moment of the miss, not leave the handler to discover it at `/shipments/new`.
5. The unblocking path is Flow F: P6 approves the proposed entry, the record is raised on `/review` for a human to confirm the match, and the shipping identifiers resolve.
6. See §6, Edge Case E-5.

#### Branch A-c — the label cannot be read at all

Zero fields extracted. This is not a low-confidence case; treat it separately. Step 2 shows a no-read state with retake guidance and offers full manual entry. See `UX_SPEC.md` §5 and Edge Case E-4.

#### Branch A-d — damaged or defective condition

P1 sets the assessed condition to the damaged/defective value at step 3. See **Flow D**.

**Failure handling:** photo upload failure → Edge Case E-3. Extraction service failure → the session is preserved, P1 may retry or enter manually, and the failure is written to `audit_event`. Commit failure → the draft persists, nothing partial is written, and the error names the field or rule that rejected it.

---

### Flow B — P1 builds a shipment and gets a shipping paper and a container label

**Actor:** P1 (or P6). **Form factor:** desktop typically, mobile supported. **Entry:** `/shipments` header action, or `/containers/[id]` → "Ship this container" (which pre-selects it).

| # | Route | Actor does | System does |
|---|---|---|---|
| B1 | `/shipments/new?step=1` | Selects one or more `container`s and/or `lot`s. | Shows a live contents summary: record count, chemistries present, aggregate mass and energy where known, condition flags, and **any damaged/defective record in scope, named**. |
| B2 | `/shipments/new?step=2` | Picks transport mode, carrier and destination facility. | **Air is hard-blocked if any record in scope is damaged, defective or recalled** (Rules 5.11, 6.7). See Flow D. Carrier and transporter details are recorded on the shipment before departure (Rule 5.16). |
| B3 | `/shipments/new?step=3` | Reviews the generated shipping paper before committing. | Renders the basic description per line, the emergency response information, and the **verified 24-hour emergency contact number** from the organization profile. **Every unmet precondition is listed by name** (Rule 5.3): unconfirmed identifications, missing classifications, mode conflicts, an unverified emergency number, missing destination or transporter details, missing shipping identifiers (Rule 5.9). A missing or unverified number blocks generation and is never replaced with a placeholder (Rules 5.6, 5.7) — Edge Case E-11. Where a line classified as full hazardous, **the manifest obligation is stated prominently and the shipment is never presented as fully documented** (Rule 3.12) — Edge Case E-15. |
| B4 | commit | Presses **Generate shipping paper**. | Writes `shipment`; renders `shipping_paper` as an **immutable** `document_render` (Rule 5.12); makes a `container_label` available for each container in scope; writes `storage_event` rows; writes `audit_event`. Retention is read from jurisdiction data, never a literal (Rules 5.18, 1.23). |
| B5 | `/shipments/[id]` | — | Redirects. Shipping paper preview, **Print**, **Download PDF**, and **Print container label** per container. |
| B6 | `/documents/[id]` | Prints. | Full-page print-optimised viewer. Printing is a real browser print against a print stylesheet, Letter by default. Every render is a retained `document_render` — a reprint is a new instance, and both are in the audit trail. |

**Container labels do not require a shipment.** A `container_label` carries the accumulation start date and exists as soon as a container holds anything. P1, P2 and P6 generate and print it from `/containers/[id]` → Label tab, independently of Flow B. This matters: the label is a standing storage-area requirement, not a shipping artifact. **A container holding contents with no current printed label cannot be added to a shipment** under the container-marking demonstration method (Rule 4.22), and a container whose printed start date no longer matches its current one is flagged mislabeled and must be relabelled first (Rule 4.19).

**Failure handling:** a container whose contents changed between step 1 and commit → the form re-validates, names what changed, and returns the user to step 1 with the selection intact. **Changing contents after a paper has been generated voids that paper immediately**; the shipment returns to a state requiring regeneration and the voided render is retained and marked (Rules 5.13, 5.14). Document render failure → the `shipment` is still written, `/shipments/[id]` shows a render-failed state with **Retry**, and the shipment cannot depart until a paper renders.

---

### Flow C — P2 responds to a storage-clock alert

**Actor:** P2 Facility Manager. **Form factor:** phone in the storage room, desktop at the desk. **Entry:** the dashboard alert region, or the alert bell.

| # | Route | Actor does | System does |
|---|---|---|---|
| C1 | `/` | Reads the alert region, ordered most urgent first. | Orders: overdue → the configured remaining-time alert ladder → over-limit container quantity → open review items. The ladder is configuration data seeded with the roadmap's default tiers; the tier *names* are `TAXONOMY.md` (Rule 4.13). Alerts go to P2 always, and to P1 for containers at their site (Rule 4.14). |
| C2 | `/containers?filter=alerting` | Opens the alert. | Filters the list to alerting containers. Filter state is in the URL and is shareable. |
| C3 | `/containers/[id]` | Opens the container. | Shows the storage clock — accumulation start date, elapsed, remaining, tier — the contents, and the fill reading against the per-container limit **supplied by the site's jurisdiction and fire-code data**. The limit value and its unit are read from `jurisdiction_rule`; the UI renders whatever number and unit the rule supplies and assumes nothing (Rule 1.23). Every date is computed in the **site's local time zone** (Rule 4.29). In B1a, crossing a limit raises a warning to P2 with the limit's source stated — the monitoring and evidence behaviour is `[B1b]` §9 and **B1a must not implement it ahead of specification** (Rule 4.26). |
| C4 | `/containers/[id]` | Chooses a response. | Three are available to P2: (a) record a `storage_event` — inspection, consolidation, relocation; (b) regenerate and reprint the `container_label` where the system has flagged it as needing it (Rules 4.19, 4.21); (c) **mark the container ready to ship**, which sets the container's ready-to-ship status (value in `TAXONOMY.md`), writes a `storage_event`, and raises it on `/` for P1 and P6. On an **overdue** container, a fourth appears: **record a remediation** stating what was done and why (Rule 4.17). |
| C5 | `/review` | Checks what in her containers is still unidentified. | View-only list of open queue items **keyed on the container each one sits in** (CL-1). An unconfirmed record has no confirmed chemistry, so it cannot be classified (Rule 3.3) and therefore cannot be validated against its container's segregation class (Rule 4.28). This is the question the dashboard count cannot answer. She can open the record or the container; she cannot confirm or void (Rule 2.22). |
| C6 | `/` | — | The alert re-tiers, or moves to a handed-off state if C4(c) was taken. An `audit_event` records who did what, when, and with what stated reason. |

**The clock never pauses.** There is no hold, freeze, suspend or extension. A container in dispute, under inspection or awaiting a carrier keeps counting (Rule 4.6). **Moving batteries between containers is never a way to restart a clock** — accumulation start dates travel with the records, a receiving container inherits the earliest, and consolidation and splitting both inherit the earliest (Rules 4.9–4.12). The system makes that impossible rather than merely discouraged, so no screen may offer a re-dating affordance.

**P2 cannot build the shipment.** `/shipments/new` is P1/P6 only per `_ANCHORS.md` §5. P2's terminal action on a full or ageing container is the hand-off in C4(c). This asymmetry is intentional and must be visible in the UI, not discovered by a failed click: on `/containers/[id]`, P2 sees "Mark ready to ship" where P1 and P6 see "Ship this container".

**Overdue is a hard state, not a warning** (Rule 4.15). An overdue container **accepts no new items** (Rule 4.16), and its contents leave by exactly two paths: on a shipment, or by a recorded remediation entered by P2 (Rule 4.17). A remediation does not alter the accumulation start date and is never a silent status change. Nobody, including P6, can dismiss or snooze it. See Edge Case E-6.

---

### Flow D — P1 hits the damaged-battery path and air transport is hard-blocked

**Actor:** P1 (or P6). **Entry:** step 3 of intake, or `/batteries/[id]` → Edit assessed condition.

| # | Route | Actor does | System does |
|---|---|---|---|
| D1 | `/batteries/new?step=3` or `/batteries/[id]` | Confirms at least one indicator from the taxonomy's **damaged-or-defective indicator set**. | Writes `damage_assessment`. **No damage assessment is ever produced without human confirmation, at any confidence** (Rule 6.6); a model may propose indicators, a model never sets them (Rule 6.2). Prompts for a damage photo — it feeds the B2 labelled damage set (Rule 7.11, D-7), and no public equivalent exists. A **recall association is handled in the same class** as damage for transport and segregation (Rule 6.5). |
| D2 | `/batteries/[id]` | — | A persistent, non-dismissible destructive Alert states the finding and lists the handling consequences carried by the governing rule version **as data** — outer-packaging class, marking requirements and their dimensions, segregation (Rule 6.15) — **and that air transport is prohibited for this record**. |
| D3 | `/containers/[id]` | Routes the record to quarantine. | The record **cannot remain in general stock**: it is routed to a segregated quarantine container at its site, and that routing is a required action, not a suggestion (Rule 6.17). A container holds one segregation class (Rules 4.28, 6.18). **Damage does not stop the clock** — the accumulation start date travels with the record into quarantine (Rule 6.19). |
| D4 | `/batteries/[id]` | — | Damage discovered after intake triggers a re-classification check, because the damage assessment is a classification input (Rules 3.4, 3.15, 6.20). |
| D5 | `/shipments/new?step=2` | Tries to pick a transport mode. | The **Air** option is rendered **visible and not selectable**, with: a plain-language statement of the prohibition; the citation carried by the governing rule version; the list of specific records causing the block; and, for each, **the specific indicator that triggered it** (Rule 6.9). It is never hidden — a handler who cannot see why the option is gone will call someone. |
| D6 | `/shipments/new?step=2` | Looks for a way forward. | The same surface offers **exactly three paths and no others** (Rule 6.10): ship by a non-air mode; remove the blocking records and ship the remainder by air; or re-assess the damage on a specific record. They are offered as actions, not as advice. |
| D7 | `/shipments/new?step=1→2` | Adds a damaged record *after* selecting air. | The addition is blocked at the moment of assembly (Rule 6.13). If the confirmation lands on a record **already** assigned to an open air shipment, that record is removed from the shipment automatically, its shipping paper is voided, the shipment returns to a state requiring regeneration, and P1 and P2 are notified with the reason (Rule 6.14). |
| D8 | server | — | The same rule is re-evaluated at commit. A request arriving with air selected is rejected with the same stated reason. **The client block is never the only enforcement.** |
| D9 | `/shipments/[id]` | Picks ground and commits. | The shipping paper renders with the damaged/defective handling information; the damaged/defective packet is generated as part of the shipment's document set and **its absence blocks departure** (Rule 6.16). A blocked attempt, if one was made, is written to `audit_event` (Rule 6.21). |

**There is no override.** No admin bypass, no "proceed anyway", no acknowledge-and-proceed, no "I understand the risk" checkbox, no supervisor approval path, no support grant, no import path, no API call. **P6 sees exactly the same block as P1** (Rules 6.7, 6.8, 1.20). It is stated again in `UX_SPEC.md` §2.6 as a component-level rule so no builder invents an escape hatch.

**The only way the block clears** is a new damage assessment, entered by a human, finding no damaged-or-defective indicator present, carrying a stated reason for the change and **at least one photograph supporting it** (Rule 6.11). The block clears because the record's assessed condition changed — never because someone chose to proceed. The superseded assessment stays visible alongside the current one with its author, timestamp, indicators and evidence, permanently and in every export (Rule 6.12). A reversed damage finding is exactly what an auditor will look for, and the product makes that easy rather than hard.

---

### Flow E — an invited user joins the organization

**Actor:** any persona. **Entry:** an emailed link.

1. `/invite/[token]` — public. Shows the inviting organization, the role being granted, and who invited them. Never shows tenant data.
2. Token is valid and the user has no account → `/sign-up` with the email pre-filled and the token carried; token is valid and the user has an account → `/sign-in` with the token carried.
3. On authentication, `membership` is created with the invited role. The member **acknowledges** the Terms of Service on first sign-in; the acknowledgement is recorded per user and is **a record, not a second gate** (Rule 7.20).
4. **Consent is the organization's, not the individual's** (Rule 7.19). A new P1 joining an organization whose acceptance is already in force may log batteries immediately. Where no acceptance is in force, **intake is blocked organization-wide** — every other read-only surface stays available so the organization can be set up while consent is pending (Rule 7.2). See Edge Case E-14.
5. Acceptance itself is made by a member holding binding authority — the founding member created at sign-up, or a P2 to whom it has been assigned. **P1, P3 and P4 cannot accept on the organization's behalf. P5 cannot accept anything. P6 can never accept on a tenant's behalf, under any circumstance, including under a support grant** (Rules 7.3, 7.4, 1.19).
6. Redirect to `/`. Nav renders for the granted role.
7. Token expired, already used, or revoked → a stated reason and a "Request a new invitation" action. Never a raw error page. Only P2 and P6 may invite or revoke (Rule 1.9).

---

### Flow F — P6 resolves a proposed catalog entry (a catalog miss, closed)

1. A catalog miss in Flow A branch A-b creates a proposed `catalog_entry`.
2. P6 opens `/settings/catalog`, filtered to proposals.
3. P6 reviews the proposal against the linked `intake_photo` and label crop, edits the fields, and approves or rejects with a reason.
4. On approval the entry becomes searchable at `/catalog`, and every `battery_record` that was committed unmatched against the same identifying fields is offered a re-match. **Re-matching never silently changes a confirmed chemistry** — it raises the record on `/review` for a human to confirm.
5. `audit_event` records the approval and every re-match confirmation.

---

### Flow G — P5 reads the evidence at audit or renewal

1. P5 signs in with an auditor `membership` and lands on `/`, which renders in read-only form with no create actions.
2. P5 opens `/audit`, filters by date range, actor, entity type and event type, and exports (BR §12). The retention period is read from jurisdiction data, never written as a number (Rules 5.18, 1.23). P5 may view and download within an active grant's scope and may generate nothing (Rule 5.27).
3. P5 opens `/batteries`, `/batteries/[id]`, `/shipments`, `/shipments/[id]`, `/documents/[id]`, `/catalog` — all read-only.
4. P5 **cannot** open `/containers/[id]`, `/batteries/new`, `/review`, `/shipments/new` or any `/settings/*` route. See RN-1.
5. Every mutating control P5 encounters is disabled with a stated reason, not hidden — the auditor is assessing the system's controls, and invisible controls cannot be assessed. Destructive controls are omitted entirely. See Edge Case E-8.

---

## 4. Page Inventory

| # | Route | Name | Purpose — one line | Primary entity | Phase |
|---|---|---|---|---|---|
| 1 | `/sign-in` | Sign in | Authenticate an existing user into an organization. | `user` | B1a |
| 2 | `/sign-up` | Sign up | Create an account and accept the Terms of Service, including the data training-rights grant. | `user`, `tos_acceptance` | B1a |
| 3 | `/invite/[token]` | Accept invitation | Turn an invitation token into a `membership` with a named role. | `membership` | B1a |
| 4 | `/` | Dashboard | The day's work: open storage clocks, the review-queue count, and every alert this role must act on. | `alert`, `storage_clock`, `intake_session` | B1a |
| 5 | `/batteries` | Batteries | Find any battery record by search, filter or sort. | `battery_record` | B1a |
| 6 | `/batteries/new` | Log a battery | The three-step intake: photograph the label, review the extraction, confirm and place. | `intake_session`, `intake_photo`, `label_extraction` | B1a |
| 7 | `/batteries/[id]` | Battery record | Everything known about one battery — identity, condition, classification, photos, documents, history. | `battery_record` | B1a |
| 8 | `/review` | Review queue | P1/P6 resolve every extraction the confidence gate held back; **P2 sees, view-only, which batteries in her containers are still unidentified** (CL-1). | `label_extraction`, `intake_session` | B1a |
| 9 | `/containers` | Containers | See every container's fill level and storage clock at a glance, and which ones need action. | `container` | B1a |
| 10 | `/containers/[id]` | Container | Work one container: its contents, its clock, its volume against threshold, and its printable label. | `container`, `container_label` | B1a |
| 11 | `/shipments` | Shipments | The shipment ledger — every movement, retained three years. | `shipment` | B1a |
| 12 | `/shipments/new` | Build a shipment | Assemble containers or lots into a shipment and generate its shipping paper. | `shipment` | B1a |
| 13 | `/shipments/[id]` | Shipment | One shipment with its generated shipping paper, contents and history. | `shipment`, `shipping_paper` | B1a |
| 14 | `/documents/[id]` | Document | View, print or download any generated document, in a print-accurate layout. | `document_render` | B1a |
| 15 | `/catalog` | Catalog | Search known battery products to match a record or check a specification. | `catalog_entry` | B1a |
| 16 | `/catalog/[id]` | Catalog entry | One known product's specification and the records matched to it. | `catalog_entry` | B1a |
| 17 | `/settings/organization` | Organization | The org profile, the 24-hour emergency contact, and the jurisdiction profile that supplies every threshold. | `organization`, `jurisdiction` | B1a |
| 18 | `/settings/users` | Members and roles | Invite people and set what each of them can do. | `membership` | B1a |
| 19 | `/settings/catalog` | Catalog administration | Approve, edit and reject proposed catalog entries. | `catalog_entry` | B1a |
| 20 | `/audit` | Audit log | Read and export the record of every action the system and its users took. | `audit_event` | B1a |

---

## 5. Access Rules

### 5.1 Roles

The six FIXED personas of `_ANCHORS.md` §2 map one-to-one onto `membership.role`. **All six role values exist in the enum from the first migration**, including P3 and P4, so B1b and B3 activate seats rather than migrating roles.

| Role | Persona | Phase seats provisioned | Posture |
|---|---|---|---|
| P1 | Compliance Handler | B1a | Read + write across intake, containers, shipments |
| P2 | Facility Manager | B1a | Read + write on containers, storage events, org settings, members |
| P3 | Producer Compliance Officer | B1b | Member-level read in B1a; no seats provisioned until B1b |
| P4 | Mobility Supplier Technician | B3 | Member-level read in B1a; no seats provisioned until B3 (see RN-2) |
| P5 | Auditor / Underwriter | B1b | **Read-only, externally, everywhere, always** (Rule 1.14). Access is granted per organization by P2 or P6 and **every grant carries a scope and an expiry; a grant without an expiry cannot be created** (Rule 1.15). An expired or revoked grant terminates access immediately, inside an already-open session (Rule 1.28). |
| P6 | Platform Admin | B1a | Next Sketch / Jonathan side. **Platform-scope, not a tenant member by default** — platform scope alone confers no tenant data access (Rule 1.17). P6 acts inside a tenant only under a **recorded support grant** naming reason, scope and expiry, and every such action is marked in the audit log as a platform action, distinguishable from a member's (Rule 1.18). Every `W` in §5.2 for P6 is read as "under an active support grant". |

**A membership carries exactly one role** (Rule 1.4); a user may hold memberships in several organizations with different roles, and those roles never combine or leak (Rules 1.5, 1.22). No user changes their own role (Rule 1.11). Members are deactivated, never deleted — their name stays attached to every record and audit event they created, forever (Rule 1.13).

### 5.2 Route access matrix

Derived from the FIXED table in `_ANCHORS.md` §5, with "any member" expanded to the explicit six. **This table is the authority a builder implements against.**

`R` = can reach and read · `W` = can reach and perform this route's mutating actions · `—` = cannot reach

| Route | P1 | P2 | P3 | P4 | P5 | P6 | Notes |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| `/sign-in` | public | public | public | public | public | public | Unauthenticated only; a signed-in user is redirected to `/` |
| `/sign-up` | public | public | public | public | public | public | Requires `tos_acceptance` before entering `(app)` |
| `/invite/[token]` | public | public | public | public | public | public | Token-scoped; shows no tenant data before authentication |
| `/` | R | R | R | R | R | R | Alert content differs by role; P5 sees no create actions |
| `/batteries` | R | R | R | R | R | R | Export is P2, P5, P6 |
| `/batteries/new` | **W** | — | — | — | — | **W** | See RN-2 |
| `/batteries/[id]` | **W** | R | R | R | R | **W** | Only P1/P6 edit assessed condition, re-run matching, attach photos |
| `/review` | **W** | **R** | — | — | — | **W** | **P2 is view-only** (`_ANCHORS.md` §5; Rule 2.22; CL-1). Confirming and voiding a queue item are P1/P6 only. P2's view is composed for her question, not a disabled copy of P1's — `UX_SPEC.md` §3.8. |
| `/containers` | R | R | R | R | R | R | Rows are non-navigating for P3, P4, P5 — see §5.4 |
| `/containers/[id]` | **W** | **W** | — | — | — | **W** | P2's write set differs from P1's — see §5.5 |
| `/shipments` | R | R | R | R | R | R | |
| `/shipments/new` | **W** | — | — | — | — | **W** | P2 hands off via the container's ready-to-ship status |
| `/shipments/[id]` | **W** | R | R | R | R | **W** | Reprint and re-render are P1/P6 |
| `/documents/[id]` | R | R | R | R | R | R | Print and download available to all six; every render is logged |
| `/catalog` | R | R | R | R | R | R | |
| `/catalog/[id]` | R | R | R | R | R | R | "Edit this entry" appears for P6 only |
| `/settings/organization` | — | **W** | — | — | — | **W** | Holds the 24-hour emergency number and the jurisdiction profile |
| `/settings/users` | — | **W** | — | — | — | **W** | Only P6 may grant or revoke the P6 role |
| `/settings/catalog` | — | — | — | — | — | **W** | P6 only |
| `/audit` | — | R | — | — | R | R | **P1 cannot read the audit log.** Export is available to all three who can. |

### 5.3 Enforcement rules

1. **Authentication gate.** Middleware guards the entire `(app)` group. Unauthenticated → `/sign-in?next=<path>`, and the user lands on their intended page after signing in.
2. **Terms of Service gate — it blocks intake, not the app.** Where the organization has no acceptance in force, **`/batteries/new` and every intake action are blocked organization-wide**, with a stated remedy naming who can accept; every other read-only route stays reachable so the organization can be set up while consent is pending (Rules 7.1, 7.2). **No battery is logged before the training-rights grant is in force** (D-2) — and a record captured while none was in force is *permanently* not training-eligible, which no later acceptance ever reverses (Rules 7.6, 7.7). The gate is not skippable and not deferrable.
3. **Role gate.** Every route segment resolves its access server-side against a single **data-driven role→route map** before rendering. One map, one place, read by both the guard and the navigation renderer — so a nav item and a route can never disagree. **This map is per-route, per-role *capability* — `none` / `read` / `write` — not a boolean reachability list**, because §5.2 now contains a role that reaches a route in one mode and not another (P2 on `/review`, CL-1) and B3 will add another (P4 on `/batteries/new`, RN-2). A boolean map cannot express view-only and will be rewritten within one phase. Accepted by the owner; see RN-2.
4. **Denial behaviour.** A member of the organization who reaches a route their role cannot access is **redirected to `/` with a toast naming the restriction**. Not a blank 403, not a silent no-op, not a crash. This is a single-tenant internal tool; telling a colleague that a page exists but is not theirs is correct.
5. **Cross-tenant behaviour is different and stricter.** A record ID belonging to another `organization` resolves as **not found**, never as forbidden. Existence is not disclosed across tenants under any circumstances.
6. **P5 is read-only as a property of the role, enforced server-side.** Every mutating server action re-checks the role and rejects. A disabled button is a courtesy, never a control.
7. **Navigation renders from the same map as the guard.** A role that cannot reach a route sees no nav item, no row link, no command-palette result and no cross-route entry point to it.
8. **Every denial writes an `audit_event`** — actor, attempted route, role, timestamp. Denials are evidence.
9. **Client-side blocks are never the only enforcement.** Every hard block in Flow D and every role restriction in §5.2 is re-evaluated on the server at commit.
10. **Prohibited-activity guardrails (Rules 3.21, 3.22).** Permitted and prohibited handler activities are both jurisdiction data. Actions a handler is not permitted to take are not rendered as disabled controls to be argued with — they are unreachable states in the workflow. The system does not warn about them and does not offer them. Every permission denial states its reason in plain language and names the governing rule; **a silently disabled control is a defect** (Rule 1.26).

### 5.4 The `/containers` → `/containers/[id]` asymmetry

`/containers` is reachable by all six roles; `/containers/[id]` is not. This is the one place in B1a where a list is broader than its detail, and it is the most likely thing for a builder to get wrong.

**Required behaviour:** for P3, P4 and P5, container rows are **not links**. The row renders its data, the cursor does not change, and a tooltip (or, on touch, a tap-to-reveal helper line) states: *"Container detail requires the Handler, Facility Manager or Admin role."* No navigation attempt, no redirect, no toast. See RN-1.

### 5.5 Where P1 and P2 differ on `/containers/[id]`

Both hold `W`. They do not hold the same `W`.

| Action | P1 | P2 | P6 |
|---|:--:|:--:|:--:|
| Record a `storage_event` (inspection, consolidation, relocation) | ✓ | ✓ | ✓ |
| **Record a remediation on an overdue container** (Rule 4.17) | — | ✓ | ✓ |
| Choose the site's clock demonstration method (Rule 4.3) | — | ✓ | ✓ |
| Generate / reprint the `container_label` | ✓ | ✓ | ✓ |
| Add or remove records from the container | ✓ | — | ✓ |
| Mark the container **ready to ship** | ✓ | ✓ | ✓ |
| **Ship this container** → `/shipments/new` | ✓ | — | ✓ |
| Edit container capacity or location | — | ✓ | ✓ |
| Retire an empty container with a closed clock (Rule 4.30) | — | ✓ | ✓ |

**No role can change an accumulation start date.** It is set by the first placement (Rule 4.4) and travels with the records (Rules 4.9–4.12). There is no re-date control on any screen for any role, because a re-date affordance is a way to restart a legal clock and the system must make that impossible rather than merely discouraged. **A container is never deleted** (Rule 4.30).

### 5.6 Public vs. authenticated

Public: `/sign-in`, `/sign-up`, `/invite/[token]`. **Nothing else.** No public battery record, no public document link, no shareable read-only URL in B1a. `/documents/[id]` is authenticated even though it is the most obviously shareable page in the product — an unauthenticated document URL is a data leak with a customer serial number in it (`PROJECT_SETUP_BMMP.md` §1). A public evidence-sharing surface, if one is wanted, is a B1b decision alongside `evidence_pack`.

---

## 6. Structural edge cases

Behavioural and visual treatment lives in `UX_SPEC.md` §5. These are the **routing** consequences. **E-1 through E-14 carry the same identifier and the same meaning in both documents** — cite them by number across docs. E-15 onward are structural-only cases that `UX_SPEC.md` folds into its catch-all.

| # | Case | Routing behaviour |
|---|---|---|
| E-1 | Zero batteries in the organization | `/` and `/batteries` render empty states. For P1/P6 the single call to action routes to `/batteries/new`. For P2/P3/P4/P5 there is no create action and the empty state says who can create one. |
| E-2 | Zero containers | `/containers` empty. Intake step 3 cannot assign a container; it offers "Create a container" inline for P1/P6 and blocks for anyone else. `/shipments/new` step 1 is unreachable with an explanatory state rather than an empty picker. |
| E-3 | Photo fails to upload | The `intake_session` persists as a draft. The flow does not advance. Retry in place; on repeated failure the capture queues and the user may leave — the draft is on `/review` as an unprocessed session, not lost. |
| E-4 | Label unreadable — zero fields extracted | Step 2 renders the no-read state, not the low-confidence state. Manual entry and catalog search are offered on the same screen. Routing to `/review` happens only if the user leaves without resolving. |
| E-5 | Catalog miss — no match | Step 2 continues on the manual entry path (Rule 2.20). Proposing an entry creates a proposal visible at `/settings/catalog` for P6. The record commits, classifies and gets a clock — **but cannot ship until shipping identifiers resolve** (Rule 5.9), and the intake screen says so at the moment of the miss. |
| E-6 | **Overdue** storage clock | Pinned to the top of `/`, non-dismissible by every role including P6. The container **accepts no new items** (Rule 4.16). Contents leave by exactly two paths: on a shipment, or by a remediation recorded by P2 stating what was done and why (Rule 4.17). **No screen offers a re-date control** — a remediation does not alter the accumulation start date. |
| E-7 | Container over its quantity limit | The limit and its unit come from jurisdiction and fire-code data via the site's profile — never a literal (Rule 1.23). B1a raises a warning to P2 with the limit's source stated, and **blocks nothing** (Rule 4.26). Monitoring, alerting and evidence behaviour are `[B1b]` §9, and **B1a must not implement them ahead of specification**. |
| E-8 | A read-only role lands on a screen with editable controls | Two different cases, and they resolve differently. **E-8a, P5 anywhere:** the route renders, every mutating control is **disabled with a stated reason** — the auditor is assessing controls, and invisible controls cannot be assessed — destructive controls omitted, unreachable routes redirect per §5.3(4). **E-8b, P2 on `/review` (CL-1):** the route renders a **differently composed view**, not a disabled copy — confirm and void are **absent, not greyed out**, because P2 is not doing that job and a disabled Confirm invites her to ask for the permission. Treatment in `UX_SPEC.md` §3.8 and §5 E-8. |
| E-9 | Damaged record blocks air transport | Flow D. The block is visible, reasoned, linked to its cause, re-checked server-side, and has no override for any role. |
| E-10 | Offline or slow network | Reads serve from cache with a staleness indicator. Photo captures queue. **No commit of a hard-gated field happens offline** — confirmation against stale data is not a confirmation. See `UX_SPEC.md` §5. |
| E-11 | 24-hour emergency contact number not set | `/shipments/new` step 3 blocks with a link to `/settings/organization`. For P1, who cannot reach that route, the block names the roles who can (P2, P6) rather than offering a dead link. |
| E-12 | **No Terms of Service acceptance in force** | Intake is blocked organization-wide (Rule 7.2). `/batteries/new` renders a stated block naming what must be accepted and **who in the organization can accept it**. Every read-only route stays reachable. P6 can never accept on the tenant's behalf (Rules 7.4, 1.19). |
| E-13 | **Site has no jurisdiction profile** | Classification is blocked, **not defaulted** (Rule 3.10). The record sits in a blocked state naming the missing input and who can supply it — P2 or P6 — and **no downstream document may be generated**. |
| E-14 | **A line classifies as full hazardous** | B1a does not generate a hazardous waste manifest. The obligation is surfaced prominently on the record, the container, the shipment and the shipping paper's accompanying checklist, and **the shipment is never presented as fully documented** (Rules 3.11, 3.12). The gap is stated, never silent. |
| E-15 | A record is in two places at once | Impossible by construction: a `battery_record` belongs to at most one `container` at a time, and cannot be on two open shipments (Rule 5.25). Moving it writes a `storage_event` on both containers and carries its accumulation start date with it (Rule 4.9). |
| E-16 | Single-organization user | The organization switcher is not rendered. It appears only on a second `membership`. |
| E-17 | Container unlabelled or mislabelled | Under the container-marking method, a container holding contents with no current printed label is non-compliant, is flagged to P1 and P2, and **cannot be added to a shipment** (Rule 4.22). A printed start date that no longer matches the container's current one flags it mislabelled and it must be relabelled first (Rule 4.19). |
| E-18 | Prohibited handler activity | Not a warning and not a disabled control to argue with — **there is no screen, action, status or field through which it can be recorded** (Rule 3.21). An attempt arriving through any other path is blocked with the citation from the governing rule version and written to the audit log (Rule 3.22). |

---

## 7. Structural constraints for the build

1. **Twenty routes.** The list in §1.1 is complete for B1a. A twenty-first route is a decision-log entry.
2. **One role map.** §5.2 is implemented once as data and read by the guard, the navigation, the command palette and every cross-route link. Duplicating it is how nav and guard drift apart.
3. **Nothing reaches past `src/data`.** Every route in this document is built against the `DataAdapter` contract (`PROJECT_SETUP_BMMP.md` §3.2). CI enforces it.
4. **Filter, sort, step and tab state lives in the URL.** Every list, every stepper, every tabbed detail. A warehouse user sends a colleague a link; a lost connection restores a page; an audit row deep-links into the exact view it describes.
5. **Every mutating action writes an `audit_event`**, including denials and blocked attempts (BR §12). No role, including P6, may edit or delete an audit event (Rule 1.21).
6. **No hazard surface in B1a.** `/batteries/[id]` reserves the space; `hazard_ranking` is `[B2]`. When it lands it is a **relative ranking with a stated basis per factor** — never a probability, percentage, likelihood or risk of fire, in the UI, an export, an API response or a PDF (`_ANCHORS.md` §7.1).
6a. **Every alert on screen is an `alert` record.** The dashboard region, the alert bell, the `/containers?filter=alerting` deep link and every storage-clock or fire-code volume warning read the same `alert` rows. No screen derives an alert on render, and no two screens compute the same alert differently. Its target role is what makes Rule 4.14 true — P2 always, P1 for containers at their site — without each screen re-deriving who should see what.
6b. **A format band is a `format_classification`, never a field on the battery.** It is keyed on `(battery_record, jurisdiction, rule_version)` because **the same battery classifies differently in different states** (`_ANCHORS.md` §3; Rule 3.5). No B1a screen renders one — the format classifier is `[B1b]` BR §8 — but no B1a screen may present a single organization-wide size or format value either, because doing so bakes in the assumption the entity exists to prevent. `/catalog/[id]` reserves the space; `/settings/organization` shows the jurisdiction profile per **site**, not per organization.
7. **No jurisdiction value is a literal.** Thresholds, deadlines, citations and units are read from `jurisdiction_rule` and `rule_version`. A hard-coded state threshold is a review rejection (`PROJECT_SETUP_BMMP.md` §8.1).
8. **The battery record is wide from day one.** `/batteries` and `/batteries/[id]` must render a small mobility-device pack sitting next to a vehicle pack without a special case, from the first mock fixture (`_ANCHORS.md` §0, `PROJECT_SETUP_BMMP.md` §8.2). MIP's purpose was **absorbed** into BMMP, not cut — these screens are where that shows.

---

*Next Sketch LLC · Confidential · August 2026*
