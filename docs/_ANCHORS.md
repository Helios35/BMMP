# BMMP Doc Stack — Shared Anchors

*Every doc-stack author reads this first. These names, numbers and lists are FIXED. Do not invent alternatives, do not rename, do not renumber. Cross-doc citations depend on them.*

**Version:** 1.0 · 2026-08-11

---

## 0. Scope of this doc stack

The roadmap runs Aug 2026 → Apr 2027 across four build phases. **This stack is written to B1a depth.** B1b, B2 and B3 are named, their entities reserved and their rule sections stubbed — but not fully specified. They get filled in at Gate 1 and Gate 2.

Two exceptions where B1b/B2/B3 must be specified **now**, because building them narrow makes a later phase a rebuild:

- **The battery record** holds small mobility-device packs (power wheelchair, mobility scooter) from the first migration. Not added later.
- **The jurisdiction rules data model** carries the medium-format category that covers scooter and mobility packs from the first migration.

The first shipped slice is a **mock-data prototype**: all screens and flows on fake data behind `src/data`, migrating to Supabase after the UI settles. Docs describe the product, not the mock — but the UX Spec and Site Architecture are what the prototype is built from, so they carry the most detail.

---

## 1. Product one-liner

BMMP is battery lifecycle software. It follows a battery through the end of its life: **identify it → assess its condition → grade it → route it → dispose of it or resell it.** It covers batteries from vehicles, consumer electronics, industrial equipment, and small mobility devices.

**What it is not:** not an autonomous-vehicle or self-driving product. Not a hardware product — no devices are built, sold or attached to anything. "Predictive" in this product means *predicting how worn out a battery is*, never predicting or controlling vehicle motion.

---

## 2. Personas — FIXED IDs

| ID | Name | Phase | What they do |
|---|---|---|---|
| **P1** | Compliance Handler | B1a | Logs batteries, photographs labels, confirms identification, prints shipping papers and container labels. The daily user. |
| **P2** | Facility Manager | B1a | Owns the storage area. Watches storage clocks and volume against fire-code thresholds. Answers to the fire marshal and the insurer. |
| **P3** | Producer Compliance Officer | B1b | Registers the company with state agencies, files annual sales reports, tracks dated obligations across states. |
| **P4** | Mobility Supplier Technician | B3 | Swaps a wheelchair or scooter battery on site, needs disposal documentation for the old pack. |
| **P5** | Auditor / Underwriter | B1b | External, read-only. Reads the evidence pack at renewal or audit. Never edits. |
| **P6** | Platform Admin | B1a | Next Sketch / Jonathan side. Manages tenants, the battery catalog, and jurisdiction rules data. |

---

## 3. Core entities — FIXED NAMES

Database naming is `snake_case`. Types in TypeScript are `PascalCase` singular.

**Tenancy and identity**

`organization` · `user` · `membership` (user↔organization with role) · `tos_acceptance`

**Battery and identification**

`battery_record` (the canonical record — sized wide, see §0) · `catalog_entry` (known battery products) · `intake_session` · `intake_photo` · `label_extraction` (per-field values + per-field confidence) · `date_code_decode`

**Storage and containers**

`container` · `lot` · `storage_clock` · `storage_event` · `alert`

**Classification and documents**

`classification_decision` (light waste category vs full hazardous, with recorded reasoning) · `shipment` · `shipping_paper` · `container_label` · `document_render` (any generated PDF instance)

**Condition**

`damage_assessment` · `grade` (B2) · `hazard_ranking` (B2) · `recall_match` (B2)

**Rules as data**

`jurisdiction` · `jurisdiction_rule` · `rule_version` · `format_classification` (the per-jurisdiction, per-rule-version size/format result for a battery — keyed on `(battery_record, jurisdiction, rule_version)`, never a column on `battery_record`, because the same battery classifies differently by state) · `producer_obligation` (B1b) · `obligation_deadline` (B1b)

**Evidence and audit**

`evidence_pack` (B1b) · `audit_event`

---

## 4. Business Rules — FIXED SECTION NUMBERS

Every rule is numbered `<section>.<n>`. Other docs cite rules by number. **These section numbers do not move.** B1b/B2/B3 sections exist now as stubs so later citations stay stable.

| § | Area | Phase |
|---|---|---|
| **1** | Access, tenancy and roles | B1a |
| **2** | Battery intake and identification | B1a |
| **3** | Waste classification — light category vs full hazardous | B1a |
| **4** | Storage, containers and the one-year clock | B1a |
| **5** | Transport documentation and shipping papers | B1a |
| **6** | Damage, defect and the air-transport prohibition | B1a |
| **7** | Data capture, consent and training rights | B1a |
| **8** | Producer obligations and state registration | B1b — stub |
| **9** | Insurance evidence and fire-code volume | B1b — stub |
| **10** | Grading, damage triage and hazard ranking | B2 — stub |
| **11** | Mobility and small-battery coverage | B3 — stub |
| **12** | Audit, retention and export | B1a |

---

## 5. B1a page list — FIXED

Site Architecture and UX Spec must use exactly these. Route groups per `PROJECT_SETUP_BMMP.md` §3.1.

