# Business Rules — BMMP
**Version:** 1.1 · **Date:** 2026-08-11 · **Owner:** Nathan Ivy / Next Sketch LLC
**Answers:** What decisions does the system make, and on what basis?
**Reads from:** `docs/_ANCHORS.md`, `docs/PRD.md`, `ROADMAP_BMMP_2026-07-28.md` (v3.0), `Decision Log.md` (D-1–D-11), `RESEARCH_battery-management-feature-sweep_2026-07-28.md`, `PROJECT_SETUP_BMMP.md`  ·  **Feeds:** `docs/TAXONOMY.md`, `docs/TECHNICAL_SPEC.md`, `docs/ERD.md`, `docs/UX_SPEC.md`, `docs/SITE_ARCHITECTURE.md`, `docs/RUNBOOK.md`, every builder brief

> ## REVIEW NOTES
> None open. All review notes for this document were answered on 2026-08-19 — see `Decision Log.md` **D-20** for the full disposition, and D-21 through D-26 for the calls that carry their own rationale. Content below is unchanged.

---

## Changelog

**v1.1 · 2026-08-11 — status reconciliation against `TAXONOMY.md` v1.1**

- **Status vocabularies reconciled with `TAXONOMY.md` (their RN-9).** Every table in § Status Definitions now carries the **stored value** alongside the plain-english status, so the two documents can be diffed mechanically instead of read for agreement. Nine status systems are now identical in both documents by set and by definition. Substantive changes: `container` gains `overdue` (Rules 4.15–4.17 were unimplementable without it) and drops the redundant Empty/Accumulating split, which `storage_clock.not_started` already carries; `shipment` gains `ready` and `exception`; `intake_session` gains `failed` (EC-14); `battery_record` gains `classified` and `reclassifying`; `document_render` gains `draft`; `storage_clock` keeps this document's `overdue` naming so that one condition is not called three different things across three columns of the same entity family.
- **Three missing status systems written.** `classification_decision`, `damage_assessment` and `tos_acceptance` had `status` columns in `ERD.md` with no definition in either document. Now defined here and added to `TAXONOMY.md` as **T-45, T-46 and T-47**. `tos_acceptance` is written so that no status on it can be read as clawing back training eligibility, which Rule 7.6 fixes at capture.
- **Two `TAXONOMY.md` assertions given rules (their RN-10).** T-14's `manual_override` basis code is now authorised and constrained by new **Rules 3.26, 3.27 and 3.28**. T-36's P6-only recall-entry restriction was **relaxed rather than ratified** — new **Rules 6.23 and 6.24** let P1, P2 or P6 record a recall association, because the handler is who receives the notice and the direction is safety-increasing, while removing one is held to Rule 6.11's discipline.
- **New Rule 5.28** governs draft document renders, which `TAXONOMY.md` T-39 carried with no rule behind them.
- **OQ-9 decided, and `TAXONOMY.md`'s RN-8 with it.** Container segregation class stays on the column `container.container_type` — four downstream documents build against that name and a rename buys nothing. **Rule 4.28 is amended in place** to state that a container's type is a composite of classification outcome and condition state. `TAXONOMY.md` T-23 becomes a six-value cross of the two.
- **No rule was renumbered.** Every new rule appends to the end of its section. Rule 4.28 is the only existing rule whose text changed, and its number and subject are unchanged.

---

## Overview

This document is the single source of truth for every decision BMMP makes. Every "if this, then that" in the product lives here, in numbered plain english. Builders cite rule numbers instead of re-deriving logic. Reviewers verify behavior against rule numbers instead of reading code.

**What this document governs.** BMMP is battery lifecycle software: it follows a battery through the end of its life — identify it, assess its condition, grade it, route it, dispose of it or resell it. It covers batteries from vehicles, consumer electronics, industrial equipment, and small mobility devices such as power wheelchairs and mobility scooters. The rules below govern who may act, how a battery is identified, how it is classified for waste handling, how it is stored and clocked, what documents travel with it, what happens when it is damaged, what consent must exist before it is logged at all, and what evidence survives afterward.

**What this document does not govern.** It does not describe how anything is built — that is `TECHNICAL_SPEC.md`. It does not enumerate valid values, categories or labels — that is `TAXONOMY.md`. Where a rule needs a set of values, it names the set and lets the taxonomy list it. It does not describe screens — that is `UX_SPEC.md`. It states what the user must be told, never where the text sits on the page.

**Depth.** This stack is written to B1a depth. Sections 1–7 and 12 are specified in full and are buildable now. Sections 8, 9, 10 and 11 are stubs: they name what they will govern, state the constraints already binding on them, and reserve their numbers so later citations do not shift. A stub is not permission to invent the rules early.

**How to read a rule number.** Every rule is `<section>.<n>`. Section numbers are fixed in `_ANCHORS.md` §4 and never move. A rule number, once issued, is never reused for different content; a superseded rule is marked superseded and kept.

**Three constraints that bind every rule in this document**, restated as Rules 1.23, 1.24 and 1.25 and enforced throughout:

1. **Regulatory rules are data, never logic.** No threshold, deadline, citation or code limit appears anywhere as a fixed value. Rules state the shape and read the value.
2. **The battery record is wide from the first day.** Small mobility-device packs are first-class records, not a later addition.
3. **Hazard output is a relative ranking with a stated basis per factor.** Never a probability of ignition, in any surface, ever.

---

## Glossary

*Every term used in a rule is defined here first. Where a term names a set of values, the values themselves live in `TAXONOMY.md`.*

**Organization** — the tenant. A single customer business. Every record in the system belongs to exactly one organization and is invisible outside it.

**Site** — a physical location belonging to an organization, with its own address and therefore its own jurisdiction. Storage, containers and fire-code obligations attach to a site, not to the organization as a whole.

**User** — a person with a login. A user is not, by itself, allowed to do anything; permission comes from membership.

**Membership** — the link between one user and one organization, carrying exactly one role. A user with two memberships is two different actors with two different permission sets.

**Role** — the permission set attached to a membership. The role value list lives in `TAXONOMY.md`. This document refers to role holders by their fixed persona ID (P1–P6) so that permissions can be stated without duplicating the taxonomy.

**Compliance handler (P1)** — the daily user. The person who physically has the batteries: logs them, photographs their labels, confirms their identification, prints shipping papers and container labels. "Handler" also has a regulatory sense — see *handler*.

**Handler** — in the regulatory sense, the business that accumulates and manages end-of-life batteries at a site. A handler is subject to storage, labeling, clock, training and prohibited-activity obligations. The applicable obligations depend on the handler's size class.

**Handler size class** — whether a site is treated as a smaller or larger handler for a given period. The class depends on the quantity on site measured against the applicable threshold, which is jurisdiction data. Size class changes the paperwork burden, not the classification of the waste.

**Producer** — the company that put a battery or a battery-containing product on the market. Producers carry registration, reporting and labeling obligations that vary by state. Producer obligations are section 8 (B1b).

**Generator** — the business whose activity caused a battery to become waste — a dismantler, a repair shop, an electronics aggregator, a mobility equipment supplier. In BMMP most customers are generators, and most generators are also handlers.

**Container** — a physical accumulation unit at a site into which end-of-life batteries are placed. A container has an accumulation start date, a fill level, a segregation class and, under one demonstration method, a printed label.

**Lot** — a logical grouping of battery records or containers assembled for a single shipment or a single reporting purpose. A lot is a grouping, not a place. A lot has no clock of its own.

**Shipment** — one movement of batteries from one origin site to one destination, on one mode of transport, under one shipping paper.

**Light waste category** — the lighter-touch regulatory path under which most end-of-life lithium batteries are managed in most states, with simpler paperwork and no hazardous waste manifest. The category's name, its stored value and its per-jurisdiction availability live in `TAXONOMY.md` and in jurisdiction data. This document never asserts which jurisdictions allow it — that is data.

**Full hazardous** — the fully regulated path, applying where the light waste category is not available or not elected. It carries a manifest obligation. In B1a the system identifies this outcome and surfaces it; it does not generate the manifest.

**Classification decision** — the recorded outcome of deciding, for one battery record, whether it is handled under the light waste category or as full hazardous, together with the inputs, the rule version used, the citation that rule version carried, and the resulting obligations. The reasoning is the product, not a by-product.

**Jurisdiction** — the governing authority whose rules apply at a site's address. A site can sit under several layered jurisdictions at once.

**Jurisdiction rule** — one regulatory rule held as data: a threshold, a period, a prohibition, a required marking, a deadline, a citation. Never a value written into logic.

**Rule version** — one dated edition of a jurisdiction rule. Versions supersede; they are never edited in place. Every decision records the version it used.

**In force** — a rule version is in force on a given date if that date falls within its effective window. Decisions read the version in force on the governing date, not the version in force today.

**Storage clock** — the running count of how long batteries have been accumulating, measured from an accumulation start date against the applicable accumulation period. Colloquially "the one-year clock," because the common federal baseline period is one year. **The system never assumes one year.** The period is jurisdiction data.

**Accumulation start date** — the date the first battery was placed into a container, or the date an individual item began accumulating under the inventory demonstration method. This date is what a label carries and what an inspector reads.

**Demonstration method** — how a site proves the age of its accumulated batteries: by marking the container, or by maintaining an inventory system. Both are valid. The choice is made per site and recorded.

**Intake session** — one working pass by a handler that produces one battery record. It holds the photos, the extraction, the catalog match, the confidence-gate outcome and the human confirmation.

**Intake photo** — an image captured during an intake session. At least one is required.

**Label crop** — the region of an intake photo containing the battery's printed label, stored as its own linked artifact. The label crop paired with the human-confirmed answer is the asset the platform is accumulating.

**Extraction** — the set of field values a vision model reads off a label image, each value carrying its own confidence. **An extraction is a proposal, never a fact.** It becomes fact only when a human confirms it.

**Confidence** — a per-field score expressing how sure the extraction is about that one field. Confidence is per field, never a single score for the whole read.

**Confidence gate** — the fixed checkpoint between machine proposal and stored fact. Nothing crosses it without a human. The gate's existence is not configurable; only the threshold value is data.

**Catalog entry** — a known battery product in the platform catalog, carrying manufacturer, model, chemistry, form factor, energy characteristics and shipping identifiers. Chemistry comes from here.

**Catalog match** — the act of resolving an extracted label to a catalog entry. A match may be exact, ambiguous (several candidates), or absent.

**Date code decode** — the deterministic translation of a printed date code into a manufacture date and an age. No model is involved.

**Form factor** — the physical shape class of a cell or pack. Form factor may be detected from a photograph. Chemistry may not.

**Assessed condition** — condition determined by human observation and recorded judgment, optionally aided by machine proposal. Everything BMMP produces about condition in B1a and B2 is assessed condition.

**Measured condition** — condition produced by an instrument: a laboratory rig or a purpose-built battery-health tester. **BMMP does not measure battery health.** It integrates third-party testers (section 11) and, when it does, labels the result measured. Assessed and measured are never merged into one field and never presented as interchangeable.

**Damage assessment** — the recorded, human-confirmed determination of which damage indicators are present on a battery record.

**Damaged or defective** — a battery record on which any indicator in the taxonomy's damaged-or-defective indicator set is confirmed present, or which carries an active recall association. This state hard-blocks air transport (section 6).

**Quarantine** — a segregated container or area holding damaged, defective or recalled records apart from sound stock.

**Shipping paper** — the document that legally travels with a shipment, carrying the basic description sequence, emergency response information and a 24-hour emergency contact number. Required on every shipment regardless of waste classification.

**Container label** — the printed marking applied to a container, carrying the required regulatory phrase, the contents description and the accumulation start date.

**Document render** — one generated instance of any document — a shipping paper, a container label, an export. A render is immutable once produced. Corrections produce a new render that references the old one.

**Emergency response information** — the response guidance and identifiers that must accompany a shipment, and the 24-hour reachable telephone number attached to it.

**Terms of Service acceptance** — the recorded acceptance, by an authorized member of an organization, of a specific version of the Terms of Service, including the grant of rights to use submitted data for model training.

**Training-eligible** — a permanent property of a battery record, fixed at the moment of capture, stating whether that record may ever be used for model training. It is decided once and never re-decided.

**Audit event** — an immutable, append-only record of one thing that happened: who or what did it, to which record, when, what changed, and which rule number governed it.

**Evidence pack** — a packaged export assembled for an external reader, an auditor or an underwriter. It contains records that already exist; it never creates new assertions. Section 9 (B1b).

