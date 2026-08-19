# PRD — BMMP
**Version:** 1.0 · **Date:** 2026-08-11 · **Owner:** Nathan Ivy / Next Sketch LLC
**Answers:** What are we building?
**Reads from:** `VISION.md` · `ROADMAP_BMMP_2026-07-28.md` (v3.0) · `Decision Log.md` (D-1–D-11) · `RESEARCH_battery-management-feature-sweep_2026-07-28.md` · `BMMP_MIP_SOW_DRAFT_2026-07-12.md` · `PROJECT_SETUP_BMMP.md` · `_ANCHORS.md`  ·  **Feeds:** `SITE_ARCHITECTURE.md` · `UX_SPEC.md` · `BUSINESS_RULES.md` · `TAXONOMY.md` · `TECHNICAL_SPEC.md` · `ERD.md` · `RUNBOOK.md`

> ## REVIEW NOTES
> None open. All review notes for this document were answered on 2026-08-19 — see `Decision Log.md` **D-20** for the full disposition, and D-21 through D-26 for the calls that carry their own rationale. Content below is unchanged.

---

## 1. Overview

This document specifies **what gets built** for BMMP, at full depth for **Phase B1a — Compliance Core** (17 Aug – 16 Oct 2026), and at scope-only depth for Phases B1b, B2 and B3, which are specified at Gate 1 and Gate 2 respectively.

B1a delivers the outcome the roadmap gates on: **a business holding dead batteries can log one and produce every document the law actually requires, on live data.** That means a battery record, an intake pipeline that reads a label and asks a person to confirm it, containers with a running storage clock, a classification decision that records its own reasoning, a document engine that produces shipping papers and container labels, and an audit trail underneath all of it.

Two later-phase capabilities are specified **now** rather than later, because building them narrow would turn a four-week phase into a rebuild: the **battery record holds small mobility-device packs from the first migration**, and the **jurisdiction rules model carries the medium-format category from the first migration**. See §6.19.

**What this document does not contain, by design.** The PRD references other documents; it never absorbs them.

| If you are looking for | Read |
|---|---|
| Any if/then decision the system makes | `BUSINESS_RULES.md`, cited here by rule number |
| Any category, status, label or valid-value list | `TAXONOMY.md` |
| How pages connect, nest and are reached | `SITE_ARCHITECTURE.md` |
| What a screen looks like or how a control behaves | `UX_SPEC.md` |
| Tables, columns, types, keys | `ERD.md` |
| How any of it is implemented | `TECHNICAL_SPEC.md` |
| How it is deployed and operated | `RUNBOOK.md` |

If a requirement below reads like a rule or a list of valid values, it is a defect in this document — replace it with a citation.

---

## 2. Background / Context

### 2.1 Why this, and why now

The case is made in full in `VISION.md`. In brief, four findings from the research sweep set the shape of B1a:

1. **The entry product was aimed at the wrong document.** In 48 states, end-of-life lithium batteries fall under a lighter-touch waste category that is exempt from the hazardous waste manifest. The document that legally travels with almost every battery is the transport shipping paper, plus a container label and a storage clock. Higher volume, zero regulatory ambiguity, currently done in spreadsheets (D-6).
2. **Chemistry cannot be identified from a photograph.** It is printed on the label. Reading the label with a vision model and resolving it against a catalog works today and needs no harvested training data (D-7).
3. **The obvious buyer is the least solvent.** Aim one step upstream of the recycler, at producers, generators and receiving facilities.
4. **Regulatory obligations are dated, divergent and moving.** Fourteen states with different thresholds, fire codes adopted 12–24 months apart, a pending federal rule. Everything regulatory is data.

### 2.2 What is fixed before this document starts

- **Phases, gates and dates** — `ROADMAP_BMMP_2026-07-28.md` v3.0. B1a is 9 weeks, 17 Aug – 16 Oct 2026, ending at Gate 1.
- **Decisions D-1 through D-11** — in particular D-2 (capture from day one, training rights in force at launch), D-4 (no hardware), D-6 (the compliance artifact), D-7 (the capture payload), D-11 (MIP absorbed; BMMP widens to small mobility-device batteries). D-5, D-6 and D-7 are still `Proposed` — see RN-4.
- **Names, personas, entities, rule section numbers, the B1a page list, and the language rules** — `_ANCHORS.md`. These are fixed and this document does not vary them.
- **The stack, the repo layout, and the mock-first data seam** — `PROJECT_SETUP_BMMP.md`. In particular §3.2: the first shipped slice is a mock-data prototype, all screens on fake data behind `src/data`, migrating to Supabase after the UI settles. No screen ever talks to the database directly.
- **Orchestration patterns** — `_ANCHORS.md` §6. B1a's intake identification is a sequential, code-orchestrated pipeline with a human gate at the end. No agent chooses the next step.

### 2.3 What is carried rather than closed

SOW 1 is not being amended (D-10). Two clauses stay live and are carried as recorded exposures: **§11's M2 predictive-warning acceptance criterion**, which is unsatisfiable and unbounded, and **§10's `[[N]]` feedback window**, still a placeholder. Both appear in §9, Open Questions. They are the engagement's largest exposure and they are managed through the gate working sessions the SOW already provides, not through this document.

---

## 3. Goals

What B1a must accomplish. Each goal maps to a Vision outcome and is verified at Gate 1.

| # | Goal | Verifies |
|---|---|---|
| **G-1** | A real business can log a real battery from a photograph, with identification confirmed by a person, in less time than their current spreadsheet process. | O-1, O-4 |
| **G-2** | The shipping paper and container label that the law requires are generated from that record, correct, without re-typing. | O-1 |
| **G-3** | Every battery in storage has a running one-year clock that is visible to the facility manager and warns before it expires. | O-3 |
| **G-4** | Every classification decision records its inputs, its outcome, the jurisdiction rule applied, and the version of that rule — and remains readable years later. | O-2 |
| **G-5** | A damaged or defective battery cannot be routed to air transport, and the block states its reason. | O-1, O-2 |
| **G-6** | Every record is independently useful the day it is captured, and the photo, label crop and human-confirmed answer are stored as a linked, training-ready set with the training-rights grant already in force. | O-5 |
| **G-7** | Every regulatory threshold, deadline and citation lives in data. Zero appear in code. | O-6 |
| **G-8** | The battery record and the jurisdiction rules model are wide enough on day one that Phase B3 activates existing machinery rather than building new machinery. | O-9 |
| **G-9** | Every state change is attributable to an actor and recoverable from the audit log. | O-2, O-7 |
| **G-10** | The mock-to-real data seam holds: the same end-to-end suite passes on `DATA_ADAPTER=mock` and `DATA_ADAPTER=supabase` with no screen changes. | Enables the whole plan |

---

## 4. Non-Goals

`VISION.md` §5 carries the full list and the reasoning. Restated here only as scope-creep control for the build.

**Not in this product at all:** autonomous vehicles or any vehicle-motion capability; hardware of any kind; in-house battery health measurement; a probability of ignition or any prediction of an individual cell's thermal runaway; chemistry inference from a photograph with no legible label; physical recycling facilities or facility digital twins; a generic waste-management ERP; repair-deadline compliance software; any clinical or medical claim.

**Not in this product yet:** the marketplace (revisit at Gate 3 — build, partner or skip); electronic manifest integration (revisit when the final federal rule publishes); the European Battery Passport (open decision at Gate 0 — the Battery Pass data model is adopted in B1a regardless, so the option stays cheap).