| Route | Purpose | Access |
|---|---|---|
| `/sign-in`, `/sign-up`, `/invite/[token]` | Authentication | public |
| `/` | Dashboard — open storage clocks, review queue count, alerts | any member |
| `/batteries` | Battery list, filter and search | any member |
| `/batteries/new` | Intake flow — multi-step: photo → extraction review → confirm | P1, P6 |
| `/batteries/[id]` | Battery record detail, history, linked documents | any member |
| `/review` | Confidence-gated review queue — low-confidence extractions | P1, P6 resolve · **P2 view-only** |
| `/containers` | Container list with fill level and storage clock | any member |
| `/containers/[id]` | Container detail, contents, label generation | P1, P2, P6 |
| `/shipments` | Shipment list | any member |
| `/shipments/new` | Build a shipment from containers or lots | P1, P6 |
| `/shipments/[id]` | Shipment detail with generated shipping paper | any member |
| `/documents/[id]` | Document viewer — print / download any generated document | any member |
| `/catalog` | Battery catalog browse and search | any member |
| `/catalog/[id]` | Catalog entry detail | any member |
| `/settings/organization` | Org profile, jurisdiction profile | P2, P6 |
| `/settings/users` | Members and roles | P2, P6 |
| `/settings/catalog` | Propose / edit catalog entries | P6 |
| `/audit` | Audit log, filterable, exportable | P2, P5, P6 |

---

## 6. AI orchestration patterns — FIXED

Per the SKETCH orchestration cheat sheet. The Technical Spec states these explicitly.

**Intake identification (B1a) — Sequential (pipeline), code-orchestrated, human gate at the end.**
`intake_photo` → label crop → vision extraction (per-field values + per-field confidence) → catalog match → **confidence gate** → human confirmation by P1. Fixed order. No agent chooses the next step. Every step logged to `audit_event`.

**Confidence gate rule:** any field below threshold routes the whole record to `/review`. Nothing auto-commits an unconfirmed chemistry, model or condition. This is a hard rule, not a tunable default.

**Assessment (B2) — Concurrent fan-out / fan-in over one record, then a sequential grading step, human gate at the end.**
Damage triage, recall match and hazard ranking run independently on the same record and are reassembled; grading consumes all three. Independent because none reads another's output.

**No handoff, group-chat or hierarchical pattern is used anywhere in this product.** If a future workflow appears to need one, that is a decision-log entry, not a builder's call.

---

## 7. Language rules that bind every doc

1. **Never write a probability of ignition.** Hazard output is a *relative ranking with a stated basis per factor*. Not a probability, percentage, likelihood, or "risk of fire." UI copy, API responses, exports and PDFs included.
2. **Never say chemistry is detected from a photo.** The label is *read*; chemistry is *matched from the catalog* and *confirmed by a human*. Chemistry cannot be seen in an image.
3. **Never describe MIP as cut, dropped or descoped.** It was **absorbed**: MIP was about mobility-device batteries; BMMP now handles mobility-device batteries.
4. **Never hard-code a jurisdiction threshold, deadline or citation.** Rules are data. A doc that specifies a state threshold as a literal in code is wrong.
5. **"Assessed condition," not "measured condition."** BMMP integrates third-party health testers; it does not measure battery health itself.

---

## 8. Source documents

Staged at `/mnt/user-data/uploads/Jonathan AI Platforms/`:

- `ROADMAP_BMMP_2026-07-28.md` — v3.0, the authority on phases, gates and principles
- `Decision Log.md` — D-1 through D-11
- `RESEARCH_battery-management-feature-sweep_2026-07-28.md` — the evidence behind every claim
- `BMMP_MIP_SOW_DRAFT_2026-07-12.md` — the contract; note §11's M2 clause is a carried exposure
- `Battery Management Platform/Battery Material Management Platform Vision.md` — **draft numbers contain AI-citation cruft (stray `+4`, `7777`). Do not copy any figure from it without confirming against the research sweep.**
- `Battery Management Platform/Monetization Overview – Battery Material Management Platform (BMMP).md`

Setup reference: `/home/claude/PROJECT_SETUP_BMMP.md`

---

## 9. File names — FIXED, stable forever

`docs/VISION.md` · `docs/PRD.md` · `docs/SITE_ARCHITECTURE.md` · `docs/UX_SPEC.md` · `docs/BUSINESS_RULES.md` · `docs/TAXONOMY.md` · `docs/TECHNICAL_SPEC.md` · `docs/ERD.md` · `docs/RUNBOOK.md`

Every doc opens with:

```
# <Title> — BMMP
**Version:** 1.0 · **Date:** 2026-08-11 · **Owner:** Nathan Ivy / Next Sketch LLC
**Answers:** <the one question this doc owns>
**Reads from:** <upstream docs>  ·  **Feeds:** <downstream docs>

> ## REVIEW NOTES
> *Unresolved judgment calls. Content below is unchanged until the owner picks.*
> - **RN-1** — <question>. **Recommendation:** <call>.
```

If there are no open judgment calls, write `> None open.` — never delete the block.