**Hazard ranking** — a relative ordering of stored inventory by hazard, with a stated evidence basis for each contributing factor. Never a probability, percentage, likelihood or chance of ignition. Section 10 (B2).

**Grade** — a published, transparent quality classification for a used battery. There is no external standard to conform to; BMMP publishes its own scheme and says so. Section 10 (B2).

**Supersede** — to replace a record's content with a new version while retaining the old one, linked and readable. BMMP supersedes; it does not overwrite.

**Void** — to mark a record or document as no longer valid while retaining it in full. BMMP voids; it does not delete.

**Block** — a hard stop. The action is unavailable, the reason is stated, and no role can proceed past it. Distinct from a warning.

**Warning** — a stated concern that does not stop the action. A warning is recorded when acknowledged.

---

## Roles and Permissions

*Permissions are stated by persona ID. Persona IDs are fixed in `_ANCHORS.md` §2. The stored role values are enumerated in `TAXONOMY.md`. Every CAN and every CANNOT below is explicit; nothing is implied by omission, and anything not listed as permitted is denied.*

Page-level access follows the fixed page list in `_ANCHORS.md` §5. Where this section and that list appear to disagree, the page list governs which page opens and this section governs what may be done on it.

### P1 — Compliance Handler (B1a)

**CAN:** sign in and act within organizations where they hold membership · view the dashboard, battery list and any battery record in their organization · start an intake session · capture and upload intake photos · review an extraction and confirm, correct or reject any field · resolve a catalog match, pick from candidates, or enter a battery manually when no match exists · work the confidence-gated review queue · record and correct a damage assessment with a stated reason and evidence · create, fill and close containers · move items between containers · print and reprint container labels · create lots · build a shipment from containers, lots or records · generate, view, print and download shipping papers and other documents · view the catalog · view audit history on records they can see.

**CANNOT:** invite users, change any role, or remove any member · view or act in an organization where they hold no membership · disable, bypass, lower or defer the confidence gate · commit a chemistry, model or condition value without confirming it themselves · clear an air-transport block by any means other than a corrected damage assessment (Rule 6.11) · edit or delete an audit event · edit a generated document render · accept the Terms of Service on the organization's behalf · edit catalog entries or jurisdiction rules · edit the organization's jurisdiction profile · access the audit page.

### P2 — Facility Manager (B1a)

**CAN:** everything P1 can do · invite users to the organization and revoke invitations · assign and change roles for other members · deactivate a member · edit the organization profile and the site jurisdiction profile · choose and change a site's demonstration method · view and export the audit log · grant, scope, time-box and revoke P5 access · receive and act on storage-clock and volume alerts · acknowledge warnings on the organization's behalf · accept the Terms of Service if they hold the organization's binding authority (Rule 7.3).

**CANNOT:** change their own role · remove the last member holding binding authority (Rule 1.12) · edit or delete an audit event · edit the platform catalog or jurisdiction rule data · disable, bypass or lower the confidence gate · clear an air-transport block · edit a generated document render · grant a P5 access without an expiry · act in another organization.

### P3 — Producer Compliance Officer (B1b)

**CAN:** everything P1 can do within their organization, plus the producer-obligation surfaces specified in section 8 at Gate 2 — registration state, filing packets, the dated obligation calendar, and annual reporting.

**CANNOT:** anything not permitted to P1 in B1a · edit jurisdiction rule data (that is P6) · disable, bypass or lower the confidence gate · clear an air-transport block · edit or delete an audit event · act in another organization.

*P3's full permission set is specified at Gate 2 with section 8. Until then P3 is a P1-equivalent role and must not be built with extra reach.*

### P4 — Mobility Supplier Technician (B3)

**CAN:** everything P1 can do, scoped to their organization, with the on-site swap and disposal-documentation workflow specified in section 11 at Gate 2 or Gate 3.

**CANNOT:** anything not permitted to P1 · invite users or change roles · edit catalog or jurisdiction data · disable, bypass or lower the confidence gate · clear an air-transport block · edit or delete an audit event.

*P4's full permission set is specified with section 11. Until then P4 is a P1-equivalent role.*

### P5 — Auditor / Underwriter (B1b) — external, read-only

**This is the airtight one. P5 is read-only at the system level, not by convention and not by hiding buttons.**

**CAN:** sign in as an external user · open only the organizations for which an unexpired access grant exists · read only the records, documents and audit entries inside the scope of that grant · read the audit log within scope · export within scope, where the grant permits export · read an evidence pack prepared for them (section 9).

**CANNOT — every one of these is denied at the system level and the denial is itself logged (Rule 1.16):** create, edit, void, supersede or delete any record of any kind · start an intake session · confirm, correct or reject any extracted field · create, fill, move or close a container · create a lot or a shipment · generate, regenerate or void any document · acknowledge a warning · change any setting · invite, remove or re-role any user · accept or decline Terms of Service · read anything outside the grant's scope, including other sites in the same organization if the grant is site-scoped · retain access after the grant's expiry, including inside a session already open (Rule 1.28) · be granted access without an expiry.

### P6 — Platform Admin (B1a) — Next Sketch / Jonathan side

**CAN:** create, suspend and close organizations · manage platform-level users · create and edit catalog entries and approve proposed entries · create jurisdictions, jurisdiction rules and rule versions · set the platform-wide confidence threshold floor · read platform-level audit · enter a tenant only under a recorded, time-boxed support grant (Rule 1.18), and while inside act with P1-and-P2 capability, with every action marked as a platform action in the audit trail.

**CANNOT:** read tenant data without an active recorded support grant · accept the Terms of Service on a tenant's behalf, ever (Rule 7.4) · disable, bypass or lower the confidence gate below the platform floor, or turn it off for a tenant (Rule 2.17) · clear an air-transport block (Rule 6.8) · edit or delete an audit event, in any tenant or at platform level (Rule 12.4) · edit a generated document render · edit a rule version in place — only supersede it (Rule 12.22) · retroactively change a record's training eligibility (Rule 7.6) · re-open a terminal status.

---

## Status Definitions

*A status marked **terminal** never transitions again; the record is retained through its retention period and can only be referenced, superseded by a new record, or exported.*

**How to read these tables, and how they relate to `TAXONOMY.md`.** This document owns the **set** of states, what each one means, what triggers it and what it transitions to. `TAXONOMY.md` owns the **stored value, its casing and its display label**. Both are shown below so the two documents can be diffed mechanically rather than read for agreement. **The two must state identical sets.** Where a rule's prose elsewhere in this document uses a state's plain-english name, the stored value in these tables is what governs. Where this document and `TAXONOMY.md` ever disagree again, this document wins on the set and the meaning, `TAXONOMY.md` wins on the stored string — and the disagreement is a defect to be closed in one pass, not a choice a builder makes.

Nine entities have a status. Every one is listed here and every one has a matching `TAXONOMY.md` system, cited by its `T-` number.

### battery_record — `TAXONOMY.md` T-22

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `draft` | Draft | An intake session is open; nothing is committed. | An intake session starts. | `pending_review`, `confirmed`, `voided` | No |
| `pending_review` | Pending review | The confidence gate held the record back. One or more fields need a human. | Any extracted field falls below the threshold, or chemistry / model / condition is unconfirmed (Rules 2.13–2.15). | `confirmed`, `voided` | No |
| `confirmed` | Confirmed | A human has confirmed the identification. The record is now a fact. | P1 or P6 confirms every gated field (Rule 2.21). | `classified`, `pending_review` (on a correction), `voided` | No |
| `classified` | Classified | An active classification decision exists (section 3). | Classification runs after identification (Rule 3.3). | `stored`, `reclassifying`, `voided` | No |
| `reclassifying` | Reclassifying | A change invalidated the classification; a new decision is being made. | Corrected identification, jurisdiction change, rule version change, handler size-class change, or damage reclassification (Rule 3.15). | `classified`, `voided` | No |
| `stored` | In storage | The record sits in a container with a running storage clock. | Placed into a container (Rule 4.4). | `staged`, `stored` (moved), `quarantined`, `reclassifying`, `voided` | No |
| `quarantined` | Quarantined | Damaged, defective or recalled; segregated from sound stock. | A damaged-or-defective determination (Rule 6.17) or a confirmed recall association (Rules 6.5, 6.23). | `stored` (only on a corrected assessment, Rule 6.11), `staged` (non-air only, Rule 6.7), `voided` | No |
| `staged` | Staged for shipment | Assigned to a shipment that has not yet departed. | Added to a shipment (Rule 5.1). | `stored` (removed), `shipped`, `voided` | No |
| `shipped` | Shipped | The shipment carrying it has departed. | Shipment departure recorded (Rule 5.17). | `closed` | No |
| `closed` | Closed | Arrival confirmed at the destination; the record's operational life is over. | Shipment arrival recorded (Rule 5.26). | — | **Yes** |
| `voided` | Voided | The record was created in error and is retained as evidence of the error. | A human voids it with a stated reason. | — | **Yes** |

### intake_session — `TAXONOMY.md` T-08

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `open` | In progress | A handler is working; photos may be added. | P1 or P6 starts intake. | `extracting`, `abandoned` | No |
| `extracting` | Reading label | The pipeline is running its fixed sequence (Rule 2.2). | The handler submits the photo set. | `awaiting_confirmation`, `failed` | No |
| `awaiting_confirmation` | Awaiting confirmation | The extraction is complete and is held at the confidence gate for a human. | The pipeline reaches the gate (Rules 2.13–2.15). | `completed`, `abandoned` | No |
| `completed` | Completed | A human confirmed the record; the battery record becomes `confirmed`. | Human confirmation (Rule 2.21). | — | **Yes** |
| `failed` | Failed | A pipeline step could not complete. Photos are retained and the session is recoverable by retry or by the manual path (EC-14). | Any step errors out. | `open` (retry), `abandoned` | No |
| `abandoned` | Abandoned | The handler stopped without confirming. Photos are retained; no battery record is created. | Explicit abandon, or expiry of an idle session (OQ-8). | — | **Yes** |

### container — `TAXONOMY.md` T-24

*There is no separate empty state. A container that holds nothing is `open` with its storage clock at `not_started` — emptiness is read from the clock and the fill level, not from a second status that could drift out of step with them.*

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `open` | Open | Accepting material. Holds nothing yet, or holds material with a running clock. | Created by P1, P2 or P6; or material removed from a `full` container. | `full`, `overdue`, `closed`, `retired` (only while it holds nothing, Rule 4.30) | No |
| `full` | Full | At its recorded capacity. Accepts no more material. The limit and the measure are jurisdiction data (Rule 4.26). | Fill level reaches the applicable limit. | `open` (on removal), `overdue`, `closed` | No |
| `overdue` | Overdue | The storage clock has passed the applicable accumulation period. **Hard state**: accepts no new items (Rule 4.16). | The clock exceeds the applicable period (Rule 4.15), or the container inherits an earlier accumulation start date on receipt (Rule 4.10). | `closed` (ship it out), `open` (only after a recorded remediation by P2, Rule 4.17) | No |
| `closed` | Closed | Sealed. No further material may be added, whether or not it reached its limit. | P1, P2 or P6 closes it, or it is added to a shipment. | `staged`, `open` (reopened before staging) | No |
| `staged` | Staged for shipment | Allocated to a shipment being built. Contents locked. | Added to a shipment (Rule 5.1). | `shipped`, `open` (shipment cancelled, Rule 4.6 — the clock never stopped, EC-26) | No |
| `shipped` | Shipped | Left the site on a departed shipment. | Shipment departure (Rule 5.17). | `retired` | No |
| `retired` | Retired | Out of service. Never reused. A container is never deleted (Rule 4.30). | P2 or P6 retires a container holding nothing with a closed clock. | — | **Yes** |

### storage_clock — `TAXONOMY.md` T-26

*One clock instance per accumulation cycle. A container that ships and reopens starts a **new** instance; a clock is never reset in place, because the historical clock is evidence.*

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `not_started` | Not started | The container is open but holds no material, so no accumulation start date exists. | The clock instance is created. | `running` | No |
| `running` | Running | Counting from the accumulation start date, outside every alert band. **Never pauses** (Rule 4.6). | First item placed (Rule 4.4). | `approaching_limit`, `overdue`, `stopped` | No |
| `approaching_limit` | Approaching limit | An alert tier on the configured ladder has been reached. Which tier is `storage_clock.alert_band` (T-27), not this column. | Remaining time crosses a ladder offset (Rule 4.13). | `approaching_limit` (next tier), `overdue`, `stopped` | No |
| `overdue` | Overdue | The applicable accumulation period has elapsed. Drives the container's `overdue` hard state. | Elapsed time exceeds the applicable period (Rule 4.15). | `stopped` | No |
| `stopped` | Stopped | The accumulation ended — the contents shipped out, or the container reached empty with no contents remaining that carry this start date (Rule 4.7). | Shipment departure, or the container emptying. | — | **Yes** |