**Not in B1a specifically:** producer obligations and insurance evidence (B1b); grading, damage triage, hazard ranking, recall matching and the reuse-versus-recycle engine (B2); mobility supplier onboarding and air travel documentation (B3). Their scope is stated in §6.16–§6.18, with the two exceptions in §6.19.

**Not decided by the builder, ever:** any orchestration pattern other than the two fixed in `_ANCHORS.md` §6; any jurisdiction threshold, deadline or citation written as a code literal; any relaxation of the confidence gate. Each of those is a decision-log entry, not a builder's call.

---

## 5. User Stories

Persona IDs are fixed in `_ANCHORS.md` §2. Stories are grouped by persona and marked with the phase that delivers them. Test-level given/when/then criteria live in the sprint-loop user stories and validation walkthroughs; the acceptance bar for the phase is §8.

### 5.1 P1 — Compliance Handler (B1a, the daily user)

- **US-1** — As a Compliance Handler (P1), I want to photograph a battery's label and have the platform read it for me so that I am not re-typing a part number I might get wrong.
- **US-2** — As a Compliance Handler (P1), I want to see how confident the platform is about each field it read so that I know which values to check rather than checking all of them.
- **US-3** — As a Compliance Handler (P1), I want to confirm the chemistry, model and condition myself before anything is saved so that no document goes out carrying a value nobody checked.
- **US-4** — As a Compliance Handler (P1), I want low-confidence reads to land in one queue so that I can clear them in a batch instead of hunting for them.
- **US-5** — As a Compliance Handler (P1), I want to log a battery whose label is missing or unreadable so that a scuffed label does not stop the work.
- **US-6** — As a Compliance Handler (P1), I want to propose a catalog entry when the battery I am holding is not in the catalog so that the next person does not hit the same wall.
- **US-7** — As a Compliance Handler (P1), I want to place a battery into a container and have its storage clock start automatically so that the clock is never something I remember to start.
- **US-8** — As a Compliance Handler (P1), I want to generate a shipping paper for a shipment in one action so that the document is ready when the carrier is at the dock.
- **US-9** — As a Compliance Handler (P1), I want to print a container label that already carries the storage start date so that the drum is compliant the moment it is marked.
- **US-10** — As a Compliance Handler (P1), I want to record damage on a battery at intake so that the platform routes it correctly instead of me remembering to.
- **US-11** — As a Compliance Handler (P1), I want to be stopped, with a stated reason, if I try to send a damaged battery by air so that I cannot make that mistake at all.
- **US-12** — As a Compliance Handler (P1), I want to re-print any document I have generated before so that a lost copy is not an incident.
- **US-13** — As a Compliance Handler (P1), I want to search and filter batteries by the things I actually know about them so that I can find the pack a colleague is asking about.

### 5.2 P2 — Facility Manager (B1a)

- **US-14** — As a Facility Manager (P2), I want one view of every open storage clock so that nothing in my building ages out without me knowing.
- **US-15** — As a Facility Manager (P2), I want warnings before a storage clock expires, not after, so that I have time to arrange a shipment.
- **US-16** — As a Facility Manager (P2), I want to see what is in each container and how full it is so that I can answer a fire marshal's question without opening a drum.
- **US-17** — As a Facility Manager (P2), I want to set my organisation's jurisdiction profile so that the rules the platform applies are the ones that apply to my site.
- **US-18** — As a Facility Manager (P2), I want to manage who has access and what they can do so that a departing employee stops being able to issue documents.
- **US-19** — As a Facility Manager (P2), I want an exportable audit log so that when an inspector asks how a decision was made, I hand them a file rather than a story.

### 5.3 P6 — Platform Admin (B1a)

- **US-20** — As a Platform Admin (P6), I want to add and edit jurisdiction rules as data so that a statutory change is an edit I make, not a release someone ships.
- **US-21** — As a Platform Admin (P6), I want every rule change to be versioned with an effective date so that a document generated last year can still be explained by the rule that was in force then.
- **US-22** — As a Platform Admin (P6), I want to review and publish catalog entries proposed by handlers so that the shared catalog improves without anyone editing it unreviewed.
- **US-23** — As a Platform Admin (P6), I want to create and configure a tenant organisation so that onboarding a customer does not require a database session.
- **US-24** — As a Platform Admin (P6), I want to confirm that the training-rights terms are accepted for an organisation before its first battery is logged so that no captured record is permanently unusable.

### 5.4 P3 — Producer Compliance Officer (B1b)

- **US-25** — As a Producer Compliance Officer (P3), I want to know which state statutes apply to the batteries my company places on the market so that I stop maintaining that answer in a spreadsheet.
- **US-26** — As a Producer Compliance Officer (P3), I want a dated calendar of my obligations with their legal citations so that a deadline is something I am warned about rather than something I discover.
- **US-27** — As a Producer Compliance Officer (P3), I want to produce a state agency registration packet from data I have already entered once so that registering in the fifth state costs less than the first.

### 5.5 P5 — Auditor / Underwriter (B1b, external, read-only)

- **US-28** — As an Auditor or Underwriter (P5), I want read-only access to one organisation's evidence pack so that I can complete a renewal or an audit without being given the ability to change anything.
- **US-29** — As an Auditor or Underwriter (P5), I want to see why a battery was classified the way it was, including which rule version applied, so that I can verify the decision rather than take it on trust.

### 5.6 P4 — Mobility Supplier Technician (B3)

- **US-30** — As a Mobility Supplier Technician (P4), I want to log a replaced wheelchair or scooter pack through the same intake as any other battery so that disposal documentation is a step in the job rather than a separate errand.
- **US-31** — As a Mobility Supplier Technician (P4), I want the disposal documentation for the old pack before I leave the customer's site so that the pack is compliant from the moment it is in my van.

---

## 6. Functional Requirements

### 6.0 How to read this section

- **Depth.** §6.1–§6.15 are **B1a**, written to build depth. §6.16–§6.18 are B1b, B2 and B3 at scope-only depth. §6.19 covers the two later-phase items specified now.
- **Citations.** `Rule N.n` refers to `BUSINESS_RULES.md`; section numbers are fixed by `_ANCHORS.md` §4. See RN-1. Entity names in `code_font` are fixed by `_ANCHORS.md` §3. Routes are fixed by `_ANCHORS.md` §5.
- **What is missing on purpose.** No requirement below states a threshold, a valid-value list, a status transition or a screen layout. Those live in `BUSINESS_RULES.md`, `TAXONOMY.md` and `UX_SPEC.md`.
- **The prototype.** Every requirement below must be satisfiable on `DATA_ADAPTER=mock` before it is satisfiable on `DATA_ADAPTER=supabase`, and must not change shape between them (`PROJECT_SETUP_BMMP.md` §3.2).

---

### 6.1 FR-1 — Tenancy, identity and access

- **FR-1.1** The system supports multiple customer organisations on one deployment. Every record in the product belongs to exactly one `organization`.
- **FR-1.2** A `user` reaches an organisation's data only through a `membership`, which carries their role. Roles and their capabilities are defined in `TAXONOMY.md`; what each role may and may not do is Rule 1.2.
- **FR-1.3** Users are invited by email and accept through `/invite/[token]`. Invitation, acceptance, expiry and revocation behave per Rule 1.4. Members and their roles are managed at `/settings/users` by P2 and P6, including revoking a departing member's access.
- **FR-1.4** Authentication is email-and-password with session management, on `/sign-in` and `/sign-up`. Sign-up creates an organisation; every later member arrives by invitation.
- **FR-1.5** Access to every route is enforced against the access column in `_ANCHORS.md` §5. Enforcement happens server-side; hiding a control in the UI is not access control.
- **FR-1.6** A member may belong to more than one organisation and switches between them explicitly. No view ever combines records from two organisations.
- **FR-1.7** External read-only access for P5 is scoped to one organisation and grants no write capability anywhere in the product, per Rule 1.3. The B1a surface for this is `/audit`; the B1b evidence pack extends it.

