# Taxonomy — BMMP
**Version:** 1.2 · **Date:** 2026-08-11 · **Owner:** Nathan Ivy / Next Sketch LLC
**Answers:** How is everything in this product classified?
**Reads from:** `_ANCHORS.md` · `PRD.md` · `BUSINESS_RULES.md` · `PROJECT_SETUP_BMMP.md`  ·  **Feeds:** `TECHNICAL_SPEC.md` · `ERD.md` · `UX_SPEC.md` · `SITE_ARCHITECTURE.md` · every builder brief

> ## REVIEW NOTES
> None open. All review notes for this document were answered on 2026-08-19 — see `Decision Log.md` **D-20** for the full disposition, and D-21 through D-26 for the calls that carry their own rationale. Content below is unchanged.

---

## Changelog

**v1.2 · 2026-08-11 — status reconciliation with `BUSINESS_RULES.md` v1.1**

- **RN-9 resolved.** Every status system now states the same value set as `BUSINESS_RULES.md` § Status Definitions, which carries the stored value alongside each state so the two documents diff mechanically. **T-24 gains `overdue`** — the hard state Rules 4.15–4.17 depend on, and the most consequential omission in v1.1. **T-28 gains `ready` and `exception`** (Rule 5.3; EC-47). **T-08 gains `failed`** (EC-14). **T-22 gains `classified` and `reclassifying`** (Rules 3.3, 3.15). **T-26 renames `expired` to `overdue`** so that one condition is not called three different things across `container.status`, `storage_clock.status` and `storage_clock.alert_band`; `stopped` is unchanged. **T-39 is unchanged** — `BUSINESS_RULES.md` adopted its four-value set and wrote **Rule 5.28** to govern `draft`.
- **Three missing systems added: T-45 `classification_decision.status`, T-46 `damage_assessment.status`, T-47 `tos_acceptance.status`.** All three had `status` columns in `ERD.md` with no taxonomy citation. T-47 is written so that no status on it can be read as clawing back training eligibility, which Rule 7.6 fixes at capture and Rule 7.18 confirms is not retroactive.
- **RN-10 resolved, in opposite directions.** (a) T-14's `manual_override` is now authorised and constrained by new **Rules 3.26, 3.27 and 3.28** — P6 only, stated reason, written as a superseding decision, separately listable in the audit export, and an override toward less regulation must record the rule gap that forced it. (b) T-36's P6-only restriction was **relaxed, not ratified**: new **Rule 6.23** lets P1, P2 or P6 record a recall association, because the handler is who receives the notice and the effect is safety-increasing; **Rule 6.24** holds removal to Rule 6.11's discipline so clearing a recall flag cannot become a route around the air prohibition.
- **RN-8 resolved, both parts.** (a) The column stays `container.container_type`; `BUSINESS_RULES.md` states in Rule 4.28 that its term "segregation class" denotes the same thing. Four downstream documents keep building against the existing name. (b) **OQ-9 accepted.** T-23 is now the six-value cross of classification outcome × condition state, so a quarantine container can no longer mix a light-category and a fully-regulated record.
- **No `T-` ID moved and no shipped stored value was renamed except T-26's `expired` → `overdue`**, which is recorded in §6 as a retirement plus an addition per §4.4 rule 10.

**v1.1 · 2026-08-11 — citation reconciliation against `BUSINESS_RULES.md` v1.0**

- **RN-1 resolved.** All 111 section-level `BR §n` citations replaced with specific rule numbers. This document now cites **174 distinct rules, 42 edge cases and 4 open questions across 269 citation mentions**; every number has been verified to exist in `BUSINESS_RULES.md`. Two citations remain deliberately non-numbered because the thing they cite is not a numbered rule: T-07's catalog-edit restriction and part of T-38's document-generator split, both stated in `BUSINESS_RULES.md` § Roles and Permissions. They are labelled as such in place.
- **RN-7 resolved.** `format_classification` and `alert` were accepted into `_ANCHORS.md` §3 at the exact names used here, and `ERD.md` carries both.
- **T-29 / T-30 rewritten to satisfy Rule 6.4.** The cosmetic versus damaged-or-defective split is now two-valued and mechanical. `dent` and `connector_damage` moved into the damaged-or-defective set; `corrosion` reclassified as cosmetic; `surface_marking` added so a scuff has a home. The former three-way "Assessed" middle band is gone — it was the builder judgment Rule 6.4 exists to prevent.
- **T-29 / T-30 terminality corrected.** Both previously declared damage findings and DDR flags terminal, which **contradicted Rule 6.11**. Rule 6.11 governs: a superseding human assessment with a stated reason and a supporting photograph is the one clearing path, both assessments stay permanently visible (Rule 6.12), and it is not P6-only.
- **T-43 gained `denial.recorded`**, required by Rule 12.6, which mandates audit events for denied actions and had no value to write.
- **T-28's discrepancy note corrected.** It previously told builders not to invent a `rejected` value; `BUSINESS_RULES.md` in fact defines an `Exception` shipment status and EC-47. Now points at both, and at RN-9.
- **RN-8, RN-9 and RN-10 opened.** Segregation-class naming plus OQ-9; status-set divergence plus three missing status systems; two taxonomy assertions with no governing rule. All three are flagged rather than actioned — each touches shipped systems or another author's document.

---

## 1. Overview

This document is the single source of truth for **every classification system in BMMP** — every category, status, label, type, tag, code and controlled vocabulary. Each one is defined here exactly once.

BMMP follows a battery through the end of its life: identify it → assess its condition → grade it → route it → dispose of it or resell it. Almost every step in that sequence is a classification act, and almost every legally required document the product prints is a rendering of one or more of these classifications. Getting a value wrong is not a cosmetic defect — it is a wrong shipping paper, a wrong container label, or a storage clock that never fires.

**Why this document exists:** without it, build agents invent taxonomy. They pick their own labels, their own casing, their own value strings — differently every time, and differently from each other. Every query, filter, export, PDF template and test fixture then silently disagrees. This document removes the judgment call.

### 1.1 How to use this document

- **Never invent a value.** If a value you need is not here, it does not exist yet. Stop and raise it — additions go through P6 and get appended to the relevant system, not improvised in a branch.
- **Never invent a mapping.** §5 (Label-to-Database Mapping) is binding. A display label is never derived from a stored value at runtime by string manipulation, and a stored value is never derived from a label.
- **Never rename a stored value.** Renaming is a deprecation plus an addition, logged in §6. See §5.4.
- Each system carries a stable ID (`T-01` … `T-61`). Cite systems by ID. **IDs never move and are never reused.**

### 1.2 What is taxonomy and what is data — the load-bearing distinction

> **The value set is taxonomy. The logic that assigns a value, and every number inside that logic, is data.**

BMMP operates across roughly fourteen states plus DC, each with different weight and energy thresholds, fire codes adopted twelve to twenty-four months apart by jurisdiction, and a pending federal rule that could restructure classification entirely. Per `PROJECT_SETUP_BMMP.md` §8.1 and Roadmap Principle 5, **a hard-coded jurisdiction threshold is a review rejection.**

So this document enumerates *that a battery can be classified as* `medium_format`. It does **not** state what weight or watt-hour figure puts it there — that lives in `jurisdiction_rule`, versioned by `rule_version`, maintained as data by P6.

The systems below are **jurisdiction-varying**: their value set is fixed here, their assignment is not.

| System | Fixed here | Held as data in |
|---|---|---|
| T-06 Size / format category | the three format values | threshold sets per jurisdiction — `jurisdiction_rule` |
| T-13 Waste classification | the two outcomes plus pending | which stream a chemistry falls into per jurisdiction — `jurisdiction_rule` |
| T-14 Waste classification basis code | the basis vocabulary | which bases are available and which dominate — `jurisdiction_rule` |
| T-15 Handler size class | the two classes | the mass threshold and the latch behaviour — `jurisdiction_rule` |
| T-16 Handler activity type | the activity vocabulary | which activities are permitted vs prohibited — `jurisdiction_rule` |
| T-17 UN transport identifier | the five lithium identifiers shipped at B1a | assignment logic and all non-lithium identifiers — `jurisdiction_rule` |
| T-19 Packing group | the four group values | which conditions force which group — `jurisdiction_rule` |
| T-20 Packaging exception | the exception vocabulary | eligibility for each exception — `jurisdiction_rule` |
| T-21 State-of-charge band | the three bands | the storage charge limit — `jurisdiction_rule` |
| T-24 / T-26 Container and storage clock limits | the status values | fill limits, the measure used (volume or energy), separation distances, accumulation period length — `jurisdiction_rule` |
| T-38 Document type | the document vocabulary | every template, required phrase, marking text and marking size — `jurisdiction_rule` |
| T-40 / T-41 / T-42 Jurisdiction and rule versioning | identifier formats and status values | every jurisdiction row, rule row and citation — `jurisdiction`, `jurisdiction_rule`, `rule_version` |

**A value name must never carry a threshold.** `medium_format` is correct. `over_11lb_300wh` is a review rejection: it hard-codes one state's numbers into a value that has to mean something different in the next state.

**Citations are data too.** Statutory citations, effective dates and deadlines live on `jurisdiction_rule`. Where this document names a regulatory concept, it is provenance for the reader — not a string to be pasted into code or a PDF template.

### 1.3 Language rules this document obeys absolutely

Per `_ANCHORS.md` §7. These are not style preferences.

1. **No probability of ignition.** Hazard output (T-33, T-34) is a *relative ranking with a stated basis per factor*. Never a probability, percentage, likelihood, score-out-of-ten, "risk of fire," or "chance of thermal runaway" — in UI copy, API responses, exports or PDFs.
2. **Chemistry is never detected from a photograph.** The label is *read*; chemistry is *matched from the catalog* and *confirmed by a human* (T-01). Chemistry is not visually inferable — the industry deployed X-ray and XRF sorting because cameras cannot do it.
3. **"Assessed condition," never "measured condition."** BMMP integrates third-party health testers; it does not measure battery health itself.
4. **No hard-coded jurisdiction threshold, deadline or citation.** See §1.2.
5. **MIP was absorbed, never cut or descoped.** Mobility-device battery coverage lives inside BMMP.

### 1.4 Phase markers, and the two systems that must exist now

Every system carries a phase marker. A marker of B1b/B2/B3 means the *behaviour* arrives in that phase — it does **not** mean the classification can be added later.

Two systems are explicitly **built at B1a and activated later**, per `_ANCHORS.md` §0 and `PROJECT_SETUP_BMMP.md` §8.2:

- **T-02 Battery application class** carries `small_mobility` **from the first migration.** Power wheelchair and mobility scooter packs are first-class battery records on day one. B3 does not add this class; B3 onboards the customers who bring it volume.
- **T-06 Size / format category** carries `medium_format` **from the first migration.** State producer-responsibility statutes use this category to cover scooter and mobility packs. B3 *activates* the medium-format producer rules; it does not create the category.

If either is built narrow, B3 is a rebuild rather than a four-week activation.

### 1.5 Citation convention

Business rule citations in this document are written **`Rule n.m`**, pointing at a specific numbered rule in `BUSINESS_RULES.md`. Every number cited has been verified to exist. Section numbers are fixed in `_ANCHORS.md` §4:

| § | Area | § | Area |
|---|---|---|---|
| 1 | Access, tenancy and roles | 7 | Data capture, consent and training rights |
| 2 | Battery intake and identification | 8 | Producer obligations and state registration (B1b) |
| 3 | Waste classification — light category vs full hazardous | 9 | Insurance evidence and fire-code volume (B1b) |
| 4 | Storage, containers and the one-year clock | 10 | Grading, damage triage and hazard ranking (B2) |
| 5 | Transport documentation and shipping papers | 11 | Mobility and small-battery coverage (B3) |
| 6 | Damage, defect and the air-transport prohibition | 12 | Audit, retention and export |

**This document enumerates valid values and their plain-english meaning. `BUSINESS_RULES.md` owns what triggers a transition between them.** Where a value drives behaviour, the governing rule is cited by number. Edge cases are cited as `EC-n` and open questions as `OQ-n`, both from `BUSINESS_RULES.md`.

Two citations in this document are deliberately **not** numbered, because what they point at is not a numbered rule: T-07's catalog-edit restriction and part of T-38's document-generator split both live in `BUSINESS_RULES.md` § Roles and Permissions. Each says so in place. **Everywhere else, a citation is a rule number.** If you find a claim in this document with no citation and no rule behind it, that is a defect — raise it rather than implementing the claim.

---

## 2. Classification Systems Index

| ID | System | Stored on | Cardinality | Phase |
|---|---|---|---|---|
| **A. Battery identity and catalog** ||||
| T-01 | Battery chemistry | `battery_record.chemistry`, `catalog_entry.chemistry` | single | B1a |
| T-02 | Battery application class | `battery_record.application_class` | single | B1a |
| T-03 | Assembly level | `battery_record.assembly_level` | single | B1a |
| T-04 | Cell form factor | `battery_record.cell_form_factor` | single | B1a |
| T-05 | Battery removability | `catalog_entry.removability` | single | B1a |
| T-06 | Size / format category | `format_classification.format_category` | single per jurisdiction | B1a (activated B3) |
| T-07 | Catalog entry status | `catalog_entry.status` | single | B1a |
| **B. Intake, extraction and provenance** ||||
| T-08 | Intake session status | `intake_session.status` | single | B1a |
| T-09 | Label extraction field code | `label_extraction.field_code` | one row per field | B1a |
| T-10 | Extraction confidence band | `label_extraction.confidence_band` | single per field | B1a |
| T-11 | Provenance source type | `battery_record.provenance_source_type` | single | B1a |
| T-12 | Data-use eligibility | `intake_photo.data_use_eligibility` | single | B1a |
| **C. Waste classification and handling** ||||
| T-13 | Waste classification | `classification_decision.waste_classification` | single | B1a |
| T-14 | Waste classification basis code | `classification_decision.basis_codes` | multi | B1a |
| T-15 | Handler size class | `organization.handler_size_class` | single | B1a |
| T-16 | Handler activity type | `storage_event.activity_type` | single per event | B1a |
| **D. Transport** ||||
| T-17 | UN transport identifier | `shipping_paper.un_identifier` | single per line | B1a |
| T-18 | Transport mode | `shipment.transport_mode` | single | B1a |
| T-19 | Packing group | `shipping_paper.packing_group` | single per line | B1a |
| T-20 | Packaging exception | `shipment.packaging_exceptions` | multi | B1a |
| T-21 | State-of-charge band | `battery_record.state_of_charge_band` | single | B1a |
| **E. Records, containers, storage and movement** ||||
| T-22 | Battery record status | `battery_record.status` | single | B1a |
| T-23 | Container type | `container.container_type` | single | B1a |
| T-24 | Container status | `container.status` | single | B1a |
| T-25 | Lot status | `lot.status` | single | B1a |
| T-26 | Storage clock status | `storage_clock.status` | single | B1a |
| T-27 | Storage clock alert band | `storage_clock.alert_band` | single | B1a |
| T-28 | Shipment status | `shipment.status` | single | B1a |
| **F. Condition, damage and assessment** ||||
| T-29 | Damage finding type | `damage_assessment.finding_types` | multi | B1a |
| T-30 | DDR flag | `battery_record.ddr_flags` | multi | B1a |
| T-31 | Condition grade | `grade.grade_value` | single per grade row | B2 |
| T-32 | Disposition route | `battery_record.disposition_route` | single | B2 |
| T-33 | Hazard ranking band | `hazard_ranking.band` | single per ranking row | B2 |
| T-34 | Hazard factor code | `hazard_ranking.factor_codes` | multi | B2 |
| T-35 | Recall match status | `recall_match.status` | single | B2 |
| T-36 | Recall source | `recall_match.source` | single | B2 |
| **G. Access, documents, rules and audit** ||||
| T-37 | Role | `membership.role` | single per membership | B1a |
| T-38 | Document type | `document_render.document_type` | single | B1a |
| T-39 | Document render status | `document_render.status` | single | B1a |
| T-40 | Jurisdiction identifier | `jurisdiction.code`, `jurisdiction.level` | single | B1a |
| T-41 | Jurisdiction rule domain | `jurisdiction_rule.domain` | single | B1a |
| T-42 | Rule version status | `rule_version.status` | single | B1a |
| T-43 | Audit event type | `audit_event.event_type` | single | B1a |
| T-44 | Alert type | `alert.alert_type` | single | B1a |
| **H. Status systems added at v1.2** ||||
| T-45 | Classification decision status | `classification_decision.status` | single | B1a |
| T-46 | Damage assessment status | `damage_assessment.status` | single | B1a |
| T-47 | Terms of Service acceptance status | `tos_acceptance.status` | single | B1a |
| **I. Condition, severity, source, method and step** ||||
| T-48 | Alert severity | `alert.severity` | single | B1a |
| T-49 | Assessed condition | `battery_record.assessed_condition`, `damage_assessment.assessed_condition` | single | B1a |
| T-50 | Intake photo type | `intake_photo.photo_type` | single | B1a |
| T-51 | Label crop method | `intake_photo.crop_method` | single | B1a |
| T-52 | Review reason code | `intake_session.review_reason_codes` | multi | B1a |
| T-53 | Intake step | `intake_session.current_step` | single | B1a |
| T-54 | Chemistry source | `battery_record.chemistry_source` | single | B1a |
| T-55 | State-of-charge source | `battery_record.soc_source` | single | B1a |
| T-56 | Date code precision | `date_code_decode.decoded_precision` | single | B1a |
| T-57 | Date code decode method | `date_code_decode.decoded_by_method` | single | B1a |
| T-58 | Classification decision scope | `classification_decision.decision_scope` | single | B1a |
| T-59 | Damage assessment method | `damage_assessment.assessment_method` | single | B1a |
| T-60 | Audit actor type | `audit_event.actor_type` | single | B1a |
| T-61 | Catalog entry source type | `catalog_entry.source_type` | single | B1a |

---

## 3. Classification Systems

---

### T-01 · Battery chemistry

**Stored on:** `battery_record.chemistry`, `catalog_entry.chemistry` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Identifies the electrochemical family and, where known, the sub-chemistry of a battery, because chemistry drives waste classification, transport identifier assignment, storage rules and end-of-life economics.

| Stored value | Display label | Definition |
|---|---|---|
| `li_nmc` | Lithium-ion — NMC | Lithium nickel manganese cobalt oxide. Common in electric-vehicle traction packs. Carries recoverable nickel and cobalt value. |
| `li_nca` | Lithium-ion — NCA | Lithium nickel cobalt aluminium oxide. Vehicle traction chemistry, similar recovery profile to NMC. |
| `li_lfp` | Lithium-ion — LFP | Lithium iron phosphate. Increasingly common in vehicles and stationary use. Low material recovery value — disposal frequently costs money rather than earning it. |
| `li_lco` | Lithium-ion — LCO | Lithium cobalt oxide. Dominant in consumer electronics cells. |
| `li_lmo` | Lithium-ion — LMO | Lithium manganese oxide. Often blended; appears in power tools and some vehicle packs. |
| `li_lto` | Lithium-ion — LTO | Lithium titanate. Long-cycle industrial and transit applications. |
| `li_ion_unspecified` | Lithium-ion — sub-chemistry not stated | Confirmed lithium-ion, but the label does not state a sub-chemistry and the catalog entry does not resolve one. A legitimate confirmed answer, not a placeholder. |
| `lithium_metal` | Lithium metal (primary) | Non-rechargeable lithium metal cells. Classified and shipped differently from lithium-ion. |
| `lead_acid_sealed` | Lead-acid — sealed | Sealed / valve-regulated lead-acid, including AGM and gel. The dominant chemistry in power wheelchairs and mobility scooters today. |
| `lead_acid_flooded` | Lead-acid — flooded | Vented flooded lead-acid, including conventional vehicle starter batteries. |
| `nimh` | Nickel-metal hydride | Nickel-metal hydride. The classic hybrid-vehicle traction chemistry and a large share of the hybrid battery stream. |
| `nicd` | Nickel-cadmium | Nickel-cadmium. Older industrial and tool packs. |
| `sodium_ion` | Sodium-ion | Sodium-ion. Emerging chemistry whose transport classification is not settled in law — see RN-6 and T-17. |
| `alkaline` | Alkaline (primary) | Non-lithium single-use household cells. |
| `other` | Other chemistry | A chemistry confirmed by a human that is genuinely outside every value above. Requires a free-text note and raises a taxonomy change request to P6. |
| `unknown` | Chemistry not confirmed | Chemistry has not been human-confirmed. The record cannot be classified, shipped or documented in this state. |

**Rules**

- **Single-select.** A battery record holds exactly one chemistry.
- **Assigned by human confirmation only.** The vision pipeline *reads the label* and the catalog match *proposes* a chemistry; neither writes it. P1 or P6 confirms it. Per `_ANCHORS.md` §6, nothing auto-commits an unconfirmed chemistry, and per `_ANCHORS.md` §7.2, chemistry is never described as detected from a photograph.
- **`unknown` is the default on record creation** and is the only state in which a record may sit unclassified. It is a blocking value: a record with `unknown` chemistry cannot leave `pending_review` (T-22), cannot receive a waste classification (T-13), and cannot appear on a shipping paper. Governed by **Rules 2.15, 3.3 and 5.3**.
- **Triggers behaviour:** waste classification (**Rules 3.4, 3.9** — chemistry is one input among several and never determines the outcome alone), transport identifier derivation and shipping paper generation (**Rule 5.9**), container segregation (**Rule 4.28**), damage handling and the air-transport prohibition (**Rule 6.7**), and — from B1b — producer obligation and format determination (**Rules 8.1, 8.2**, stub).
- **Not terminal.** A confirmed chemistry can be corrected by P1 or P6. Correction writes an `audit_event` and re-runs every dependent classification; documents already issued are **not** retroactively altered — they are superseded (T-39).
- **Sub-chemistry granularity** defaults from the matched `catalog_entry` and is stored on the record. See RN-2.
- **Chemistry is not the transport identifier.** Do not derive `un3480` from `li_nmc` in code — the mapping is `jurisdiction_rule` data. See T-17.