*This document, `container.status` and `storage_clock.alert_band` all name the elapsed condition **`overdue`**. One condition, one word, across all three columns — so that no builder infers a fourth state from a fourth name.*

### shipment — `TAXONOMY.md` T-28

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `draft` | Draft | Being assembled. Contents and destination may change freely. | P1 or P6 starts a shipment. | `ready`, `cancelled` | No |
| `ready` | Ready | Every precondition in Rule 5.3 is satisfied. Documents may be generated. | The last precondition clears. | `documents_issued`, `draft` (a precondition fails again), `cancelled` | No |
| `documents_issued` | Documents issued | A shipping paper render exists and is current for the shipment's contents. Contents are frozen. | Shipping paper generated (Rule 5.3). | `dispatched`, `ready` (contents changed and the paper was voided, Rule 5.13), `cancelled` | No |
| `dispatched` | Dispatched | Departed. Contents locked, storage clocks closed, ledger entry written (Rule 5.17). | Departure recorded by P1 or P6. | `delivered`, `exception` | No |
| `delivered` | Delivered | Arrival confirmed at the destination. Records move to `closed` (Rule 5.26). | Arrival recorded. | `closed` | No |
| `exception` | Exception | Departed and then went wrong — refusal, discrepancy or return. **Rule 5.26 does not fire on a refusal**: the records stay `shipped` rather than closing out, and any return movement is a new shipment with its own documents (EC-47). | A handler records an exception. | `delivered`, `cancelled` | No |
| `closed` | Closed | The shipment record is complete and under retention (Rules 5.18, 12.10). | Delivery confirmed and the ledger entry finalised. | — | **Yes** |
| `cancelled` | Cancelled | Abandoned before departure. Contents return to storage; documents are voided, not deleted (Rule 5.14). | A human cancels a shipment that has not departed. | — | **Yes** |

### lot — `TAXONOMY.md` T-25

*A lot is a grouping, not a place. It has no fill level and no storage clock of its own (Rule 4.23), and it reports the earliest accumulation start date among its contents — so a lot holding an overdue container reads overdue (Rule 4.24).*

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `open` | Open | Being assembled. Members may be added or removed. | P1 or P6 creates the lot. | `closed`, `dissolved` | No |
| `closed` | Closed | Membership fixed. Ready to be allocated. | P1 or P6 closes it. | `allocated`, `open`, `dissolved` | No |
| `allocated` | Allocated | Assigned to a shipment being built (Rule 5.1). | Added to a shipment. | `shipped`, `closed` (shipment cancelled) | No |
| `shipped` | Shipped | Dispatched under an issued shipping paper. | Shipment departure (Rule 5.17). | — | **Yes** |
| `dissolved` | Dissolved | Broken up before shipment; members return to their prior state. The lot row is retained for audit. | P1 or P6 dissolves it. | — | **Yes** |

### classification_decision — `TAXONOMY.md` T-45

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `pending` | Pending | Classification is required and every input is present, but the decision has not yet been produced. | Identification confirmed (Rule 3.3). | `active`, `blocked` | No |
| `blocked` | Blocked | An input required to classify is absent or invalid and a human must supply it. The record produces no downstream document (Rule 3.12). | A missing site jurisdiction profile (Rule 3.10; EC-16), or no rule version in force on the governing date (Rule 3.6). | `pending`, `active` | No |
| `active` | Active | The current, governing decision for this battery record. **Exactly one per record** — never zero once identified, never two (Rule 3.1). | Classification completes and records its full reasoning (Rule 3.7). | `superseded` | No |
| `superseded` | Superseded | A newer decision replaced it. Retained in full, with its inputs, rule version, citation and reasoning intact (Rule 3.14). | A re-classification (Rule 3.15) or a P6 override (Rule 3.26). | — | **Yes** |

*A decision is never edited. Every change is a new row that supersedes the old one, which is what lets an auditor read the decision that governed a shipment years after the rule changed (Rules 12.15, 12.16; EC-50).*

### damage_assessment — `TAXONOMY.md` T-46

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `not_assessed` | Not assessed | No assessment exists. The record is incomplete and cannot join a shipment (Rule 6.1). | Battery record created. | `assessed_sound`, `assessed_damaged` | No |
| `assessed_sound` | Assessed sound | A human confirmed that no indicator from the damaged-or-defective set is present (Rules 6.2, 6.4). | Human confirmation. | `superseded` | No |
| `assessed_damaged` | Assessed damaged | A human confirmed at least one damaged-or-defective indicator. **Air transport is blocked** (Rule 6.7) and the record routes to quarantine (Rule 6.17). | Human confirmation. | `superseded` | No |
| `superseded` | Superseded | Replaced by a later assessment. Retained and displayed **alongside** the current one, with its author, timestamp, indicators and evidence (Rule 6.12). | A corrected assessment carrying a stated reason and a supporting photograph (Rule 6.11). | — | **Yes** |

*Neither assessed state is terminal, and that is deliberate. Rule 6.11 provides exactly one clearing path for a damaged finding — a superseding human assessment — and the reversal stays permanently visible in every export.*

### tos_acceptance — `TAXONOMY.md` T-47

*This entity records the organization's consent. **It never governs whether an already-captured record may be used for training.** That is stamped on the record at capture by Rule 7.6, is immutable, and no status below can move it. `lapsed` and `revoked` change what happens next, never what already happened.*

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `not_accepted` | Not accepted | No version has ever been accepted by this organization. **Intake is blocked organization-wide** (Rules 7.1, 7.2). | Organization created. | `in_force` | No |
| `in_force` | In force | An accepted version is currently effective. Intake proceeds and captures are stamped training-eligible. | An authorized member accepts (Rules 7.3, 7.5). | `grace`, `superseded`, `revoked` | No |
| `grace` | Grace period | A newer version has published; this acceptance still permits intake until the re-acceptance deadline. **Records captured now bind to this — the prior — version** (Rules 7.13, 7.15). | The new version's in-force date passes without re-acceptance (Rule 7.12). | `superseded` (re-accepted), `lapsed` | No |
| `lapsed` | Lapsed | The grace window closed without re-acceptance. **Intake is blocked** (Rule 7.14). Records captured before the lapse are untouched (Rule 7.16). | The re-acceptance deadline passes. | `superseded` (re-accepted) | No |
| `superseded` | Superseded | Replaced by a later accepted version. **Retained permanently as the governing terms for every record captured under it** (Rule 7.16). | Acceptance of a newer version. | — | **Yes** |
| `revoked` | Revoked | The organization withdrew the grant. Captures **from the revocation forward** are not training-eligible; captures made while it was in force keep the eligibility they were stamped with (Rule 7.18). | Explicit revocation by an authorized member. | `in_force` (re-accepted) | No |

*Re-acceptance is never retroactive (Rule 7.17). A record captured with no acceptance in force is permanently not training-eligible and nothing later changes that (Rule 7.7; EC-32). Per-record eligibility itself lives on the capture, not here — see `TAXONOMY.md` T-12.*

### document_render — `TAXONOMY.md` T-39 *(covers shipping_paper, container_label, the DDR packet and every generated export)*

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `draft` | Draft | Rendered for preview only. Not issued, not valid, watermarked as such, and never permitted to accompany a shipment (Rule 5.28). | A preview is requested. | `issued`, `voided` | No |
| `issued` | Issued | The live, valid instance of this document. Immutable (Rule 5.12). | Generation by an authorized role (Rule 5.3). | `superseded`, `voided` | No |
| `superseded` | Superseded | A newer render replaced it. Retained in full and linked from its replacement (Rule 5.15). | A regeneration. | — | **Yes** |
| `voided` | Voided | Invalidated without replacement — the underlying shipment changed or was cancelled. Retained with the reason and the actor (Rule 5.14). | Rule 5.13, or a shipment cancellation. | — | **Yes** |

### rule_version — `TAXONOMY.md` T-42

*Maintained by P6 only. A rule version is never edited in place; a change is a new version, because decisions reference the version that governed them (Rule 12.22).*

| Stored value | Status | What it means | What triggers it | Transitions to | Terminal |
|---|---|---|---|---|---|
| `draft` | Draft | Being prepared. Never used to resolve a rule or produce a document. | P6 creates it. | `scheduled`, `active`, `withdrawn` | No |
| `scheduled` | Scheduled | Approved, with a future effective date. Visible for planning; not yet in force. | P6 approves it with a future effective date. | `active`, `withdrawn` | No |
| `active` | Active | In force. Exactly one active version per jurisdiction and domain at any moment. | The effective date arrives. | `superseded`, `withdrawn` | No |
| `superseded` | Superseded | Replaced by a later version. **Retained permanently** — every decision and document produced under it must stay readable (Rules 12.15, 12.23). | A later version becomes active. | — | **Yes** |
| `withdrawn` | Withdrawn | Published in error and pulled, and flagged so anything produced under it can be found. Affected open records are flagged for re-evaluation; departed shipments keep the decision that governed them (Rules 3.16, 3.17; EC-53). | P6 withdraws it. | — | **Yes** |

---

## Business Rules by Feature Area

---

### 1. Access, tenancy and roles — B1a

**1.1** Every record in the system belongs to exactly one organization. There is no record without an owning organization, and no record shared between two.

**1.2** No user, of any role, ever reads data belonging to an organization in which they hold no active membership or active grant. This is enforced at the data layer, not at the screen.

**1.3** A user acts in exactly one organization at a time. Switching organizations is an explicit act and is recorded.

**1.4** A membership carries exactly one role. A user cannot hold two roles in the same organization.

**1.5** A user may hold memberships in more than one organization, with a different role in each. The roles do not combine and do not leak between organizations.

**1.6** This document states permissions by persona ID (P1–P6). The stored role values are owned by `TAXONOMY.md`. If a role value exists that maps to no persona, that is a taxonomy defect, not a permission to invent behavior.

**1.7** Every page and every action requires an authenticated session, except the sign-in, sign-up and invitation-acceptance routes.

**1.8** A new user reaches an organization one of two ways: they create it at sign-up and become its first binding-authority member, or they accept an invitation to an existing one. There is no third way.

**1.9** Only P2 and P6 may invite a user to an organization, and only P2 and P6 may revoke a pending invitation.

**1.10** Only P2 and P6 may assign or change a role.

**1.11** No user may change their own role, and no user may remove their own membership if doing so would leave the organization without a binding-authority member.

**1.12** Every organization must have at least one active member holding binding authority at all times. An action that would remove the last one is blocked with a stated reason.

**1.13** Members are deactivated, never deleted. A deactivated member's name remains attached to every record and audit event they created, forever.

**1.14** P5 is read-only, externally, everywhere, always. There is no state, setting, grant or role change that makes a P5 able to write anything.

**1.15** P5 access is granted per organization by P2 or P6, and every grant carries a scope and an expiry. A grant without an expiry cannot be created.

**1.16** Any write attempt by P5 is denied, the denial is surfaced to the user with a stated reason, and the denial itself is written to the audit log as an event.

**1.17** P6 is a platform-scope role. P6 does not hold membership in any tenant organization by default, and platform scope alone confers no tenant data access.

**1.18** P6 may act inside a tenant organization only under a recorded support grant that names the reason, the scope and an expiry. Every action taken under that grant is written to the audit log and marked as a platform action, distinguishable from a tenant member's action.

**1.19** P6 cannot accept the Terms of Service on a tenant's behalf. See Rule 7.4.

**1.20** P6 cannot clear an air-transport block. See Rule 6.8.

**1.21** P6 cannot edit or delete an audit event, at platform level or inside any tenant. See Rule 12.4.

**1.22** No role, including P6, grants access to a second organization's data by virtue of access to the first. Multi-organization visibility is only ever the sum of explicit grants.

**1.23 — RULES ARE DATA, NEVER LOGIC.** No jurisdiction threshold, accumulation period, retention period, deadline, legal citation, fire-code limit, marking dimension, energy limit or weight limit may appear anywhere in this product as a fixed value written into logic. Every such value is read from a jurisdiction rule, at the rule version in force on the record's governing date. Rules in this document state the shape of the lookup and never the number. **A rule stated as a literal is a defect, not a shortcut**, and is a review rejection under `PROJECT_SETUP_BMMP.md` §8.1. This applies to displayed copy, generated documents and exports as well as to decision logic. (Roadmap Principle 5.)