**Cites:** Rules 1.1–1.4 · `TAXONOMY.md` (roles) · `_ANCHORS.md` §5 (access) · Entities: `organization`, `user`, `membership`

---

### 6.2 FR-2 — Terms of Service and data-training rights

- **FR-2.1** An organisation must have a recorded `tos_acceptance` before its first `battery_record` can be created. This is a hard precondition, not a prompt — per D-2, every battery logged before the grant is in force is permanently unusable for training.
- **FR-2.2** The acceptance records who accepted, on behalf of which organisation, at what time, and against which version of the terms.
- **FR-2.3** When the terms version changes, re-acceptance is required per Rule 7.1. Records captured under a prior version retain the rights granted under that version.
- **FR-2.4** What is captured and stored as the training-linked set — the `intake_photo`, the label crop, and the human-confirmed answer — is Rule 7.2. The set is stored linked, not merely co-located.
- **FR-2.5** Handling of customer identifiers visible in a photograph, including serial numbers, is Rule 7.4. No battery photograph containing a customer serial number is ever committed to version control (`PROJECT_SETUP_BMMP.md` §1).

**Cites:** Rules 7.1–7.4 · Entities: `tos_acceptance`, `intake_photo` · D-2

---

### 6.3 FR-3 — The battery record

*This is one of the two forward-specified items. See §6.19.*

- **FR-3.1** `battery_record` is the canonical record for one physical battery, and every other entity in the product refers to it rather than duplicating it.
- **FR-3.2** The record is modelled on the **Battery Pass data model**, which is public and openly licensed. Adopting it rather than inventing a schema is what keeps a future European passport export mechanical instead of a rebuild (Roadmap Principle 6). Column-level detail is in `ERD.md`.
- **FR-3.3** **The record holds small mobility-device packs — power wheelchair and mobility scooter batteries — from the first migration**, alongside vehicle, consumer-electronics and industrial batteries. Concretely, the record must be able to represent:
  - a device class covering all four coverage classes, not a vehicle-only assumption;
  - pack attributes at any scale — mass, nominal voltage, energy, capacity, cell count, form factor and size class — because a jurisdiction may classify by any of them;
  - chemistry families including the sealed lead-acid type as well as lithium types, because mobility devices are mid-switch between them.
  Valid values for every one of those dimensions live in `TAXONOMY.md`. This requirement is about the *shape* of the record, not its vocabulary.
- **FR-3.4** A record carries its identification state, its condition state and its location state independently. Statuses, their meanings and their transitions are `TAXONOMY.md` plus Rule 2.x and Rule 4.x.
- **FR-3.5** A record is never hard-deleted while it is referenced by a `shipment`, a `shipping_paper` or a `container_label`. Retention behaviour is Rule 12.3.
- **FR-3.6** `/batteries` lists and filters records; `/batteries/[id]` shows one record with its history and linked documents. Structure is `SITE_ARCHITECTURE.md`; appearance is `UX_SPEC.md`.

**Cites:** Rules 2.x, 4.x, 12.3 · `TAXONOMY.md` · `ERD.md` · Entities: `battery_record` · `PROJECT_SETUP_BMMP.md` §8.2

---

### 6.4 FR-4 — Battery catalog

- **FR-4.1** `catalog_entry` describes a known battery product. It is the thing a label read resolves *to*, and it is where chemistry comes from — chemistry is matched from the catalog and confirmed by a person, never seen in an image.
- **FR-4.2** The catalog is browsable and searchable at `/catalog`, with detail at `/catalog/[id]`.
- **FR-4.3** P1 may propose a new catalog entry from an intake when no match exists. P6 reviews and publishes it at `/settings/catalog`. Who may propose, who may publish, and what happens to records attached to an unpublished proposal is Rule 2.5.
- **FR-4.4** A catalog entry must be able to describe a small mobility pack as completely as a vehicle module — same fields, same completeness expectations (see FR-3.3).
- **FR-4.5** Catalog entries are shared across tenants; proposals are visible only to the proposing organisation and to P6 until published.

**Cites:** Rule 2.5 · `TAXONOMY.md` · Entities: `catalog_entry` · `_ANCHORS.md` §7 rule 2

---

### 6.5 FR-5 — Intake pipeline

The orchestration pattern is fixed: **sequential, code-orchestrated, human gate at the end** (`_ANCHORS.md` §6). No agent chooses the next step. Every step writes an `audit_event`.

- **FR-5.1** Intake runs at `/batteries/new` as a multi-step flow: photo → extraction review → confirm. An `intake_session` holds the in-progress work so a handler can leave and return without losing captured photos.
- **FR-5.2** One or more `intake_photo` records are captured per session, from a device camera or an upload. Photo capture must work on a mobile browser — the handler is standing in a warehouse, not sitting at a desk.
- **FR-5.3** The pipeline crops the label region from the photo and stores the crop as part of the linked set (FR-2.4).
- **FR-5.4** A vision model reads the label crop and produces a `label_extraction` holding **a value and a confidence for each field it extracted**. Per-field confidence is mandatory: the known failure mode of these models is fabricating a field value on a low-confidence read, and per-field confidence plus schema validation plus a human threshold is the documented mitigation.
- **FR-5.5** Extracted values are schema-validated before they are shown. A value that fails validation is presented as unread, not as a low-confidence read.
- **FR-5.6** The extraction is matched against `catalog_entry` to propose a product. Match behaviour, including no-match and multiple-match, is Rule 2.5.
- **FR-5.7** `date_code_decode` derives age from a decoded date code using deterministic rules. No model is involved. Decode behaviour and the handling of an undecodable code is Rule 2.6.
- **FR-5.8** Form factor is detected from the photograph. Form factor is the one visual attribute the evidence supports detecting; it is not chemistry and is never presented as chemistry.
- **FR-5.9** **The confidence gate.** Before anything commits, the record passes a gate whose behaviour is Rule 2.3: any field below threshold routes the whole record to `/review`. The gate's existence is fixed by `_ANCHORS.md` §6 — it is a hard rule, not a tunable default, and no configuration may switch it off. Where the threshold value lives is RN-3.
- **FR-5.10** **Human confirmation.** P1 confirms chemistry, model and condition before the record commits, per Rule 2.4. Nothing auto-commits an unconfirmed value of any of the three, at any confidence.
- **FR-5.11** A battery whose label is missing, destroyed or unreadable can still be logged, by the path in Rule 2.1. Intake must not be blocked by a bad label.
- **FR-5.12** State of charge at intake is captured where the handler can obtain it, per Rule 2.8. It is an input to later phases and to Rule 3.x; it is recorded, never inferred from a photograph.
- **FR-5.13** On commit, the photo, the label crop and the confirmed answer are stored as a linked set (FR-2.4) and the record becomes visible at `/batteries/[id]`.

**Cites:** Rules 2.1–2.8 · `TAXONOMY.md` (fields, form factors, confidence bands) · `UX_SPEC.md` (the three-step flow) · Entities: `intake_session`, `intake_photo`, `label_extraction`, `date_code_decode`, `catalog_entry`, `battery_record`, `audit_event` · `_ANCHORS.md` §6

---

### 6.6 FR-6 — Confidence-gated review queue