---

### T-02 · Battery application class

**Stored on:** `battery_record.application_class` · **Cardinality:** single-select · **Phase:** B1a — `small_mobility` included from the first migration

**Purpose:** Records what kind of equipment the battery came out of, because producer-responsibility statutes, storage rules and customer workflows all key off application rather than chemistry.

| Stored value | Display label | Definition |
|---|---|---|
| `vehicle` | Vehicle | A battery from a road vehicle — electric-vehicle traction pack, hybrid traction pack, or conventional starter battery. |
| `consumer_electronics` | Consumer electronics | A battery from a consumer device — laptop, phone, power tool, e-bike, household appliance. |
| `industrial` | Industrial | A battery from industrial or commercial equipment — forklift, uninterruptible power supply, stationary backup, material-handling equipment. |
| `small_mobility` | Small mobility device | A battery from a powered mobility device — power wheelchair, mobility scooter, or comparable personal mobility equipment. **Present from day one, not added at B3.** |
| `unknown` | Application not confirmed | Source equipment has not been confirmed. Blocking for producer-obligation determination. |

**Rules**

- **Single-select.** One application class per record.
- **No `other` value exists.** A record that fits none of these classes is a taxonomy change request routed to P6 — not a free-text escape hatch. See RN-5.
- **Assigned by human confirmation** by P1 or P6 during intake. May be pre-filled from the matched catalog entry.
- **`small_mobility` is live at B1a.** Every screen, filter, document template and rules lookup handles it from the first migration. Phase B3 onboards mobility suppliers and repair companies (P4) and activates the medium-format producer rules (T-06) — it does not introduce this value. Required by **Rules 1.24 and 2.28**: no battery is rejected, downgraded or routed to a side path because it is a mobility pack, and intake accepts them from the first day on the same record, pipeline and document path as any other battery. A builder who finds themselves widening the record in B3 has found a B1a defect and raises it (**Rules 11.2, EC-57**); an unfamiliar mobility pack goes down the manual path like any other unmatched battery, never a "not supported yet" path (**EC-15**). (`PROJECT_SETUP_BMMP.md` §8.2.)
- **Triggers behaviour:** producer obligation determination and format classification (**Rules 8.1, 8.3**, stub), and mobility-specific document workflows at B3 (**Rules 11.1, 11.3**, stub).
- **Not terminal.** Correctable by P1 or P6 with an `audit_event`.

---

### T-03 · Assembly level

**Stored on:** `battery_record.assembly_level` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records what physical unit the record describes — an individual cell, a module of cells, or a complete pack — because packaging, weight, energy and transport treatment all differ by assembly level.

| Stored value | Display label | Definition |
|---|---|---|
| `cell` | Cell | A single electrochemical cell. |
| `module` | Module | An assembly of cells, without the pack-level enclosure or management electronics. |
| `pack` | Pack | A complete battery pack as installed in equipment, including enclosure and any management electronics. |
| `unknown` | Assembly level not confirmed | Not yet confirmed. Blocking for shipping paper generation. |

**Rules**

- **Single-select.** One assembly level per record.
- **Assigned by human confirmation** by P1 or P6; may be pre-filled from the catalog entry.
- **Triggers behaviour:** shipping paper line construction (**Rules 5.8, 5.9**), container fill calculation (**Rule 4.25**).
- **Not terminal**, but a change after a shipping paper has been issued supersedes that document (T-39) rather than editing it.
- **Assembly level is independent of T-04.** A pack has an assembly level of `pack` and may still record the cell form factor of the cells inside it.

---

### T-04 · Cell form factor

**Stored on:** `battery_record.cell_form_factor` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records the physical shape of the cells, which is the one identification attribute that is genuinely visible in a photograph and is therefore usable for a cold-start check on what has been photographed.

| Stored value | Display label | Definition |
|---|---|---|
| `cylindrical` | Cylindrical | Round cylindrical cells, including the common 18650 and 21700 sizes. |
| `prismatic` | Prismatic | Hard-cased rectangular cells. |
| `pouch` | Pouch | Soft-pouch cells in a laminated foil enclosure. |
| `button_coin` | Button / coin | Small round button or coin cells. |
| `not_applicable` | Not applicable | The record describes an assembly whose cell form factor is not meaningful or not visible — typically a sealed pack. |
| `unknown` | Form factor not confirmed | Not yet confirmed. |

**Rules**

- **Single-select.**
- **May be proposed by the vision model.** Form factor is the one attribute the model may propose with a confidence band, because shape is visible where chemistry is not. The proposal is still confirmed by P1 or P6 before it is stored. **This asymmetry with T-01 is deliberate and must not be generalised** — nothing else in the identification pipeline gains this treatment.
- **Not a hard-gated field** (see T-10) — a low-confidence form factor does not on its own route a record to `/review`, but any other gated field below band does.
- **Triggers behaviour:** none directly. Feeds packaging guidance and catalog matching only.
- **Not terminal.**

---

### T-05 · Battery removability

**Stored on:** `catalog_entry.removability` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records how the battery separates from the product it powers, because several producer-responsibility statutes key their covered-product definitions to removability.

| Stored value | Display label | Definition |
|---|---|---|
| `user_removable` | User removable | Removable by the end user without tools. |
| `tool_removable` | Removable with tools | Removable with ordinary tools, but not by hand. |
| `non_removable` | Not removable | Embedded in the product and not intended to be separated — the battery-embedded product case. |
| `unknown` | Removability not confirmed | Not yet established for this catalog entry. |

**Rules**

- **Single-select**, held on the catalog entry rather than the battery record, because removability is a property of the product design.
- **Assigned by P6** as part of catalog maintenance (`/settings/catalog`).
- **Triggers behaviour:** producer obligation determination and format classification (**Rules 8.1, 8.2**, stub). It is an *input* to a jurisdiction rule, never a rule itself — which products a state covers by removability is `jurisdiction_rule` data.
- **Not terminal.**

---

### T-06 · Size / format category

**Stored on:** `format_classification.format_category` · **Cardinality:** single-select **per jurisdiction and rule version** · **Phase:** B1a — `medium_format` included from the first migration; activated B3

**Purpose:** Places a battery in the size band that a producer-responsibility statute uses to decide which obligations apply to it.

| Stored value | Display label | Definition |
|---|---|---|
| `portable` | Portable | The smallest statutory band — household and consumer-scale batteries. |
| `medium_format` | Medium format | The middle statutory band. **This is the category state producer-responsibility statutes use to cover scooter and mobility packs.** Present from the first migration. |
| `large_format` | Large format | The largest statutory band — vehicle traction packs and comparable industrial batteries. |
| `not_covered` | Not covered in this jurisdiction | The battery falls outside every covered band in this jurisdiction's rule set. A real, meaningful result — not an error. |
| `undetermined` | Not yet determined | Required inputs are missing or unconfirmed, so no format can be assigned. |

**Rules**

- **This is not a single attribute of a battery.** The same physical battery classifies differently in different states. `format_classification` is a derived row keyed on `(battery_record, jurisdiction, rule_version)` — never a single column on `battery_record`. An agent that adds `battery_record.format_category` has broken the multi-state model.
- **Jurisdiction-varying.** The three format values are fixed here; **the weight and energy thresholds that assign them are `jurisdiction_rule` data and appear nowhere in code.** A value name that carries a threshold is a review rejection (§1.2).
- **System-assigned**, derived from confirmed chemistry, weight, energy, removability (T-05) and the jurisdiction's active rule version. P6 may record an override with a stated reason; P1 may not.
- **`medium_format` exists at B1a and is activated at B3.** The category, its storage, its filters and its rule-lookup path are built in the first migration. B1b builds the multi-state threshold engine including this band. B3 turns it on for the states that name it. **B3 does not add this category** — **Rule 8.3** puts the medium-format category in the jurisdiction rules data model from the first migration, and **Rule 11.2** states plainly that B3 activates existing machinery rather than building new machinery (`_ANCHORS.md` §0).
- **Triggers behaviour:** producer obligation determination, registration filing packets and deadline tracking (**Rule 8.1**, stub); mobility and small-battery coverage (**Rules 11.1, 11.2**, stub).
- **Not terminal**, and expected to change: when a jurisdiction publishes a new rule version, a new `format_classification` row is written against the new version. **Existing rows are never mutated** — the classification that produced a filed document must remain readable exactly as it was.

---

### T-07 · Catalog entry status

**Stored on:** `catalog_entry.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Tracks whether a known battery product in the catalog is usable for matching during intake.

| Stored value | Display label | Definition |
|---|---|---|
| `proposed` | Proposed | Drafted but not yet approved. Not available for intake matching. |
| `published` | Published | Approved and available for intake matching. |
| `deprecated` | Deprecated | Withdrawn from matching — superseded, incorrect, or a duplicate. Existing battery records that reference it keep the reference. |
| `rejected` | Rejected | Reviewed and declined. Never becomes available for matching. Terminal. |

**Rules**

- **Single-select.**
- **Assigned by P6 only** (`/settings/catalog`). P6 approves entries proposed from the manual intake path (**Rule 2.20**). *The catalog-edit restriction itself is stated in `BUSINESS_RULES.md` § Roles and Permissions — in P1's, P2's and P6's CAN/CANNOT lists — rather than as a numbered rule, so it is cited here by name.*
- **Triggers behaviour:** only `published` entries are returned by intake catalog matching (**Rules 2.18–2.20**). A handler's rejection of a match always wins over the match (**EC-10**).
- **`rejected` is terminal.** A rejected entry is never revived — a corrected product is a new entry.
- **Deprecating an entry never rewrites the battery records that reference it.** Chemistry and other attributes already confirmed on those records stand. Deprecation removes the entry from future matching only.

---

### T-08 · Intake session status

**Stored on:** `intake_session.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Tracks a single pass through the intake flow — photo capture, label reading, catalog match, human confirmation — so an interrupted intake can be resumed rather than lost.

| Stored value | Display label | Definition |
|---|---|---|
| `open` | In progress | The session is active. Photos are being captured. |
| `extracting` | Reading label | The identification pipeline is running: label crop → vision extraction → catalog match. |
| `awaiting_confirmation` | Awaiting confirmation | Extraction is complete and the session is waiting on human confirmation by P1 or P6. |
| `completed` | Completed | Identification confirmed and one or more battery records created. Terminal. |
| `failed` | Failed | A pipeline step could not complete. Captured photos are retained and the session is recoverable by retry or by the manual entry path — work in progress is never lost because a step failed (**EC-14**). |
| `abandoned` | Abandoned | Closed without confirmation. Captured photos are retained for audit; no battery record was created. Terminal. |

**Rules**

- **Single-select.**
- **System-assigned** as the pipeline advances. Users do not set this value directly; P1 can abandon a session, which the system records as `abandoned`.
- **The pipeline order is fixed** and code-orchestrated: photo → label crop → vision extraction → catalog match → confidence gate → human confirmation. No agent chooses the next step, and every step writes an `audit_event` including steps that produce nothing and steps that fail (`_ANCHORS.md` §6). Governed by **Rules 2.2, 2.3 and 2.4**.
- **`completed` and `abandoned` are terminal.** A session is never reopened — a correction is a new action on the resulting battery record, not a reopened session. **`failed` is not terminal**: it returns to `open` on retry, or to `abandoned` if the handler gives up. **An idle session does not expire in B1a** — the interval is configuration and it is unset, so no session ever moves to `abandoned` on a timer (**D-33**). `abandoned` is reached only by a handler abandoning the session, which is a person acting.
- **Triggers behaviour:** entering `awaiting_confirmation` with any gated field below band places the record in the `/review` queue (**Rules 2.13, 2.14**). See T-10.

---

### T-09 · Label extraction field code

**Stored on:** `label_extraction.field_code` · **Cardinality:** one row per field per extraction · **Phase:** B1a

**Purpose:** Names every field the vision model extracts from a battery label, so per-field values and per-field confidence are recorded against a stable vocabulary rather than free-text keys.

| Stored value | Display label | Definition | Gate |
|---|---|---|---|
| `manufacturer` | Manufacturer | The manufacturer or brand name printed on the label. | confidence-gated |
| `model` | Model / part number | The model or part number used to resolve the catalog entry. | **hard-gated** |
| `chemistry_code` | Chemistry code | The chemistry designation printed on the label. Feeds catalog resolution — it does not by itself set T-01. | **hard-gated** |
| `voltage` | Voltage | Nominal voltage as printed. | confidence-gated |
| `capacity_ah` | Capacity (Ah) | Amp-hour capacity as printed. | confidence-gated |
| `energy_wh` | Energy (Wh) | Watt-hour energy as printed or derived from voltage and capacity. | confidence-gated |
| `date_code` | Date code | The manufacture date code, decoded by `date_code_decode` into an age. | confidence-gated |
| `serial_number` | Serial number | The unit serial, used for provenance binding (T-11) and recall matching (T-35). | confidence-gated |
| `certification_marks` | Certification marks | Certification marks visible on the label. Feeds hazard factors (T-34). | confidence-gated |
| `transport_test_marking` | Transport test marking | Markings indicating transport test compliance. | confidence-gated |
| `assessed_condition` | Assessed condition | The condition recorded at intake. **Assessed, never measured** — BMMP integrates third-party health testers, it does not measure health itself. | **hard-gated** |

**Rules**

- **One row per field per extraction**, each carrying its own value and its own confidence band (T-10). A single blended confidence for the whole extraction is forbidden — per-field confidence is what makes the gate meaningful.
- **Written by the pipeline; confirmed by P1 or P6.** A model-fabricated value on a low-confidence field is a known failure mode; per-field confidence, schema validation and the human gate are the mitigation.
- **Hard-gated fields — `model`, `chemistry_code`, `assessed_condition` — always require human confirmation** regardless of confidence band. There is no confidence value at which they auto-commit — a perfect-confidence chemistry read still stops at the gate (`_ANCHORS.md` §6). Governed by **Rules 2.15 and 2.17**, and illustrated by **EC-8**.
- **Confidence-gated fields** auto-populate only at band `high`; anything lower routes the whole record to `/review`.
- **This vocabulary is closed.** A new extracted field is a taxonomy addition, not a new free-text key.

---

### T-10 · Extraction confidence band

**Stored on:** `label_extraction.confidence_band` · **Cardinality:** single-select per field · **Phase:** B1a

**Purpose:** Expresses how far a single extracted field can be trusted, so the review gate can be applied consistently without exposing raw model scores to users.

| Stored value | Display label | Definition |
|---|---|---|
| `high` | High confidence | The extraction is clean enough to auto-populate a confidence-gated field, subject to human confirmation of the record as a whole. |
| `medium` | Needs confirmation | The extraction is plausible but not clean. Routes the record to review. |
| `low` | Low confidence | The extraction is unreliable. Routes the record to review and is presented as a suggestion, never as an answer. |
| `not_extracted` | Not found on label | The field was not present or not legible on the label. Routes the record to review. |

**Rules**

- **Single-select per field.** The record itself holds no aggregate confidence value.
- **System-assigned.** No user sets a confidence band.
- **The gate is a hard rule, not a tunable default** (`_ANCHORS.md` §6): **any gated field not at `high` routes the whole record to `/review`.** Not the field — the record, because a bad read on one field is evidence the read as a whole is unreliable. Governed by **Rules 2.13 and 2.14**; no role may disable, bypass, defer or lower it (**Rule 2.17**).
- **Band boundaries are configuration, in one place.** The numeric cutoffs that map a raw model score to a band live in a single configuration module; **the gate behaviour above does not change with them.** Raw scores are stored for audit and are never displayed as a percentage in the UI or in any export.
- **Triggers behaviour:** placement in the `/review` queue (**Rule 2.14**); every band assignment writes an `audit_event` (**Rules 2.4, 12.5**). A confident value for a field not physically on the label is treated as a fabrication, rejected by schema validation and shown as unread (**Rules 2.11, 2.12; EC-7**).
- **Not terminal.** A re-extraction writes a new `label_extraction` row; it never overwrites the previous one.

---

### T-11 · Provenance source type

**Stored on:** `battery_record.provenance_source_type` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records what the battery was removed from, so the link between a pack and its source equipment survives — the named failure mode in this industry is that this link gets severed at intake.

| Stored value | Display label | Definition |
|---|---|---|
| `vehicle_vin` | Vehicle (VIN) | Removed from a road vehicle identified by its vehicle identification number. |
| `device_serial` | Device (serial number) | Removed from a device identified by its serial number — including powered mobility devices. |
| `equipment_asset_id` | Equipment (asset ID) | Removed from industrial or commercial equipment identified by a customer asset identifier. |
| `bulk_consignment` | Bulk consignment | Received as part of a bulk lot with no per-unit source identification available. |
| `unknown_provenance` | Provenance not recorded | No source identification was captured. |

**Rules**

- **Single-select.**
- **Assigned by P1 or P6 at intake** (**Rule 2.30** — B1a captures; it does not verify).
- **`unknown_provenance` and `bulk_consignment` are legitimate answers, not failures** — but both suppress recall matching (T-35) for the record, because there is nothing to match against.
- **Triggers behaviour:** the provenance binding (**Rule 10.9**, stub — B1a captures the source reference under **Rule 2.30**, B2 specifies the binding and what breaks it), recall matching (**Rule 10.7**, stub), and evidence-pack content at B1b (**Rule 9.3**, stub).
- **Not terminal**, but the source identifier itself is write-once: once a serial or VIN is bound and confirmed, changing it requires P6 and writes an `audit_event`.

---

### T-12 · Data-use eligibility

**Stored on:** `intake_photo.data_use_eligibility` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records whether a captured image may be used for model training, determined by whether the tenant's Terms of Service grant was in force at the moment of capture.

| Stored value | Display label | Definition |
|---|---|---|
| `training_eligible` | Training eligible | Captured while an accepted Terms of Service granting training rights was in force for the tenant. |
| `training_excluded` | Training excluded | Captured with no training-rights grant in force. **Terminal** — a later acceptance does not make this image eligible. |
| `pending_determination` | Pending determination | Capture recorded, eligibility not yet resolved. A transient state that must resolve before the image is stored to the corpus. |

**Rules**

- **Single-select**, stamped at capture time against the tenant's `tos_acceptance` record.
- **System-assigned. No user or role can change it** — not P1, not P6 (**Rule 7.6**: eligibility is decided once, never recomputed, and never editable by any role including P6). This is the only classification in the product that no human can edit.
- **`training_excluded` is terminal and irreversible** (**Rules 7.7 and 7.17**): no later acceptance, re-acceptance, backdating or administrative action ever makes it eligible, and re-acceptance is never retroactive. Every image captured before the grant is permanently unusable for training, which is why the Terms of Service granting training rights must be in force *before* the first battery is logged (**Rules 7.1, 7.2**; **EC-32**). Ineligible is not useless — the record remains fully usable for compliance, documentation, shipment, audit and insurance evidence (**Rule 7.8**).
- **Triggers behaviour:** inclusion in the label-image corpus and the labeled damage set (**Rules 7.10 and 7.11** — both halves of the pair, or neither). Governed by **Rules 7.6 and 7.7**; eligibility travels with the data, so no copy, crop, embedding or aggregate of an ineligible record enters a training set (**Rule 7.24**), imports default to ineligible (**Rule 7.23**; **EC-31**), and every determination writes an `audit_event` (**Rule 12.1**).
- **Eligibility is a property of the image, not the record.** A single battery record can hold eligible and excluded images.

---

### T-13 · Waste classification

**Stored on:** `classification_decision.waste_classification` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records which waste stream a battery record is managed under — the lighter-touch waste category or the fully regulated hazardous stream — because that single decision determines which documents the movement legally requires.

| Stored value | Display label | Definition |
|---|---|---|
| `light_category` | Light waste category | Managed under the lighter-touch waste category. Simpler paperwork; the document that travels with the battery is the transport shipping paper plus a container label and an accumulation clock. This is the path most battery volume takes in most jurisdictions. |
| `fully_regulated` | Fully regulated hazardous | Managed as fully regulated hazardous waste. Carries the heavier documentation set. Applies where a jurisdiction requires it, where a handler elects it, or where the material's condition forces it. |
| `undetermined` | Not yet determined | Required inputs — most often confirmed chemistry — are missing, so no classification has been made. Blocking: no shipping paper or container label is issued in this state. |

**Rules**

- **Single-select.** One classification per decision row.
- **Jurisdiction-varying.** The two outcomes are fixed here; **which chemistries and conditions land in which stream is `jurisdiction_rule` data, versioned by `rule_version`.** One jurisdiction treats lithium-ion as fully regulated where most do not — that difference is a data row, never a conditional in code. Governed by **Rules 1.23, 3.2 and 3.6** (the version used is the one in force on the record's intake date, not today's).
- **System-derived, human-visible, override-able by P6 only.** The decision engine produces the classification from confirmed chemistry (T-01), condition and DDR flags (T-30), handler size class (T-15) and the jurisdiction's active rule version. P1 cannot override it. A P6 override requires basis code `manual_override` (T-14) and a stated reason.
- **Exactly one active decision per record** — never zero once identified, never two (**Rule 3.1**).
- **Every decision records its reasoning** (**Rule 3.7**): every input value used, the identity and version of every rule applied, the citation each rule version carried, the outcome, and any obligations it triggers. A `classification_decision` row without at least one basis code (T-14) is invalid. The reasoning trail is the artefact that survives an audit (**Rules 12.15, 12.16; EC-50**) — it is not optional metadata. Citations are reproduced from the rule version as data, never typed into a template (**Rule 3.8**).
- **A missing input blocks the decision; it is never assumed** (**Rules 3.4, 3.10**). A site with no jurisdiction profile holds the record in a blocked state, names the missing input and who can supply it, and produces no downstream document (**EC-16**).
- **Triggers behaviour:** shipping paper preconditions (**Rule 5.3**), container labelling and the accumulation clock (**Rules 4.4, 4.18**), retention (**Rules 12.10, 12.11**). **A light-category outcome does not exempt a shipment from transport documentation** — every shipment needs a shipping paper regardless of waste classification (**Rules 3.13, 5.4**), which is the most commonly misunderstood point in the domain. A `fully_regulated` outcome sets a manifest obligation that B1a surfaces prominently and does not satisfy; the shipment is never presented as fully documented (**Rules 3.11, 3.12; EC-19**).
- **Not terminal**, and expected to be re-derived: **Rule 3.15** lists the triggers — a corrected identification, a jurisdiction profile change, a new rule version in force, a handler size-class change, or a change to the damage assessment. Re-classification supersedes and never overwrites (**Rule 3.14**); existing rows keep their inputs, rule versions, citations and reasoning intact. **A new rule version never retroactively re-classifies a departed shipment** (**Rule 3.16**), and it flags every affected open record for re-evaluation as a required action, not a dismissible notice (**Rule 3.17; EC-18**). Voiding a battery record does not delete its classification decision (**Rule 3.25**).
- **The printed regulatory phrase on a container label is not a taxonomy value.** The exact wording, and any jurisdiction-specific variant, is label-template data driven by `jurisdiction_rule`. Do not hard-code a marking string.