**1.24 — THE BATTERY RECORD IS WIDE FROM DAY ONE.** No battery is rejected, downgraded, routed to a side path or given a reduced record because it is a small mobility-device pack — a power wheelchair or mobility scooter battery. Mobility packs are first-class battery records from the first migration, alongside vehicle, consumer and industrial batteries. (`PROJECT_SETUP_BMMP.md` §8.2; Decision D-11.)

**1.25 — NO PROBABILITY OF IGNITION, PLATFORM-WIDE.** No surface of this product — screen, notification, API response, export, generated document or marketing copy rendered by the product — ever expresses battery hazard as a probability, percentage, likelihood, chance or risk of fire or ignition. Hazard is expressed only as a relative ranking with a stated basis per contributing factor. The operative rule is 10.3; this rule makes the prohibition binding on every section, including sections built before section 10 exists. (`PROJECT_SETUP_BMMP.md` §8.3; Roadmap Principle 4.)

**1.26** Every permission denial states the reason in plain language and, where a rule governs it, names the rule. A silently disabled control is a defect.

**1.27** Page access follows the fixed page list in `_ANCHORS.md` §5. A page not on that list does not exist in B1a, and access to a page never implies permission to act on it — action permissions are the rules in this section.

**1.28** An expired or revoked grant terminates access immediately, including inside a session that is already open. Access is re-checked on every request, never only at sign-in.

---

### 2. Battery intake and identification — B1a

*Grounded in Decision D-7 and the research sweep §2.1. The orchestration pattern is fixed in `_ANCHORS.md` §6: sequential pipeline, code-orchestrated, human gate at the end.*

**2.1** One intake session produces one battery record. A session that produces nothing is abandoned, not deleted, and its photos are retained.

**2.2** The intake pipeline runs in exactly this order: intake photo → label crop → extraction with per-field values and per-field confidence → catalog match → confidence gate → human confirmation. This order is fixed.

**2.3** No step may be skipped, reordered, run in parallel or chosen at runtime. No model selects the next step. If a workflow appears to need a different order, that is a decision-log entry, not a builder's call.

**2.4** Every pipeline step writes an audit event, including steps that produce nothing and steps that fail.

**2.5** At least one intake photo is required before extraction runs. A record cannot be identified with no image at all, except via the manual path in Rule 2.29.

**2.6** The label crop is stored as its own artifact, linked to the photo it came from and to the battery record. The crop paired with the human-confirmed answer is the training pair defined in Rule 7.10.

**2.7** Extraction returns a value and a confidence for each field independently. There is no single whole-read confidence score, and a high average never substitutes for a low field.

**2.8** An extraction is a proposal. It is never stored as a fact, never displayed as a confirmed value, and never used by any downstream rule until a human confirms it.

**2.9 — CHEMISTRY IS NEVER DETECTED FROM A PHOTOGRAPH.** The system does not infer, guess, predict or estimate battery chemistry from the appearance of a battery. Chemistry is printed on the label; the label is read; the reading resolves to a catalog entry; the catalog entry carries the chemistry; a human confirms it. Any behavior, screen, label, API field or document implying visual chemistry detection is wrong and must be removed. (Decision D-7; research §2.1.)

**2.10** Chemistry on a battery record comes from exactly two sources: a matched catalog entry, or direct human entry. Never from an extraction alone, and never from form-factor detection.

**2.11** A field that is not legible on the label is returned as unread. It is never guessed, never interpolated from a similar product, and never filled from a catalog entry the record has not yet matched to. The known failure mode of these models is fabricating values on low-confidence reads; unread is the correct output.

**2.12** Every extracted value is validated against the expected shape for its field before it is offered to a human. A value that fails validation is presented as unread, with the raw text retained for the reviewer to see.

**2.13 — THE CONFIDENCE GATE IS HARD, NOT TUNABLE.** Every intake record passes through the confidence gate before anything is committed. The gate's existence is not a setting, not a default, not a feature flag and not a performance optimization. The threshold *value* is data; the gate *itself* is not.

**2.14** If any single field falls below the applicable threshold, the whole record routes to the review queue — not just that field. A record is reviewed as a whole because a bad read on one field is evidence that the read as a whole is unreliable.

**2.15** Chemistry, model and condition never auto-commit. They require explicit human confirmation regardless of how high their confidence is. A perfect-confidence chemistry read still stops at the gate. (`_ANCHORS.md` §6.)

**2.16** The threshold value is read from configuration, per Rule 1.23's shape discipline. Its source and scope are RN-4; until that is resolved, treat it as a platform-wide floor that a tenant may raise and can never lower.

**2.17** No role may disable, bypass, defer or lower the confidence gate — not P1, not P2, not P6. There is no bulk-confirm action that skips it, no "trust this supplier" setting that skips it, and no import path that skips it. An imported record that never passed the gate is not identified (see Rule 7.23 and EC-31).

**2.18** A catalog match is exact when one catalog entry is resolved unambiguously from the extracted identifiers. Only an exact match may pre-fill catalog-sourced fields, and even then those fields still require confirmation under Rule 2.15.

**2.19** When several catalog entries are plausible, the system presents them as a candidate list and a human picks one. The system never auto-selects the top candidate, and never silently narrows a candidate list to one.

**2.20** When no catalog entry matches, the record follows the manual entry path: the handler enters the fields directly, the record is marked as manually identified, and the entry may be proposed as a new catalog entry for P6 to approve.

**2.21** Human confirmation is per field and attributable: the record stores who confirmed each field and when. "Confirmed by the system" is not a valid value.

**2.22** Only P1 and P6 may confirm an identification. P2 may view the review queue and may not confirm. P5 may never confirm.

**2.23** A record leaves the review queue in exactly two ways: a human confirms it, or a human voids it with a stated reason. It never times out into a confirmed state, and it never ages out of the queue.

**2.24** Date-code decoding is deterministic and rules-based. It produces a manufacture date and an age. A decoded date never overrides a date a human entered, and a decode failure is recorded as undecodable rather than as an approximate date.

**2.25** Form factor may be determined from a photograph and offered as a proposal. It still passes the confidence gate like every other field. Form factor detection never implies, suggests or contributes to a chemistry determination.

**2.26** State of charge at intake is captured where the handler can observe or read it, and is recorded as assessed condition with its observation method noted.

**2.27** No condition value is ever labeled or exported as measured unless it came from an integrated third-party health tester (section 11). Assessed condition and measured condition are separate, are never merged into one field, and are never presented as interchangeable. (`_ANCHORS.md` §7.5; Roadmap Principle 7.)

**2.28** Intake accepts small mobility-device packs from the first day, with the same record, the same pipeline and the same document path as any other battery. See Rule 1.24.

**2.29** When a label is absent, destroyed or unreadable, the record follows the manual entry path, the reason is recorded as a stated value from the taxonomy's unreadable-label reason set, and the photos are still captured and retained — an unreadable label is itself a useful training example.

**2.30** Where the handler supplies a source reference — the device, vehicle or asset the battery came out of — it is captured and stored on the record at intake. Verification and the formal provenance binding are section 10 (B2). B1a captures; it does not verify.

**2.31** Every confirmed record must be independently useful on the day it is captured — sufficient to classify, store, label and ship. No field exists solely as a bet on a future model. (Roadmap Principle 3.)

**2.32** Editing a confirmed field after commit creates a superseding version of the record. The prior values, their confirmer and their timestamps are retained and readable. A correction to chemistry, model or condition re-opens the confidence gate for that field.

**2.33** Bulk intake gates every record individually. A batch of fifty records produces fifty gate decisions, not one.

**2.34** A record cannot enter classification until its identification is confirmed. See Rule 3.3.

---

### 3. Waste classification — light category vs full hazardous — B1a

*Grounded in Decision D-6 and the research sweep §1.1. This is the highest-value logic asset in the product; the recorded reasoning is what survives an audit.*

**3.1** Every battery record carries exactly one active classification decision. Never zero once it is identified, never two.

**3.2** A classification decision resolves to one of the outcome families named in `TAXONOMY.md`: the light waste category, or full hazardous. This document does not enumerate the values, the sub-categories or their labels.

**3.3** Classification runs only after identification is confirmed. A record with an unconfirmed chemistry, model or condition cannot be classified, because the classification depends on facts that do not yet exist.

**3.4** A classification decision reads, at minimum: the battery record's confirmed identification, the site's jurisdiction, the applicable jurisdiction rule versions in force on the governing date, the handler's size class, and the current damage assessment. Any input that is missing blocks the decision rather than being assumed.

**3.5** The governing jurisdiction is the jurisdiction of the **site** where the battery is held — not the organization's headquarters, not the billing address, and not the destination. An organization with sites in two states classifies the same battery two different ways, correctly.

**3.6** The rule version used is the version in force on the record's intake date. Not today's version. This is what allows a decision made two years ago to still be explainable.

**3.7** Every classification decision records: every input value it used, the identity and version of every rule it applied, the citation carried by each of those rule versions, the resulting outcome, and any obligations the outcome triggers. This reasoning is readable by any member and by P5 within scope, and is exportable per section 12.

**3.8** Legal citations are carried by the rule version as data and reproduced from it. A citation is never written into decision logic and never typed into a document template. See Rule 1.23.

**3.9** Classification is never derived from chemistry alone. Chemistry is one input among several, and a chemistry value on its own never determines the outcome.

**3.10** If a site has no jurisdiction profile, classification is blocked, not defaulted. The record sits in a blocked state, the handler is told which input is missing and who can supply it (P2 or P6), and no downstream document may be generated.

**3.11** A full-hazardous outcome sets a manifest-required obligation on the record and on any shipment containing it.

**3.12** B1a does not generate a hazardous waste manifest. Where Rule 3.11 fires, the obligation is surfaced prominently on the record, on the container, on the shipment and on the shipping paper's accompanying checklist, and the shipment is never presented as fully documented. The gap is stated, never silent. See RN-5 and EC-19.

**3.13** A light-category outcome does not exempt a shipment from transport documentation. Every shipment needs a shipping paper regardless of waste classification. See Rule 5.4. This is the most commonly misunderstood point in the domain and the system must never imply otherwise.

**3.14** Re-classification supersedes; it never overwrites. The prior decision is retained in full with its inputs, rule versions, citations and reasoning intact.

**3.15** Re-classification is triggered by any of: a corrected identification (Rule 2.32), a change to the site's jurisdiction profile, a new rule version coming into force that affects an open record, a change in handler size class, or a change to the damage assessment.

**3.16** A new rule version never retroactively re-classifies a record on a shipment that has already departed. The decision that governed that shipment is the decision that was correct at the time, and it stays.

**3.17** A new rule version flags every open record whose classification it could affect for re-evaluation, and notifies P2. The flag is a required action, not a dismissible notice.

**3.18** Handler size class is determined by the quantity on site measured against the applicable threshold, evaluated continuously, with the calendar-year latch behavior carried in the jurisdiction rule. The threshold, the measurement basis and the latch behavior are all data.

**3.19** Crossing into a higher size class raises obligations immediately, on the day of crossing. Falling below the threshold later in the same calendar-year period does not lower them — the latch holds for the period defined in the rule version.

**3.20** A size-class change writes an audit event, notifies P2, and re-evaluates every open classification decision at that site.

**3.21 — PROHIBITED HANDLER ACTIVITIES ARE UNREACHABLE STATES.** Activities a handler is permitted to perform on accumulated batteries, and activities a handler is prohibited from performing, are both carried as jurisdiction data. The workflow makes prohibited activities unreachable: there is no screen, action, status or field through which a handler can record having performed one. The system does not warn about them; it does not offer them. (Research §1.1.)

**3.22** Where a prohibited activity is attempted through any path — an import, an API call, a status change — it is blocked, the reason is stated with the citation from the governing rule version, and the attempt is written to the audit log.

**3.23** A handler organization may not route its own accumulated light-category waste to a self-operated recycling or destruction process within the system. The destination of a shipment must be a distinct receiving party. Where the receiving party belongs to the same corporate group, the shipment is flagged for the handler to confirm the receiving party's own permitted status, and the confirmation is recorded.

**3.24** Classification decisions and their full reasoning are visible to every member of the owning organization and to P5 within an active grant's scope, and are included in every audit and evidence export.

**3.25** Voiding a battery record does not delete its classification decision. The decision is retained, marked as belonging to a voided record, and remains readable.