- **FR-6.1** `/review` lists every record held by the confidence gate, for P1 and P6.
- **FR-6.2** A queue item shows the photo, the label crop, every extracted field with its confidence, and the proposed catalog match — enough for a person to decide without opening the record.
- **FR-6.3** A reviewer may accept, correct or reject each field. Corrections are recorded against the original extraction, not over it: the corrected pair is the training signal.
- **FR-6.4** Clearing a queue item commits the record through the same confirmation path as FR-5.10. There is no route that commits a record without a human confirmation.
- **FR-6.5** Queue ordering, ageing and escalation behaviour is Rule 2.3.

**Cites:** Rule 2.3, Rule 2.4 · Entities: `label_extraction`, `battery_record`, `audit_event`

---

### 6.7 FR-7 — Containers, lots and the storage clock

- **FR-7.1** A `container` is a physical vessel holding batteries at a site. A `lot` groups batteries for movement or processing. `/containers` lists containers with fill level and clock state; `/containers/[id]` shows contents and generates the label.
- **FR-7.2** Placing a battery into a container is a `storage_event`. Every movement in, out or between containers is a `storage_event` — the movement history is the evidence, not a derived field.
- **FR-7.3** A `storage_clock` starts automatically per Rule 4.1. A handler never starts a clock manually and cannot forget to.
- **FR-7.4** Clock behaviour when a battery moves between containers is Rule 4.2. The clock follows the battery, not the drum, unless the rule says otherwise.
- **FR-7.5** The system raises warnings ahead of expiry at the intervals set in Rule 4.3, surfaced on `/` and to P2. A clock that expires without a warning having fired is a defect, not a missed target (`VISION.md` §4.2).
- **FR-7.6** Container fill and capacity are tracked per Rule 4.4 so that P2 can answer a fire marshal without opening a drum.
- **FR-7.7** Handler size classification against the on-site quantity threshold behaves per Rule 4.5 — including the calendar-latch behaviour, which is a rule and lives there, not here.
- **FR-7.8** Activities a handler is prohibited from performing are unreachable in the workflow, per Rule 4.6. The requirement is that the product makes those states impossible to enter, not that it warns about them.

**Cites:** Rules 4.1–4.6 · `TAXONOMY.md` (container and clock statuses) · Entities: `container`, `lot`, `storage_clock`, `storage_event`

---

### 6.8 FR-8 — Waste classification decision engine

*The highest-value logic asset in the product. The reasoning trail is what survives an audit.*

- **FR-8.1** Every battery record receives a `classification_decision` routing it to the light waste category or to full hazardous handling, per **Rule 3.2**.
- **FR-8.2** The decision records, permanently: its inputs, its outcome, the `jurisdiction` it was made under, the `jurisdiction_rule` applied, and the `rule_version` in force at the time. A decision that cannot be re-explained years later has failed its purpose.
- **FR-8.3** Reasoning is recorded in a form a person can read — an auditor is the intended reader, not a developer. Rule 3.3 governs what must appear in it.
- **FR-8.4** Jurisdiction-specific handling, including the state that treats these batteries as fully regulated rather than as light-category, is Rule 3.4 and is expressed entirely as `jurisdiction_rule` data. No jurisdiction is named in code.
- **FR-8.5** When an input changes — condition, chemistry confirmation, jurisdiction profile — the record is re-evaluated per Rule 3.5. Re-evaluation creates a **new** `classification_decision`; it never edits the previous one.
- **FR-8.6** The decision is visible on `/batteries/[id]` and carried into the documents generated from that record.

**Cites:** Rules 3.1–3.5 · `TAXONOMY.md` (classification categories) · Entities: `classification_decision`, `jurisdiction`, `jurisdiction_rule`, `rule_version`

---

### 6.9 FR-9 — Damage, defect and the air-transport prohibition

- **FR-9.1** A `damage_assessment` is captured against a battery record. What constitutes damage or defect, and what each finding triggers, is Rule 6.1 and Rule 6.2. Damage types are `TAXONOMY.md`.
- **FR-9.2** Assessment at B1a depth is **recorded by a person**, from what they can see, with photographs attached. Automated visual damage triage is B2 (§6.17). B1a builds the labeled damage set that B2 consumes, as a byproduct.
- **FR-9.3** **A battery determined damaged or defective cannot be routed to air transport.** The option is blocked outright and the block states its reason, per Rule 6.3. This is a hard block, not a warning, not an override-with-confirmation.
- **FR-9.4** The packaging, marking and documentation consequences of a damaged or defective determination follow Rule 6.4 and are reflected in the documents generated.
- **FR-9.5** Quarantine handling for damaged units is Rule 6.5.
- **FR-9.6** Nothing in this feature area outputs a probability, percentage or likelihood of ignition, in the UI, an API response, an export or a PDF (`_ANCHORS.md` §7 rule 1).

**Cites:** Rules 6.1–6.5 · `TAXONOMY.md` (damage types) · Entities: `damage_assessment`, `battery_record`

---

### 6.10 FR-10 — Shipments and the document engine

- **FR-10.1** A `shipment` is built from containers or lots at `/shipments/new`, listed at `/shipments`, and shown with its documents at `/shipments/[id]`.
- **FR-10.2** Generating a shipment produces a `shipping_paper`. Its composition — including emergency response information and a 24-hour emergency contact — is Rule 5.1 and Rule 5.2, driven by the `jurisdiction_rule` set in force. **No content element of a shipping paper is written as a literal in code.**
- **FR-10.3** A `container_label` is generated for a container at `/containers/[id]`, carrying the storage start date, per Rule 5.3.
- **FR-10.4** Transport mode eligibility for a shipment is evaluated per Rule 5.6, which is where the air-transport block in FR-9.3 is enforced at the shipment level as well as the record level.
- **FR-10.5** The shipment ledger records every shipment with the retention behaviour in Rule 12.3.
- **FR-10.6** A shipment cannot be finalised while any battery in it is missing a required element. What is required is Rule 5.1; the requirement here is that the product refuses rather than generates an incomplete document.

**Cites:** Rules 5.1–5.6, Rule 12.3 · `TAXONOMY.md` (shipment statuses, document types) · Entities: `shipment`, `shipping_paper`, `container_label`, `document_render`

---

### 6.11 FR-11 — Document rendering, viewing and retention

- **FR-11.1** Every generated PDF is a `document_render` recording what was generated, from which record, by whom, when, and **against which `rule_version`**.
- **FR-11.2** A `document_render` is immutable. Regeneration creates a new render; it never mutates an existing one. The old render remains retrievable.
- **FR-11.3** `/documents/[id]` views, prints and downloads any generated document, for any member.
- **FR-11.4** The same inputs at the same `rule_version` produce the same document content. A document whose content changes because a rule changed later is a defect — that is the entire point of versioning the rule.
- **FR-11.5** Documents remain retrievable for the retention period in Rule 12.3, independent of the state of the surrounding records.

**Cites:** Rule 5.4, Rule 12.3 · Entities: `document_render`, `shipping_paper`, `container_label`

---

### 6.12 FR-12 — Jurisdiction rules as data

*The second of the two forward-specified items. See §6.19.*