---

### T-14 · Waste classification basis code

**Stored on:** `classification_decision.basis_codes` · **Cardinality:** multi-select, minimum one · **Phase:** B1a

**Purpose:** Records *why* a record landed in the waste classification it did, so an auditor can read the reasoning rather than trusting the outcome.

| Stored value | Display label | Definition |
|---|---|---|
| `federal_default` | Federal default treatment | The federal baseline treatment for this chemistry applied, with no jurisdiction rule displacing it. |
| `jurisdiction_override` | State or local rule applies | The jurisdiction's own rule set places this chemistry in a different stream than the federal baseline. |
| `chemistry_out_of_scope` | Chemistry outside the light category | The confirmed chemistry is not covered by the light category in this jurisdiction. |
| `damage_state` | Damaged, defective or recalled | One or more DDR flags (T-30) are set, which changes how the material must be handled and packaged. |
| `handler_size_threshold` | Handler size threshold reached | The organisation's handler size class (T-15) changes the obligations that attach to this material. |
| `handler_election` | Handler elected fuller treatment | The organisation chose to manage this stream under the heavier regime despite being eligible for the lighter one. |
| `chemistry_unconfirmed` | Chemistry not confirmed | Chemistry is `unknown`, so no classification can be derived. The only basis code valid alongside `undetermined`. |
| `manual_override` | Manual override by platform admin | P6 set the classification directly. Requires a stated reason recorded on the decision row. |

**Rules**

- **Multi-select, minimum one.** A record can land in a stream for more than one reason and all of them are recorded. A decision row with zero basis codes is invalid and must fail validation.
- **`chemistry_unconfirmed` is exclusive.** It appears alone, and only with `waste_classification = undetermined`.
- **`manual_override` may only be written by P6**, and only alongside a stated reason recorded on the decision row (**Rules 3.7, 3.26**). It is now **authorised and constrained by rule**: **Rule 3.26** makes P6 the only role that may override and states that the ordinary fix is still to correct the jurisdiction rule data and let **Rules 3.15 and 3.17** re-derive; **Rule 3.27** requires the override to be written as a *new decision superseding* the derived one, never an edit, with the derived outcome retained and readable beside it; **Rule 3.28** makes every override separately listable in the audit export, and requires an override toward a **less** regulated outcome to record the jurisdiction rule gap that forced it, held open until a corrected rule version supersedes it. *(v1.1 flagged this basis code as having no rule behind it — RN-10, now resolved.)*
- **Jurisdiction-varying.** The vocabulary is fixed here; which bases are reachable in a given jurisdiction, and which dominates when several apply, is `jurisdiction_rule` data.
- **Triggers behaviour:** `damage_state` forces the damaged-or-defective packaging and marking path and the air-transport prohibition (**Rules 6.4, 6.7, 6.15**), and a change to the damage assessment re-triggers classification because it is a classification input (**Rules 3.4, 3.15, 6.20**).
- **Terminal in effect.** Basis codes are written once with their decision row and never edited. A different reasoning set is a new decision row.

---

### T-15 · Handler size class

**Stored on:** `organization.handler_size_class` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records which handler size band an organisation's site falls into, because the size band changes which records the organisation must keep and for how long.

| Stored value | Display label | Definition |
|---|---|---|
| `small_handler` | Small handler | The organisation's accumulated quantity on site is below the jurisdiction's threshold. Lighter record-keeping obligations. |
| `large_handler` | Large handler | The organisation's accumulated quantity on site has reached or exceeded the jurisdiction's threshold. Additional shipment record-keeping and retention obligations attach. |
| `undetermined` | Not yet determined | Insufficient quantity data recorded to establish a class. |

**Rules**

- **Single-select per organisation per site.**
- **Jurisdiction-varying and latching.** The mass threshold **and the latch behaviour** are `jurisdiction_rule` data. The latch matters: in the common case, an organisation that crosses the threshold at any point in a calendar year is treated as a large handler for the remainder of that year even if quantity later falls. **Do not implement the class as a live comparison against current quantity** — it is a latched determination with a defined reset boundary held in rule data (**Rules 3.18, 3.19**). Crossing upward raises obligations on the day of crossing; falling back below later in the same period does not lower them (**EC-20**).
- **System-derived** from running quantity, recalculated on every storage event. Not user-assignable. P6 may record an override with a reason.
- **Triggers behaviour:** shipment ledger retention (**Rules 5.18, 12.10**), re-evaluation of every open classification decision at the site plus an audit event and a notification to P2 (**Rule 3.20**, via basis code `handler_size_threshold`), and quantity-limit warning (**Rule 4.26**).
- **Terminal within the latch period only.** `large_handler` cannot be reduced to `small_handler` before the rule-defined reset boundary. Across boundaries it is not terminal.

---

### T-16 · Handler activity type

**Stored on:** `storage_event.activity_type` · **Cardinality:** single-select per event · **Phase:** B1a

**Purpose:** Names the handling activities that can be performed on stored material, so the workflow can make prohibited activities unreachable rather than merely warning about them.

| Stored value | Display label | Definition |
|---|---|---|
| `sort` | Sort | Separating batteries by chemistry, type or condition. |
| `discharge` | Discharge | Discharging a battery. |
| `disassemble` | Disassemble | Taking a pack or module apart into its components. |
| `remove_electrolyte` | Remove electrolyte | Draining or removing electrolyte from a battery. |
| `repackage` | Repackage | Moving material between containers or into transport packaging. |
| `inspect` | Inspect | Visual or thermal inspection, recorded to the inspection log. |
| `shred` | Shred | Size reduction by shredding. |
| `self_recycle` | Recycle on site | Recycling the organisation's own accumulated material on site. |

**Rules**

- **Single-select per storage event.** An activity session that involves two activities writes two events.
- **The vocabulary is taxonomy; which activities are permitted is `jurisdiction_rule` data.** `shred` and `self_recycle` are prohibited to handlers in the common case — but the permitted set is a data lookup, never a hard-coded deny-list in TypeScript. Governed by **Rules 3.21 and 1.23**. `self_recycle` is further constrained by **Rule 3.23**: a shipment's destination must be a distinct receiving party, and a same-corporate-group destination is flagged for the handler to confirm the receiving party's own permitted status (**EC-22**).
- **The UI must make a prohibited activity unreachable, not merely warned about.** **Rule 3.21** is explicit: there is no screen, action, status or field through which a handler can record having performed one, and the system does not warn about them — it does not offer them. An agent that ships an "are you sure?" prompt here has implemented the wrong thing. Enforcement is at the data layer too: an import or API call attempting one is blocked, cited from the governing rule version, and audited (**Rules 3.22; EC-21**).
- **Assigned by P1 or P2**, recorded against the container or lot acted on. Every event writes an `audit_event` (**Rule 12.1**).
- **Not terminal.** Events are append-only; an event recorded in error is reversed by a correcting event, never deleted.

---

### T-17 · UN transport identifier

**Stored on:** `shipping_paper.un_identifier` · **Cardinality:** single-select per shipping paper line · **Phase:** B1a

**Purpose:** Records the transport identifier that appears in the basic description on a shipping paper line, because the identifier determines the required description sequence, packaging and emergency response information.

| Stored value | Display label | Definition |
|---|---|---|
| `un3480` | UN3480 | Lithium-ion batteries shipped on their own. |
| `un3481` | UN3481 | Lithium-ion batteries contained in, or packed with, equipment. |
| `un3090` | UN3090 | Lithium metal batteries shipped on their own. |
| `un3091` | UN3091 | Lithium metal batteries contained in, or packed with, equipment. |
| `un3536` | UN3536 | Lithium batteries installed in a cargo transport unit. |
| `not_assigned` | Not assigned | No transport identifier has been assigned to this line. Blocking — a shipping paper cannot be issued with an unassigned line. |

**Rules**

- **Single-select per line.** A shipment carrying more than one identifier produces more than one line.
- **These five are the B1a shipped set — they are not the whole world.** Non-lithium identifiers (lead-acid, nickel-based) and sodium-ion are **not enumerated here.** They are seeded as `jurisdiction_rule` data because the relevant federal harmonisation rule is pending and sodium-ion classification is not settled law. See RN-6.
- **Jurisdiction- and rule-version-varying.** **Never derive an identifier from chemistry in code.** The mapping from confirmed chemistry, assembly level, energy and packing configuration to an identifier is a rule-data lookup resolved against the active `rule_version`. **Rule 5.9** governs: shipping identifiers are derived from the matched catalog entry together with the active classification decision, are never free-typed by a handler, and are never guessed when the catalog entry is absent — a record with no shipping identifiers blocks generation, naming the record and the missing identifier (**EC-46**). A hard-coded `if (chemistry === 'li_nmc') return 'un3480'` is a review rejection under **Rule 1.23**.
- **System-derived from confirmed inputs, reviewed by P1 before the paper is issued.** P6 may override with a stated reason.
- **Triggers behaviour:** shipping paper basic-description construction (**Rules 5.8, 5.9**), emergency response information (**Rule 5.5**), and the 24-hour emergency contact requirement — which blocks generation when missing, unverified or lapsed, and is never omitted or replaced with a placeholder (**Rules 5.6, 5.7; EC-43**); packaging exception eligibility (T-20, **Rule 5.19**).
- **Terminal on an issued document.** Once a shipping paper is issued, its lines are frozen: no render is ever edited after generation, by any role including P6 (**Rule 5.12**). A correction issues a new render referencing the one it supersedes (**Rule 5.15**), and changing the shipment's contents voids the paper immediately (**Rule 5.13; EC-44**).
- **Display casing is fixed:** `UN3480`, never `Un3480` or `un3480`, in UI, exports and PDFs. The stored value is lower-case per §4. This is the canonical worked example in §5.

---

### T-18 · Transport mode

**Stored on:** `shipment.transport_mode` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records how a shipment travels, because mode changes the documentation required and because one mode is prohibited outright for damaged or defective material.

| Stored value | Display label | Definition |
|---|---|---|
| `ground` | Ground | Road transport by truck. The default mode for almost all battery movement. |
| `rail` | Rail | Rail transport. |
| `vessel` | Vessel | Transport by water. |
| `air` | Air | Air transport. **Unavailable for any record carrying a DDR flag (T-30).** |

**Rules**

- **Single-select per shipment.** A shipment has exactly one origin, one destination, one mode and one shipping paper (**Rule 5.2**).
- **Assigned by P1 or P6** while building a shipment, and recorded on both the shipment and the shipping paper (**Rule 5.10**).
- **`air` is hard-blocked, not warned, when any record on the shipment carries a DDR flag.** Governed by **Rules 6.7, 6.8 and 5.11**. There is no acknowledge-and-proceed, no confirmation dialog that permits it, no "I understand the risk" checkbox and no supervisor approval path, and **no role can override it — not P1, not P2, not P6** (**Rule 6.8; EC-38**). **Rule 6.9** fixes what the user sees: the mode visibly present but not selectable, a plain-language statement, the citation from the governing rule version, the specific records causing the block, and the specific indicator behind each. **Rule 6.10** fixes the three available paths and no others — ship by a non-air mode, remove the blocking records and fly the remainder, or re-assess under Rule 6.11.
- **Triggers behaviour:** packaging exception eligibility (T-20, **Rule 5.19** — the recycling and disposal exception is a ground-transport concept), shipping paper preconditions (**Rule 5.3**), and the DDR block above (**Rules 6.7, 6.13**). Confirming a damage indicator on a record already loaded onto an air shipment removes it automatically, voids the paper and notifies P1 and P2 (**Rule 6.14; EC-39**).
- **Not terminal** while the shipment is `draft`; frozen once documents are issued.
- **The mobility air-travel document set at B3 is a different artefact** (T-38 `air_travel_packet`) covering a person travelling with their own device. It does not relax this prohibition and must not be confused with it.

---

### T-19 · Packing group

**Stored on:** `shipping_paper.packing_group` · **Cardinality:** single-select per line · **Phase:** B1a

**Purpose:** Records the packing group that governs outer packaging performance for a shipping paper line.

| Stored value | Display label | Definition |
|---|---|---|
| `i` | Packing Group I | The most stringent outer packaging performance level. Required for damaged or defective material. |
| `ii` | Packing Group II | Intermediate outer packaging performance level. |
| `iii` | Packing Group III | Least stringent outer packaging performance level. |
| `not_applicable` | Not applicable | No packing group applies to this line. |

**Rules**

- **Single-select per line.** Stored lower-case (`i`, `ii`, `iii`); displayed as Roman numerals in the label. This is a deliberate label/value split, not an inconsistency — see §5.
- **System-derived from rule data**, never from a hard-coded conditional. A DDR flag forces Packing Group I outer packaging in the common case, but *that the flag forces it* is rule data resolved against the active `rule_version`. Governed by **Rules 5.9, 6.15 and 1.23** — packaging, outer-packaging class, marking requirements, minimum marking dimensions and required marking text are all carried by the rule version as data.
- **Triggers behaviour:** packaging guidance and the damaged-or-defective marking requirement (**Rule 6.15**), and the damaged/defective packet, whose absence blocks departure (**Rule 6.16**).
- **Terminal on an issued document**, as T-17.

---

### T-20 · Packaging exception

**Stored on:** `shipment.packaging_exceptions` · **Cardinality:** multi-select · **Phase:** B1a

**Purpose:** Records which packaging or testing exceptions a shipment qualifies for, because qualifying directly reduces the customer's packaging cost.

| Stored value | Display label | Definition |
|---|---|---|
| `recycling_disposal_ground` | Recycling / disposal by ground | The shipment qualifies for the exception available to material moving by ground transport to a recycling or disposal facility, which excepts it from certain testing and performance packaging requirements. |
| `damaged_defective_packaging` | Damaged / defective packaging | The shipment is packed under the damaged and defective regime, which imposes rather than relieves requirements. Recorded here so the applied regime is explicit on the record. |
| `none` | No exception applied | No exception qualifies or none was claimed. |

**Rules**

- **Multi-select**, but `none` is exclusive — it never appears alongside another value.
- **Eligibility is `jurisdiction_rule` data resolved against the active `rule_version`**, evaluated from the shipment's mode, destination type and contents using the version in force on the shipment date. Not a hard-coded conditional. Governed by **Rule 5.19**, which also requires eligibility, the criteria used and the citation to be recorded on the shipment.
- **Claimed by P1 or P6, with the eligibility determination recorded.** A claimed exception that the engine did not derive requires a stated reason and is a P6 action.
- **Triggers behaviour:** packaging guidance and shipping paper annotations (**Rule 5.19**). **The system never assumes eligibility and never silently applies an exception the shipment does not qualify for** — a shipment that does not qualify falls back to the full packaging obligations carried by the applicable rule version (**Rule 5.20**).
- **Terminal on an issued document.**

---

### T-21 · State-of-charge band

**Stored on:** `battery_record.state_of_charge_band` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records charge level at intake against the applicable storage limit, because charge level is one measurement with a large documented difference in handling severity and a direct regulatory hook.

| Stored value | Display label | Definition |
|---|---|---|
| `at_or_below_storage_limit` | At or below storage limit | Charge at intake is at or below the applicable limit for storage and transport. |
| `above_storage_limit` | Above storage limit | Charge at intake exceeds the applicable limit. Flags the record for discharge before storage or transport. |
| `not_captured` | Not captured | No charge reading was taken at intake. |

**Rules**

- **Single-select.**
- **Jurisdiction-varying. The limit itself is `jurisdiction_rule` data and appears in no value name, no constant and no conditional.** A value named `below_30_percent` is a review rejection — the number belongs to the rule, not the taxonomy.
- **Captured by P1 at intake** where a reading is available, with its observation method noted (**Rule 2.26**); system-banded from the reading against the active rule version.
- **`not_captured` is a legitimate answer, not a validation failure.** It suppresses the related hazard factor (T-34) rather than blocking intake.
- **Triggers behaviour:** contributes a hazard factor at B2 (**Rule 10.4**, stub). **No rule in `BUSINESS_RULES.md` currently attaches a storage or transport consequence to the charge band.** **Rule 2.26** requires only that charge at intake be captured where the handler can observe or read it, and recorded as assessed condition with its observation method noted. The limit exists as jurisdiction data under **Rule 1.23**; the behaviour that reads it is unspecified. Treat this as captured-and-recorded in B1a, not as a gate.
- **Not terminal.** A later reading writes a new value with an `audit_event`; the intake reading is retained.
- **This is a charge reading, not a health measurement.** It says nothing about state of health and must never be presented as a health figure. Nothing is labelled or exported as *measured* unless it came from an integrated third-party health tester, and assessed and measured condition are never merged into one field (**Rules 2.27, 11.5**).

---

### T-22 · Battery record status

**Stored on:** `battery_record.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Tracks where a battery record sits in its lifecycle, from unconfirmed intake through to disposition.

| Stored value | Display label | Definition |
|---|---|---|
| `draft` | Draft | Created within an intake session, not yet submitted. Visible only in that session. |
| `pending_review` | Pending review | Submitted with at least one gated field below band, or with a hard-gated field unconfirmed. Sits in the `/review` queue awaiting P1 or P6. |
| `confirmed` | Confirmed | Identification human-confirmed. The record is canonical but not yet classified. |
| `classified` | Classified | An active `classification_decision` exists (T-45). Classification runs only after identification is confirmed (**Rule 3.3**). |
| `reclassifying` | Reclassifying | A change invalidated the classification and a new decision is being derived — corrected identification, jurisdiction profile change, new rule version in force, handler size-class change, or a changed damage assessment (**Rule 3.15**). |
| `stored` | In storage | Assigned to a container or lot. The accumulation clock applies. |
| `quarantined` | Quarantined | Held apart from ordinary storage because of a DDR flag or a pending determination. Excluded from ordinary shipments. |
| `staged` | Staged for shipment | Allocated to a shipment being built. Not yet dispatched. |
| `shipped` | Shipped | Dispatched under an issued shipping paper. |
| `closed` | Closed | Disposition complete and confirmed. **Terminal.** |
| `voided` | Voided | Created in error. Retained in full for audit, excluded from every operational count and view. **Terminal.** |

**Rules**

- **Single-select.**
- **System-assigned on events.** Users do not set status directly. The two exceptions are both explicit actions with their own permissions: P1 or P6 may void a record; P1 or P2 may quarantine one.
- **Transitions are governed by the `battery_record` table in `BUSINESS_RULES.md` § Status Definitions, not by this document.** That table names the rule behind each transition: **Rules 2.13–2.15** (into review), **2.21** (identification confirmed), **3.3** (classified), **3.15** (re-classifying), **4.4** (into storage), **6.17** (into quarantine), **6.11** (out of quarantine, and only on a corrected assessment), **5.1** (onto a shipment), **5.17** (shipped), **5.26** (closed out). **The two value sets are identical as of v1.2.**
- **`closed` and `voided` are terminal.** No transition leaves either.
- **Records are never deleted.** Retention and audit obligations run for years past disposition; `voided` is the mechanism for an erroneous record, and deletion is not available to any role including P6 (**Rules 12.12, 12.13**). A customer asking for deletion gets a void, retained through its retention period, explained plainly (**EC-48**).
- **A record cannot reach `confirmed` with `unknown` chemistry** (T-01) or an unconfirmed hard-gated field (T-09).

---

### T-23 · Container type

**Stored on:** `container.container_type` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records what kind of material a container holds, because content class determines its labelling, its packaging requirements and what may be added to it.

**This system is a composite of two dimensions**, per **Rule 4.28** and the decision recorded at **OQ-9**: the **classification outcome** of the container's contents (T-13) crossed with their **condition state** (T-30, T-46). Every value names both. A flat list of one dimension is what v1.1 shipped, and it let a quarantine container hold a light-category record next to a fully-regulated one.

| Stored value | Display label | Classification outcome | Condition state | Definition |
|---|---|---|---|---|
| `light_category_sound` | Light waste — sound | light category | sound | Accumulation container for light-category material with no damaged-or-defective indicator and no open recall adjudication. |
| `light_category_ddr` | Light waste — damaged / defective | light category | damaged, defective or recalled | Quarantine container for light-category material carrying a DDR flag, meeting the heavier outer packaging requirements (**Rule 6.15**). |
| `light_category_hold` | Light waste — determination pending | light category | awaiting determination | Quarantine container for light-category material whose damage assessment is `not_assessed` (T-46) or whose recall match is `possible_match` (T-35). **No documents are issued from it.** |
| `fully_regulated_sound` | Fully regulated — sound | fully regulated | sound | Accumulation container for fully-regulated material with no DDR flag and no open recall adjudication. |
| `fully_regulated_ddr` | Fully regulated — damaged / defective | fully regulated | damaged, defective or recalled | Quarantine container for fully-regulated material carrying a DDR flag. |
| `fully_regulated_hold` | Fully regulated — determination pending | fully regulated | awaiting determination | Quarantine container for fully-regulated material awaiting a damage or recall determination. **No documents are issued from it.** |

**Rules**

- **Single-select, set at container creation.**
- **This system is the segregation class vocabulary that Rules 4.28 and 6.18 point at.** `BUSINESS_RULES.md` calls the concept *segregation class*; the column is **`container.container_type`** and `ERD.md`, `TECHNICAL_SPEC.md`, `SITE_ARCHITECTURE.md` and `UX_SPEC.md` build against that name. **The two names denote the same thing and neither is being renamed** — decided at **OQ-9** and stated in Rule 4.28 itself.
- **A container holds one segregation class, and the constraint is enforced at placement, not advised** (**Rule 4.28**). Because every value carries both dimensions, two consequences follow mechanically rather than by builder judgement: **no container can ever hold two different waste classification outcomes**, and no container can hold sound material alongside DDR material. A record classified `fully_regulated` cannot enter any `light_category_*` container. A record with any DDR flag can only enter a `*_ddr` container (**Rules 6.17, 6.18**).
- **A record's container follows its own two values.** Placement reads the record's active `classification_decision` (T-13) and its condition — DDR flags (T-30), damage assessment status (T-46) and recall match status (T-35) — and admits it only to the container whose type is that exact pair. A change to either dimension moves the record, which writes storage events.
- **`undetermined` classification has no container.** A record whose classification is `undetermined` (T-13) is not placed at all: **Rule 3.10** blocks the decision and **Rule 3.12** blocks every downstream document until the missing input is supplied (**EC-16**).
- **Assigned by P1, P2 or P6.**
- **Effectively terminal once the container holds material.** Changing type with contents present is not available; the material is moved to a new container, which writes storage events for the move.
- **Container fill limits, separation distances and clearance rules are `jurisdiction_rule` data**, not properties of the type.

---

### T-24 · Container status

**Stored on:** `container.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Tracks whether a container is accepting material, ready to move, or out of service.