**3.26 — THE ONLY CLASSIFICATION OVERRIDE.** P6, and only P6, may set a classification outcome directly, overriding the derived one. The override requires a stated reason recorded on the decision, and the decision carries the override basis code owned by `TAXONOMY.md`. No other role may override a classification — not P1, not P2, not P3, not P4, and never P5. This exists for one situation: the jurisdiction rule data is wrong for a specific record and correcting the rule version would wrongly move every other record in that jurisdiction. **The ordinary fix is still to correct the rule data and let Rules 3.15 and 3.17 re-derive.** An override is the exception, not the tool.

**3.27** An override never edits a decision. It writes a new decision that supersedes the derived one, and the derived outcome it replaced — with its inputs, rule version and citation — is retained and readable beside it. An auditor must be able to see both what the rules produced and what a human substituted for it.

**3.28** Every override is separately listable in the audit export, so an auditor can ask "show me every classification a person set by hand" and get an answer. An override that moves a record to a **less** regulated outcome carries an additional obligation: the jurisdiction rule gap that made it necessary is recorded for correction by P6, and remains open until a corrected rule version supersedes it. Overriding toward less regulation without fixing the underlying rule is how a one-off becomes a habit.

---

### 4. Storage, containers and the one-year clock — B1a

*"One-year clock" is the industry's colloquial name for this mechanism, and it is the fixed section title. **The system never assumes one year.** The accumulation period is jurisdiction data, read per Rule 1.23.*

**4.1** A container is a physical accumulation unit belonging to exactly one site. A container never spans sites and never moves between them while holding contents.

**4.2** A storage clock attaches to a container under the container-marking demonstration method, or to individual items under the inventory demonstration method. Both are valid demonstrations of accumulation age.

**4.3** The demonstration method is chosen per site by P2 or P6, is recorded with its effective date, and is included in every audit and evidence export. Changing the method does not restart any clock.

**4.4** A storage clock starts on the date the first battery is placed into the container — the accumulation start date. Not the date the container was created, not the date the batteries were logged.

**4.5** The applicable accumulation period is read from the jurisdiction rule in force at the site on the accumulation start date. It is never written as a number in logic, in copy, or on a template.

**4.6** The storage clock never pauses. There is no hold, no freeze, no suspend and no extension. A container in dispute, under inspection, or awaiting a carrier keeps counting.

**4.7** A storage clock closes in exactly two ways: the contents depart on a shipment, or the container reaches empty with no remaining contents carrying that start date.

**4.8** Emptying a container does not reset the clocks of items that were moved elsewhere. Their accumulation start dates travel with them.

**4.9** Moving a battery record from one container to another carries its accumulation start date with it. Moving batteries between containers is never a way to restart a clock, and the system must make that impossible rather than merely discouraged.

**4.10** A receiving container's accumulation start date becomes the earliest accumulation start date among its contents, immediately on receipt. If that makes the receiving container overdue, it becomes overdue.

**4.11** Consolidating two or more containers produces a container whose accumulation start date is the earliest among all consolidated contents.

**4.12** Splitting a container produces containers that each inherit the earliest accumulation start date among their own contents. Splitting is never a way to shed an old start date.

**4.13** Alerts fire on a configured ladder of remaining-time offsets held as configuration data, seeded with the roadmap's default tiers. The ladder is data; the existence of alerting is not. Tier names are owned by `TAXONOMY.md`.

**4.14** Storage-clock alerts are delivered to P1 and P2 for the affected site. P2 always receives them; P1 receives them for containers at their site.

**4.15** Overdue is a hard state, not a warning. It is reached when elapsed time exceeds the applicable accumulation period.

**4.16** An overdue container accepts no new items. The action is blocked with a stated reason and a pointer to the two available paths: ship the contents, or record a remediation.

**4.17** The contents of an overdue container may leave only by shipment, or by a recorded remediation entered by P2 that states what was done and why. A remediation is an audited event, never a silent status change, and it does not alter the accumulation start date.

**4.18** A container label carries the required regulatory phrase, the contents description and the accumulation start date. The exact required phrase, its wording and any format requirements are jurisdiction data carried by the rule version, per Rule 1.23. `TAXONOMY.md` owns the contents-description vocabulary.

**4.19** The accumulation start date on a printed label must match the container's current accumulation start date. Where they differ, the container is flagged as mislabeled and must be relabeled before a shipment may be built from it.

**4.20** A container label is a document render. Reprinting produces a new render that supersedes the previous one; the previous render is retained.

**4.21** A container label must be regenerated when the accumulation start date changes, when the contents description changes materially, or when the applicable label rule version changes. The system flags the need; a human prints.

**4.22** Under the container-marking demonstration method, a container holding contents with no current printed label is non-compliant, is flagged to P1 and P2, and cannot be added to a shipment until it is labeled.

**4.23** A lot groups battery records or containers for shipment or reporting. A lot is not a place, has no fill level, and has no storage clock of its own.

**4.24** A lot reports the earliest accumulation start date among its contents. Where a lot contains an overdue container, the lot reads overdue.

**4.25** Every container records a capacity and a current fill level. Fill level updates on every placement and removal.

**4.26** Per-container and site-aggregate quantity limits are jurisdiction and fire-code data, read per Rule 1.23. In B1a, crossing a limit raises a warning to P2 with the limit's source stated. The monitoring, alerting and evidence behavior around those limits is section 9 (B1b), and B1a must not implement it ahead of specification.

**4.27** Damaged, defective or recalled records are placed in a segregated quarantine container. See Rule 6.17.

**4.28** A container holds one segregation class, and the constraint is enforced at placement, not advised. Placing an item of a different segregation class into a container is blocked with a stated reason.

**A container's segregation class is a composite of two things: the classification outcome of its contents (section 3) and their condition state (section 6).** It follows that **no container may ever hold records carrying two different waste classification outcomes**, and no container may hold sound records alongside damaged, defective or recalled ones. A container awaiting a determination — an unassessed damage state, or a recall association not yet adjudicated — is its own class again, and issues no documents until the determination is made.

`TAXONOMY.md` owns the values of this composite and stores them on the column **`container.container_type`**. *That column name and the term "segregation class" denote the same thing.* This document uses the term; `TAXONOMY.md` T-23 and `ERD.md` use the column. Neither is renamed — see OQ-9, decided.

**4.29** Every clock date, alert evaluation and overdue determination is computed in the site's local time zone, and every stored timestamp carries its time zone. A container is not overdue because a server is in a different zone. See Rule 12.20.

**4.30** A container cannot be deleted. An empty container with a closed clock may be retired; a container holding contents or with a running clock may not.

---

### 5. Transport documentation and shipping papers — B1a

*Grounded in Decision D-6 and the research sweep §1.1. The shipping paper is the document that actually travels with almost every battery.*

**5.1** A shipment is assembled from containers, lots or individual battery records. All three are valid sources and may be mixed.

**5.2** A shipment has exactly one origin site, one destination, one mode of transport and one shipping paper.

**5.3** A shipping paper may be generated only when every one of these preconditions is satisfied, and each unmet precondition is listed by name to the user: every included record has a confirmed identification (section 2); every included record has an active classification decision (section 3); no included record carries an unresolved damaged-or-defective determination that conflicts with the selected mode (section 6); the organization has a verified 24-hour emergency contact number on file; and the destination and transporter details are recorded.

**5.4** Every shipment requires a shipping paper, regardless of whether its contents classified into the light waste category or as full hazardous. There is no shipment without one.

**5.5** Every shipping paper carries emergency response information. Its required content is carried by the applicable rule version as data.

**5.6** The 24-hour emergency contact number must be recorded for the organization and verified before it can be used on a document. Verification is a recorded act with a date and an actor.

**5.7** A missing, unverified or expired 24-hour emergency number blocks shipping-paper generation with a stated reason and a pointer to who can fix it (P2 or P6). It is never omitted from the document and never replaced with a placeholder.

**5.8** The basic description sequence, the required identifiers and their ordering are owned by `TAXONOMY.md` and by the applicable rule version. This document does not enumerate them.

**5.9** Shipping identifiers — proper shipping name, identification number, class and packing group — are derived from the matched catalog entry together with the active classification decision. They are never free-typed by a handler and never guessed when the catalog entry is absent; a record with no shipping identifiers blocks generation.

**5.10** The mode of transport is selected per shipment, from the modes named in `TAXONOMY.md`. The selected mode is recorded on the shipment and on the shipping paper.

**5.11** Air is gated by section 6. Where any included record is damaged, defective or recalled, air is not merely warned against — it is unavailable. See Rules 6.7 and 6.8.

**5.12** Every generated document is an immutable render. No render is ever edited after generation, by any role, including P6.

**5.13** Changing a shipment's contents after a shipping paper has been generated voids that paper immediately. The shipment returns to a state requiring regeneration, and the voided paper is retained and marked.

**5.14** A voided document is retained in full, marked void, with the reason and the actor recorded. Voided documents appear in audit and evidence exports.

**5.15** Corrections produce a new render that references the render it supersedes. Both are retained and both are readable, and the superseded one is clearly marked as no longer valid.

**5.16** Transporter details — carrier identity, any required transporter identifiers, and the pickup date — are recorded on the shipment before departure.

**5.17** Departure is a recorded act with a date, a time zone and an actor. Departure creates the shipment ledger entry, closes the storage clocks of the departing contents, and moves the included records to shipped.

**5.18** The shipment ledger is retained for the applicable retention period, read from jurisdiction data per Rule 1.23, and is exportable per section 12.

**5.19** Where the applicable rules provide a packaging exception for batteries moving by ground to a recycling or disposal destination, the system determines eligibility for that exception from the shipment's mode, destination type and contents, using the rule version in force on the shipment date. Eligibility, the criteria used and the citation are recorded on the shipment.

**5.20** A shipment that does not qualify for a packaging exception falls back to the full packaging obligations carried by the applicable rule version. The system never assumes eligibility, and never silently applies an exception the shipment does not qualify for.

**5.21** Label and mark artwork is governed by a versioned artwork rule. The version applied is the one in force on the print date, not the shipment creation date. Artwork requirements change on dated schedules and are data, never drawn into a template as a fixed design.

**5.22** A reprint after an artwork rule version changes uses the version in force at the moment of reprint, and the reprint is a new render superseding the old one.

**5.23** Where the applicable rules require a test summary or certification document to be available on request, the system records whether that document is on file for each catalog entry, and surfaces its absence on the shipment. Which documents are required and from when is rule-version data.

**5.24** A shipment never includes records from more than one organization. This is blocked at assembly, not detected afterward.

**5.25** A record already assigned to an open shipment cannot be added to a second one. It must be removed from the first.

**5.26** Arrival at the destination is a recorded act. Arrival closes the shipment and moves its records to closed out, which is terminal.

**5.27** Any member of the owning organization may view, print and download any document their role permits them to see. P5 may view and download within an active grant's scope and may generate nothing.

**5.28 — DRAFT RENDERS ARE NEVER DOCUMENTS.** A document may be rendered as a draft for preview before its preconditions are met, so a handler can see what they are about to produce. A draft is watermarked as not valid, is never counted as satisfying any documentation obligation, may never accompany a shipment or be applied to a container, and does not close any precondition in Rule 5.3. Issuing is a separate, deliberate act that produces the issued render. A draft is still immutable as a render — a changed draft is a new draft, not an edited one — and drafts are retained and auditable like every other render.

---

### 6. Damage, defect and the air-transport prohibition — B1a

*Grounded in the research sweep §1.1. This section contains the product's only absolute prohibition on a user action, and it is deliberate.*

**6.1** Every battery record carries a damage assessment. A record with no assessment is incomplete and cannot be added to a shipment.

**6.2** A damage assessment is assessed condition, confirmed by a human. A model may propose indicators; a model never sets them. See Rule 2.27.

**6.3** The damage indicator vocabulary — swelling, dents, punctures, corrosion, leakage, connector damage and any others — is owned by `TAXONOMY.md`. This document references the set; it does not enumerate it.

**6.4 — WHAT "DAMAGED OR DEFECTIVE" MEANS.** A battery record is damaged or defective when a human has confirmed the presence of at least one indicator from the taxonomy's **damaged-or-defective indicator set**, or when the record carries an active recall association. `TAXONOMY.md` defines which indicators belong to that set and which are merely cosmetic and do not trigger it. The distinction between a cosmetic mark and a damaged-or-defective indicator is a taxonomy decision, not a builder's judgment.

**6.5** A recalled record is handled in the same class as a damaged or defective one for transport and segregation purposes. In B1a a recall association is entered by a human; automated recall matching is section 10 (B2) and does not change this rule's effect.

**6.6** No damage assessment is ever produced without human confirmation, regardless of the confidence of any visual proposal. See Rule 2.15.