- **FR-12.1** `jurisdiction`, `jurisdiction_rule` and `rule_version` hold every regulatory threshold, deadline, citation and condition the product applies. **None of these appears as a literal in TypeScript. A hard-coded jurisdiction value is a code-review rejection** (`PROJECT_SETUP_BMMP.md` §8.1, Roadmap Principle 5).
- **FR-12.2** Every rule is versioned with an effective date range, so a decision made in 2026 can still be explained by the rule that was in force in 2026 after that rule has changed twice.
- **FR-12.3** Rules are authored and edited by P6 as data. A statutory change is a data edit, not a deployment.
- **FR-12.4** A rule must be expressible against whichever measure a jurisdiction uses — mass, energy, volume or count — because jurisdictions genuinely differ on this and adoption lags by 12–24 months. This is why FR-3.3 requires the battery record to carry all of them.
- **FR-12.5** **The rules model carries the medium-format category that covers scooter and mobility packs from the first migration.** The producer-obligation engine that consumes it is B1b and its activation for mobility packs is B3 — but the dimension exists in the model now. See §6.19.
- **FR-12.6** An organisation's jurisdiction profile is set at `/settings/organization` and determines which rules apply to its sites.
- **FR-12.7** Where no rule exists for a jurisdiction, the product says so and blocks the dependent action. It never guesses and never falls back to a default jurisdiction.

**Cites:** Rules 3.4, 4.x, 5.x · `TAXONOMY.md` (jurisdiction rule types, format categories) · Entities: `jurisdiction`, `jurisdiction_rule`, `rule_version` · `PROJECT_SETUP_BMMP.md` §8.1

---

### 6.13 FR-13 — Dashboard and alerts

- **FR-13.1** `/` shows the working state of the organisation: open storage clocks, the review queue count, and active alerts. Composition and priority are `UX_SPEC.md`.
- **FR-13.2** Alerts are generated from rules, not from hard-coded intervals — storage clock warnings per Rule 4.3, classification re-evaluation per Rule 3.5, blocked actions per Rule 6.3.
- **FR-13.3** An alert names the record it concerns and links to it. An alert that cannot be acted on from where it appears is not finished.

**Cites:** Rules 3.5, 4.3, 6.3 · `UX_SPEC.md` · `SITE_ARCHITECTURE.md`

---

### 6.14 FR-14 — Audit log and export

- **FR-14.1** Every state change anywhere in the product writes an `audit_event` recording the actor, the organisation, the entity, what changed, when, and whether the actor was a person or a pipeline step.
- **FR-14.2** `audit_event` is append-only. Nothing in the product edits or deletes one, per Rule 12.2.
- **FR-14.3** `/audit` is filterable and exportable, for P2, P5 and P6.
- **FR-14.4** Export produces a file an external reader can use without access to the product, per Rule 12.4.
- **FR-14.5** Audit coverage is verified, not assumed: the test suite proves that each state-changing operation produces an event.

**Cites:** Rules 12.1–12.4 · Entities: `audit_event`

---

### 6.15 FR-15 — Platform administration

- **FR-15.1** P6 creates and configures tenant organisations, and confirms FR-2.1 is satisfied before an organisation's first battery is logged.
- **FR-15.2** P6 manages the shared catalog at `/settings/catalog`, including reviewing proposals from FR-4.3.
- **FR-15.3** P6 manages jurisdiction rules data per FR-12.3.
- **FR-15.4** Every administrative action is an `audit_event` like any other. Admin is not exempt from the audit trail.

**Cites:** Rules 1.2, 2.5, 12.1 · Entities: `organization`, `catalog_entry`, `jurisdiction_rule`, `audit_event`

---

### 6.16 Later phase — B1b: Producer Obligations and Insurance Evidence

**Phase:** 19 Oct – 11 Dec 2026, 8 weeks. **Specified at Gate 1 (16 Oct 2026).**

**Scope, stated so nothing is designed away in B1a:** a multi-state producer obligation engine with a format classifier applying each state's distinct thresholds; statute mapping across roughly fourteen states plus DC with a dated deadline calendar carrying legal citations; producer registration filing packets per state agency; annual sales reporting mapping one canonical dataset into each state's format; a label and marking compliance planner; a one-click **insurance evidence pack** for an underwriter at renewal; a storage quantity monitor tracking live volume against fire-code thresholds and clearance rules; and the first version of the jurisdiction profile engine.

**Entities reserved now, specified at Gate 1:** `producer_obligation`, `obligation_deadline`, `evidence_pack`. **Rule sections reserved now, stubbed:** `BUSINESS_RULES.md` §8 (producer obligations and state registration) and §9 (insurance evidence and fire-code volume). **Personas activated:** P3, P5.

**What B1a must not do to this phase:** every obligation, threshold, deadline and citation is `jurisdiction_rule` data (FR-12). The format classification dimension including the medium-format category exists from the first migration (FR-12.5). Nothing in B1a may hard-code a jurisdiction and force B1b to unpick it.

---

### 6.17 Later phase — B2: Intelligence

**Phase:** 28 Dec 2026 – 12 Mar 2027, 11 weeks. **Specified at Gate 2 (11 Dec 2026).**

**Scope, stated so nothing is designed away earlier:** label-image corpus maturation, so identification works on scuffed, faded and partly obscured labels where a general model fails; visual damage triage; a reuse-versus-recycle engine implementing the published decision rule; a **published transparent grading scheme** into a market with no grading standard and therefore no incumbent to displace; a **paperwork-only hazard ranking** presented as a relative ranking with a stated basis per factor and **never as a probability of ignition**; automated recall matching on every intake record; and a provenance record binding a battery's serial to the device or vehicle it came from.

**Orchestration pattern, fixed now** (`_ANCHORS.md` §6): concurrent fan-out / fan-in over one record, then a sequential grading step, human gate at the end. Damage triage, recall match and hazard ranking run independently on the same record and are reassembled; grading consumes all three. They are independent because none reads another's output.

**Entities reserved now, specified at Gate 2:** `grade`, `hazard_ranking`, `recall_match`. **Rule section reserved now, stubbed:** §10 (grading, damage triage and hazard ranking).

**What earlier phases must not do to this phase:** B1a's intake photos, label crops and human-confirmed answers are the corpus B2 consumes (FR-2.4); B1a's recorded damage assessments are the labeled damage set (FR-9.2). If either is stored unlinked, B2 starts from zero.

---

### 6.18 Later phase — B3: Mobility and Small Battery Coverage

**Phase:** 15 Mar – 9 Apr 2027, 4 weeks. **Specified at Gate 2 (11 Dec 2026).** This is where MIP's purpose lands (D-11).

**Scope, stated so nothing is designed away earlier:** a small mobility battery catalog covering power wheelchair and scooter packs in both the older sealed lead-acid type and the newer lithium type; mobility supplier and repair-company onboarding for a business that swaps batteries constantly and must dispose of the old ones; **activation** of the medium-format producer rules built in B1b; air travel documentation including the information set, the energy calculation against the carry-on limit, the transport certification check and the correct labels; and a **third-party health-tester integration hook** — the socket is built, the tester is chosen later (Roadmap Principle 7, and an open question in §9).

**Rule section reserved now, stubbed:** §11 (mobility and small-battery coverage). **Persona activated:** P4.

**Why this is four weeks and not a second product:** almost everything it needs is built already. The battery record was sized wide in B1a. The rules engine already carries the medium-format category from B1b. The intake pipeline, document engine, grading scheme and evidence exports are chemistry-agnostic by design. **This phase points existing machinery at another battery size.** That is only true if §6.19 holds.

---

### 6.19 The two exceptions — specified now, and why

`_ANCHORS.md` §0 names two places where building to B1a-only depth would make a later phase a rebuild. Both are requirements of the **first migration**, not of a later one.

**Exception 1 — the battery record holds small mobility-device packs from day one (FR-3.3).**
The record must represent a power wheelchair pack and an EV traction pack equally well from the first schema migration: same intake, same documents, same rules path. It carries mass, energy, capacity, voltage, cell count, form factor and size class, and its chemistry dimension includes the sealed lead-acid family, because these devices are mid-switch from lead-acid to lithium and lithium is the type carrying the fire, storage and shipping rules.