| Stored value | Display label | Definition |
|---|---|---|
| `open` | Open | Accepting material. Holds nothing yet, or holds material with a running clock. **There is no separate empty status** — emptiness is read from the fill level and from clock status `not_started` (T-26), not from a second value that could drift out of step with them. |
| `full` | Full | At its fill limit. No further material may be added. |
| `overdue` | Overdue | The accumulation clock has passed the applicable period. **A hard state, not a warning** (**Rule 4.15**): the container accepts no new items (**Rule 4.16**) and its contents leave only by shipment or by a recorded remediation entered by P2 (**Rule 4.17**). A container can enter this state on receipt, by inheriting an earlier accumulation start date (**Rule 4.10; EC-23**). |
| `closed` | Closed | Sealed and ready for shipment. No further material may be added, whether or not it reached its limit. |
| `staged` | Staged for shipment | Allocated to a shipment being built. |
| `shipped` | Shipped | Dispatched under an issued shipping paper. |
| `retired` | Retired | Out of service. Holds no material and accepts none. **Terminal.** |

**Rules**

- **Single-select.**
- **System-assigned**, except that P1, P2 or P6 may close a container early and P2 or P6 may retire an empty one.
- **`full` is derived against `jurisdiction_rule` fill data** — volume, mass or energy depending on the jurisdiction's measure. **The limit and the measure are both data.** An agent that hard-codes a cubic-foot figure or assumes volume is the universal measure has broken the multi-jurisdiction model: some jurisdictions measure stored batteries by energy, not volume (**Rules 4.25, 4.26, 9.2**).
- **Triggers behaviour:** the accumulation clock (**Rule 4.4**) and container label generation, regeneration and the mislabelled block (**Rules 4.18, 4.20, 4.21, 4.22; EC-29**); shipment building (**Rule 5.1**); and quantity-limit warning to P2 with the limit's source stated (**Rule 4.26**), expanding to live monitoring at B1b (**Rules 9.1, 9.2**, stub — **B1a must not implement it ahead of specification**, Rule 9.5).
- **`retired` is terminal**, and a container is never deleted: a container holding nothing with a closed clock may be retired, one holding contents or with a running clock may not (**Rule 4.30**).
- **`overdue` is never cleared by moving material.** A receiving container inherits the earliest accumulation start date among its contents and may become overdue on the spot; consolidation takes the earliest across all contents; splitting gives each result the earliest date *of its own contents* (**Rules 4.9–4.12; EC-23, EC-24, EC-25**). Overdue blocks additions, not departures (**EC-27**). A remediation is an audited event that does **not** alter the accumulation start date (**Rule 4.17**).

---

### T-25 · Lot status

**Stored on:** `lot.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Tracks a lot — a grouping of records or containers assembled for movement, grading or reporting — through its life.

| Stored value | Display label | Definition |
|---|---|---|
| `open` | Open | Being assembled. Members may be added or removed. |
| `closed` | Closed | Membership fixed. Ready to be allocated. |
| `allocated` | Allocated | Assigned to a shipment being built. |
| `shipped` | Shipped | Dispatched under an issued shipping paper. |
| `dissolved` | Dissolved | Broken up before shipment; members returned to their prior state. **Terminal.** |

**Rules**

- **Single-select.** A lot is a grouping, not a place: it has no fill level and no storage clock of its own (**Rule 4.23**), and it reports the earliest accumulation start date among its contents — so a lot containing an overdue container reads overdue (**Rule 4.24**).
- **Assigned by P1 or P6.**
- **Triggers behaviour:** shipment building from lots (**Rule 5.1**), grading batch assembly at B2 (**Rule 10.1**, stub).
- **`dissolved` is terminal for that lot.** Its members are unaffected and the lot row is retained for audit.

---

### T-26 · Storage clock status

**Stored on:** `storage_clock.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Tracks the accumulation clock that starts when material first enters a container, because demonstrating that clock through an inventory system is itself a compliance obligation.

| Stored value | Display label | Definition |
|---|---|---|
| `not_started` | Not started | The container is open but holds no material, so no accumulation start date exists. |
| `running` | Running | Material is accumulating and the clock is within its period, outside any alert band. |
| `approaching_limit` | Approaching limit | The clock has entered an alert band. See T-27 for which band. |
| `overdue` | Overdue | The accumulation period has elapsed and the material has not moved. A compliance exception, surfaced prominently to P2, and the state that drives `container.status = overdue` (T-24). |
| `stopped` | Stopped | The clock ended because the contents shipped out. **Terminal for that clock instance.** |

**Rules**

- **Single-select, one clock instance per container accumulation cycle.** A container that ships and reopens starts a **new** clock instance. Clock instances are never reset in place — the historical clock is evidence.
- **System-assigned.** **Rule 4.6 is absolute: the clock never pauses.** There is no hold, no freeze, no suspend and no extension, and no role can create one, including P6. A container in dispute, under inspection or awaiting a carrier keeps counting. A clock that is wrong is corrected by correcting the underlying storage events, which writes an `audit_event`.
- **The clock starts on first placement** — the accumulation start date — not on container creation and not on the logging date (**Rule 4.4**), and it closes in exactly two ways: the contents depart on a shipment, or the container reaches empty with no remaining contents carrying that start date (**Rule 4.7**).
- **Start dates travel and can only ever be inherited downward.** Moving a record carries its start date with it (**Rule 4.9**), a receiving container takes the earliest start date among its contents immediately on receipt and may become overdue on the spot (**Rule 4.10**), consolidation takes the earliest across all contents (**Rule 4.11**), and splitting gives each result the earliest date *of its own contents* (**Rule 4.12**). **Moving batteries between containers is never a way to restart a clock, and the system defeats that structurally rather than by warning** (**EC-23, EC-24, EC-25**).
- **The accumulation period length is `jurisdiction_rule` data**, read from the version in force at the site on the accumulation start date. It is not a constant, not `365`, and not an assumption — `BUSINESS_RULES.md` §4 is titled "the one-year clock" and states in its own preamble that **the system never assumes one year** (**Rules 4.5, 1.23**).
- **Triggers behaviour:** alerting to P2 always and to P1 for containers at their site (**Rules 4.13, 4.14**), dashboard surfacing of open clocks, and evidence pack content at B1b (**Rule 9.1**, stub). Every clock date and overdue determination is computed in the site's local time zone (**Rules 4.29, 12.20; EC-30**).
- **Overdue is a hard state, not a warning** (**Rule 4.15**). An overdue container accepts no new items (**Rule 4.16**); its contents leave only by shipment or by a recorded remediation entered by P2 stating what was done and why, which is an audited event that does not alter the accumulation start date (**Rule 4.17**). Overdue blocks additions, not departures (**EC-27**). It is never silently cleared: the expiry is retained in the clock's history and appears in the audit export.
- **One condition, one word.** This column, `container.status` (T-24) and `storage_clock.alert_band` (T-27) all name the elapsed condition **`overdue`**. v1.1 called it `expired` here and `overdue` in the other two, which is how a builder infers a fourth state from a fourth name. The rename is recorded in §6. The closing state stays `stopped` — nothing else in the entity family uses that word, so there is no collision to resolve.

---

### T-27 · Storage clock alert band

**Stored on:** `storage_clock.alert_band` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records which warning stage an accumulation clock has reached, so alerting is consistent without baking a day count into a stored value.

| Stored value | Display label | Definition |
|---|---|---|
| `none` | No alert | The clock is running outside every alert band. |
| `early` | *First notice* — rendered from the configured offset, e.g. "90-day notice" | The first warning stage has been reached. |
| `mid` | *Second notice* — rendered from the configured offset, e.g. "60-day notice" | The second warning stage has been reached. |
| `final` | *Final notice* — rendered from the configured offset, e.g. "30-day notice" | The last warning stage before the period elapses. |
| `overdue` | Overdue | The accumulation period has elapsed. Pairs with clock status `overdue` (T-26) and container status `overdue` (T-24) — the same word in all three, deliberately. |

**Rules**

- **Single-select.** The bands are ordered and a clock moves through them in one direction within an instance.
- **This system is the worked example of §5.4.** The stored values carry **no day count**. The offsets that define each band are organisation-level configuration, seeded at 90 / 60 / 30 days, and the display label is rendered from the configured offset at read time. **Changing an offset from 90 days to 75 days is a configuration change and touches no stored data.** A value named `warning_90` would have made that a migration — which is exactly the failure this document exists to prevent.
- **System-assigned.** Offsets are set by P2 or P6 at organisation level. **Rule 4.13** states the discipline exactly: the ladder is data, the existence of alerting is not, and the tier names are owned by this document. Whether alerts also go out by email is undecided (**OQ-10**).
- **Triggers behaviour:** alert generation (T-44) and dashboard surfacing (**Rules 4.13, 4.14**).
- **Not terminal.**

---

### T-28 · Shipment status