**6.7 — AIR TRANSPORT IS HARD-BLOCKED FOR DAMAGED, DEFECTIVE OR RECALLED RECORDS.** This is a block, not a warning. Where any record in a shipment is damaged, defective or recalled, the air mode of transport is unavailable for that shipment. It cannot be selected. There is no acknowledge-and-proceed, no confirmation dialog that permits it, no "I understand the risk" checkbox, and no supervisor approval path.

**6.8** No role can override Rule 6.7. Not P1, not P2, not P3, not P4, not P6. There is no setting, no support grant, no import path and no API call that permits air transport on a damaged, defective or recalled record.

**6.9 — WHAT THE USER SEES.** When a handler selects a shipment containing a damaged, defective or recalled record, the air mode is presented as unavailable — visibly present but not selectable — accompanied by: a plain-language statement that damaged, defective and recalled batteries are prohibited from air transport; the citation carried by the governing rule version; the list of specific records causing the block; and, for each, the specific indicator that triggered it.

**6.10 — WHAT THE USER CAN DO.** The same surface offers exactly three paths, and no others: ship by a non-air mode; remove the blocking records from the shipment and ship the remainder by air; or re-assess the damage on a specific record under Rule 6.11. The paths are offered as actions, not as advice.

**6.11 — THE ONLY WAY TO CLEAR THE BLOCK** is a new damage assessment, entered by a human, that finds no damaged-or-defective indicator present, and that carries a stated reason for the change and at least one photograph supporting it. The block clears because the record's assessed condition changed — never because someone chose to proceed.

**6.12** A superseded damage assessment is retained and displayed alongside the current one, with its author, timestamp, indicators and evidence. Both the original finding and the correction are permanently visible on the record and in every export. A record whose damage assessment has been reversed is a record an auditor will want to look at, and the system makes that easy rather than hard.

**6.13** A damaged, defective or recalled record cannot be added to a shipment whose mode is air. The addition is blocked at the moment of assembly.

**6.14** If a damage indicator is confirmed on a record already assigned to an air shipment, that record is removed from the shipment automatically, the shipping paper is voided per Rule 5.13, the shipment returns to a state requiring regeneration, and P1 and P2 are notified with the reason.

**6.15** Packaging, outer-packaging class and marking requirements for damaged, defective and recalled batteries — including any minimum marking dimensions and required marking text — are carried by the applicable rule version as data, per Rule 1.23.

**6.16** The damaged/defective/recalled packet is generated as part of the shipment's document set whenever the shipment contains such a record, and its absence blocks departure.

**6.17** A record confirmed damaged, defective or recalled is routed to a segregated quarantine container at its site. The routing is a required action; the record cannot remain in general stock.

**6.18** Quarantine containers hold only the quarantine segregation class. See Rule 4.28.

**6.19** Damage does not stop a storage clock. A quarantined record's accumulation start date travels with it per Rule 4.9, and the quarantine container's start date follows Rule 4.10. There is no clock relief for damage.

**6.20** Damage discovered after intake — during storage, handling or shipment assembly — triggers a re-classification check under Rule 3.15, because the damage assessment is a classification input under Rule 3.4.

**6.21** Every change to a damage assessment writes an audit event carrying the before state, the after state, the stated reason, the actor and the evidence reference.

**6.22** A record with an unresolved damaged-or-defective determination cannot be marked as suitable for reuse or resale. Grading and reuse-versus-recycle logic is section 10 (B2); this rule binds it in advance.

**6.23 — WHO MAY RECORD A RECALL ASSOCIATION.** P1, P2 or P6 may record a recall association on a battery record. P5 may not, and neither may any automated step without human confirmation (Rule 10.7). The recording is **not** restricted to P6, deliberately: the handler at the facility is who receives a manufacturer's recall notice, and the effect of recording one is to increase handling restrictions, which is the safe direction to let people move in quickly. Every association records its source from the source vocabulary owned by `TAXONOMY.md`, a reference to the originating notice or database entry, the actor and the timestamp. A recorded association takes effect immediately: the record enters the section 6 handling class, moves to quarantine (Rule 6.17) and makes air unavailable on any shipment containing it (Rules 6.5, 6.7).

**6.24 — REMOVING A RECALL ASSOCIATION IS HELD TO RULE 6.11'S DISCIPLINE.** Dismissing or withdrawing a recall association requires a stated reason recorded on the association, is attributable to the human who did it, and never deletes the original — both the association and its dismissal stay permanently visible on the record and in every export. P5 may never dismiss one. Air transport does not become available again until the record's damage assessment and its recall associations are both clear. **Clearing a recall flag is not a route around Rule 6.7**, and the audit trail is built so that using it as one is visible.

---

### 7. Data capture, consent and training rights — B1a

*Grounded in Decision D-2, amended by D-7. The roadmap states this plainly: the training-rights grant must exist before the first battery is logged, and every battery that passes through beforehand is permanently unusable for training. This section is time-sensitive and non-negotiable.*

**7.1 — CONSENT BEFORE CAPTURE.** The Terms of Service granting rights to use submitted data for model training must be accepted by the organization and in force **before** any battery is logged in that organization. Not before the first shipment, not before the first export — before the first battery record exists.

**7.2** Until an acceptance is in force, intake is blocked organization-wide. The block is stated plainly: what must be accepted, who in the organization can accept it, and that no batteries can be logged until it is. Every other read-only surface remains available so the organization can be set up while consent is pending.

**7.3** Acceptance is made by a member holding the organization's binding authority — the founding member created at sign-up, or a P2 to whom binding authority has been assigned. P1, P3 and P4 cannot accept on the organization's behalf. P5 cannot accept anything.

**7.4** P6 can never accept the Terms of Service on a tenant's behalf, under any circumstance, including under a support grant. A platform admin accepting a customer's terms is not consent.

**7.5** Every acceptance records the exact version accepted, the accepting user, the timestamp with time zone, and the organization. This record is permanent and is never edited.

**7.6 — TRAINING ELIGIBILITY IS FIXED AT CAPTURE AND IS IMMUTABLE.** At the instant a battery record is captured, the system resolves whether an acceptance was in force, and stamps the record training-eligible or not. That stamp is decided once, is never recomputed, and is never editable by any role including P6.

**7.7** A battery record captured while no acceptance was in force is **permanently** not training-eligible. No later acceptance, no re-acceptance, no backdating and no administrative action ever makes it eligible.

**7.8** Not training-eligible does not mean not useful. An ineligible record is fully usable for compliance, documentation, storage, shipment, audit and insurance evidence. Eligibility governs one thing only: whether the record may enter a model training set.

**7.9** A record whose identification was never confirmed by a human is not training-eligible, regardless of the acceptance state. An unverified answer is not a label. See Rule 2.21.

**7.10 — WHAT THE TRAINING PAIR IS.** The asset being accumulated is the **label crop stored against the human-confirmed answer**, linked as a set: the photograph, the label crop, and the confirmed fields (manufacturer, model, chemistry, and the rest of the confirmed identification). Both halves must be present for the pair to be usable. (Decision D-7.)

**7.11** The second dataset is the **labeled damage set**: the intake photographs stored against the human-confirmed damage indicators from section 6. Same rule — both halves, or neither.

**7.12** When a new Terms of Service version is published, it carries an in-force date and a re-acceptance deadline. Every organization with an acceptance under a prior version is notified on publication, at the in-force date, and again before the deadline.

**7.13** Between the in-force date and the re-acceptance deadline the organization is in a grace window. Intake continues. Records captured in the grace window bind to the **prior** accepted version's terms, not the new one.

**7.14** When the re-acceptance deadline passes without acceptance, the acceptance lapses and intake is blocked organization-wide under Rule 7.2, with the same stated remedy.

**7.15** Records captured during a grace window are permanently governed by the prior version's terms. Accepting the new version afterwards does not move them.

**7.16** Every battery record permanently records which Terms of Service version was in force at its capture. That version's terms govern that record forever, even after the version is superseded and even after the organization has accepted three newer ones.

**7.17** Re-acceptance is never retroactive. Accepting a version today grants rights over records captured from today forward, and never over records captured before.

**7.18** If an organization revokes the grant, every record captured from the revocation forward is not training-eligible. Records captured while the grant was in force retain the eligibility they were stamped with at capture, because Rule 7.6 makes eligibility immutable. **This is a legal call and is flagged as RN-2 and OQ-3;** it holds as written until counsel confirms or replaces it.

**7.19** Consent is given by the organization, not by the individual user. A new P1 joining an organization with an acceptance in force may log batteries immediately.

**7.20** Each member acknowledges the Terms of Service on first sign-in, and the acknowledgement is recorded per user. An unacknowledged member still acts under the organization's acceptance — their acknowledgement is a record, not a second gate.

**7.21** Intake photographs may contain customer serial numbers and other identifying content. Any export of records for training purposes requires the redaction handling defined in section 12, and no raw photograph leaves the retention boundary without it. (`PROJECT_SETUP_BMMP.md` §1.)

**7.22** A record's training-eligible state is visible on the record and included in every export, so that eligibility can be verified from outside the system rather than trusted.

**7.23** Records created by migration or import default to **not training-eligible**, and cannot be stamped eligible by the import. An import can carry a prior acceptance forward only where that acceptance is itself imported as a record with its version, actor and timestamp intact, and the import is audited as such.

**7.24** No copy, derivative, crop, embedding or aggregate of a record that is not training-eligible may enter a training set. Eligibility travels with the data, not with the file.

---

### 8. Producer obligations and state registration — B1b — STUB

*Reserved. Specified at **Gate 2** (11 December 2026). Nothing in this section may be implemented ahead of that specification.*

**8.1** This section will govern: which state producer-responsibility statutes apply to a given producer and product; which stewardship organization must be joined in each state; the format classification of a product against each state's own thresholds; registration filing packets per state agency; annual sales and units-placed-on-market reporting mapped from one canonical dataset into each state's format; the dated obligation calendar; and label and marking compliance planning across divergent state schedules.

**8.2** Every threshold, deadline, statutory citation and covered-category definition in this section is jurisdiction data under Rule 1.23. The same battery classifies differently in different states, and the engine must express that as data, never as branching logic per state.

**8.3** The medium-format category that covers scooter and mobility packs is present in the jurisdiction rules data model **from the first migration**, before this section is specified. This is what makes section 11 an activation rather than a rebuild. (`_ANCHORS.md` §0; Roadmap B1b and B3.)

**8.4** Producer obligation records and their deadlines are evidence artifacts under section 12: dated, cited, versioned and exportable.

**8.5** Until this section is specified at Gate 2, P3 holds P1-equivalent permissions and no producer-obligation surface exists. A builder encountering a producer-obligation requirement raises it as a decision-log entry rather than implementing it.

---

### 9. Insurance evidence and fire-code volume — B1b — STUB

*Reserved. Specified at **Gate 2** (11 December 2026). Nothing in this section may be implemented ahead of that specification.*

**9.1** This section will govern: the insurance evidence pack and what it contains; live storage-quantity monitoring against fire-code limits and clearance rules; the alerting that fires before a violation rather than after; the jurisdiction profile engine that decides which code edition and which local amendments apply at each site address; the emergency response plan and its recurring review cadence; and the thermal and visual inspection log with its scheduled cadence and exception escalation.

**9.2** Every quantity limit, clearance distance, separation distance, code edition and adoption date in this section is jurisdiction data under Rule 1.23. Fire codes are adopted by different jurisdictions 12 to 24 months apart, and some jurisdictions measure by volume where others measure by energy. Per-jurisdiction versioning is a day-one property of the data model, not a later feature.

**9.3** An evidence pack contains records that already exist in the system. It never generates a new assertion, never fills a gap with an assumption, and never presents an absent record as satisfied. A gap in the evidence appears in the pack as a gap.

**9.4** Nothing in this section ever expresses hazard as a probability of ignition. See Rules 1.25 and 10.3.

**9.5** Until this section is specified at Gate 2, B1a raises a warning when a recorded limit is crossed (Rule 4.26) and does no more. A builder encountering a monitoring or evidence-pack requirement raises it as a decision-log entry rather than implementing it.

---

### 10. Grading, damage triage and hazard ranking — B2 — STUB

*Reserved. Specified at **Gate 2** (11 December 2026), built in B2. The orchestration pattern is fixed in `_ANCHORS.md` §6: concurrent fan-out and fan-in over one record, then a sequential grading step, human gate at the end. Two rules below are not reserved — they are in force now and bind every section built before this one.*

**10.1** This section will govern: visual damage triage against the labeled damage set; automated recall matching on every intake record; relative hazard ranking of stored inventory; the published grading scheme; the reuse-versus-recycle recommendation; and the provenance record binding a pack's serial to the device or vehicle it came out of.