**Exception 2 — the jurisdiction rules model carries the medium-format category from day one (FR-12.5).**
State statutes explicitly name the medium-format category that covers scooter and mobility packs. The producer-obligation engine that consumes that category is built in B1b and switched on for mobility packs in B3 — but the *dimension* must exist in the rules model from the first migration, and rules must be expressible against whichever measure a jurisdiction uses.

**Why both are specified now.** **Phase B3 is four weeks only because of this.** If the battery record is built narrow — vehicle and industrial only — then B3 is a schema migration, a data backfill, a re-test of every document path and a re-test of every rule path, inside a four-week window with zero float in a 32-week plan. If the rules model has no medium-format dimension, B3 builds new machinery instead of activating existing machinery. Either one turns an activation into a rebuild, and there is no room in the calendar for a rebuild.

This is verified, not assumed: **at Gate 1** for the battery record and **at Gate 2** for the rules model (see AC-13 and AC-14, and the roadmap's risk register). The mock data set must include a small mobility-scooter pack sitting next to a vehicle pack from the first commit (`PROJECT_SETUP_BMMP.md` §3.2), so the wide record is exercised by every screen on day one rather than being a column nobody fills.

---

## 7. Non-Functional Requirements

### NFR-1 — Multi-tenant isolation

- **NFR-1.1** Every row of tenant data is scoped to exactly one `organization`, and isolation is enforced in the data layer — not in the UI, not in a route handler, not by a convention.
- **NFR-1.2** A request authenticated for organisation A must never be able to read, list, count, search, export or infer the existence of a record belonging to organisation B, through any surface including error messages, identifier probing and document URLs.
- **NFR-1.3** Isolation is proven by test, not asserted: the suite includes a cross-tenant access attempt against every read path and every write path, and it must fail closed.
- **NFR-1.4** P5's external read-only access is scoped to a single organisation and carries no write capability anywhere.
- **NFR-1.5** The shared battery catalog is the one deliberate cross-tenant surface. Everything else is tenant-scoped by default.

### NFR-2 — Audit logging on every state change

- **NFR-2.1** Every operation that changes state writes an `audit_event`. There is no code path that changes state without one — including administrative actions, pipeline steps and background jobs.
- **NFR-2.2** An event records the actor, the organisation, the entity and identifier, the change, the timestamp, and whether the actor was a person or a pipeline step.
- **NFR-2.3** Events are append-only. No product code updates or deletes an event.
- **NFR-2.4** Audit writes participate in the same transaction as the change they describe. A change that commits without its event is a defect.
- **NFR-2.5** Coverage is verified in CI, not by inspection.

### NFR-3 — Retention

- **NFR-3.1** Shipment records are retained and retrievable for **three years** from the shipment date, per Rule 12.3.
- **NFR-3.2** Retention survives deletion or archival of surrounding records. A retained shipment record must still render its documents and its classification reasoning after three years.
- **NFR-3.3** Retained records are exportable in a form readable without access to the product (FR-14.4).
- **NFR-3.4** `audit_event` retention is not shorter than shipment record retention.

### NFR-4 — Document generation performance

*Targets are provisional — see RN-2.*

- **NFR-4.1** A single shipping paper or container label renders from request to available PDF in **under 5 seconds at p95 and under 10 seconds at p99**, measured server-side.
- **NFR-4.2** A batch of container labels for one container renders in **under 10 seconds at p95**.
- **NFR-4.3** Generation is synchronous from the user's point of view up to the p99 target; beyond it, the user gets a queued state and a notification rather than a spinner that never resolves.
- **NFR-4.4** A generation failure never leaves a partially written `document_render`, and never leaves a shipment in a state where it looks finalised but has no document.
- **NFR-4.5** These targets are measured during the 72-hour soak at Gate 1 on live data and re-baselined in v1.1.

### NFR-5 — The mock-to-real data seam holds

- **NFR-5.1** **The same Playwright suite passes on `DATA_ADAPTER=mock` and on `DATA_ADAPTER=supabase`.** That is the proof the seam held, and it is a required status check, not an aspiration.
- **NFR-5.2** No screen, page, component, hook or route handler talks to the database directly. Everything goes through `src/data`.
- **NFR-5.3** The CI data-seam check fails the build if any file outside `src/data/supabase/` or `src/lib/` imports the database client, and it is proven to fail on a deliberate bad import.
- **NFR-5.4** Migrating an entity to the real backend means writing an adapter against the existing contract. **If a screen has to change, the seam leaked — fix the seam, not the screen.**
- **NFR-5.5** The mock data set includes deliberately awkward cases from the first commit: a scuffed label, a swollen pack, and a small mobility-scooter pack sitting next to a vehicle pack.

### NFR-6 — Regulatory data integrity

- **NFR-6.1** Zero jurisdiction thresholds, deadlines or citations appear as literals in code. Verified at code review; a hard-coded value is a rejection.
- **NFR-6.2** Every `jurisdiction_rule` is versioned with an effective date range, and every decision that consumed one records which version it consumed.
- **NFR-6.3** A rules-data change is deployable without a code deployment.

### NFR-7 — Language and output constraints

- **NFR-7.1** No surface of the product — UI copy, API response, export or PDF — ever outputs a probability, percentage or likelihood of ignition, or any prediction of thermal runaway. Verified by a sweep every sprint.
- **NFR-7.2** No surface states or implies that chemistry was determined from a photograph.
- **NFR-7.3** Condition is described as **assessed**, never as measured, anywhere BMMP is not reading a third-party health tester.
- **NFR-7.4** These are `_ANCHORS.md` §7 and they bind generated content as much as hand-written content.

### NFR-8 — Security and data handling

- **NFR-8.1** All secrets live in environment configuration; nothing sensitive sits behind a browser-visible prefix; the service-role key is server-side only.
- **NFR-8.2** Battery photographs may contain customer serial numbers. They are never committed to version control, never included in a public artifact, and handled per Rule 7.4.
- **NFR-8.3** Label crops leaving the product boundary for vision extraction do so only with the training-rights grant in force (FR-2.1), and the destination is recorded in the technical spec, not chosen by a builder.
- **NFR-8.4** Session, invitation and password handling follow the platform auth provider's defaults; nothing is hand-rolled.

### NFR-9 — Availability, reliability and recovery

- **NFR-9.1** Each live phase is demonstrably stable across a **72-hour pre-launch soak** with no unhandled error (SOW §11).
- **NFR-9.2** An intake session survives a dropped connection without losing captured photos (FR-5.1).
- **NFR-9.3** A vision-model failure or timeout degrades to manual entry (FR-5.11) rather than blocking intake.
- **NFR-9.4** Backup and restore procedures are exercised, not just configured. `RUNBOOK.md` owns the procedure.

### NFR-10 — Usability, accessibility and reach

- **NFR-10.1** Intake works on a mobile browser held in one hand in a warehouse, with gloves a realistic constraint on target size. `UX_SPEC.md` owns the specifics.
- **NFR-10.2** All B1a screens meet WCAG 2.2 AA.
- **NFR-10.3** Supported browsers: current and previous major versions of Chrome, Safari, Edge and Firefox, plus iOS Safari and Android Chrome.
- **NFR-10.4** English only in B1a. No localisation work, and no design decision that makes localisation impossible later.

### NFR-11 — Code quality gates

- **NFR-11.1** CI runs lint, typecheck, unit and integration tests, build, end-to-end tests on mock, and the data-seam check on every push. Code reaches staging or production only through a passing CI run.
- **NFR-11.2** `tsc --noEmit` passes with `strict: true`; `any` is not permitted in committed code.
- **NFR-11.3** Everything in `src/domain/` has unit tests. It is pure functions with no dependencies, which makes it the cheapest and highest-value place to test.
- **NFR-11.4** No agent merges its own work. Every unit ends in a PR whose diff Nate reads and merges by hand.

---

## 8. Acceptance Criteria

**The bar is Gate 1, 16 October 2026:** *a real business logs a battery, receives a correct shipping paper and container label, and has a storage clock running — end to end, on live data. Captured records verified labeled, linked and training-ready.*

AC-1 is that sentence, decomposed. AC-2 through AC-14 are the criteria that must also hold for AC-1 to mean anything.

### AC-1 — The Gate 1 scenario, end to end on live data

**Given** a real customer organisation with the training-rights terms accepted (AC-10), at least one member with the Compliance Handler role, and a jurisdiction profile set,
**When** that handler photographs a real battery at `/batteries/new`, reviews the extracted fields with their per-field confidence, confirms chemistry, model and condition, places the battery into a container, and builds a shipment from that container,
**Then** all of the following are true:

| # | Must be true |
|---|---|
| 1.1 | A `battery_record` exists, attributed to that organisation, with the confirmed values and a link to the `catalog_entry` it resolved to. |
| 1.2 | A `classification_decision` exists with its inputs, its outcome, the `jurisdiction_rule` applied and the `rule_version` in force, in reasoning a person can read. |
| 1.3 | A `storage_clock` is running against that battery, started automatically, visible to the Facility Manager on `/` and `/containers`. |
| 1.4 | A `container_label` has been generated carrying the storage start date, and printed. |
| 1.5 | A `shipping_paper` has been generated for the shipment, carrying emergency response information and a 24-hour emergency contact, composed from rules data. |
| 1.6 | Both documents are correct — reviewed against the requirement by the customer, and used as issued without manual correction. |
| 1.7 | Both documents are retrievable at `/documents/[id]` and each has a `document_render` recording its `rule_version`. |
| 1.8 | Every step above produced an `audit_event`. |
| 1.9 | It ran on live data, on the real backend, with a real customer — not a demo tenant and not the mock adapter. |

### AC-2 — Captured records are labeled, linked and training-ready

**Given** a committed battery record, **when** the captured set is inspected, **then** the `intake_photo`, the label crop and the human-confirmed answer are stored as one linked set, attributable to an organisation whose `tos_acceptance` predates the capture. A record whose photo and confirmed answer cannot be traced to each other is not training-ready and does not count toward the gate.

### AC-3 — Nothing commits without human confirmation

**Given** a label read where any field falls below the confidence threshold, **when** the pipeline reaches the gate, **then** the whole record routes to `/review` and no document can be generated from it. **And** there exists no path in the product — API, admin action, batch import or background job — that commits a chemistry, model or condition value without a person confirming it.

### AC-4 — The storage clock warns before it expires

**Given** a battery in a container with a running clock approaching the first warning interval in Rule 4.3, **when** the interval is reached, **then** the warning appears on `/` and to the Facility Manager. **And** across the soak period, the count of clocks that expired without a warning having fired is zero.

### AC-5 — A damaged battery cannot go by air

**Given** a battery with a damaged or defective determination, **when** air transport is selected on a shipment containing it, **then** the request is blocked, the block states its reason, and there is no override control. **And** the block is enforced server-side, so it holds against a direct API call.

### AC-6 — Reasoning survives

**Given** a classification decision made under rule version *n*, **when** that rule is later superseded by version *n+1*, **then** the original decision still renders its original reasoning and still names version *n*; and the document generated from it still renders its original content.

### AC-7 — The audit trail is complete

**Given** any state-changing operation in the product, **when** the audit log is queried, **then** an `audit_event` exists for it with actor, organisation, entity, change and timestamp. **And** no code path exists that changes state without one — proven by test, not by inspection.

### AC-8 — Tenants are isolated

**Given** a user authenticated for organisation A, **when** they attempt to read, list, search, export or address by identifier any record belonging to organisation B, through any route or API surface, **then** the attempt fails closed and reveals nothing about the record's existence.

### AC-9 — The seam held

**Given** the full end-to-end suite, **when** it is run with `DATA_ADAPTER=mock` and again with `DATA_ADAPTER=supabase`, **then** it passes both ways with no change to any screen. **And** the data-seam check is wired as a required status check and has been proven to fail on a deliberate bad import.

### AC-10 — Training rights are in force before the first battery

**Given** a newly created organisation with no `tos_acceptance`, **when** any member attempts to create the first battery record, **then** the attempt is blocked until acceptance is recorded, with the accepting person, organisation, time and terms version stored.

### AC-11 — No probability of ignition anywhere

**Given** the shipped product, **when** UI copy, API responses, exported files and generated PDFs are swept, **then** no probability, percentage or likelihood of ignition, and no prediction of thermal runaway, appears anywhere. **And** no surface states or implies that chemistry was determined from a photograph. **And** condition is described as assessed, never measured.

### AC-12 — No regulatory literals in code

**Given** the codebase at Gate 1, **when** it is swept for jurisdiction thresholds, deadlines and citations, **then** none appears as a literal. Every one is `jurisdiction_rule` data, editable by P6 without a deployment.

### AC-13 — The battery record is wide *(verified at Gate 1 — roadmap risk register)*

**Given** the first schema migration, **when** a power wheelchair or mobility scooter pack and a vehicle traction pack are both logged, **then** both move through the same intake, the same classification path and the same document engine, and both produce correct documents — with no schema change, no conditional branch on device class in the record layer, and no field that only one of them can populate.

### AC-14 — The rules model carries the medium-format category *(verified at Gate 2)*

**Given** the jurisdiction rules model as migrated in B1a, **when** a medium-format rule is authored in B1b, **then** it is authored as data against an existing dimension, with no schema change and no migration.

### AC-15 — Stability

**Given** the product deployed for Gate 1, **when** it runs a **72-hour soak** under representative use, **then** it completes with no unhandled error, and the NFR-4 performance targets are measured against live data over that window (SOW §11).

---

## 9. Open Questions

Every one of these has an owner and a date. An open question with neither is a risk pretending to be a question.

### 9.1 Decisions due at Gate 0 — 14 August 2026

| # | Question | Why it matters | Owner |
|---|---|---|---|
| **OQ-1** | **Does BMMP take the European Battery Passport bet?** | The 18 Feb 2027 deadline is firm and the specification was still being updated in June 2026, with the access-rights implementing act not expected until Q4 2026. **If yes, it must start by October and it does not fit this plan.** If no, say so and stop tracking it. Adopting the Battery Pass data model in B1a (FR-3.2) keeps the option open cheaply either way. Listed as a Non-Goal in `VISION.md` §5 pending this decision. | **Jonathan** |
| **OQ-2** | **Confirm D-5 through D-11.** | D-5, D-6 and D-7 still read `Proposed — decision required by 2026-08-14`. **D-6 and D-7 are load-bearing for this entire PRD** — see RN-4. B1a build starts 17 Aug. | **Nate** |
| **OQ-3** | **Fill the SOW signatory blank — three places.** | SOW 1 is still an unsigned document. | **Jonathan** |
| **OQ-4** | **The `[[N]]` feedback window in SOW §10 is still a placeholder.** This plan operates on a **5-business-day** working assumption for phase-gate sign-off. That is an assumption, not a contractual term. Without it agreed in writing, a slow client review presents as builder slip. | Nine weeks to Gate 1 with zero float in a 32-week plan. | **Nate + Jonathan** |

### 9.2 Carried exposures — live now, resolved at a gate or not at all

| # | Question | Status | Owner |
|---|---|---|---|
| **OQ-5** | **SOW §11's M2 acceptance criterion** — *"a predictive failure warning reliably fires on a degrading battery under monitored fleet conditions."* It is **unsatisfiable**: the device control systems are closed, the category leader owns the connected install base, and there is no fleet. It is also **unbounded** — §12 runs the engagement "through completion of the phases in Section 4," so the clause has no expiry. **This is the largest single exposure in the engagement and it is being carried, not fixed** (D-10, amended by D-11). MIP's purpose — battery health for mobility devices — is delivered through BMMP's expanded coverage in B3; M2 as literally specified is not built. | Carried. Confirm direction in writing at Gate 0 and at every gate after, using the working-session mechanism SOW §5 and §6 already provide. | **Nate + Jonathan** |
| **OQ-6** | **SOW Phase B3 — marketplace and brokerage — is deferred**, and SOW §11's B3 criterion is therefore also unmet at delivery. | Carried alongside OQ-5. Same mechanism. | **Nate + Jonathan** |

### 9.3 Product decisions due at a later gate

| # | Question | Needed by | Owner |
|---|---|---|---|
| **OQ-7** | **Marketplace — build, partner, or skip.** A competitor already ships it with a major automaker as anchor customer; a second company tried the pure-marketplace model and pivoted to brokerage; and a growing share of volume is worth less than nothing, which a bidding marketplace mis-models. | **Gate 3** (12 Mar 2027) | Nate + Jonathan |
| **OQ-8** | **Which third-party battery-health tester gets integrated.** Principle 7 is integrate, don't invent: **the socket is built in B3, the tester is chosen separately.** The choice determines the integration contract and whether "assessed condition" ever becomes "measured condition" for a customer. | **Gate 3** — B3 starts 15 Mar 2027 | **Nate** |
| **OQ-9** | **Which recall data source B2 matches against.** The research names a free government product-recall API; `PROJECT_SETUP_BMMP.md`'s `.env.example` names a vehicle-recall base URL. These are different sources and vehicle packs and consumer products may need both. Nothing is wired in B1a either way. | **Gate 2** (11 Dec 2026), when B2 is specified | Nate |

### 9.4 Build questions that need an answer inside B1a

| # | Question | Needed by | Owner |
|---|---|---|---|
| **OQ-10** | **Who is the Gate 1 customer?** AC-1 requires a real business on live data by 16 Oct, and onboarding starts in the hardening week beginning 12 Oct. No customer is named. This is a schedule dependency on the client side, not on the build. | Named at **Gate 0**; onboarded by 12 Oct 2026 | **Jonathan** |
| **OQ-11** | **Does the Gate 1 customer operate in the jurisdiction that treats these batteries as fully regulated rather than light-category?** If so, that jurisdiction's rules must be authored as data before Gate 1 rather than after (FR-8.4). It changes what rules data must exist on day one, not what code exists. | With OQ-10 | Nate |
| **OQ-12** | **Where does the confidence gate threshold live, and who owns it?** The gate's existence is fixed; the value is not, and it is not a jurisdiction rule. See RN-3. | Week 3 of B1a, before the intake pipeline commits | Nate |
| **OQ-13** | **Which vision model reads the label, and does the label crop leave the tenant boundary to reach it?** NFR-8.3 requires the destination to be a recorded technical decision. It also interacts with FR-2.1: no crop leaves before the training-rights grant is in force. | Week 3 of B1a | Nate |
| **OQ-14** | **How long are `intake_photo` originals retained, as distinct from label crops?** Retention of the training-linked set is not the same question as retention of full-resolution photographs that may carry customer serial numbers (NFR-8.2, Rule 7.4). | Before the first migration | Nate |

---

## Appendix A — Rule citation map

The rule *sections* are fixed by `_ANCHORS.md` §4. The sub-numbers below are assigned by this PRD and are what `BUSINESS_RULES.md` must adopt. See RN-1.

| Rule | Subject | Cited by |
|---|---|---|
| 1.1 | Tenant scoping of every record | FR-1.1, NFR-1 |
| 1.2 | Role capabilities | FR-1.2, FR-15 |
| 1.3 | External read-only access | FR-1.7, NFR-1.4 |
| 1.4 | Invitation, acceptance, expiry, revocation | FR-1.3 |
| 2.1 | What an intake requires before it can be saved, including an unreadable label | FR-5.11 |
| 2.2 | Label reading produces per-field values and per-field confidence | FR-5.4 |
| 2.3 | The confidence gate, queue ordering and escalation | FR-5.9, FR-6 |
| 2.4 | Human confirmation of chemistry, model and condition | FR-5.10, FR-6.4 |
| 2.5 | Catalog match, no-match, multiple-match, and catalog proposals | FR-4.3, FR-5.6 |
| 2.6 | Date-code decode and undecodable codes | FR-5.7 |
| 2.7 | Form factor | FR-5.8 |
| 2.8 | State of charge at intake | FR-5.12 |
| 3.1 | Classification inputs | FR-8.1 |
| **3.2** | **Light waste category vs full hazardous routing** | FR-8.1 |
| 3.3 | What the recorded reasoning must contain | FR-8.3 |
| 3.4 | Jurisdiction-specific handling and the fully regulated exception | FR-8.4, FR-12 |
| 3.5 | Re-evaluation on input change | FR-8.5, FR-13.2 |
| 4.1 | Storage clock start | FR-7.3 |
| 4.2 | Clock behaviour on movement between containers | FR-7.4 |
| 4.3 | Warning intervals ahead of expiry | FR-7.5, FR-13.2, AC-4 |
| 4.4 | Container capacity and fill | FR-7.6 |
| 4.5 | Handler size classification and the calendar latch | FR-7.7 |
| 4.6 | Prohibited handler activities | FR-7.8 |
| 5.1 | Shipping paper composition and completeness | FR-10.2, FR-10.6 |
| 5.2 | Emergency response information and 24-hour contact | FR-10.2 |
| 5.3 | Container label composition and storage start date | FR-10.3 |
| 5.4 | Document immutability and regeneration | FR-11.2 |
| 5.5 | Shipment ledger content | FR-10.5 |
| 5.6 | Transport mode eligibility | FR-10.4 |
| 6.1 | Damage assessment capture | FR-9.1 |
| 6.2 | Damaged / defective determination | FR-9.1 |
| 6.3 | The air-transport prohibition | FR-9.3, FR-13.2, AC-5 |
| 6.4 | Packaging, marking and documentation consequences | FR-9.4 |
| 6.5 | Quarantine | FR-9.5 |
| 7.1 | Terms acceptance and re-acceptance | FR-2.1, FR-2.3 |
| 7.2 | What the training-linked set contains | FR-2.4 |
| 7.3 | Withdrawal and revocation | FR-2.3 |
| 7.4 | Customer identifiers and serial numbers in photographs | FR-2.5, NFR-8.2, OQ-14 |
| 8.x | Producer obligations and state registration | §6.16 — stub, B1b |
| 9.x | Insurance evidence and fire-code volume | §6.16 — stub, B1b |
| 10.x | Grading, damage triage and hazard ranking | §6.17 — stub, B2 |
| 11.x | Mobility and small-battery coverage | §6.18 — stub, B3 |
| 12.1 | Every state change writes an audit event | FR-14.1, NFR-2 |
| 12.2 | Audit events are append-only | FR-14.2, NFR-2.3 |
| 12.3 | Three-year shipment record retention | FR-10.5, FR-11.5, NFR-3 |
| 12.4 | Export | FR-14.4, NFR-3.3 |

---

*Next Sketch LLC · Confidential · August 2026*