**Stored on:** `shipment.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Tracks a shipment from assembly through dispatch to the closed record that retention obligations attach to.

| Stored value | Display label | Definition |
|---|---|---|
| `draft` | Draft | Being assembled from containers or lots. Contents and destination may still change. |
| `ready` | Ready | Every precondition in **Rule 5.3** is satisfied and documents may be generated: confirmed identification on every record, an active classification decision on every record, no damage determination conflicting with the selected mode, a verified 24-hour emergency number, and recorded destination and transporter details. Falls back to `draft` if a precondition fails again. |
| `documents_issued` | Documents issued | The shipping paper and any required labels have been rendered. Contents are frozen. |
| `dispatched` | Dispatched | The shipment has left the site. |
| `delivered` | Delivered | Receipt confirmed by the receiving facility. |
| `exception` | Exception | Departed and then went wrong — refusal, discrepancy or return. **A refused shipment is not a delivery: Rule 5.26 does not fire**, the records stay `shipped` rather than closing out, and any return movement is a new shipment with its own documents (**EC-47**). |
| `closed` | Closed | The shipment record is complete and under retention. **Terminal.** |
| `cancelled` | Cancelled | Abandoned before dispatch. Any issued documents are marked superseded. **Terminal.** |

**Rules**

- **Single-select.**
- **System-assigned on events**, with dispatch and delivery confirmation entered by P1 or P6.
- **Contents freeze once a shipping paper exists.** Changing a shipment's contents after generation **voids that paper immediately** and returns the shipment to a state requiring regeneration; the voided paper is retained and marked (**Rules 5.13, 5.14**). No render is ever edited (**Rule 5.12**) and a correction is a new render referencing the one it supersedes (**Rule 5.15; EC-44**).
- **Triggers behaviour:** departure creates the shipment ledger entry, closes the storage clocks of the departing contents and moves the records to shipped (**Rule 5.17**); the ledger is retained for the applicable period as jurisdiction data (**Rules 5.18, 12.10, 12.11**); arrival closes the shipment and moves its records to closed out, which is terminal (**Rule 5.26**).
- **`closed` and `cancelled` are terminal.** Shipment records are retained for the full statutory period and are never deleted.
- **`ready` is derived, never set by hand.** It is the state of the precondition set in **Rule 5.3**, recomputed on every content change. A shipment does not sit in `ready` because someone said so.
- **Delivery and closure are two steps.** `delivered` records arrival and moves the contained records to `closed` (**Rule 5.26**); `closed` is the ledger state the retention period attaches to (**Rules 5.18, 12.10, 12.11**).

---

### T-29 · Damage finding type

**Stored on:** `damage_assessment.finding_types` · **Cardinality:** multi-select · **Phase:** B1a (recorded), B2 (model-assisted triage)

**Purpose:** Names each physical condition observed on a battery during inspection, because damage is one of the few things about a battery that is genuinely visible and it changes how the battery must be packaged and moved.

> **Rule 6.4 assigns this document one specific job: splitting cosmetic marks from the damaged-or-defective indicator set.** That split is what triggers the hard air-transport block, and `BUSINESS_RULES.md` states plainly that it "is a taxonomy decision, not a builder's judgment." **The `Class` column below is that decision. It is two-valued. There is no third option, no "it depends," and nothing for a builder to weigh.**

| Stored value | Display label | Definition | Class |
|---|---|---|---|
| `swelling` | Swelling | The casing is deformed outward — a bulged pouch, a distended pack, a lifted cell face. | **Damaged-or-defective** |
| `puncture` | Puncture | The casing is breached or perforated. | **Damaged-or-defective** |
| `leakage` | Leakage | Electrolyte or other internal material is visible outside the casing. | **Damaged-or-defective** |
| `thermal_evidence` | Thermal evidence | Signs of a past thermal event — scorching, discoloration, melted plastic, damaged heat-shrink, charred connectors. | **Damaged-or-defective** |
| `dent` | Dent | Impact deformation of the casing, without a breach. | **Damaged-or-defective** |
| `connector_damage` | Connector damage | Damaged terminals, connectors, cabling or strain relief. | **Damaged-or-defective** |
| `corrosion` | Corrosion | Corrosion on terminals, connectors or the casing, with no breach and no material escaping. | Cosmetic |
| `surface_marking` | Surface marking | Scuffs, scratches, abrasion, soiling, faded printing or non-thermal discoloration. The casing is intact. | Cosmetic |
| `none_observed` | None observed | An inspection was performed and no finding was recorded. | Neither |

**Where the line falls, and why**

- **Damaged-or-defective** covers every finding that either breaches the casing, evidences internal change, or creates a short-circuit path. `dent` is in the set because an impact sufficient to deform a casing is a mechanical insult to the cells inside that **cannot be ruled out by looking** — and because the consequence of a false negative is an air shipment of a compromised pack, which Rule 6.7 exists to make impossible. `connector_damage` is in the set because a battery whose terminals, cabling or strain relief are damaged cannot be safely isolated.
- **Cosmetic** covers findings that are visible but carry no breach and no short-circuit path. Surface corrosion is extremely common on lead-acid packs and on anything stored in humidity, and on its own indicates neither. **Corrosion accompanied by a breach is not cosmetic** — in that case `leakage` or `puncture` is also present and the flag fires through those, which is why `corrosion` does not need to carry the set on its own.
- **`surface_marking` exists so that a scuff has somewhere to go.** Without it a handler records `dent` for a scratch, and the record is needlessly quarantined and blocked from air.

**Rules**

- **Multi-select.** A battery can carry several findings and all of them are recorded.
- **`none_observed` is exclusive** — it never appears alongside another finding. It is a positive statement that an inspection happened, which is materially different from no assessment existing at all. A record with no `damage_assessment` row has not been inspected; a record with `none_observed` has.
- **Every battery record carries a damage assessment**; a record with none is incomplete and cannot be added to a shipment (**Rule 6.1**).
- **Recorded by P1, P2 or P6** at intake or at a scheduled inspection. **A model may propose indicators; a model never sets them** (**Rules 6.2, 6.6**) — no damage assessment is ever produced without human confirmation, regardless of the confidence of any visual proposal. Governed by **Rules 6.1–6.6** and, for the B2 triage step, **Rule 10.1** (stub).
- **Confirming any finding in the damaged-or-defective class sets the `damaged` flag (T-30) automatically.** No judgment step sits between the two. A builder implementing this reads the `Class` column and nothing else (**Rule 6.4**).
- **Confirming a cosmetic finding never sets a flag, on its own or in combination.** Two cosmetic findings are still cosmetic. Cosmetic findings feed the record and the B2 hazard factors (T-34) and nothing else.
- **No finding is terminal, and that is deliberate.** An earlier draft of this document called four of them terminal; **Rule 6.11 overrides that.** The only way an assessment changes is a **new** damage assessment, entered by a human, finding no damaged-or-defective indicator present, carrying a stated reason and **at least one supporting photograph**. The block clears because the record's assessed condition changed — never because someone chose to proceed. It is not restricted to P6: any role that may record an assessment may record a corrected one, honestly.
- **Both assessments stay permanently visible**, with author, timestamp, indicators and evidence, on the record and in every export (**Rule 6.12**). A reversed damage finding is exactly what an auditor will want to look at, and the system makes that easy rather than hard. **The system makes the reversal easy to do honestly and impossible to do quietly** (**EC-40**).
- **Triggers behaviour:** the damaged-or-defective determination and the air-transport prohibition (**Rules 6.4, 6.7**), quarantine placement and container segregation (**Rules 6.17, 4.28**), packaging class and marking (**Rules 6.15, 6.16**), re-classification — because the damage assessment is a classification input (**Rules 3.4, 3.15, 6.20; EC-42**) — and hazard factors at B2 (**Rule 10.4**, stub). Every change writes an `audit_event` carrying the before state, the after state, the stated reason, the actor and the evidence reference (**Rule 6.21**).
- **Findings are append-only.** A later inspection writes a new `damage_assessment` row; it never edits the earlier one. The inspection history is the evidence.

---

### T-30 · DDR flag

**Stored on:** `battery_record.ddr_flags` · **Cardinality:** multi-select; empty set is valid · **Phase:** B1a

**Purpose:** Records that a battery is damaged, defective or recalled, because that determination changes the packaging, the required marking, and — decisively — removes air transport as an option.

| Stored value | Display label | Definition |
|---|---|---|
| `damaged` | Damaged | At least one finding in T-29's **damaged-or-defective** class is confirmed present on the record. Set automatically from the confirmed assessment — never by separate judgment. |
| `defective` | Defective | The battery is functionally defective — it fails to perform as intended — regardless of whether any visible finding is present. Recorded by a human; there is no visible indicator that sets it. |
| `recalled` | Recalled | An active recall association exists for this battery (T-35). |

**Rules**

- **Multi-select. An empty set is the normal state** and means the battery is on the ordinary path. There is no `none` value — an empty set is the absence, and modelling it as a value invites `['none','damaged']` nonsense.
- **Any non-empty set puts the record on the DDR path**, which means: the heavier outer packaging class and marking carried by the rule version (**Rule 6.15**), the damaged/defective packet whose absence blocks departure (**Rule 6.16**), routing to a segregated quarantine container as a required action — the record cannot remain in general stock (**Rule 6.17**) — and **air transport hard-blocked** (**Rules 6.7, 6.8, 6.13**). Governed by **Rule 6.4**.
- **The marking text and its minimum size are `jurisdiction_rule` data**, applied by the label template. They are not constants in code and not values here.
- **`damaged` is derived, never entered.** It is set automatically the moment a damage assessment confirming a damaged-or-defective finding is recorded (T-29, **Rule 6.4**), and it clears only when a superseding assessment finds no such indicator present (**Rule 6.11**). There is no control that sets or clears this flag directly.
- **Not terminal — corrected by supersession only.** An earlier draft called these flags terminal; **Rule 6.11 is the governing rule and it provides exactly one clearing path**: a new human assessment finding no damaged-or-defective indicator, with a stated reason and at least one supporting photograph. There is no override, no acknowledge-and-proceed, no supervisor approval and no bulk operation (**Rules 6.8, 6.10; EC-38**). Both assessments remain permanently visible (**Rule 6.12**).
- **`recalled` does not clear through Rule 6.11.** A damage re-assessment says nothing about a recall. It clears only when the underlying recall association is withdrawn, recorded with its own reason and `audit_event`. In B1a a recall association is entered by a human (**Rule 6.5**); automated matching arrives at B2 (**Rule 10.7**) and does not change this rule's effect.
- **`defective` is human-recorded** and clears the same way `damaged` does — by a superseding assessment, never by a control that toggles it.
- **Triggers behaviour:** waste classification basis `damage_state` and re-classification (**Rules 3.4, 3.15**), packaging and marking (**Rules 6.15, 6.16**), the air prohibition and quarantine (**Rules 6.7, 6.17**), the bar on grading a record as suitable for reuse or resale (**Rule 6.22**), and hazard factors at B2 (**Rule 10.4**, stub). **Damage never stops a storage clock** — there is no clock relief for damage (**Rule 6.19**).

---

### T-31 · Condition grade

**Stored on:** `grade.grade_value` · **Cardinality:** single-select per grade row · **Phase:** B2

**Purpose:** Expresses BMMP's published judgment of what a battery's assessed condition makes it suitable for, on a scheme BMMP defines and publishes.

> **There is no national or international grading standard for used batteries.** As of July 2026 no ANSI, UL or IEC letter-grade standard exists. The nearest process standard governs repurposing facilities rather than grades, the relevant international standard explicitly declines to define grades, and its successor is unpublished. **BMMP's A/B/C/reject scheme is a scheme BMMP is creating, not one it is adopting.** **Rule 10.6** makes this binding: the product must never claim conformance to a standard that does not exist, and must state plainly wherever a grade is shown or exported that the scheme is BMMP's own and where its criteria are published. Any claim that BMMP "follows a grading standard" is false and must never appear in UI copy, exports, marketing or a PDF. What BMMP publishes is a transparent, versioned, documented scheme with a stated basis for every grade issued.

| Stored value | Display label | Definition |
|---|---|---|
| `a` | Grade A | Assessed condition supports reuse in the original application. |
| `b` | Grade B | Assessed condition supports second-life use in a lower-demand application, but not the original one. |
| `c` | Grade C | Not suitable for reuse. Routed to material recovery. |
| `reject` | Reject | Cannot be graded, or cannot be handled on the ordinary path. Includes batteries whose condition or DDR flags remove them from consideration and batteries with insufficient assessment data to grade. |
| `ungraded` | Not graded | No grade has been issued for this record. |

**Rules**

- **Single-select per grade row**, and **a grade row is immutable once published.** Re-grading writes a **new** row with a new scheme version and a new as-of date. Grades are append-only; the grade that informed a sale or a routing decision must remain readable exactly as it was issued.
- **Every published grade carries three things or it is not published:** the scheme version identifier (`bmmp-grade-v1`), the as-of date, and the stated basis — the inputs and the assessment that produced it. A grade without its basis is not a BMMP grade. See RN-3.
- **"Assessed condition," never "measured condition."** BMMP integrates third-party health testers via the interface hook built at B3; it does not measure battery health itself. **Rules 2.27 and 11.5** keep the two apart: measured condition is stored, labelled and exported separately from assessed condition, is never merged into it and never silently replaces it (`_ANCHORS.md` §7.5, Roadmap Principle 7). Grade copy that says "measured" is a defect.
- **System-produced, human-confirmed.** The grading step consumes damage triage, recall match and hazard ranking, all three of which run independently first and are reassembled (`_ANCHORS.md` §6). A human gate sits at the end. No grade auto-publishes.
- **Triggers behaviour:** disposition routing (T-32) and the reuse-versus-recycle recommendation (**Rule 10.1**, stub). **Rule 6.22 binds this system in advance and is in force now:** a record with an unresolved damaged-or-defective determination can never be graded or marked as suitable for reuse or resale.
- **`reject` is not terminal for the record** — a rejected battery still moves, still ships, still needs documents. It is terminal for the reuse path only.
- **Single-character stored values are permitted here and nowhere else** in this taxonomy, because the letter *is* the published scheme's external identifier and must survive into exports and third-party references unchanged. See §4.4.

---

### T-32 · Disposition route

**Stored on:** `battery_record.disposition_route` · **Cardinality:** single-select · **Phase:** B2

**Purpose:** Records where a battery is being sent, which is the operational consequence of its grade and the economics of its chemistry.

| Stored value | Display label | Definition |
|---|---|---|
| `pending` | Pending | No disposition decided. |
| `reuse` | Reuse | Returning to service in its original application. |
| `repurpose` | Repurpose | Second-life use in a different, lower-demand application. |
| `material_recovery` | Material recovery | Sent for material recovery. |
| `disposal` | Disposal | Sent for disposal. |
| `return_to_producer` | Return to producer | Returned under a producer take-back obligation. |

**Rules**

- **Single-select.**
- **Recommended by the reuse-versus-recycle engine, chosen by P1 or P6.** The engine implements the published decision rule — achievable resale value against recovery or disposal cost, by chemistry, assessed condition and target application. **The recommendation is not the decision**, and the engine's output is recorded alongside whichever route the human picked, including when they differ.
- **The economics are data, not code.** Prices, gate fees and recovery values move; some chemistries currently cost money to dispose of rather than earning value. Those figures are configuration and reference data, never constants.
- **Triggers behaviour:** shipment destination selection (**Rules 5.2, 3.23** — the destination must be a distinct receiving party) and producer take-back tracking at B1b (**Rule 8.1**, stub). **A record with an unresolved damaged-or-defective determination cannot be routed to `reuse` or `repurpose`** (**Rule 6.22**).
- **Not terminal until the record reaches `closed`** (T-22), after which the route is frozen with the record.

---

### T-33 · Hazard ranking band

**Stored on:** `hazard_ranking.band` · **Cardinality:** single-select per ranking row · **Phase:** B2

**Purpose:** Places a battery record in a **relative** band against a stated comparison set, so a facility manager can see what to look at first.

> **This system is never a probability.** Per `_ANCHORS.md` §7.1, `PROJECT_SETUP_BMMP.md` §8.3 and Roadmap Principle 4: a hazard band is **a relative ranking with a stated basis per factor**. It is never a probability, a percentage, a likelihood, a "risk of fire," a "chance of ignition," a score out of ten, or any number that reads as a rate. **This applies to UI copy, API responses, exports, PDFs, tooltips, empty states, alert text and column headers.** It is legal exposure, not word choice. No evidence base exists for predicting an individual cell's thermal runaway and BMMP does not claim one. **Rules 1.25, 10.3 and 10.5** make the prohibition binding on every phase, including work built before section 10 is specified: a builder in B1a asked for a "risk score" builds nothing and raises it. **It is not waivable by any role, any customer request or any commercial pressure** — a customer asking for a "fire risk percentage" for their insurer is declined and offered the relative ranking with its per-factor basis instead (**EC-55**).

| Stored value | Display label | Definition |
|---|---|---|
| `band_1` | Band 1 — highest relative ranking in set | Ranked highest within the stated comparison set on the recorded factors. |
| `band_2` | Band 2 | Ranked above the middle of the comparison set. |
| `band_3` | Band 3 | Ranked below the middle of the comparison set. |
| `band_4` | Band 4 — lowest relative ranking in set | Ranked lowest within the stated comparison set on the recorded factors. |
| `not_ranked` | Not ranked | Insufficient recorded factors to place this record in the comparison set. |

**Rules**

- **Single-select per ranking row.**
- **A band is meaningless without its comparison set and its as-of date.** Every `hazard_ranking` row records the set it was computed against — a container, a lot, a site — and when. **A band must never be exported, displayed or transmitted without both.** "Band 1" alone is not information.
- **Bands are relative within a set, not absolute across the product.** Band 1 in a container of undamaged consumer cells is not comparable to Band 1 in a container of swollen traction modules, and the UI must not invite that comparison.
- **Prohibited presentation, explicitly:** no percentage, no probability, no 0–100 score, no colour-only encoding that reads as a traffic light without the band label, no adjective that implies likelihood ("moderate risk", "high chance"). Prohibited in every surface including PDF exports and the evidence pack.
- **Every band carries its factors.** A ranking row without at least one factor code (T-34) and its stated basis is invalid.
- **System-produced.** No role assigns a band by hand, including P6. Governed by **Rules 10.3 and 10.4** — **Rule 10.4** fixes the only permitted output shape: a relative ranking of items against each other with a stated basis per contributing factor, in comparative language ("higher than," "ranked above"), never probabilistic.
- **Append-only.** A re-ranking writes a new row. Rankings are never mutated. See RN-4 on band count.

---

### T-34 · Hazard factor code

**Stored on:** `hazard_ranking.factor_codes` · **Cardinality:** multi-select, minimum one · **Phase:** B2

**Purpose:** Names each factor that contributed to a hazard ranking, so every band can be read back to the evidence that produced it.

| Stored value | Display label | Definition |
|---|---|---|
| `state_of_charge_at_intake` | Charge level at intake | The charge band recorded at intake (T-21). |
| `chemistry` | Chemistry | The confirmed chemistry (T-01). |
| `damage_indicators` | Damage indicators | Recorded damage findings (T-29) and DDR flags (T-30). |
| `age_from_date_code` | Age from date code | Age derived from the decoded manufacture date code. |
| `recall_status` | Recall status | Recall match status for the record (T-35). |
| `certification_marks` | Certification marks | Presence or absence of certification marks read from the label. |
| `storage_aggregation` | Storage aggregation | How much comparable material is accumulated together, and how it is separated. |

**Rules**

- **Multi-select, minimum one.** A ranking row with no factors is invalid.
- **Every factor carries a stated basis** — the recorded evidence for that factor on that record, at that time. The basis is what makes the ranking defensible; a factor code with no basis is not acceptable output.
- **All factors are paperwork-level.** Nothing in this system requires a sensor, and nothing in it is presented as a measurement of battery health. The whole system is derived from data the compliance workflow already captures.
- **A factor that has no recorded evidence is omitted, not defaulted.** A record with no charge reading (T-21 `not_captured`) simply does not carry that factor — it is never scored as if it were zero, low, or safe.
- **System-assigned.** Governed by **Rule 10.4**, which requires that a user be able to read why one item ranks above another factor by factor — what the factor is, what value this record has for it, and where that value came from.
- **Append-only**, written with the ranking row.

---

### T-35 · Recall match status

**Stored on:** `recall_match.status` · **Cardinality:** single-select · **Phase:** B2

**Purpose:** Records whether a battery record matches a published recall, because a recall match carries immediate liability consequences for the holder.

| Stored value | Display label | Definition |
|---|---|---|
| `not_checked` | Not checked | No recall check has been run for this record. |
| `no_match` | No match | A check ran against the available sources and returned no match. |
| `possible_match` | Possible match — needs review | A candidate match was returned that is not conclusive. Requires human adjudication. |
| `confirmed_match` | Confirmed match | A human has confirmed the record matches a published recall. |
| `dismissed` | Dismissed | A possible match was reviewed and rejected, with a stated reason. |

**Rules**

- **Single-select.**
- **`possible_match` requires human adjudication by P1 or P6.** It never resolves itself, never auto-promotes to `confirmed_match`, and never auto-dismisses on a timer. It sits in the review path until a human decides. Governed by **Rule 10.7**: recall matching produces an *advisory* association confirmed by a human — with one exception, that a confirmed association triggers the section 6 handling class immediately, because that direction is the safe one.
- **`confirmed_match` sets the `recalled` DDR flag (T-30).** This is the only automatic write into T-30. A recalled record is handled in the same class as a damaged or defective one for transport and segregation (**Rule 6.5**), moves to quarantine, triggers a re-classification check, and makes air unavailable on any shipment containing it (**EC-41**).
- **`dismissed` requires a stated reason** recorded on the match row, is attributable to the human who dismissed it, and never deletes the original — both the match and its dismissal stay permanently visible on the record and in every export (**Rule 6.24**). P5 may never dismiss one.
- **Matching requires provenance.** Records with T-11 `unknown_provenance` or `bulk_consignment` stay at `not_checked` — there is nothing to match against, and that is a recorded fact rather than a failure.
- **Append-only.** Each check writes a `recall_match` row. Re-checking a record does not overwrite the previous result; recall data changes over time and the history is the evidence.

---

### T-36 · Recall source

**Stored on:** `recall_match.source` · **Cardinality:** single-select · **Phase:** B2

**Purpose:** Names where a recall match came from, because sources differ in coverage, authority and refresh cadence.

| Stored value | Display label | Definition |
|---|---|---|
| `consumer_product_agency` | Consumer product recall database | The federal consumer product recall source. Free, unauthenticated, covers consumer goods. |
| `vehicle_safety_agency` | Vehicle safety recall database | The federal vehicle safety recall source, matched on vehicle identification. |
| `manufacturer_notice` | Manufacturer notice | A recall or service notice issued directly by the manufacturer and recorded by a human — P1, P2 or P6 (**Rule 6.23**). |
| `manual_entry` | Manual entry | A recall recorded by a human from a source outside the integrated feeds, with the originating source cited on the row. |

**Rules**

- **Single-select per match row.** A record matched by two sources produces two rows.
- **Source endpoints and credentials are environment configuration**, never constants in code.
- **`manufacturer_notice` and `manual_entry` require the originating notice or database entry recorded on the row**, together with the actor and the timestamp (**Rule 6.23**). In B1a a recall association is entered by a human (**Rule 6.5**); automated matching is B2 (**Rule 10.7**).
- **Entry is not restricted to P6.** v1.1 tightened these two sources to P6 with no rule behind them; **Rule 6.23 relaxed that deliberately** rather than ratifying it — **P1, P2 or P6 may record a recall association**, because the handler at the facility is who receives a manufacturer's notice and the effect of recording one is to *increase* handling restrictions, which is the safe direction to let people move in quickly. **P5 may never record one.** *(RN-10, resolved.)*
- **Removing an association is held to a stricter bar than adding one.** Dismissal requires a stated reason, is attributable, never deletes the original, and leaves both the association and its dismissal permanently visible (**Rule 6.24**). Air transport does not reopen until the damage assessment *and* every recall association are clear — **clearing a recall flag is not a route around Rule 6.7**.
- **Not terminal.** Sources are re-queried on a cadence and each query writes its own row.

---

### T-37 · Role

**Stored on:** `membership.role` · **Cardinality:** single-select per membership · **Phase:** B1a

**Purpose:** Names what a person is permitted to do inside an organisation, and is the single vocabulary every permission check in the product reads from.

| Persona | Stored value | Display label | Definition | Phase |
|---|---|---|---|---|
| P1 | `compliance_handler` | Compliance Handler | The daily user. Logs batteries, photographs labels, confirms identification, builds shipments, prints shipping papers and container labels. | B1a |
| P2 | `facility_manager` | Facility Manager | Owns the storage area. Watches storage clocks and stored volume against fire-code thresholds. Manages members and organisation settings. | B1a |
| P3 | `producer_compliance_officer` | Producer Compliance Officer | Registers the company with state agencies, files annual sales reports, tracks dated obligations across states. | B1b |
| P4 | `mobility_supplier_technician` | Mobility Supplier Technician | Swaps a wheelchair or scooter battery on site and needs disposal documentation for the old pack. | B3 |
| P5 | `auditor` | Auditor / Underwriter | External and **read-only**. Reads the evidence pack at renewal or audit. Never edits anything. | B1b |
| P6 | `platform_admin` | Platform Admin | Next Sketch / Jonathan side. Manages tenants, the battery catalog, and jurisdiction rules data. The only cross-tenant role. | B1a |

**Rules**

- **Single-select per membership, not per user.** Role lives on `membership`, which binds a user to an organisation. **One person can hold different roles in different organisations**, the roles do not combine and do not leak between organisations, and the permission check must always resolve role in the context of the active organisation (**Rules 1.4, 1.5, 1.22; EC-2**). A user acts in exactly one organisation at a time and switching is an explicit, recorded act (**Rule 1.3**). A `user.role` column is a defect.
- **Persona IDs are documentation identifiers and are never stored.** `P1` never appears as a stored value, an enum member, a URL parameter, a CSS class or an API field. The mapping above exists so `_ANCHORS.md` §2, the PRD, the UX Spec and this document can refer to the same person — nothing more. **Rule 1.6** states the split exactly: `BUSINESS_RULES.md` states permissions by persona ID, `TAXONOMY.md` owns the stored values, and a role value that maps to no persona is a taxonomy defect rather than permission to invent behaviour. **An agent that stores `"P1"` has misread this table.**
- **Assigned by P2 or P6** at `/settings/users` (**Rule 1.10**), and no user may change their own role (**Rule 1.11**). P6 is a platform-scope role holding no tenant membership by default (**Rule 1.17**). An organisation must always retain at least one member with binding authority, and an action that would remove the last one is blocked (**Rules 1.11, 1.12; EC-1, OQ-6**). Members are deactivated, never deleted, and their name stays attached to every record and audit event they created (**Rule 1.13; EC-6**).
- **P5 is read-only, structurally.** Enforced at the data layer, not by hiding buttons (**Rules 1.2, 1.14**), and every denied write is surfaced with a stated reason *and written to the audit log as an event* (**Rules 1.16, 12.6**). Every P5 grant carries a scope and an expiry; a grant without an expiry cannot be created, and expiry ends access immediately including inside an open session (**Rules 1.15, 1.28; EC-3**). Whether B1a ships a working P5 login or only the enforcement and export is **OQ-4**.
- **P4 and P5 roles exist in the vocabulary at B1a** even though their surfaces arrive later, so that a later phase adds screens rather than migrating role values.
- **Triggers behaviour:** every access decision in the product (**Rules 1.1–1.6, 1.10**); route access per **Rule 1.27** and the fixed page list in `_ANCHORS.md` §5 — access to a page never implies permission to act on it. Every denial states its reason and names the governing rule; a silently disabled control is a defect (**Rule 1.26**).
- **Not terminal.** A role change writes an `audit_event` (**Rule 12.1**) and takes effect on the next request, because access is re-checked on every request rather than only at sign-in (**Rule 1.28**) — never retroactively on records already created.

---

### T-38 · Document type

**Stored on:** `document_render.document_type` · **Cardinality:** single-select · **Phase:** per row

**Purpose:** Names each kind of document the product generates, because document type determines the template, the required content, the retention period and who may see it.

| Stored value | Display label | Definition | Phase |
|---|---|---|---|
| `shipping_paper` | Shipping paper | The transport document that travels with a shipment, carrying the basic description, emergency response information and a 24-hour emergency contact number. The highest-frequency document in the product. | B1a |
| `container_label` | Container label | The label applied to an accumulation container, carrying the required regulatory phrase, chemistry, accumulation start date and handler identifier, linked back to the container record. | B1a |
| `ddr_packet` | Damaged / defective packet | The determination and packaging documentation for a battery carrying a DDR flag. | B1a |
| `shipment_record` | Shipment record | The retained record of a completed shipment, held for the statutory retention period. | B1a |
| `audit_export` | Audit export | A filtered, exportable extract of the audit log. | B1a |
| `training_record` | Training record | Employee training documentation on its recurrent cycle. | B1a |
| `evidence_pack` | Evidence pack | The underwriter-facing export assembling inspection logs, thermal scans, training records, emergency response plan and quantity and segregation reports for a renewal or audit. | B1b |
| `filing_packet` | Filing packet | A producer registration filing packet formatted for a specific state agency. | B1b |
| `annual_report` | Annual report | An annual sales or units-placed-on-market report, mapped from one canonical dataset into a specific state's schema. | B1b |
| `air_travel_packet` | Air travel packet | The document set for a person travelling by air with their own mobility device battery — the information set, the energy calculation against the applicable limit, transport certification confirmation and the correct labels. | B3 |

**Rules**

- **Single-select per render.**
- **Templates, required content and every regulatory string are `jurisdiction_rule` and template data**, resolved against the active `rule_version` at render time. **No document text is a literal in application code** — including required phrases, marking wording and minimum sizes (**Rules 1.23, 4.18, 5.5, 6.15**). Label and mark artwork is governed by a versioned artwork rule, and the version applied is the one in force **on the print date**, not the shipment creation date (**Rules 5.21, 5.22; EC-45**). Marking requirements change on published schedules; a literal makes that a code release.
- **Every render records the `rule_version` that produced it** (**Rules 12.15, 12.16**). This is what makes a document reproducible years later and what stops a re-render under new rules from silently altering an issued document — an auditor asking why a record was classified as it was in March 2027 is answered by reading the stored rule version, not by reconstruction (**EC-50**).
- **`air_travel_packet` is a personal-travel document and does not relax the DDR air prohibition** (T-18, T-30). **Rule 11.3** is explicit: a damaged mobility pack is hard-blocked from air transport exactly like any other damaged battery, **including when it is fitted to a device a passenger is travelling with**. The energy calculation against a carry-on or baggage allowance reads its limit from the rule version as data (**Rule 11.4**). The two must not be conflated in code or copy.
- **Generated by P1 or P6**, except `evidence_pack` (P2 or P6) and `filing_packet` / `annual_report` (P3 or P6, whose surfaces are stubs until Gate 2 — **Rules 8.5, 11.1**). **Rule 5.27** governs read access: any member may view, print and download any document their role permits them to see, and **P5 may view and download within an active grant's scope and may generate nothing**. Exports are scoped to what the requester could open individually (**Rule 12.17**).
- **Triggers behaviour:** retention clocks per type, each starting on its class's governing date (**Rules 12.10, 12.11**); shipment readiness (**Rule 5.3**); and the container-labelling block, since an unlabelled or mislabelled container cannot join a shipment (**Rules 4.19, 4.21, 4.22**). Every export is itself an audited act recording who exported what, when, in what scope and in what format (**Rule 12.18**).

---

### T-39 · Document render status

**Stored on:** `document_render.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records whether a generated document is a draft, the live version, or one that has been replaced — because compliance documents are evidence and must never be edited in place.

| Stored value | Display label | Definition |
|---|---|---|
| `draft` | Draft | Rendered for preview. Not issued, not valid, and watermarked as such. |
| `issued` | Issued | The live, valid version of this document. |
| `superseded` | Superseded | Replaced by a later render. Retained in full, with a pointer to the render that replaced it. |
| `voided` | Voided | Issued in error and withdrawn. Retained in full with a stated reason. **Terminal.** |

**Rules**

- **Single-select.**
- **An issued document is immutable.** There is no edit path. A correction renders a **new** document that supersedes the previous one, and both are retained. An agent that regenerates a PDF over an existing render has destroyed evidence. Governed by **Rules 5.12, 5.15 and 12.14**.
- **Superseding is explicit and linked** (**Rule 5.15**). A superseded render always points to its replacement and is clearly marked as no longer valid, so the chain from the current document back to the original is readable.
- **`voided` is terminal.** A voided document is retained in full, marked void, with the reason and the actor recorded, and appears in audit and evidence exports (**Rule 5.14**). It is never reissued; a replacement is a new render.
- **Documents are never deleted**, by any role including P6, for the full retention period (**Rule 12.12**).
- **`draft` is governed by Rule 5.28.** A draft render is watermarked as not valid, never counts as satisfying any documentation obligation, may never accompany a shipment or be applied to a container, and closes no precondition in **Rule 5.3**. Issuing is a separate deliberate act. A draft is still immutable as a render — a changed draft is a new draft, not an edited one. `BUSINESS_RULES.md` adopted this four-value set at v1.1.
- **Triggers behaviour:** shipment content freezing and the void-on-change rule (**Rule 5.13**), retention (**Rules 12.12, 12.14**).