**10.2** Specified at Gate 2 with the B2 scope. Nothing else in this section may be implemented ahead of that specification.

**10.3 — ABSOLUTE PROHIBITION: NEVER A PROBABILITY OF IGNITION. IN FORCE NOW.** No output of this product, in any phase, on any surface, ever expresses battery hazard as a probability, percentage, likelihood, chance, odds, score-out-of-ten implying likelihood, or "risk of fire." No screen, no notification, no API field, no export column, no generated document, no PDF, no chart axis, no tooltip, no email. There is no evidence base supporting a per-cell thermal-runaway prediction, and asserting one is a legal exposure, not an accuracy problem. **This is a prohibition, not a preference, and it is not waivable by any role, any customer request or any commercial pressure.** (`PROJECT_SETUP_BMMP.md` §8.3; Roadmap Principle 4; research §2.4.)

**10.4 — THE ONLY PERMITTED HAZARD OUTPUT SHAPE.** Hazard is expressed as a **relative ranking** of items against each other, accompanied by a **stated basis for each contributing factor** — what the factor is, what value this record has for it, and where that value came from. A user must be able to read why one item ranks above another, factor by factor. Ranking language is comparative ("higher than," "ranked above"), never probabilistic.

**10.5** The prohibition in 10.3 and the shape in 10.4 bind every phase, including work built before this section is specified. A builder in B1a who is asked for a "risk score" builds nothing and raises it. See Rule 1.25.

**10.6** The grading scheme is BMMP's own published scheme. There is no external letter-grade standard for used batteries to conform to. The product must never claim conformance to a standard that does not exist, and must state plainly, wherever a grade is shown or exported, that the scheme is BMMP's own and where its criteria are published. (Research §2.3.)

**10.7** Recall matching produces an advisory association. A recall association is confirmed by a human before it changes how a record is handled — with one exception: a confirmed recall association triggers the section 6 handling class immediately, because that direction is the safe one. See Rule 6.5.

**10.8** Chemistry is never determined from a photograph in B2 any more than in B1a. Improved label reading on degraded labels is still label reading. See Rule 2.9.

**10.9** The provenance record binds a battery's serial to its source device or vehicle. B1a captures the source reference under Rule 2.30; this section specifies the binding, its verification and what breaks it.

---

### 11. Mobility and small-battery coverage — B3 — STUB

*Reserved. Specified at **Gate 2 or Gate 3**, built in B3 (15 March – 9 April 2027). This is where MIP's purpose lands: MIP was about mobility-device batteries, and BMMP now handles mobility-device batteries. It was absorbed, not cut.*

**11.1** This section will govern: the small mobility battery catalog covering power wheelchair and scooter packs in both the older sealed lead-acid type and the newer lithium type; onboarding for mobility suppliers and repair companies who swap batteries constantly and must dispose of the old ones; activation of the medium-format producer rules built in section 8; air travel documentation for a personal mobility device; and the interface for plugging in third-party handheld battery-health testers.

**11.2** This phase **activates existing machinery**; it does not build new machinery. The battery record was sized wide in B1a under Rule 1.24, and the jurisdiction rules data model carries the medium-format category from the first migration under Rule 8.3. A builder who finds themselves widening the record or the rules model in B3 has found a defect in B1a or B1b, and raises it rather than working around it.

**11.3** Air travel documentation for a personal mobility device follows section 5 for document generation and section 6 for the damaged-battery prohibition without exception. A damaged mobility pack is hard-blocked from air transport exactly like any other damaged battery (Rule 6.7), including when it is fitted to a device a passenger is travelling with.

**11.4** The energy calculation performed against a carry-on or checked-baggage allowance reads its limit from the applicable rule version as data under Rule 1.23. No allowance figure is written into logic or copy.

**11.5** A third-party health tester produces **measured condition**. Measured condition is stored, labeled and exported separately from assessed condition, is never merged into it, and never silently replaces it. BMMP integrates measurement; it does not invent it. (Roadmap Principle 7; Decision D-11.)

**11.6** No hardware is built, sold, shipped or attached to any device in any phase of this product. The tester integration is a software interface to equipment the customer already owns. (Decision D-4, reinforced by D-8 and D-11.)

---

### 12. Audit, retention and export — B1a

**12.1** Every state change in the system writes an audit event. Creation, update, supersession, void, status transition, permission change, document generation, export, sign-in, grant, and denial — all of them.

**12.2** An audit event records: the actor (a user, or the pipeline step that acted), the organization, the entity and record affected, the timestamp with time zone, the before state, the after state, and the rule number that governed the action where one applies.

**12.3** The audit log is append-only. There is no edit path and no delete path, at any layer.

**12.4** No role may edit or delete an audit event. Not P2 in their own organization, not P6 at platform level, not P6 under a support grant. An audit log a platform admin can edit is not an audit log.

**12.5** Automated pipeline steps write audit events exactly as human actions do, identified as the step that ran and carrying the model or rule version used. (`_ANCHORS.md` §6.)

**12.6** Denied actions are audited. A blocked air-transport selection, a rejected P5 write, a prohibited-activity attempt and a permission denial all produce audit events, because attempted actions are evidence.

**12.7** Every action taken by P6 inside a tenant under a support grant is marked in the audit log as a platform action, with the grant's reason recorded, and is visually distinguishable from a tenant member's action.