### T-40 · Jurisdiction identifier

**Stored on:** `jurisdiction.code`, `jurisdiction.level` · **Cardinality:** single-select for level; code is a formatted identifier · **Phase:** B1a

**Purpose:** Gives every jurisdiction a stable identifier and level, so rules can be attached to the right authority and resolved in the right order.

**Level values**

| Stored value | Display label | Definition |
|---|---|---|
| `federal` | Federal | A national-level authority. |
| `state` | State / territory | A state, territory or the District of Columbia. |
| `local` | Local | A county, city or fire district with its own adopted rules or amendments. |

**Code format**

| Level | Format | Example |
|---|---|---|
| `federal` | Country code | `US` |
| `state` | Country code, hyphen, subdivision code | `US-WA`, `US-CA`, `US-CO`, `US-DC` |
| `local` | State code, hyphen, lower-case slug | `US-NY-nyc` |

**Rules**

- **The set of jurisdiction rows is data, not taxonomy.** This document fixes the **level vocabulary and the code format**. It does **not** enumerate which jurisdictions exist, and it enumerates no state's thresholds, deadlines or citations anywhere. Those are rows in `jurisdiction` and `jurisdiction_rule`, maintained by P6. Examples above are format illustrations only.
- **Resolution order is `local` → `state` → `federal`**, most specific first, and the resolved answer records which level supplied it.
- **The governing jurisdiction is the jurisdiction of the *site* where the battery is held** — not the organisation's headquarters, not the billing address, not the destination. An organisation with sites in two states classifies the same battery two different ways, correctly (**Rule 3.5**). A battery moved between two of its own sites in different states re-classifies under the receiving site's jurisdiction, and the move is itself a shipment needing its own shipping paper (**EC-17**).
- **The governing *date* differs by rule and is named by the rule that needs it** (**Rule 12.20**): intake date for classification (**Rule 3.6**), accumulation start date for the storage clock (**Rule 4.5**), print date for artwork (**Rule 5.21**), shipment date for packaging exceptions (**Rule 5.19**).
- **A site with no jurisdiction profile blocks classification rather than defaulting it** (**Rules 3.10; EC-16**).
- **A jurisdiction code is never parsed for meaning in code.** Do not infer a state from a substring, and do not branch on a specific code — branching on `US-CA` is a hard-coded jurisdiction rule wearing a disguise, and it is a review rejection under **Rule 1.23** and **`PROJECT_SETUP_BMMP.md` §8.1**. A builder who needs a threshold and finds no rule holding it adds the rule as data with its version and citation, or raises a decision-log entry — they do not write the number (**EC-54**).
- **Codes are stable and never reused.** A jurisdiction that ceases to be relevant is deactivated, not deleted.
- **Assigned by P6 only.**

---

### T-41 · Jurisdiction rule domain

**Stored on:** `jurisdiction_rule.domain` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Names what area of the product a jurisdiction rule governs, so rule lookups fetch the right rule set without string-matching on rule names.

| Stored value | Display label | Definition |
|---|---|---|
| `waste_classification` | Waste classification | Which stream a chemistry and condition fall into in this jurisdiction (T-13, T-14). |
| `transport` | Transport | Transport identifier assignment, packing group, packaging exceptions, mode restrictions (T-17 – T-20). |
| `storage_accumulation` | Storage and accumulation | Accumulation period length, container fill limits, alert configuration (T-24, T-26). |
| `fire_code` | Fire code | Stored quantity thresholds, separation and clearance rules, and which code edition applies at a site. |
| `handler_obligations` | Handler obligations | Handler size thresholds and latch behaviour, permitted and prohibited activities (T-15, T-16). |
| `format_threshold` | Format thresholds | Weight and energy thresholds that assign a format category (T-06). |
| `producer_obligation` | Producer obligations | Registration, membership, reporting and dated obligations (B1b). |
| `labeling_marking` | Labeling and marking | Required label content, marking text and marking size, and their dated schedules. |
| `training` | Training | Training requirements and their recurrence. |
| `retention` | Retention | How long each record and document type must be retained. |

**Rules**

- **Single-select per rule row.**
- **This vocabulary is closed and is the lookup key.** Rule resolution fetches by `(jurisdiction, domain, active rule_version)`. Code never searches rules by name or free text.
- **Assigned by P6 only**, as part of rules maintenance.
- **Fire code and storage rules vary by measure, not just by number.** Some jurisdictions measure stored batteries by volume and others by energy. The measure is part of the rule data. Assuming one measure is a multi-jurisdiction defect.
- **Not terminal.** A rule's domain is fixed at creation; a rule that belongs in a different domain is superseded by a new rule, not re-domained.

---

### T-42 · Rule version status

**Stored on:** `rule_version.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Tracks which version of a jurisdiction's rule set is in force, so a document can always be read back against the rules that produced it.

| Stored value | Display label | Definition |
|---|---|---|
| `draft` | Draft | Being prepared. Never used to resolve a rule or produce a document. |
| `scheduled` | Scheduled | Approved, with a future effective date. Visible for planning; not yet in force. |
| `active` | Active | In force. The version rule resolution uses today. |
| `superseded` | Superseded | Replaced by a later version. Retained permanently — documents produced under it must remain reproducible. |
| `withdrawn` | Withdrawn | Published in error and pulled. Retained, and flagged so anything produced under it can be found. **Terminal.** |

**Rules**

- **Single-select.** Exactly one `active` version per `(jurisdiction, domain)` at any moment.
- **Version identifier format:** `<jurisdiction_code>:<domain>:<effective_date>` — for example `US-WA:producer_obligation:2026-01-16`. Lower-case, colon-separated, ISO date. The identifier is opaque to code: it is stored and displayed, never parsed to make a decision.
- **Rule versions are never deleted or edited.** A change is a new version. This is what makes an issued document reproducible years later and what handles the reality that code editions lag their referenced standards by twelve to twenty-four months across jurisdictions.
- **Every derived classification and every document render stores the `rule_version` it used.** Re-deriving under a new version writes new rows and supersedes documents; it never rewrites old ones. This rule is load-bearing across T-06, T-13, T-17, T-19, T-20 and T-38.
- **Assigned by P6 only.** A rule version is never edited in place — a change produces a new version with its own effective window and the prior version is retained because decisions reference it (**Rule 12.22**) — and version history is readable to P6 and to anyone who can read a decision citing it, including P5 within scope (**Rule 12.23**). A rule discovered to have been entered wrongly is **superseded with a corrected version, not edited**; affected open records are flagged, departed shipments keep the decision that governed them, and the error stays visible (**EC-53**). Effects: **Rules 3.6, 3.16, 3.17** (which version governs, no retroactive re-classification of a departed shipment, and the mandatory re-evaluation flag with a single notification to P2 rather than one per record — **EC-18**), **Rule 4.5** (storage), **Rules 5.19, 5.21** (packaging exceptions and artwork), **Rule 12.15** (every decision records its version).
- **`withdrawn` is terminal.**

---

### T-43 · Audit event type

**Stored on:** `audit_event.event_type` · **Cardinality:** single-select per event · **Phase:** B1a

**Purpose:** Names what happened, in a stable vocabulary, so the audit log is queryable rather than a pile of prose.

**Format:** `<namespace>.<past_tense_verb>` — lower `snake_case` on both sides of a single dot. The namespace is a `_ANCHORS.md` §3 entity name, with exactly three cross-cutting exceptions that are not entities and are named here so no fourth is invented: `override`, `export` and `denial`.

| Stored value | Display label | Definition |
|---|---|---|
| `intake_session.started` | Intake started | An intake session was opened. |
| `intake_photo.captured` | Photo captured | A photo was captured and its data-use eligibility stamped (T-12). |
| `label_extraction.completed` | Label read | The extraction pipeline returned per-field values and confidence bands. |
| `catalog_entry.matched` | Catalog matched | A catalog entry was proposed for a record. |
| `battery_record.routed_to_review` | Routed to review | A gated field below band placed the record in the review queue. |
| `battery_record.confirmed` | Identification confirmed | A human confirmed identification, including chemistry. |
| `battery_record.status_changed` | Record status changed | The record moved between values of T-22. |
| `classification_decision.recorded` | Waste classification recorded | A classification decision and its basis codes were written. |
| `damage_assessment.recorded` | Damage assessment recorded | An inspection wrote findings. |
| `battery_record.ddr_flag_set` | DDR flag set | A DDR flag was set on a record. |
| `container.status_changed` | Container status changed | The container moved between values of T-24. |
| `storage_event.recorded` | Storage event recorded | A handling activity was recorded against stored material. |
| `storage_clock.status_changed` | Storage clock changed | A clock started, entered a band, expired or stopped. |
| `shipment.status_changed` | Shipment status changed | The shipment moved between values of T-28. |
| `document_render.issued` | Document issued | A document was rendered and issued. |
| `document_render.superseded` | Document superseded | An issued document was replaced. |
| `document.render_failed` | Document render failed | A render could not complete, so no `document_render` row exists. The event carries the full input snapshot, the error code and the correlation id, which is what makes a failed render as auditable as a successful one (`TECHNICAL_SPEC.md` §10.4). |
| `document.viewed` | Document viewed | An issued document's stored bytes were streamed to a reader. |
| `document.reprinted` | Document reprinted | An issued document's stored bytes were streamed again for print. **A reprint never re-renders** — the bytes are the ones that were issued (`TECHNICAL_SPEC.md` §8.4). |
| `membership.role_changed` | Role changed | A member's role was changed. |
| `jurisdiction_rule.version_activated` | Rule version activated | A rule version became active for a jurisdiction and domain. |
| `override.recorded` | Override recorded | A P6 override was applied, with its stated reason. |
| `denial.recorded` | Action denied | An action was blocked or denied — a blocked air-transport selection, a rejected P5 write, a prohibited-activity attempt, a permission denial. Required by **Rule 12.6**: attempted actions are evidence. |
| `export.generated` | Export generated | An audit or data export was produced, with its scope and format (**Rule 12.18**). |

**Rules**

- **Single-select per event.** The vocabulary above is the B1a set. **Additions follow the format and are added here first** — an agent that invents `batteryUpdated` or `BATTERY_RECORD_UPDATE` has broken the log.
- **Every state change in the system writes an event** — creation, update, supersession, void, status transition, permission change, document generation, export, sign-in, grant and denial (**Rule 12.1**). Every step of the identification pipeline writes one, including steps that produce nothing and steps that fail (**Rules 2.4, 12.5**), and automated steps write events exactly as human actions do, identified as the step that ran and carrying the model or rule version used (**Rule 12.5**).
- **Denied actions are audited** (**Rule 12.6**). A blocked air-transport selection, a rejected P5 write, a prohibited-activity attempt and a permission denial all produce events, because attempted actions are evidence. This is what `denial.recorded` exists for.
- **Append-only, never edited, never deleted, by any role including P6** — not P2 in their own organisation, not P6 at platform level, not P6 under a support grant (**Rules 12.3, 12.4**). A request to correct a wrong entry is refused; the correction is a new event describing the correction (**EC-52**). An audit log a platform admin can edit is not an audit log.
- **Every event records the actor, the organisation, the entity and record affected, the timestamp with its time zone, the before state, the after state, and the rule number that governed the action where one applies** (**Rule 12.2**). An event with no actor is a system event and says so explicitly; it is never attributed to a person. Every action taken by P6 inside a tenant under a support grant is marked as a platform action with the grant's reason recorded, and is visually distinguishable from a tenant member's action (**Rules 1.18, 12.7; EC-4**).
- **The display labels above are for the audit viewer.** Filters query the stored value, never the label.

---

### T-44 · Alert type

**Stored on:** `alert.alert_type` · **Cardinality:** single-select · **Phase:** per row

**Purpose:** Names the kinds of thing the product proactively tells a user about, so alerting is consistent and routable by role.

| Stored value | Display label | Definition | Primary audience | Phase |
|---|---|---|---|---|
| `storage_clock` | Storage clock | An accumulation clock entered an alert band or expired (T-26, T-27). | P1, P2 | B1a |
| `review_queue` | Review queue | Records are waiting in the confidence-gated review queue. | P1 | B1a |
| `container_capacity` | Container capacity | A container reached or is approaching its fill limit. | P1, P2 | B1a |
| `handler_threshold` | Handler threshold | Accumulated quantity is approaching or has crossed the handler size threshold (T-15). | P2 | B1a |
| `ddr_quarantine` | Damaged / defective quarantine | A record entered quarantine and needs handling. | P1, P2 | B1a |
| `storage_volume` | Storage volume | Stored quantity is approaching a fire-code threshold or a clearance rule is breached. | P2 | B1b |
| `obligation_deadline` | Obligation deadline | A dated producer obligation is approaching. | P3 | B1b |
| `recall_match` | Recall match | A possible or confirmed recall match needs attention. | P1, P2 | B2 |

**Rules**

- **Single-select per alert.**
- **Thresholds and offsets are `jurisdiction_rule` data or organisation configuration — never constants** (**Rules 1.23, 4.13**), and never encoded in the alert type name. In B1a a crossed quantity limit raises a warning to P2 with the limit's source stated and does no more; the monitoring and evidence behaviour is B1b and must not be built ahead of specification (**Rules 4.26, 9.5**).
- **Audience is a default, not a permission.** What a role can actually see is governed by **Rules 1.2 and 12.8**; the audience column routes the alert, it does not grant access. Storage-clock recipients are fixed by **Rule 4.14** — P2 always, P1 for containers at their site. Whether alerts also go out by email is undecided (**OQ-10**).
- **Alerts are records, not just notifications.** They are retained and appear in the audit export (**Rule 12.1**), because "the system warned them" is itself evidence.
- **No alert ever states or implies a probability of ignition** (**Rules 1.25, 10.3**; T-33). An alert about a damaged battery describes the condition and the required handling — never a chance of anything.

---

### T-45 · Classification decision status

**Stored on:** `classification_decision.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Tracks whether a waste classification decision is derivable, derived and governing, or replaced — because exactly one decision governs a battery record at a time and the replaced ones are the audit trail.

| Stored value | Display label | Definition |
|---|---|---|
| `pending` | Pending | Classification is required and every input is present, but the decision has not yet been produced. |
| `blocked` | Blocked | An input required to classify is absent or invalid and a human must supply it. The record produces no downstream document in this state. |
| `active` | Active | The current, governing decision for this battery record. |
| `superseded` | Superseded | Replaced by a later decision. Retained in full with its inputs, rule version, citation and reasoning intact. **Terminal.** |

**Rules**

- **Single-select.** **Exactly one `active` decision per battery record** — never zero once the record is identified, never two (**Rule 3.1**).
- **System-derived.** Classification runs only after identification is confirmed (**Rule 3.3**) and reads confirmed identification, site jurisdiction, the rule versions in force on the intake date, handler size class and the current damage assessment (**Rule 3.4**). The governing jurisdiction is the **site's**, not the organisation's headquarters (**Rule 3.5**), and the version used is the one in force on the **intake date**, not today's (**Rule 3.6**).
- **`blocked` is a real state, not an error.** A missing input blocks the decision and is never assumed (**Rule 3.10**): the record names the missing input and who can supply it, and no container label or shipping paper issues from it (**Rules 3.12, 5.3; EC-16**).
- **A decision is never edited.** Re-classification writes a new row and supersedes (**Rule 3.14**); the triggers are listed at **Rule 3.15**. A new rule version never retroactively re-classifies a departed shipment (**Rule 3.16**) and flags affected open records as a required action (**Rule 3.17; EC-18**).
- **A P6 override also supersedes rather than edits** (**Rules 3.26, 3.27**), carries basis code `manual_override` (T-14) and is separately listable in the audit export (**Rule 3.28**).
- **`superseded` is terminal**, and voiding a battery record does not delete its decisions (**Rule 3.25**). The reasoning trail is what survives an audit (**Rules 12.15, 12.16; EC-50**).

---

### T-46 · Damage assessment status

**Stored on:** `damage_assessment.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records whether a battery record has been assessed for damage and what the current human-confirmed finding is, because that finding drives quarantine routing and the air-transport prohibition.

| Stored value | Display label | Definition |
|---|---|---|
| `not_assessed` | Not assessed | No assessment exists. The record is incomplete and cannot join a shipment. |
| `assessed_sound` | Assessed sound | A human confirmed that no indicator from the damaged-or-defective set (T-29, T-30) is present. |
| `assessed_damaged` | Assessed damaged | A human confirmed at least one damaged-or-defective indicator. Air transport is blocked and the record routes to quarantine. |
| `superseded` | Superseded | Replaced by a later assessment. Retained and displayed **alongside** the current one. **Terminal.** |

**Rules**

- **Single-select.** Every battery record carries an assessment; a record with none cannot be added to a shipment (**Rule 6.1**).
- **Always human-confirmed.** A model may propose indicators; a model never sets them, regardless of confidence (**Rules 6.2, 6.6, 2.15**). This is **assessed condition**, never measured — measured condition comes only from an integrated third-party tester (**Rules 2.27, 11.5**).
- **`assessed_damaged` hard-blocks air transport** (**Rule 6.7**), and **no role can override that, including P6** (**Rule 6.8**). The user sees the blocking records, the specific indicator on each, and exactly three paths — ship non-air, remove the blocking records, or re-assess (**Rules 6.9, 6.10; EC-38**).
- **Neither assessed state is terminal, deliberately.** **Rule 6.11** provides exactly one clearing path: a superseding human assessment finding no indicator present, carrying a stated reason and at least one supporting photograph. The block clears because the assessed condition changed — never because someone chose to proceed. *This is why v1.1's declaration that damage findings were terminal was wrong and was corrected: it contradicted Rule 6.11.*
- **Both assessments stay visible.** A superseded assessment is displayed beside the current one with its author, timestamp, indicators and evidence, permanently and in every export (**Rule 6.12**). A record whose damage finding was reversed is one an auditor will want to look at, and the system makes that easy rather than hard.
- **Triggers behaviour:** quarantine routing and segregation (**Rules 6.17, 6.18, 4.28**; T-23), re-classification because damage is a classification input (**Rules 3.4, 3.15, 6.20**), automatic removal from an air shipment with the paper voided (**Rule 6.14; EC-39**), and the DDR packet (**Rules 6.15, 6.16**). Damage never stops a storage clock (**Rule 6.19**). Every change writes an `audit_event` carrying before, after, reason, actor and evidence (**Rule 6.21**).

---

### T-47 · Terms of Service acceptance status

**Stored on:** `tos_acceptance.status` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records the state of an organisation's consent to the Terms of Service granting data-training rights — which must be in force **before** the first battery is logged.

> **This system records organisational consent. It never governs whether an already-captured record may be used for training.** Per-record eligibility is **T-12**, stamped on the capture at the moment it happens (**Rule 7.6**), immutable, and editable by no role including P6. **No value below can move it.** `lapsed` and `revoked` change what happens next; they never change what already happened.

| Stored value | Display label | Definition |
|---|---|---|
| `not_accepted` | Not accepted | No version has ever been accepted by this organisation. **Intake is blocked organisation-wide.** |
| `in_force` | In force | An accepted version is currently effective. Intake proceeds and captures are stamped `training_eligible` (T-12). |
| `grace` | Grace period | A newer version has published; this acceptance still permits intake until the re-acceptance deadline. Records captured now bind to **this** version, not the new one. |
| `lapsed` | Lapsed | The grace window closed without re-acceptance. **Intake is blocked.** Records captured before the lapse are untouched. |
| `superseded` | Superseded | Replaced by a later accepted version. **Retained permanently as the governing terms for every record captured under it.** **Terminal.** |
| `revoked` | Revoked | The organisation withdrew the grant. Captures from the revocation forward are `training_excluded`; captures made while it was in force keep the eligibility they were stamped with. |

**Rules**

- **Single-select, one row per accepted version per organisation.** `not_accepted` is the state of an organisation with no accepted version — modelled as a value rather than an absent row, because null cannot be filtered, counted or explained to an auditor (§5.6).
- **Consent precedes capture, and this is the whole point of the system.** The Terms of Service granting training rights must be accepted and in force **before any battery is logged** (**Rule 7.1**). Until then intake is blocked organisation-wide with a stated remedy, while read-only setup surfaces stay available (**Rule 7.2**).
- **Accepted by a member holding the organisation's binding authority** — the founding member, or a P2 to whom it has been assigned (**Rule 7.3; OQ-6**). P1, P3 and P4 cannot accept on the organisation's behalf; P5 cannot accept anything. **P6 can never accept on a tenant's behalf, under any circumstance, including under a support grant** (**Rule 7.4**) — a platform admin accepting a customer's terms is not consent.
- **Every acceptance records the exact version, the accepting user, the timestamp with time zone and the organisation, permanently and un-editably** (**Rule 7.5**).
- **Version changes move through `grace`, never straight to a block.** A new version carries an in-force date and a re-acceptance deadline, with notice on publication, at the in-force date and before the deadline (**Rule 7.12**). Records captured during the grace window bind to the **prior** version's terms and stay bound to them (**Rules 7.13, 7.15; EC-33**). Missing the deadline moves to `lapsed` and blocks intake (**Rule 7.14; EC-34**).
- **Every battery record permanently records the version in force at its capture**, and that version's terms govern it forever — after the version is superseded and after the organisation has accepted three newer ones (**Rule 7.16**).
- **Re-acceptance is never retroactive** (**Rule 7.17**), and a record captured with no acceptance in force is **permanently** not training-eligible — no later acceptance, backdating or administrative action changes it (**Rules 7.7; EC-32**). Ineligible is not useless: the record stays fully usable for compliance, documentation, shipment, audit and insurance evidence (**Rule 7.8**).
- **`revoked` is forward-only** (**Rule 7.18**) and is flagged as a legal call rather than a settled one — see `BUSINESS_RULES.md` **RN-2** and **OQ-3**. A customer asking for previously captured records to be excluded is escalated, not actioned by a builder or a support admin (**EC-35**).
- **Consent is organisational, not personal** (**Rule 7.19**). A new P1 joining an organisation with an acceptance in force may log batteries immediately; their own acknowledgement is recorded on first sign-in as a record, not a second gate (**Rule 7.20**).
- **Imports never carry eligibility forward by assertion.** Migrated records default to `training_excluded` (T-12) and an imported acceptance must arrive as its own row with version, actor and timestamp intact, audited as such (**Rule 7.23; EC-31**).
- **`superseded` is terminal.** An acceptance row is never edited or deleted — it is the evidence of what was agreed and when.

---

### T-48 · Alert severity

**Stored on:** `alert.severity` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** States how urgently an alert must be acted on, so that every surface that renders an alert — the dashboard region, the alert bell, the container list — orders and styles it the same way without re-deriving urgency from the alert's subject.

| Stored value | Display label | Definition | Visual intent | Phase |
|---|---|---|---|---|
| `critical` | Critical | A legal, safety or documentary obligation is **already** breached, or an action the user needs is **already** blocked. The condition exists now; it is not approaching. | `critical` | B1a |
| `attention` | Needs attention | An obligation **will** be breached if nothing changes, or a required human action is queued and waiting. The condition is approaching or pending, not present. | `attention` | B1a |
| `informational` | For information | A state change worth surfacing that carries no obligation and no deadline. | `neutral` | B1a |

**Which severity a given alert carries**

Severity is set by the code that raises the alert, from the condition that raised it. It is **not** a property of the alert type (T-44) — the same type raises at different severities as the condition changes.

| Condition | Severity |
|---|---|
| Storage clock in the `overdue` state (**Rule 4.15**) | `critical` |
| Storage clock in an alert band short of overdue (**Rule 4.13**) | `attention` |
| A loaded container with no current printed label, or a printed start date that no longer matches (**Rules 4.19, 4.22**) | `critical` |
| A damaged, defective or recalled record blocking a shipment (**Rules 6.7, 6.16**) | `critical` |
| A record entering quarantine and needing handling (**Rule 6.17**) | `attention` |
| Records waiting in the confidence-gated review queue (**Rule 2.14**) | `attention` |
| A container over its fire-code quantity limit — **B1a warns and blocks nothing** (**Rule 4.26**) | `attention` |
| A container approaching its fill limit | `attention` |
| A published rule version that affects open records and requires action (**Rule 3.17**) | `attention` |
| A container marked ready to ship, raised for P1 and P6 | `informational` |
| A proposed catalog entry approved, raised for the proposer | `informational` |

**Rules**

- **Single-select per alert.** An alert carries exactly one severity.
- **Severity is frozen at insert.** `docs/ERD.md` §6.5 freezes `severity` by trigger after the row is written, alongside `alert_type`, `trigger_snapshot`, `raised_at` and `governing_rule_version_id`. A condition that worsens raises a **new** alert; it does not edit the old one's severity. The alert row is evidence, and evidence that changes retroactively is not evidence.
- **An unrecognised severity renders as `neutral` and is never guessed upward.** Guessing upward into `critical` invents an urgency, and inventing urgency in a compliance product is worse than showing none. This preserves exactly the behaviour `b1a-00` shipped.
- **Severity is never derived from the storage clock's alert band (T-27).** T-27 is the clock's own ladder and its tier count is `jurisdiction_rule` data that varies by jurisdiction. T-48 is the display urgency of an alert record, and it is fixed at three values platform-wide. Mapping one onto the other would make the alert bell's colour a function of which state the site is in.
- **Ordering.** Where alerts are ordered by urgency, `critical` before `attention` before `informational`, and within `critical` an overdue storage clock is pinned above everything else and is dismissible by no role, including P6 (Edge Case **E-6**).
- **Severity is not permission.** What a role can see is governed by **Rules 1.2 and 12.8** and by T-44's audience routing. Severity says how loud, never who.
- **No alert at any severity states or implies a probability of ignition** (**Rules 1.25, 10.3**). A `critical` alert about a damaged battery describes the condition and the required handling — never a chance of anything.

---

### T-49 · Assessed condition

**Stored on:** `battery_record.assessed_condition`, `damage_assessment.assessed_condition` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records a human's judgment of a battery's physical condition at inspection. This is the third of the three hard-gated intake fields, and it is the input the damaged-or-defective determination and the air-transport prohibition both read.

| Stored value | Display label | Definition |
|---|---|---|
| `not_assessed` | Not assessed | No person has assessed this battery. A record in this state **cannot ship** (**Rule 6.1**). |
| `sound` | Sound | Assessed by a person. No damaged-or-defective indicator present and no cosmetic finding recorded. |
| `cosmetic_wear_only` | Cosmetic wear only | Assessed by a person. One or more findings from T-29's cosmetic set present, and none from its damaged-or-defective set. **Ships on the ordinary path** — this value exists so a handler is never forced to call a scuffed pack damaged. |
| `damaged_or_defective` | Damaged or defective | Assessed by a person. One or more findings from T-29's damaged-or-defective set confirmed. Sets `ddr_flags` (T-30) and `is_air_transport_prohibited`, and routes the record to a segregated quarantine container. |

**Rules**

- **Single-select.**
- **Hard-gated.** This is one of the three fields that never auto-commit at any confidence level (**Rule 2.15**, `TECHNICAL_SPEC.md` §11.1 step 3). A model may propose it; **a model never sets it** (**Rules 6.2, 6.6**). Only P1 and P6 may confirm it (**Rule 2.22**).
- **"Assessed," never "measured."** BMMP integrates third-party health testers; it does not measure battery health. A measured instrument reading is stored on the `instrument_*` columns of `damage_assessment`, is labelled and exported separately, and **never merges into or silently replaces this value** (**Rules 2.27, 11.5**; `_ANCHORS.md` §7.5).
- **This is not a grade.** T-31 is BMMP's published A/B/C/reject grading scheme and is B2. This system is what a handler observes; T-31 is what BMMP concludes. **Rule 6.22** binds them: a record with an unresolved damaged-or-defective determination can never be graded or marked reusable or resaleable.
- **A recall association reaches the same handling class without changing this value.** An active recall sets `ddr_flags` and the air prohibition under **Rule 6.5** independently of the assessed condition, because a recalled battery may be physically sound. Never write `damaged_or_defective` because of a recall — the finding and the recall are separate facts and an auditor will look for both.
- **Relationship to T-46.** T-46 is the *status of an assessment row*; T-49 is *what the assessment found*. `assessed_sound` (T-46) covers both `sound` and `cosmetic_wear_only` here.
- **Changing this value re-opens the confidence gate** (`UX_SPEC.md` §3.7) and triggers a re-classification check (**Rules 3.15, 6.20**). Moving **out of** `damaged_or_defective` is held to **Rule 6.11**'s discipline: a new assessment by a person, a stated reason, and at least one supporting photograph. The superseded assessment stays visible permanently (**Rule 6.12**).
- **Triggers behaviour:** the air-transport hard block (**Rules 6.7, 6.8**), quarantine routing (**Rule 6.17**), the DDR packet (**Rule 6.16**), and shipment eligibility (**Rule 6.1**).

---

### T-50 · Intake photo type

**Stored on:** `intake_photo.photo_type` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Names what a captured image is, so the pipeline knows which image to read, which images are evidence, and which are the training pair.

| Stored value | Display label | Definition |
|---|---|---|
| `label` | Label | The battery's nameplate or label. **At least one is required before extraction runs** (**Rule 2.5**). |
| `label_crop` | Label crop | The cropped label region. **Always a child row** carrying `parent_intake_photo_id` and `crop_geometry`; the original is never modified (**Rule 2.6**). |
| `whole_pack` | Whole pack | The whole battery, for identification context and form-factor proposal (**Rule 2.25**). |
| `damage` | Damage evidence | Supports a damage assessment. Feeds the labelled damage set (**Rule 7.11**). |
| `clearing_evidence` | Clearing evidence | The photograph required to clear a damaged-or-defective finding (**Rule 6.11**). `damage_assessment.clearing_photo_intake_photo_id` points at one. |

**Rules**

- **Single-select**, assigned at capture by the surface that captured it.
- **`label_crop` is the only value that requires a parent.** Every other value is a top-level capture with `parent_intake_photo_id` null.
- **The training pair is the `label_crop` plus the human-confirmed answer** (**Rule 7.10**) — not the `label`, and not the `whole_pack`. `data_use_eligibility` (T-12) is stamped once at capture on every row regardless of type and is never recomputed by any role including P6.
- **A photo is never deleted to correct a mistake.** A wrongly-typed capture is superseded by a new one; the original is retained for audit (**Rule 12.13**).
- **Form factor may be proposed from a `whole_pack` image and still passes the confidence gate. It never implies, suggests or contributes to a chemistry determination** (**Rules 2.9, 2.25**).

---

### T-51 · Label crop method

**Stored on:** `intake_photo.crop_method` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records whether the label region was found by the vision provider or drawn by a person.

| Stored value | Display label | Definition |
|---|---|---|
| `auto_detected` | Detected automatically | Geometry came from the vision provider's region detection. |
| `manual` | Drawn by hand | A person drew the crop box, either because detection returned nothing, because it returned a low-confidence region, or because they chose to. |

**Rules**

- **Single-select**, and set on `label_crop` rows only.
- **Both are ordinary outcomes. Neither is an error state** (`docs/ERD.md` §5.4). The manual path is always available and never hidden (`TECHNICAL_SPEC.md` §11.1 step 2), and a `manual` crop carries no penalty in the confidence gate, in review, or in training eligibility.
- **There is no third value.** A crop is drawn by a machine or by a person.

---

### T-52 · Review reason code

**Stored on:** `intake_session.review_reason_codes` · **Cardinality:** **multi-select** (`text[]`) · **Phase:** B1a

**Purpose:** States why a record is in the review queue, so the reviewer sees what to fix before opening the card, and so a backing-up queue can be read for its cause rather than its size.

| Stored value | Display label | Definition |
|---|---|---|
| `field_confidence_below_threshold` | Low confidence on a field | At least one extracted field fell below the applicable threshold. **The whole record routes to review, not just that field** (**Rule 2.14**). |
| `catalog_match_score_below_threshold` | Weak catalog match | The best candidate's match score fell below the applicable threshold. |
| `catalog_match_ambiguous` | Ambiguous catalog match | The top two candidates are too close to separate. **The system never auto-selects the top one and never silently narrows the list** (**Rule 2.19**). |
| `no_catalog_match` | No catalog match | No candidate resolved. The record continues on the manual entry path (**Rule 2.20**) and **cannot ship until shipping identifiers resolve** (**Rule 5.9**). |
| `no_fields_extracted` | Label unreadable | Extraction returned no readable field. **A distinct state from low confidence** and it must not share its treatment (`UX_SPEC.md` **E-4**). |
| `field_validation_failed` | Value failed validation | An extracted value failed its expected shape and was presented as unread, with the raw text retained (**Rule 2.12**). |
| `extraction_failed` | Extraction did not complete | The provider errored, timed out or returned a malformed response. **The confidence gate is never relaxed to clear a backlog** (**D-25**; **EC-14**). |
| `session_abandoned` | Left unfinished | The handler left the flow. The session persists with its extraction and appears on the queue. **Work is never lost and never silently committed.** |

**Rules**

- **Multi-select.** A record commonly carries more than one reason and every applicable reason is recorded — a record that is both weakly matched and low-confidence says so.
- **The gate verdict lives on `intake_session`, not on `label_extraction`**, because the gate routes the record and not the field (`docs/ERD.md` §5.5, **Rule 2.14**).
- **Reason codes are diagnostic, never permissive.** No combination of them, and no absence of them, allows a hard-gated field to commit without human confirmation (**Rules 2.13, 2.15, 2.17**).
- **A record leaves the queue in exactly two ways: a human confirms it, or a human voids it with a stated reason** (**Rule 2.23**). It never times out into a confirmed state and it never ages out.

---

### T-53 · Intake step

**Stored on:** `intake_session.current_step` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records which step of the fixed intake pipeline a session is on, so an interrupted session resumes where it stopped.

| Stored value | Display label | Definition |
|---|---|---|
| `capture` | Photo | Step 1. Capturing photos. |
| `extraction_review` | Extraction review | Step 2. Reviewing extracted fields against the label crop, resolving the catalog match. |
| `confirm_and_place` | Confirm and place | Step 3. Recording state of charge and assessed condition, assigning a container, seeing the classification outcome. |
| `complete` | Complete | The session committed. Terminal. |

**Rules**

- **Single-select, system-assigned.** Users do not set it directly.
- **The order is fixed and code-orchestrated.** No step may be skipped, reordered, run in parallel or chosen at runtime, and no model selects the next step (**Rules 2.2, 2.3**).
- **The step index also lives in the URL** as `?step=` so the flow is deep-linkable and resumable (`SITE_ARCHITECTURE.md` §1.3). The URL and this column agree; the column is the durable one.
- **A step may be revisited.** Moving back from step 3 to step 2 is ordinary and does not discard captured work.
- **Distinct from T-08.** T-08 is the session's lifecycle status; this is its position in the flow. A session may be `awaiting_confirmation` (T-08) at `extraction_review` (T-53).

---

### T-54 · Chemistry source

**Stored on:** `battery_record.chemistry_source` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records how a battery's chemistry was established, so that every screen and export can state the basis rather than presenting chemistry as a bare fact.

| Stored value | Display label | Definition |
|---|---|---|
| `catalog_match` | Matched from the catalog | Defaulted from the matched `catalog_entry` and confirmed by a person (**Rules 2.10, 2.18**; **D-23**). |
| `human_entry` | Entered by hand | Entered directly by P1 or P6 on the manual entry path and confirmed by that person (**Rules 2.10, 2.20**). |

**Rules**

- **Single-select.**
- **These are the only two sources, and there will never be a third** (**Rule 2.10**). **`docs/ERD.md` §5.1 states it as an absence:** no value in this set means "read from a photograph," because chemistry cannot be seen in an image.
- **Rule 2.9 is in all capitals for this reason.** Chemistry is printed on the label; the label is read; the reading resolves to a catalog entry; the catalog entry carries the chemistry; a person confirms it. **Any value, screen, label, API field or document implying visual chemistry detection is wrong and must be removed** (**D-7**, `_ANCHORS.md` §7.2).
- **The resolved lithium-ion sub-chemistry lives on the record**, defaulted from the matched catalog entry, not left on the catalog entry alone (**D-23**).
- **Never inferred from form factor.** Form-factor detection contributes nothing to chemistry (**Rule 2.25**).

---

### T-55 · State-of-charge source

**Stored on:** `battery_record.soc_source` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records how the state of charge at intake was established, since it is an input to hazard ranking at B2 and a handler's estimate and a meter reading are not the same evidence.

| Stored value | Display label | Definition |
|---|---|---|
| `device_indicator` | Read from an indicator | Read from a gauge, indicator or display on the battery or the device it came out of. |
| `handheld_meter` | Read with a meter | Read by the handler with a handheld voltmeter or tester. |
| `handler_estimate` | Handler's estimate | The handler's stated estimate. No reading was available. |
| `not_observable` | Not observable | The state of charge could not be established. |

**Rules**

- **Single-select**, recorded alongside `state_of_charge_band` (T-21) and `state_of_charge_percent_at_intake` at step 3 (**Rule 2.26**).
- **`not_observable` is a legitimate answer, not a failure.** It is the correct value for a pack with no indicator and no accessible terminals, and it must never be replaced with a default band or a guessed percentage.
- **None of these is a health measurement.** State of charge is not state of health, and this column never contributes to a claim about condition (**Rule 2.27**; `_ANCHORS.md` §7.5).
- **This value never contributes to a probability of ignition** — no such output exists anywhere in the product (**Rule 1.25**).

---

### T-56 · Date code precision

**Stored on:** `date_code_decode.decoded_precision` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** States how precisely a printed date code resolves, so a year-only code is never displayed or exported as though it named a day.

| Stored value | Display label | Definition |
|---|---|---|
| `day` | Day | Resolves to a calendar day. |
| `month` | Month | Resolves to a calendar month. |
| `quarter` | Quarter | Resolves to a calendar quarter. |
| `year` | Year | Resolves to a year only. |
| `undecodable` | Could not be decoded | The code was read but does not resolve against any known format. |

**Rules**

- **Single-select.**
- **`undecodable` is recorded as itself and never as an approximate date** (**Rule 2.24**). A code that cannot be decoded produces no manufacture date — it does not produce a fuzzy one.
- **Precision travels with the value everywhere.** A `year`-precision decode renders as a year on screen, in exports and on any document that prints it. Rendering it as 1 January is a defect.
- **A decoded date never overrides a date a person entered** (**Rule 2.24**).
- **A future-dated decode is a validation failure, not a fact** (**EC-11**) — it is presented as unread with the raw code retained.

---

### T-57 · Date code decode method

**Stored on:** `date_code_decode.decoded_by_method` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Records whether the manufacture date came from a deterministic decoder or from a person.

| Stored value | Display label | Definition |
|---|---|---|
| `deterministic_decoder` | Decoded by rule | A versioned rules-based decoder produced the date. `decoder_version` records which. |
| `human_entry` | Entered by hand | A person entered the manufacture date directly. |

**Rules**

- **Single-select.**
- **There are two values and there will never be a third.** **Date-code decoding is deterministic and rules-based** (**Rule 2.24**); there is no machine-learning path and `TECHNICAL_SPEC.md` §11.1 step 6.3 says so explicitly. **`docs/ERD.md` §5.6 states it as an absence:** no value in this set means "inferred by a model."
- **A decoder is versioned and its version is stored**, so a decode reproduces after the decoder changes.

---

### T-58 · Classification decision scope

**Stored on:** `classification_decision.decision_scope` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** Names which subject a classification decision was made about, since the same table records decisions at three grains.

| Stored value | Display label | Definition |
|---|---|---|
| `battery_record` | Battery record | The decision is about one battery. `battery_record_id` is non-null. |
| `container` | Container | The decision is about a container's aggregate contents. `container_id` is non-null. |
| `shipment` | Shipment | The decision is about a shipment's contents as offered. `shipment_id` is non-null. |

**Rules**

- **Single-select, and it names whichever of the three foreign keys is non-null.** Exactly one is non-null; the scope and the key never disagree.
- **A record carries exactly one active decision** at `battery_record` scope (**Rule 3.1**), enforced by a partial unique index on `status = 'active'`.
- **Classification runs only after identification is confirmed** (**Rule 3.3**) and reads the rule version in force on the record's **intake date** in the **site's** jurisdiction (**Rules 3.5, 3.6**).
- **A missing site jurisdiction profile blocks the decision and never defaults it** (**Rule 3.10**; **E-13**). There is no fallback, no "assume federal" and no placeholder citation.
- **Re-classification supersedes; it never overwrites** (**Rule 3.14**), and a new rule version never retroactively re-classifies a departed shipment (**Rule 3.16**).

---

### T-59 · Damage assessment method

**Stored on:** `damage_assessment.assessment_method` · **Cardinality:** single-select · **Phase:** per row

| Stored value | Display label | Definition | Phase |
|---|---|---|---|
| `visual_inspection` | Visual inspection | A person inspected the battery and confirmed the findings. **B1a's only method.** | B1a |
| `model_assisted_visual` | Model-assisted inspection | A model proposed indicators from a photograph and a person confirmed them. | B2 |
| `instrument_reading` | Instrument reading | A third-party health tester supplied a reading, recorded alongside a human-confirmed assessment. Carries the `instrument_*` columns. | B3 |

**Rules**

- **Single-select.**
- **No method produces an assessment without human confirmation, at any confidence** (**Rule 6.6**). **A model proposes indicators; a model never sets them** (**Rule 6.2**). `model_assisted_visual` describes how the proposal arrived, not who decided.
- **An instrument reading is measured data.** It is stored, labelled and exported **separately** from assessed condition, and never merges into it or silently replaces it (**Rules 2.27, 11.5**; Roadmap Principle 7). The vendor is open until Gate 3.
- **B1a writes only `visual_inspection`.** Building the other two ahead of their specification is a review rejection, not a head start.

---

### T-60 · Audit actor type

**Stored on:** `audit_event.actor_type` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** States what kind of actor caused an audited event, so a platform admin's action inside a tenant is never mistaken for a member's.

| Stored value | Display label | Definition |
|---|---|---|
| `user` | Member | A signed-in member acting in their own organization. `actor_user_id` is non-null. |
| `platform_admin` | Platform admin | P6 acting inside a tenant **under a recorded support grant**. `actor_user_id` is non-null. **Rendered distinctly wherever it appears** (**Rules 1.18, 12.7**). |
| `system` | System | The application acting with no human actor — a pipeline step, a trigger, a computed state change (**Rule 12.5**). |
| `scheduled_job` | Scheduled job | A cron-invoked job: storage-clock alerts, recall sync. |
| `integration` | Integration | An inbound webhook from an external system. |

**Rules**

- **Single-select**, set by the audit trigger from the request context, never by application code choosing a value.
- **`actor_user_id` is non-null for `user` and `platform_admin`** and may be null for the other three.
- **`platform_admin` is visually distinct on `/audit` and in every export.** A support grant that is invisible in the log is not a recorded support grant.
- **`system` is not a way to avoid attribution.** A state change a person caused is attributed to that person even when a trigger performed the write (**Rule 2.21** — "confirmed by the system" is not a valid value).
- **No role edits or deletes an audit event, including P6** (**Rules 12.3, 12.4**).

---

### T-61 · Catalog entry source type

**Stored on:** `catalog_entry.source_type` · **Cardinality:** single-select · **Phase:** B1a

**Purpose:** States where a catalog entry's specification came from, so a handler confirming a match can weigh the entry they are matching against.

| Stored value | Display label | Definition |
|---|---|---|
| `manufacturer_published` | Manufacturer specification | Taken from a manufacturer's published specification or datasheet. `source_url` carries the reference. |
| `platform_curated` | Platform curated | Created or verified by P6 from primary sources. Platform-owned entries carry `organization_id` null. |
| `handler_proposed` | Proposed by a handler | Proposed from a catalog miss and approved by P6 (**Rule 2.20**; Flow F). |
| `regulatory_source` | Regulatory source | Taken from a public regulatory or standards dataset. |

**Rules**

- **Single-select.**
- **`handler_proposed` is not a lesser entry once approved** — approval is P6 reviewing the proposal against the linked intake photo and label crop. The value records provenance, not quality.
- **Approving an entry never silently re-matches a committed record.** Every record committed unmatched against the same identifying fields is **raised on `/review` for a person to confirm** (Flow F, step 4).
- **Source type never substitutes for confirmation.** However authoritative the entry, chemistry, model and condition still require human confirmation (**Rule 2.15**).

---

## 4. Naming Conventions

Consistent with `PROJECT_SETUP_BMMP.md` §4. Where that document sets a convention, this one repeats it rather than varying it. Where this document adds a convention, it is because §4 does not cover taxonomy specifically.

### 4.1 Casing, by thing type

| Thing | Convention | Example |
|---|---|---|
| Database table | `snake_case`, **singular** | `battery_record`, `intake_photo`, `jurisdiction_rule` |
| Database column | `snake_case`, singular | `application_class`, `accumulation_started_at` |
| **Stored enum value** | **`snake_case`, lower-case** | `light_category`, `medium_format`, `pending_review` |
| TypeScript type / React component | `PascalCase`, singular | `BatteryRecord`, `WasteClassification` |
| TypeScript union member | the stored value verbatim, quoted | `'light_category'` |
| Constant holding the value list | `UPPER_SNAKE_CASE`, **plural** | `WASTE_CLASSIFICATIONS`, `DAMAGE_FINDING_TYPES` |
| Variables and functions | `camelCase` | `resolveWasteClassification()` |
| File | `kebab-case` | `waste-classification.ts`, `storage-clock-alert-band.ts` |
| Next.js route file | framework convention | `page.tsx`, `layout.tsx`, `route.ts` |
| Route segment | lower-case, **plural** for collections | `/batteries`, `/containers`, `/shipments` |
| Display label | sentence case | "Light waste category", "Pending review" |
| Audit event type | `<entity>.<past_tense_verb>`, lower `snake_case` both sides | `battery_record.confirmed` |
| Rule version identifier | `<jurisdiction_code>:<domain>:<effective_date>` | `US-WA:producer_obligation:2026-01-16` |

**The one exception in the whole document:** jurisdiction codes (T-40) use upper-case country and subdivision segments (`US-WA`) because they are external standard identifiers, not BMMP-invented values. Nothing else deviates.

### 4.2 Singular versus plural

- **Tables are singular.** `battery_record`, not `battery_records`. This follows `_ANCHORS.md` §3, where every fixed entity name is singular.
- **TypeScript types are singular.** `BatteryRecord`.
- **Collections are plural.** The constant array, the API collection response key, the route segment: `BATTERY_RECORDS`, `batteries`, `/batteries`.
- **Enum values are singular.** `damage_finding_type` values are `dent`, not `dents` — even in a multi-select. Cardinality is a property of the column, never of the value name.

### 4.3 Column naming patterns

| Pattern | Rule | Example |
|---|---|---|
| Status column | named `status`, never `<entity>_status` | `battery_record.status` |
| Type column | named `<concept>_type` | `container.container_type`, `document_render.document_type` |
| Enum column | named for the concept; never suffixed `_enum` | `waste_classification` |
| Boolean | prefixed `is_` or `has_` | `is_active`, `has_tos_acceptance` |
| Timestamp | suffixed `_at` | `confirmed_at`, `accumulation_started_at` |
| Date without time | suffixed `_on` | `effective_on` |
| Foreign key | `<referenced_table>_id` | `battery_record_id`, `jurisdiction_rule_id` |
| Multi-select column | plural, array-typed | `ddr_flags`, `basis_codes` |

### 4.4 How enum values are formed

1. **Formed from meaning, never from the label.** The stored value is chosen for what the thing *is*; the label is written separately for a human. They are related by a lookup table, not by a transform. A value is never produced by lower-casing and underscore-substituting a label.
2. **No numbers unless the number is semantically fixed and ordinal.** `band_1` … `band_4` are permitted because the ordinal *is* the meaning. `warning_90` is forbidden because 90 is a configured offset.
3. **No thresholds, quantities, units, dates or currency.** `over_11lb_300wh`, `above_30_percent`, `expires_2029` — all review rejections. The number belongs to `jurisdiction_rule`.
4. **No jurisdiction names**, unless the value *is* a jurisdiction identifier (T-40). `california_rule` is a hard-coded jurisdiction wearing a disguise.
5. **No phase or version markers.** `medium_format_b3`, `grade_v2` — forbidden. Phase is documentation; version belongs on `rule_version` or the grading scheme identifier.
6. **No abbreviations that are not industry-standard.** `ddr`, `un3480`, `nmc`, `lfp` are standard and permitted. `cont_stat`, `wst_cls` are not.
7. **No value repeats its column name.** `container.container_type = 'container_standard'` is redundant; `'light_category'` is right. The one deliberate exception is T-31, where the single letter is the published scheme's external identifier.
8. **ASCII only, lower-case, underscores only.** No hyphens, spaces, dots, slashes, accents or capitals — except the two documented external-identifier exceptions (T-40 jurisdiction codes, T-42 rule version identifiers, which use colons and hyphens by format).
9. **Length ceiling 40 characters.** If a value needs more, the concept is wrong.
10. **Never reused.** A retired value's string is never assigned a new meaning, even years later. See §6.

### 4.5 Display label conventions

- **Sentence case.** "Pending review", not "Pending Review" and not "PENDING REVIEW".
- **Written for the persona reading them**, not for the developer. "Approaching limit" beats "T-26 approaching_limit".
- **Never contain the stored value.** No "Light waste category (light_category)" in production UI.
- **Regulatory strings are not display labels.** Required marking text, required label phrases and statutory wording come from `jurisdiction_rule` and template data and are reproduced **verbatim**, including their own casing. They are never sentence-cased, pluralised, truncated or "improved" by a display layer.
- **Empty and pending states get real labels.** `unknown` reads "Chemistry not confirmed", not "Unknown" or "N/A" or an em dash. A user who sees "—" learns nothing.

---

## 5. Label-to-Database Mapping

> **This is the highest-risk section in this document.** If it is vague, build agents invent the mapping — differently in each feature — and every query, filter, export, PDF template and test fixture silently disagrees with every other one. Nothing below is a suggestion.

### 5.1 The contract

Every classification system has exactly two representations and no third:

| | **Stored value** | **Display label** |
|---|---|---|
| Audience | machines | humans |
| Casing | lower `snake_case` | sentence case |
| Stability | **permanent** — never changes once shipped | may change any time |
| Where it lives | the database, API payloads, exports, filters, test fixtures | the UI, PDFs, emails — rendered at read time |
| Who decides it | this document | this document, and product copy after it |
| Changing it | a deprecation entry (§6) plus a new value | a copy edit, nothing more |

**The two are related by an explicit lookup, never by a transform.** There is no `.toLowerCase().replace(/ /g, '_')` anywhere in this codebase, in either direction. A transform looks like it works until the first label with a slash, an ampersand, an accent or a regulatory phrase in it — and then it fails silently, in a PDF, in front of an auditor.

### 5.2 Casing convention for stored values — stated once, held everywhere

**Every stored enum value in BMMP is lower-case `snake_case`.** No exceptions inside this taxonomy other than the two external-identifier formats documented at T-40 (jurisdiction codes) and T-42 (rule version identifiers), both of which are external standards BMMP does not own.

This holds in: Postgres columns, TypeScript union types, API request and response bodies, query string filter parameters, CSV and JSON exports, seed data, mock adapter fixtures, Playwright selectors and every test.

**`UN3480` is the display label. `un3480` is the stored value.** Both are correct, in their own place. Neither is ever used in the other's place.

### 5.3 Where the mapping lives

One module per classification system, under `src/domain/taxonomy/`, each exporting three things and nothing else:

1. the value list constant (`UPPER_SNAKE_CASE`, plural),
2. the TypeScript union type derived from it (`PascalCase`, singular),
3. the label lookup — stored value to display label.

Rules that bind:

- **A display label appears in exactly one place in the codebase: its lookup.** A label written inline in a component, a PDF template, an email or a test is a defect, even when it happens to match.
- **`src/domain/` imports nothing from `app/`, `components/`, `features/`, `data/` or `lib/`** (`PROJECT_SETUP_BMMP.md` §3.3). Taxonomy is pure data and pure functions. It is the one thing every layer may read and nothing may reach past.
- **The mock adapter and the Supabase adapter use the same stored values.** They must, or the swap point leaks. The e2e suite runs against both and is the proof (`PROJECT_SETUP_BMMP.md` §5).
- **The database is the enforcement point, not the UI.** Every enum column carries a database-level constraint. A stored value the taxonomy does not define must be rejected by Postgres, not caught by a form.

### 5.4 Renaming a label must never require a data migration

**This is the single most important rule in this section.**

Stored values carry **no display text**. They are stable machine identifiers chosen for meaning. Therefore:

> **Changing what a user sees is a copy edit. It touches one lookup line, ships in one commit, and migrates nothing.**

The worked example is **T-27, the storage clock alert band.**

| | Stored value | Display label | Source of the label |
|---|---|---|---|
| Correct | `early` | "90-day notice" | rendered from the configured offset |
| Correct | `mid` | "60-day notice" | rendered from the configured offset |
| Correct | `final` | "30-day notice" | rendered from the configured offset |

An organisation moves its first notice from 90 days to 75 days. With the design above, an administrator changes one configuration value. Every existing `storage_clock` row keeps `early`. Every historical alert stays readable. Nothing migrates.

Now the version an agent will write if this section is missing:

| | Stored value | What breaks |
|---|---|---|
| **Wrong** | `warning_90` | The offset change becomes a schema migration plus a backfill of every historical row — and the backfill is a lie, because those alerts genuinely fired at 90 days. |
| **Wrong** | `90_day_notice` | Same, and the value starts with a digit, and it hard-codes a configured number into a stored identifier. |
| **Wrong** | `"90-day notice"` | Display text stored as data. Every filter and query now depends on copy. A copy edit corrupts the database. |

**The same test applies to every system here.** Before adding a value, ask: *if we renamed this in the UI tomorrow, would we have to touch stored data?* If yes, the value is wrong.

### 5.5 The round trip, worked

Using T-17, the system where the label and value differ most visibly.

```
User picks in the UI          →  "UN3480"                     (display label)
Stored on the record          →  un3480                       (stored value)
Sent to the API               →  { "un_identifier": "un3480" } (stored value)
Filtered in a query string    →  ?un_identifier=un3480        (stored value)
Written to a CSV export       →  un3480                       (stored value)
Printed on the shipping paper →  UN3480                       (display label)
Read back into a filter chip  →  "UN3480"                     (display label)
```

The stored value never surfaces to a human. The display label never reaches storage. The only place they meet is the lookup in `src/domain/taxonomy/`.

**Exports are the trap.** A CSV built for a human reader may carry both — a stored-value column and a label column — but it must never carry only the label, because a label-only export cannot be re-imported and cannot be joined to anything.

### 5.6 Consolidated column index

Every enum column in the product, in one place. `text[]` marks a multi-select column; `text` a single-select.

| ID | Table.column | Shape | Default on insert | Null allowed | Phase |
|---|---|---|---|---|---|
| T-01 | `battery_record.chemistry` | `text` | `unknown` | no | B1a |
| T-01 | `catalog_entry.chemistry` | `text` | `unknown` | no | B1a |
| T-02 | `battery_record.application_class` | `text` | `unknown` | no | B1a |
| T-03 | `battery_record.assembly_level` | `text` | `unknown` | no | B1a |
| T-04 | `battery_record.cell_form_factor` | `text` | `unknown` | no | B1a |
| T-05 | `catalog_entry.removability` | `text` | `unknown` | no | B1a |
| T-06 | `format_classification.format_category` | `text` | `undetermined` | no | B1a |
| T-07 | `catalog_entry.status` | `text` | `proposed` | no | B1a |
| T-08 | `intake_session.status` | `text` | `open` | no | B1a |
| T-09 | `label_extraction.field_code` | `text` | none — required | no | B1a |
| T-10 | `label_extraction.confidence_band` | `text` | none — required | no | B1a |
| T-11 | `battery_record.provenance_source_type` | `text` | `unknown_provenance` | no | B1a |
| T-12 | `intake_photo.data_use_eligibility` | `text` | `pending_determination` | no | B1a |
| T-13 | `classification_decision.waste_classification` | `text` | `undetermined` | no | B1a |
| T-14 | `classification_decision.basis_codes` | `text[]` | none — minimum one | no | B1a |
| T-15 | `organization.handler_size_class` | `text` | `undetermined` | no | B1a |
| T-16 | `storage_event.activity_type` | `text` | none — required | no | B1a |
| T-17 | `shipping_paper.un_identifier` | `text` | `not_assigned` | no | B1a |
| T-18 | `shipment.transport_mode` | `text` | `ground` | no | B1a |
| T-19 | `shipping_paper.packing_group` | `text` | `not_applicable` | no | B1a |
| T-20 | `shipment.packaging_exceptions` | `text[]` | `{none}` | no | B1a |
| T-21 | `battery_record.state_of_charge_band` | `text` | `not_captured` | no | B1a |
| T-22 | `battery_record.status` | `text` | `draft` | no | B1a |
| T-23 | `container.container_type` | `text` | none — required | no | B1a |
| T-24 | `container.status` | `text` | `open` | no | B1a |
| T-25 | `lot.status` | `text` | `open` | no | B1a |
| T-26 | `storage_clock.status` | `text` | `not_started` | no | B1a |
| T-27 | `storage_clock.alert_band` | `text` | `none` | no | B1a |
| T-28 | `shipment.status` | `text` | `draft` | no | B1a |
| T-29 | `damage_assessment.finding_types` | `text[]` | none — minimum one | no | B1a |
| T-30 | `battery_record.ddr_flags` | `text[]` | `{}` — empty is normal | no | B1a |
| T-31 | `grade.grade_value` | `text` | none — required | no | B2 |
| T-32 | `battery_record.disposition_route` | `text` | `pending` | no | B2 |
| T-33 | `hazard_ranking.band` | `text` | none — required | no | B2 |
| T-34 | `hazard_ranking.factor_codes` | `text[]` | none — minimum one | no | B2 |
| T-35 | `recall_match.status` | `text` | `not_checked` | no | B2 |
| T-36 | `recall_match.source` | `text` | none — required | no | B2 |
| T-37 | `membership.role` | `text` | none — required | no | B1a |
| T-38 | `document_render.document_type` | `text` | none — required | no | B1a |
| T-39 | `document_render.status` | `text` | `draft` | no | B1a |
| T-40 | `jurisdiction.level` | `text` | none — required | no | B1a |
| T-41 | `jurisdiction_rule.domain` | `text` | none — required | no | B1a |
| T-42 | `rule_version.status` | `text` | `draft` | no | B1a |
| T-43 | `audit_event.event_type` | `text` | none — required | no | B1a |
| T-44 | `alert.alert_type` | `text` | none — required | no | B1a |
| T-45 | `classification_decision.status` | `text` | `pending` | no | B1a |
| T-46 | `damage_assessment.status` | `text` | `not_assessed` | no | B1a |
| T-47 | `tos_acceptance.status` | `text` | `not_accepted` | no | B1a |

**No enum column is nullable anywhere in this product.** "Not yet known" is a value with a name and a definition — `unknown`, `undetermined`, `not_captured`, `not_assigned`, `pending` — because null cannot be filtered, cannot be counted, cannot be explained to an auditor and cannot be distinguished from a bug. The one place absence is modelled as absence is T-30 `ddr_flags`, where an empty array is the normal state and a `none` value would be actively harmful.

**Values are stored as constrained `text`, not as Postgres `enum` types.** Adding a value must be an ordinary forward-only migration, not an `ALTER TYPE` that locks. Deprecating one must never require rewriting historical rows (§6).

### 5.7 Forbidden patterns

Each of these is a review rejection on sight.

| Forbidden | Why |
|---|---|
| Deriving a stored value from a label by string transform | Breaks on the first label containing punctuation, an accent or a regulatory phrase — silently, in a PDF. |
| Storing a display label in a database column | A copy edit becomes a data corruption. |
| Storing a persona ID (`P1`, `P6`) as a role value | Persona IDs are documentation identifiers (T-37). The stored value is `compliance_handler`. |
| `Title Case`, `camelCase`, `SCREAMING_SNAKE` or spaces in a stored value | Breaks the casing contract and therefore every filter written against it. |
| A threshold, unit, date or currency inside a value name | Hard-codes a jurisdiction rule into an identifier (§1.2). |
| A jurisdiction name inside a value name | Same, less obviously. |
| Sorting a user-facing list by stored value | Alphabetical order of machine strings is meaningless to a user. Order is defined by the value list constant, which is the display order. |
| An `enum` type in Postgres for these columns | Makes additions and deprecations lock-heavy and migration-heavy. |
| A nullable enum column | See §5.6. |
| Inventing a value not in this document | The value does not exist. Raise it to P6. |
| Re-using a retired value's string | See §6. |
| A second lookup of the same system anywhere in the codebase | Two lookups drift. There is exactly one per system. |

### 5.8 Reading unknown values

Every read path must tolerate a stored value it does not recognise — from a retired value in historical data, from a newer deployment, or from an import. The rule:

- **Render it, do not crash.** Show the raw stored value with a "retired value" affordance rather than blanking the field or throwing.
- **Never coerce it to a default.** Silently reading a retired `light_category_v1` as `light_category` fabricates a compliance record.
- **Never filter it out of a count.** A record that vanishes from a total because its value is unrecognised is the worst possible failure in an audit export.

---

## 6. Deprecation Log

**Five values were retired at v1.2**, all pre-launch, none with a production row behind them. The log format and rules were fixed at v1.0 before any retirement existed. It exists now, with its format and rules fixed, so that when the first value is retired it is recorded rather than silently deleted — because a value deleted without a record is a value that becomes unreadable in historical data, and historical data here is legal evidence with multi-year retention.

### 6.1 The rules

1. **A stored value is never deleted from the codebase.** It is marked retired and kept in the type, so historical rows continue to parse and render.
2. **A stored value is never renamed.** A rename is a retirement plus a new value, both logged here.
3. **A retired value's string is never reused** for a different meaning, ever.
4. **Historical rows keep their value.** Retiring a value does not rewrite the rows that hold it. A shipping paper issued under a retired classification must stay readable exactly as it was issued.
5. **Backfilling is a decision, not a default.** If a retirement genuinely requires historical rows to move, that is a separate, explicitly approved migration recorded in the "Handling in existing data" column — never an implicit consequence of the retirement.
6. **This log is append-only.** Entries are never edited or removed.
7. **Every retirement is approved by P6** and paired with a `TAXONOMY.md` version bump.

### 6.2 The format

| Retired on | Version | System | Retired value | Display label it had | Reason | Replaced by | Handling in existing data | Backfill required |
|---|---|---|---|---|---|---|---|---|
| 2026-08-11 | v1.2 | T-26 | `expired` | Expired | The same condition was named `expired` here and `overdue` on `container.status` (T-24) and `storage_clock.alert_band` (T-27). Three names for one condition is how a builder infers a fourth state. | `overdue` | Render as-is, do not coerce, do not exclude from counts (§5.8). | **no** — retired pre-launch; no production row has ever held this value. |
| 2026-08-11 | v1.2 | T-23 | `light_category` | Light waste category | T-23 became a composite of classification outcome × condition state so that a quarantine container can no longer mix outcomes (**Rule 4.28**, OQ-9). | `light_category_sound` | Render as-is, do not coerce. Do **not** assume a sound condition when reading a retired flat value. | **no** — retired pre-launch. |
| 2026-08-11 | v1.2 | T-23 | `fully_regulated` | Fully regulated hazardous | Same composite change. | `fully_regulated_sound` | As above. | **no** — retired pre-launch. |
| 2026-08-11 | v1.2 | T-23 | `damaged_defective` | Damaged / defective | Same composite change. The flat value carried no classification outcome, which is the defect. | `light_category_ddr` **or** `fully_regulated_ddr` — the outcome must be read from the record's own classification decision, never assumed. | Render as-is. **Never coerce**: guessing an outcome here fabricates a compliance record (§5.8). | **no** — retired pre-launch. |
| 2026-08-11 | v1.2 | T-23 | `quarantine_hold` | Quarantine hold | Same composite change. | `light_category_hold` **or** `fully_regulated_hold` — outcome read from the record, never assumed. | Render as-is. **Never coerce.** | **no** — retired pre-launch. |

**Column meanings**

- **Retired on** — the date the retirement shipped, ISO format.
- **Version** — the `TAXONOMY.md` version that carried the retirement.
- **System** — the system ID, e.g. `T-13`.
- **Retired value** — the exact stored string. Recorded here permanently so it can never be reused.
- **Display label it had** — what users saw, so historical exports and screenshots remain interpretable.
- **Reason** — why, in one sentence. "A rule change removed the category," not "cleanup."
- **Replaced by** — the stored value that supersedes it, or `none` where the concept genuinely ended.
- **Handling in existing data** — what read paths should do with rows still holding this value. The default is *render as-is, do not coerce, do not exclude from counts* (§5.8).
- **Backfill required** — `yes` or `no`. `yes` demands a separate approved migration recorded alongside.

---

*Next Sketch LLC · Confidential · August 2026*