**12.8** The audit log is visible to P2, P5 (within an active grant's scope) and P6. P1, P3 and P4 see the audit history of records they can already see, not the organization-wide log.

**12.9** The audit log is filterable and exportable by P2, P5 (within scope) and P6.

**12.10** Retention periods are jurisdiction data under Rule 1.23. Different record classes carry different periods, and different jurisdictions set different periods for the same class.

**12.11** A record's retention period starts on the governing date for its class — shipment records from departure, classification decisions from the decision date, battery records from close-out — as carried by the applicable rule version.

**12.12** Nothing is hard-deleted within its retention period. There is no delete action on a battery record, a classification decision, a document render, a shipment or an audit event.

**12.13** Records are voided or superseded instead of deleted, and both remain fully readable with their reason, actor and timestamp.

**12.14** Document renders are immutable. A correction is a new render referencing the old one. See Rule 5.15.

**12.15** Every decision records the rule version it applied, so the decision can be re-explained years later after the rule has changed three times. This is what makes an audit survivable. See Rule 3.7.

**12.16** Because rules are data (Rule 1.23), an auditor asking "why did you classify it that way in March 2027" is answered by reading the decision's stored rule version — not by reading code, and not by reconstruction.

**12.17** Exports are scoped: an export never contains a record the requester could not open individually in the application. Scope is enforced on the export, not on the screen that requested it.

**12.18** Every export is itself an audited act, recording who exported what, when, in what scope and in what format.

**12.19** A P5 export is limited to the grant's scope and expires with the grant. An export already produced remains valid as a file; the ability to produce another ends with the grant.

**12.20** Every stored timestamp carries a time zone, and every date-based rule is evaluated in the governing site's local time zone. The governing date for a rule-version lookup is stated by the rule that needs it — intake date for classification (Rule 3.6), accumulation start date for the storage clock (Rule 4.5), print date for artwork (Rule 5.21), shipment date for packaging exceptions (Rule 5.19).

**12.21** When an organization is offboarded, its access is removed and its data is retained through the applicable retention period. Offboarding is not deletion.

**12.22** A rule version is never edited in place. A change produces a new version with its own effective window, and the prior version is retained because decisions reference it.

**12.23** Rule version history is readable to P6 and, where a decision cites a version, readable to anyone who can read that decision — including P5 within scope. An auditor must be able to read the rule as it stood, not only as it stands.

**12.24** Any export intended for model training checks training eligibility per section 7 on every record individually, excludes ineligible records entirely, and applies the redaction handling in Rule 7.21. An export that cannot verify eligibility per record does not run.

---

## Edge Cases and Exceptions

*This is where agents fail most. Every case below is a real condition that the happy path does not cover. Each names the rules it modifies. Where a case is not covered here and not covered by a rule, the correct action is to raise a decision-log entry — not to choose.*

### Access, tenancy and roles

**EC-1 — The last binding-authority member tries to leave.** Blocked under Rule 1.12, with a stated reason and instructions to assign binding authority to another member first. Applies equally to self-removal, role downgrade and deactivation by another P2.

**EC-2 — A user holds P1 in one organization and P2 in another.** They hold both, independently. Their P2 permissions never apply in the organization where they are P1, and the interface must make the active organization unmistakable. Rules 1.3, 1.5, 1.22.

**EC-3 — A P5 grant expires mid-session while a page is open.** Access ends at the next request. The open page's already-rendered content is not retroactively hidden, but no further data loads and no navigation succeeds. Rule 1.28.

**EC-4 — P6 needs to diagnose a tenant's problem out of hours with no P2 available to approve.** P6 opens a support grant on their own authority, stating the reason. The grant is recorded, time-boxed and fully audited, and the tenant's P2 is notified that it happened. Rule 1.18. P6 acting without a recorded grant is the defect this case exists to prevent.

**EC-5 — An invited user accepts an invitation to an organization that has since been suspended.** The acceptance is held, not rejected. The user is told the organization is not currently active and who to contact. No membership becomes active until the organization does.

**EC-6 — A deactivated member's name appears on a shipping paper that is later reprinted.** The name stays. Historical attribution is never rewritten. Rule 1.13.

### Intake and identification

**EC-7 — The vision model returns a confident value for a field that is not physically on the label.** Treated as a fabrication, which is the documented failure mode of these models. Schema validation rejects it, the field is presented as unread with the raw text shown, and the record routes to review. Rules 2.11, 2.12, 2.14.

**EC-8 — Every field returns above threshold.** The record still stops at the gate for chemistry, model and condition. High confidence is not confirmation. Rule 2.15.

**EC-9 — A handler photographs a battery with two labels — an original manufacturer label and a rebrander's label.** Both crops are retained. The handler chooses which one is the identifying label, and the choice is recorded. If they conflict on a gated field, the record routes to review with both values shown.

**EC-10 — The catalog match is exact but the handler knows it is wrong.** The handler rejects it and takes the manual path or picks another candidate. A handler's rejection always wins over a match. Rules 2.19, 2.20.

**EC-11 — A date code decodes to a future date.** Recorded as undecodable, not as a future manufacture date. The record routes to review and the handler may enter a date manually. Rule 2.24.

**EC-12 — The same physical battery is logged twice by two handlers.** Both records exist. The system flags the suspected duplicate by matching identifiers, and a human decides: void one with a stated reason, or confirm they are genuinely two batteries. The system never auto-merges and never auto-voids.

**EC-13 — A confirmed chemistry is corrected after the record has already been classified and placed in a container.** The correction supersedes (Rule 2.32), which re-opens the gate for that field, which triggers re-classification (Rule 3.15), which may change the container's segregation requirement (Rule 4.28) and may void a generated shipping paper (Rule 5.13). All four consequences fire. None is optional.

**EC-14 — Extraction fails entirely: the service is unavailable.** The intake session enters failed, the photos are retained, and the handler is offered retry or the manual path. Work in progress is never lost because a pipeline step failed. Rule 2.29.

**EC-15 — A mobility scooter pack arrives with a label in a format the catalog has never seen.** It is logged through the manual path like any other unmatched battery, and proposed as a catalog entry. It is never rejected, deferred or routed to a "not supported yet" path. Rules 1.24, 2.20, 2.28.

### Classification

**EC-16 — A site's jurisdiction profile is missing at the moment of intake.** Identification completes; classification blocks. The record is held in a blocked classification state, P2 is notified with the specific missing input, and no container label or shipping paper can be produced from it. Rule 3.10.

**EC-17 — A battery is moved between two of the organization's own sites in different states.** The receiving site's jurisdiction governs from arrival. The record re-classifies under Rule 3.15, and both decisions are retained. The move itself is a shipment and needs its own shipping paper under Rule 5.4.

**EC-18 — A rule version comes into force overnight and affects two hundred open records.** All two hundred are flagged for re-evaluation and P2 is notified once with a count, not two hundred times. Departed shipments are untouched. Rules 3.16, 3.17.

**EC-19 — Classification resolves to full hazardous in a jurisdiction where B1a generates no manifest.** The obligation is surfaced on the record, the container, the shipment and the document set; the shipment is never displayed as fully documented; and the handler is told plainly which document the system does not produce. Rule 3.12, RN-5.

**EC-20 — A site crosses the handler size threshold on a Friday and falls back below it on Monday.** The higher obligations latch for the period defined in the rule version. They do not fall away on Monday. Rule 3.19.

**EC-21 — An import or API call attempts to record a prohibited handler activity.** Blocked, cited, audited. The prohibition is enforced at the data layer, not only in the interface, because "the workflow makes those states unreachable" means unreachable by any route. Rules 3.21, 3.22.

**EC-22 — The shipment destination is another business unit of the same corporate group.** Permitted, but flagged: the handler confirms the receiving party's own permitted status and the confirmation is recorded. Rule 3.23.

### Storage, containers and the clock

**EC-23 — A handler tries to reset a clock by moving batteries into a fresh container.** The new container inherits the earliest accumulation start date among its contents and may become overdue on the spot. This is the single most likely attempted workaround in the domain and the system defeats it structurally rather than by warning. Rules 4.9, 4.10.

**EC-24 — Two containers are consolidated, one nearly overdue and one new.** The result carries the earliest start date. Rule 4.11.

**EC-25 — A container is split to isolate the old contents.** Each resulting container carries the earliest start date **of its own contents**, so the split does relieve the container holding only new stock — and does not relieve the one holding the old. Rule 4.12.

**EC-26 — A shipment is cancelled after the container was sealed.** The container returns to accumulating with its original accumulation start date. The clock never stopped. Rules 4.6, 4.7.

**EC-27 — A container goes overdue while a shipment carrying it is being assembled.** The shipment proceeds; overdue blocks additions, not departures. Rules 4.16, 4.17.

**EC-28 — A site changes its demonstration method from container marking to an inventory system.** No clock restarts. The change is recorded with its effective date, and containers labeled under the previous method keep their labels as evidence. Rule 4.3.

**EC-29 — A printed container label shows an accumulation start date that no longer matches the container.** The container is flagged mislabeled and cannot join a shipment until relabeled. Rule 4.19.

**EC-30 — The site's local time zone crosses a daylight-saving boundary on the day a clock would tip overdue.** Evaluation is in the site's local time zone, and the boundary does not create or erase a day. Rules 4.29, 12.20.

### Consent and training rights

**EC-31 — A customer migrates historical records in from a spreadsheet.** Every imported record is not training-eligible by default and cannot be made eligible by the import. If the customer holds a genuine prior acceptance, that acceptance is imported as its own record with version, actor and timestamp, and the import is audited as such. Rules 7.7, 7.23.

**EC-32 — A handler logs a battery ninety seconds before the organization's acceptance is recorded.** That record is permanently not training-eligible. It is fully usable for compliance. Nothing makes it eligible later. Rules 7.1, 7.7, 7.17.

**EC-33 — A new Terms of Service version publishes on a Friday; the organization re-accepts the following Wednesday.** Records captured Friday through Tuesday bind to the **prior** version. Records from Wednesday bind to the new one. Rules 7.13, 7.15.

**EC-34 — An organization lets the grace window lapse and re-accepts a week later.** Intake was blocked for that week and no records exist from it. Records from before the lapse keep their original version. Records after re-acceptance bind to the new version. Rules 7.14, 7.16.

**EC-35 — A customer revokes the training grant and then asks for their previously captured records to be excluded from training.** Rule 7.18 currently says eligibility already stamped is not clawed back. Because this is a legal question, the request is escalated rather than actioned by a builder or a support admin. RN-2, OQ-3.

**EC-36 — A record is training-eligible but its identification was later corrected.** The eligibility stamp does not change (Rule 7.6). The training pair is the label crop and the **currently confirmed** answer, so the corrected value is what the pair carries. A correction improves the dataset; it does not disqualify the record. Rules 7.10, 2.32.

**EC-37 — An intake photo contains a customer's serial number and the record is selected for a training export.** Redaction handling applies before the export runs. An export that cannot apply it does not run. Rules 7.21, 12.24.

### Damage and transport

**EC-38 — A handler wants to fly a swollen pack because the customer is waiting.** Air is unavailable. There is no dialog that permits it, no supervisor who can approve it, and no support ticket that unlocks it. The handler ships by ground or re-assesses the damage honestly. Rules 6.7, 6.8, 6.10.

**EC-39 — A damage indicator is confirmed on a record already loaded onto an air shipment with a generated shipping paper.** The record is removed automatically, the paper is voided, the shipment reverts to needing regeneration, and P1 and P2 are notified with the reason. Rule 6.14.

**EC-40 — A handler reverses a damage finding to unblock air transport.** Permitted only as a genuine re-assessment with a stated reason and photographic evidence, and both assessments stay permanently visible on the record and in every export. The system makes the reversal easy to do honestly and impossible to do quietly. Rules 6.11, 6.12.

**EC-41 — A recall is confirmed on a record already in a sound-stock container.** It moves to quarantine, re-classification is checked, and air becomes unavailable on any shipment containing it. Rules 6.5, 6.17, 6.20.

**EC-42 — Damage is discovered during shipment assembly, after classification.** Re-classification is triggered because the damage assessment is a classification input. The shipment cannot be documented until the classification settles. Rules 3.4, 3.15, 5.3.

**EC-43 — The organization's 24-hour emergency number stops answering.** Verification is a recorded act with a date; where verification has lapsed under the organization's own re-verification interval, generation blocks until it is re-verified. A number that is on file but unverified is treated as absent. Rules 5.6, 5.7.

**EC-44 — A shipping paper is printed, then one container is pulled off the truck.** The paper is void the moment the contents change. A new render is generated for the actual load. The voided paper is retained. Rules 5.13, 5.14, 5.15.

**EC-45 — A label artwork rule changes between a shipment's creation and its reprint.** The reprint uses the version in force on the print date, which may differ from the original render. Both renders are retained and the difference is visible. Rules 5.21, 5.22.

**EC-46 — A shipment is assembled containing a record with no shipping identifiers because its catalog entry is incomplete.** Generation blocks with the specific record and the specific missing identifier named. Identifiers are never guessed from a similar catalog entry. Rule 5.9.

**EC-47 — A shipment departs and is refused at the destination.** The shipment enters exception, its records remain shipped rather than closed out, and the return movement is a new shipment with its own documents. Rule 5.26 does not fire on a refusal.

### Audit, retention and export

**EC-48 — A customer asks for a record to be deleted.** It is voided, not deleted, and it is retained through its retention period. The customer is told plainly what void means and what is retained. Rules 12.12, 12.13.

**EC-49 — An organization offboards while it has open storage clocks and undelivered shipments.** Access ends; data is retained through retention; clocks stop being alerted on because nobody is left to alert. The final state is preserved exactly as it stood. Rule 12.21.

**EC-50 — An auditor asks why a record classified as it did, and the governing rule version has since been superseded twice.** The decision's stored rule version is read back with its citation. No reconstruction, no inference. Rules 3.7, 12.15, 12.16, 12.23.

**EC-51 — A P5 requests an export covering a site outside their grant.** The export runs against the grant's scope only, and states what was excluded and why. It never silently returns a partial file. Rules 12.17, 12.19.

**EC-52 — A support engineer is asked to correct a wrong audit entry.** Refused. The correction is a new event describing the correction. Rule 12.4.

**EC-53 — A jurisdiction rule is discovered to have been entered incorrectly, and decisions were made on it.** The rule version is superseded with a corrected version, not edited. Affected open records are flagged for re-evaluation. Departed shipments keep the decision that governed them, and the error is recorded so an auditor can see both. Rules 3.16, 3.17, 12.22.

### Cross-cutting

**EC-54 — A builder finds a threshold they need and no jurisdiction rule holding it.** They do not write the number. They add the rule as data with its version and citation, or raise a decision-log entry if they lack the source. A hard-coded threshold is a review rejection. Rule 1.23, `PROJECT_SETUP_BMMP.md` §8.1.

**EC-55 — A customer asks for a "fire risk percentage" for their insurer.** Declined, and the relative hazard ranking with its per-factor basis is offered instead, with an explanation of why the percentage is not produced. Commercial pressure does not waive Rule 10.3. Rules 1.25, 10.3, 10.4.

**EC-56 — A stakeholder asks for chemistry detection from a photo of an unlabeled battery.** Declined in every document, demo and screen. The product reads labels and matches a catalog. Rules 2.9, 10.8; Decision D-7.

**EC-57 — A B3 requirement appears to need the battery record widened.** That is a defect in B1a's implementation of Rule 1.24, not a B3 task. It is raised, not worked around. Rule 11.2.

---

## Open Questions

*Rules not yet decided. Each carries a recommendation and a named decider. Nothing here may be implemented until it is decided and this document is versioned to reflect it.*

**OQ-1 — Are D-6 and D-7 locked?** Both are still status `Proposed`, decision required 2026-08-14. Sections 2, 3, 5 and 6 are built on them entirely.
*Recommendation:* lock both at Gate 0 before any brief cites those sections. **Decider: Nate, with Jonathan, at Gate 0.** (RN-1.)

**OQ-2 — Confidence threshold: platform-wide, or per tenant?** The gate is hard either way (Rule 2.13); only the value is in question.
*Recommendation:* a platform-wide floor set by P6, which a tenant may raise and can never lower. **Decider: Nate.** (RN-4.)

**OQ-3 — Does revoking the training-rights grant claw back eligibility already stamped on captured records?** Rule 7.18 says no.
*Recommendation:* hold Rule 7.18 as written and obtain a written opinion before the first training-set export. **Decider: counsel, instructed by Nate.** (RN-2, EC-35.)

**OQ-4 — Does B1a ship a working P5 login, or only P5 read-only enforcement plus audit export?** P5 is a B1b persona on a B1a page.
*Recommendation:* enforcement and export in B1a; the external grant workflow in B1b. **Decider: Nate, at Gate 1.** (RN-3.)

**OQ-5 — In a full-hazardous jurisdiction, does B1a block the shipment or document everything except the manifest?**
*Recommendation:* document everything else, hard-flag the gap, never present the shipment as fully documented. **Decider: Nate, with Jonathan, at Gate 1.** (RN-5, EC-19.)

**OQ-6 — Who holds an organization's binding authority after the founding member leaves?** Rule 7.3 requires it exist; Rule 1.12 requires one always be present. The assignment mechanism is not specified.
*Recommendation:* binding authority is an attribute of a P2 membership, assignable only by an existing holder or by P6 under an audited grant. **Decider: Nate.**

**OQ-7 — What is the re-verification interval for the 24-hour emergency number?** Rule 5.6 requires verification; EC-43 assumes an interval exists.
*Recommendation:* hold it as organization configuration with a platform default, and treat a lapsed verification as absent. **Decider: Nate, at Gate 1.**

**OQ-8 — Does an idle intake session expire, and after how long?** The intake session status table names an idle-expiry trigger for abandonment.
*Recommendation:* expire to abandoned after a configured idle period, retaining photos, and let the handler resume from the photos rather than restart. **Decider: Nate.**

**OQ-9 — DECIDED, v1.1, 2026-08-11. Can a container hold batteries whose classification decisions differ (light category and full hazardous together)?**
*Decision:* **No.** A container's segregation class is a composite of classification outcome and condition state, so two different waste classifications can never share a container. **Rule 4.28 is amended in place** to say so, and `TAXONOMY.md` T-23 is now the cross of the two dimensions rather than a flat list in which a quarantine container could mix outcomes.
*Also decided (`TAXONOMY.md` RN-8a):* the column stays **`container.container_type`**. "Segregation class" is this document's term for the same thing. Four downstream documents build against the column name and a rename costs five files and buys nothing. **Decided by: Nate, on the coordinator's reconciliation pass.**

**OQ-10 — Are storage-clock alerts delivered in-product only, or also by email?** Rule 4.14 names the recipients but not the channel.
*Recommendation:* in-product for B1a with email for the overdue tier only, expanding at Gate 1 based on what the first real user actually reads. **Decider: Nate, at Gate 1.**

**OQ-11 — Does the European Battery Passport bet get taken?** Roadmap Phase 0 flags this as a Gate 0 decision with a firm 18 February 2027 deadline. If taken, sections 2 and 12 acquire completeness and export rules that do not currently exist.
*Recommendation:* do not take the bet in this engagement; the Battery Pass data model adopted in B1a keeps the option cheap either way. **Decider: Jonathan, at Gate 0.**

**OQ-12 — What is the redaction standard for training exports?** Rule 7.21 requires redaction handling; the standard is not defined.
*Recommendation:* define it with counsel at Gate 1, before any corpus is exported, and until then permit no training export at all. **Decider: Nate, with counsel.** (EC-37.)

---

*Next Sketch LLC · Confidential · August 2026*
