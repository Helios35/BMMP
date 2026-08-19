# Vision — BMMP
**Version:** 1.0 · **Date:** 2026-08-11 · **Owner:** Nathan Ivy / Next Sketch LLC
**Answers:** Why does this exist?
**Reads from:** `ROADMAP_BMMP_2026-07-28.md` (v3.0) · `Decision Log.md` (D-1–D-11) · `RESEARCH_battery-management-feature-sweep_2026-07-28.md` · `BMMP_MIP_SOW_DRAFT_2026-07-12.md` · `Monetization Overview – BMMP.md` · `_ANCHORS.md`  ·  **Feeds:** `PRD.md`, and through it the whole doc stack

> ## REVIEW NOTES
> None open. All review notes for this document were answered on 2026-08-19 — see `Decision Log.md` **D-20** for the full disposition, and D-21 through D-26 for the calls that carry their own rationale. Content below is unchanged.

---

## 0. What BMMP is, in one line

BMMP is **battery lifecycle software**. It follows a battery through the end of its life: **identify it → assess its condition → grade it → route it → dispose of it or resell it.** It covers batteries from vehicles, consumer electronics, industrial equipment, and small mobility devices such as power wheelchairs and mobility scooters.

The Mobility Intelligence Platform is **absorbed** into BMMP (D-11). MIP's purpose was battery health for mobility devices; BMMP now handles mobility-device batteries. That is a merge, not a rename — one product, one battery record, one catalog, one grading scheme.

---

## 1. Problem Statement

### 1.1 The industry's most frequent legal obligation has no software behind it

Every time a dead battery moves, a document has to move with it. In practice that document is the **transport shipping paper**, together with a container label and a storage clock — not the hazardous waste manifest.

This is the finding that reorients the whole product. **In 48 states, end-of-life lithium batteries are managed under a lighter-touch federal waste category that is explicitly exempt from the hazardous waste manifest.** EPA's own guidance states it plainly: those regulations do not mandate use of a uniform hazardous waste manifest or shipment by a hazardous waste transporter — but the Department of Transportation's rules for shipping lithium batteries do apply. California is the notable exception and treats these batteries as fully regulated.

The consequence: a product built around the manifest would be aimed at the rare document while the universal one — higher frequency, zero regulatory ambiguity — goes unserved. And it is genuinely unserved. **The Automotive Recyclers Association's own 2026 state-by-state battery compliance guide ships a printable PDF checklist and names zero software platforms.** The trade body for the exact buyer considers paper the state of the art. The incumbent compliance vendors in adjacent waste software have no battery-specific handling at all.

That is the gap: the highest-frequency legally mandated workflow in the industry is being done in spreadsheets, by people who will be audited on it.

### 1.2 The obvious buyer is the least solvent one

The battery recycling industry is in active financial distress, and it is not a blip:

- **Li-Cycle** filed for creditor protection in May 2025; its assets were acquired by Glencore in August 2025.
- **Ascend Elements filed Chapter 11 on 9 April 2026**, after two Department of Energy grants ($164M and $316M) were cancelled.
- **Redwood Materials laid off roughly 135 people — about 10% of staff — in April 2026.**

The root cause is structural, not cyclical: North American battery recycling built capacity for a wave of feedstock that has not arrived. Fastmarkets estimates more than twice as much shredding capacity as feedstock exists.

The unit economics compound it. Salvage yards face gate fees of **$1.50–$2.00 per kilogram** for LFP packs; one Massachusetts yard was quoted **negative $1,800** to recycle a single Tesla pack. A growing share of battery volume is worth *less than nothing*.

Two things follow, and both shape the product. First, **selling into the recycler is selling into a distressed budget** — the money and the statutory deadlines sit one step upstream, with producers, generators and receiving facilities. Second, **every marketplace in this space is built to help a seller maximise returns, and the actual 2026 job-to-be-done is frequently the inverse**: least-cost compliant disposal with a paper trail that survives an audit.

### 1.3 Legal obligations are arriving on a published schedule, in fourteen different shapes

Roughly **14 states plus DC** now carry battery producer-responsibility law, with **40+ dated obligations running 2026 through 2035**. Every one of them uses different weight and energy thresholds, different covered categories, and different dates. The same battery classifies differently in Washington, Colorado and Illinois.

The population under these rules is not growing gradually. **Fewer than 1 million Americans lived under all-household-battery recycling requirements in 2024. By 2027 that exceeds 61 million.** The customer base arrives on a schedule that is already published.

Nobody sells software for this. It is the most defensible opening identified in the entire research sweep, and it is fundamentally data plumbing — which is exactly why it must be **built as data and never as code**. Fourteen divergent statutes, fire codes adopted 12–24 months apart by jurisdiction, and a pending federal rule that could restructure lithium waste classification mean anything hard-coded needs rewriting inside eighteen months.

### 1.4 There is no grading standard, so "good condition" means nothing

**As of July 2026 there is no ANSI, UL or IEC letter-grade standard for used batteries.** UL 1974 is a *process* standard for repurposing facilities. IEC 63338 explicitly declines to define grades. IEC 63330-2 is unpublished. Anyone claiming to follow a grading standard is describing a private scheme.

So two parties handling the same battery have no shared vocabulary for its condition, no way to verify a counterparty's claim, and no basis for the reuse-versus-recycle decision that determines whether the battery is an asset or a liability. This is a standardisation vacuum with no incumbent to displace.

### 1.5 Insurers and fire marshals are applying pressure the customer cannot answer today

Lithium battery fires are up **over 25% in five years**, and North America recorded **448 waste-facility fires in 2024** — a record since tracking began. Insurers have responded by demanding, before they will write coverage: documented risk assessments, thermal-runaway test results, emergency response plans, proof of regular maintenance, and continuous monitoring capability. Non-compliance risks premium increases or outright coverage denial.

Meanwhile the storage rules themselves diverge by jurisdiction. The 2024 fire code section governing stored lithium inventory is new and becoming the de facto benchmark, but some jurisdictions measure the same inventory by volume and others by energy, and code adoption lags 12–24 months behind publication.

A facility manager is therefore accountable to a fire marshal and an underwriter for artifacts they currently assemble by hand, once a year, under time pressure, from records that were never designed to produce them.

### 1.6 And the identity link keeps getting broken

The named failure mode in this field is that the link between a battery and the device or vehicle it came out of gets severed somewhere in the chain. Once it is gone, the record cannot be rebuilt — not the chemistry, not the age, not the recall status, not the provenance an auditor or a buyer would want.

**Chemistry cannot be recovered from a photograph.** It is printed on the label. The best published academic attempt classifies 10 classes from roughly 500 images of consumer cells and does not generalise; the largest public battery image dataset detects form factor only. The industry's own answer was to deploy X-ray and XRF sorting machines rather than camera rigs — which is the strongest available evidence that ordinary photographs cannot do this. What *does* work today is reading the label with a vision model and resolving it against a catalog, with a person confirming the answer.

---

## 2. Target User

BMMP is sold to organisations that hold dead batteries and are accountable for them. It is **not** primarily sold to recyclers (§1.2).

### 2.1 The people who use it

Persona IDs are fixed in `_ANCHORS.md` §2 and are used throughout the doc stack.

| ID | Persona | Phase | The problem they personally have |
|---|---|---|---|
| **P1** | **Compliance Handler** | B1a | Logs batteries, photographs labels, confirms identification, prints shipping papers and container labels. The daily user. Today they do this in a spreadsheet and a filing cabinet, and they are the person who gets asked to produce a record from fourteen months ago. |
| **P2** | **Facility Manager** | B1a | Owns the storage area. Watches storage clocks and stored volume against fire-code thresholds. Answers to the fire marshal and the insurer, and currently assembles that evidence by hand at renewal. |
| **P3** | **Producer Compliance Officer** | B1b | Registers the company with state agencies, files annual sales reports, tracks dated obligations across states. Today this is a research project run against fourteen different statutes with a calendar reminder as the control. |
| **P4** | **Mobility Supplier Technician** | B3 | Swaps a wheelchair or scooter battery on site and needs disposal documentation for the old pack. Replaces batteries constantly; every replaced pack becomes their disposal problem. |
| **P5** | **Auditor / Underwriter** | B1b | External, read-only. Reads the evidence pack at renewal or audit. Never edits. Their questions are the reason the reasoning trail exists. |
| **P6** | **Platform Admin** | B1a | Next Sketch / Jonathan side. Manages tenants, the battery catalog, and jurisdiction rules data. Every regulatory change lands on this person as a data edit, not a deploy. |

### 2.2 The organisations that buy it

- **Generators** — auto dismantlers, dealerships and service networks, electronics aggregators, industrial equipment operators. They have DOT and waste-handling obligations on every movement and no software.
- **Producers and importers** placing batteries on the market in states with producer-responsibility law. They have dated statutory obligations and a growing footprint of states.
- **Receiving and consolidation facilities** holding volume against fire-code thresholds and insurer requirements.
- **Mobility equipment suppliers and repair companies** (from B3) — the same customer the absorbed MIP was aimed at, now sold a battery product.

### 2.3 Who this is not aimed at

Distressed recyclers as the primary buyer (§1.2); OEMs whose primary need is a European passport (§5, and an open Gate 0 decision); and anyone whose problem is a hazardous waste manifest today rather than a shipping paper.

---

## 3. Proposed Solution

Outcomes, not features. Feature sequencing lives in the roadmap; behaviour lives in the PRD; decision logic lives in `BUSINESS_RULES.md`.

**O-1 — The legally required document comes out correct the first time, without a spreadsheet.**
A handler logs a battery and the shipping paper, the container label and the storage clock follow from that one act. The document that legally travels with almost every battery stops being a manual re-typing exercise. This is the highest-frequency workflow in the industry and it is the first thing BMMP does, because Principle 1 says ship the legally required document before the clever one.

**O-2 — The classification decision carries its own reasoning, and the reasoning survives the audit.**
Whether a stream is handled under the light waste category or as fully hazardous is the single highest-value piece of logic in the product — the thing a compliance officer cannot get from a spreadsheet. BMMP records not just the answer but why, against which jurisdiction's rule, at which version of that rule. When the auditor asks in 2029 why a 2026 shipment went the way it did, the answer is in the record rather than in someone's memory.

**O-3 — The storage clock never runs out quietly.**
The one-year clock is currently demonstrated by a marker pen on a drum. BMMP makes it an inventory the facility manager can see, with warnings that arrive early enough to act on, per the rules in `BUSINESS_RULES.md` §4.

**O-4 — Battery identity is confirmed, not guessed.**
A photograph is taken, the **label is read** by a vision model with a confidence value on every extracted field, the product is **matched from the catalog**, and a person **confirms** chemistry, model and condition before anything commits. Chemistry is never inferred from the appearance of a battery — it is not visible in an image, and BMMP does not claim it is. Anything the pipeline is not confident about goes to a review queue instead of into a document. This ships on day one and needs no harvested training data.

**O-5 — Every record is independently useful the day it is captured.**
The test, from Principle 3: *if the AI never switches on, did the data still earn its keep?* For BMMP the answer is yes — every record is a compliance artifact, an audit exhibit and an insurance exhibit at the moment of capture. The training corpus it also happens to build is upside, not the business case.

**O-6 — Multi-state producer obligations become a dated calendar instead of a research project.**
Given what a company sells and where, BMMP returns which statutes apply, which stewardship organisation to join, and every deadline with its citation. Because every threshold, date and citation is **data, not code**, a statutory change is a data edit made by P6 — not a release.

**O-7 — Renewal-time evidence is a byproduct rather than a scramble.**
The inspection logs, training records, emergency response plan, and quantity and segregation reports an underwriter demands are produced by ordinary use of the platform and exported in one action. The claim is that BMMP produces the evidence the underwriter asks for. It is not a claim about premiums (see RN-3).

**O-8 — Condition gets a grade that means the same thing to two different parties.**
Into a standardisation vacuum with no incumbent (§1.4), BMMP publishes a transparent, documented grading scheme with an auditable basis for every grade. Where a hazard view is offered it is a **relative ranking with a stated basis for each factor — never a probability of ignition.** That distinction is legal exposure, not word choice. Where condition matters beyond what paperwork can support, BMMP **integrates a third-party health tester rather than inventing measurement**; the product reports *assessed* condition, and says so.

**O-9 — One product covers every battery size, including the small ones.**
A power wheelchair pack and an EV traction pack move through the same intake, the same documents and the same rules engine. This is what makes the MIP absorption real rather than nominal, and it is why the battery record and the jurisdiction rules model are built wide from the first migration rather than widened later.

---

## 4. Success Metrics

The roadmap's gate outcomes are the only hard targets in v1.0. Everything else is defined here and baselined with the first real customer (see RN-2). A gate is a real user completing a real task on live data, or it is not a gate.

### 4.1 Gate outcomes — the hard targets

| # | Outcome | Date |
|---|---|---|
| **Gate 1** | A real business logs a battery, receives a correct shipping paper and container label, and has a storage clock running — end to end, on live data. Captured records verified labeled, linked and training-ready. | 16 Oct 2026 |
| **Gate 2** | Paying customers on live data for compliant documentation, storage tracking, multi-state producer obligations and insurance evidence. | 11 Dec 2026 |
| **Gate 3** | Identification accuracy on degraded labels measurably beats the general-model baseline. A grading recommendation is produced with a stated confidence and an auditable basis. | 12 Mar 2027 |
| **Gate 4** | A mobility equipment supplier logs a replaced wheelchair battery, gets correct disposal documentation and a grade, and their producer obligations are tracked — on live data. | 9 Apr 2027 |
| **Delivery** | Final acceptance, 72-hour stability soak, documentation handover, acceptance working session. | 30 Apr 2027 |

### 4.2 Operating metrics — defined now, baselined at Gate 1

| Metric | What it tells us | Target |
|---|---|---|
| Documents used as issued | Share of generated shipping papers and container labels the customer uses without manual correction or re-issue. The core "does it actually work" measure. | Baseline at Gate 1 with the first customer |
| Storage clocks expiring without an alert having fired | Whether the product does the one thing a facility manager cannot afford it to miss. | **Zero.** Non-negotiable |
| Classification decisions with a recorded reason | Whether the audit trail is real or aspirational. | **100%.** It is a rule, not a goal |
| Records clearing the confidence gate without human review | How much work the identification pipeline actually removes. Rises as the label corpus matures. | Baseline at Gate 1, improvement demonstrated at Gate 3 |
| Label crops stored against a human-confirmed product | The size of the asset no public equivalent exists for. | Verified training-ready at Gate 1; growth tracked thereafter |
| Time from battery arriving to documents in hand | The customer-visible saving against the spreadsheet. | Baseline at Gate 1 |
| Renewal after a first audit or insurance cycle | Whether the evidence pack is worth paying for twice. | Measured from Gate 2 onward |
| Probability-of-ignition language anywhere in a shipped surface | Our own compliance with Principle 4, across UI, API, exports and PDFs. | **Zero.** Verified by sweep every sprint |
| Jurisdiction thresholds, deadlines or citations found in code | Our own compliance with Principle 5. | **Zero.** Verified at code review |

---

## 5. Non-Goals

What BMMP is explicitly not trying to solve. Named so nothing is silently dropped and nothing is silently added.

| Non-goal | Why | Revisit |
|---|---|---|
| **Autonomous vehicles, self-driving, or robotic autonomy** | No phase involves a vehicle driving, steering, routing or navigating itself. Where this program says "predictive," it means **predicting how worn out a battery is**. It never means predicting or controlling vehicle motion. | Never — this is a boundary, not a backlog item |
| **Hardware of any kind** | No devices are built, sold or attached to anything (D-4, reinforced by D-11). Software-first is the thesis, and for anything attaching to a mobility device the regulatory cliff is real and expensive. | After the software is built and validated, under a separate SOW |
| **In-house battery health measurement** | Principle 7 — integrate, don't invent. Credible health measurement needs lab equipment or purpose-built handheld testers; the leading competitor licenses hardware rather than building it. BMMP reports **assessed** condition and plugs into existing testers. The integration socket ships in B3; the tester is chosen later. | When a customer needs measured rather than assessed condition |
| **A marketplace connecting battery holders to recyclers — deferred** | A competitor already ships marketplace, battery identification, valuation and transport classification with a major automaker as anchor customer. Another company tried the pure-marketplace model and pivoted to brokerage. And with disposal fees running on the newest chemistry, a growing share of volume is worth less than nothing — which a bidding marketplace mis-models. | **Gate 3 (Mar 2027) — build, partner, or skip.** Deferred, not dropped |
| **The European Battery Passport — open decision at Gate 0** | Different buyer, different regulation, and a firm 18 Feb 2027 deadline sitting on a specification that was still being updated in June 2026, with the access-rights implementing act not expected until Q4 2026. It does not fit this plan; if taken, it must start by October. **Adopting the Battery Pass data model in B1a keeps the option open cheaply either way.** | **Gate 0 — 14 Aug 2026. Jonathan's call.** See RN-1 |
| **The hazardous waste manifest and electronic manifest integration as the entry product** | The federal rule forcing the industry onto electronic paperwork is proposed but not final, and most battery flows need no manifest at all. Strong second product, wrong first one. | When the final rule publishes |
| **Any probability of ignition, or prediction of an individual cell's thermal runaway** | No evidence base exists for it. Hazard output is a relative ranking with a stated basis per factor. This is legal exposure, not accuracy. | Never |
| **Chemistry inference from a photograph with no legible label** | Not achievable, and not to be promised in any document or demo (D-7). The label is read; the chemistry is matched from the catalog and confirmed by a person. | Never |
| **Physical recycling facilities, facility digital twins, or feedstock heat maps** | Out of scope for this engagement (D-4, SOW §2.4). The draft Vision brief describes these; the roadmap does not. | Separate future SOW |
| **A generic waste-management ERP** | The seam in the market is battery-specific handling — which the incumbent waste-compliance vendors do not have. Generic breadth is the opposite of the wedge. | Never |
| **Repair-deadline compliance software for mobility equipment** | Dropped from scope entirely, not deferred (D-11). It does not touch a battery, so it is not a battery product. Recorded as a possible standalone business unrelated to this program. | Never, within this program |
| **Clinical or medical claims about mobility device users** | Instant medical-device regulatory exposure. BMMP's stated purpose stays equipment-focused. | Never |

### 5.1 One thing that is explicitly *not* a non-goal

**The Mobility Intelligence Platform was absorbed, not cut.** MIP's purpose — battery health for mobility devices — is delivered by widening BMMP's battery coverage rather than by running a second platform (D-11). The mobility-device battery is in scope, the mobility supplier is a named persona (P4), and Phase B3 exists to serve them. Any statement that MIP was dropped, cut or descoped is wrong and should be corrected wherever it appears.

---

## Appendix A — Claim traceability

Every factual claim above traces to the research sweep. This table is the map, for anyone who has to defend a claim in front of Jonathan or a customer.

| Claim | Source |
|---|---|
| 48 states manage these batteries under the lighter category; manifest-exempt; California the exception | Research §0 finding 1, §1.1 |
| EPA guidance on manifest exemption vs DOT applicability | Research §1.1 |
| Trade association's 2026 guide is a printable PDF checklist naming zero software | Research §1.1 |
| Incumbent waste-compliance vendors have no battery-specific handling | Research §3.1 |
| Li-Cycle, Ascend Elements, Redwood — insolvency, Chapter 11, layoffs | Research §0 finding 5, §3.2 |
| Overbuilt shredding capacity vs feedstock | Research §3.2 |
| LFP gate fees $1.50–2.00/kg; negative $1,800 quote | Research §3.2 |
| ~14 states plus DC; 40+ dated obligations 2026–2035; divergent thresholds | Research §0 finding 7, §1.3 |
| Under 1 million Americans in 2024 → over 61 million by 2027 | Research §1.3 |
| No ANSI/UL/IEC letter-grade standard as of July 2026 | Research §2.3 |
| Fires up over 25% in five years; 448 waste-facility fires in 2024 | Research §1.4 |
| What insurers demand before writing coverage | Research §1.4 |
| Jurisdictional variation in stored-inventory rules; 12–24 month adoption lag | Research §1.4, §6 |
| Chemistry not inferable from a photograph; X-ray/XRF deployed instead | Research §0 finding 2, §2.1 |
| Label reading + catalog resolution is what works today | Research §2.1 |
| Provenance link severance is the named field failure mode | Research §2.3 |
| Marketplace already shipped by a competitor with an OEM anchor | Research §0 finding 6, §3.1 |
| Battery Pass data model is free and openly licensed | Research §1.5 |
| EU passport deadline firm, specification unfinished | Research §1.5, §6 |
| Health measurement needs lab or purpose-built equipment | Research §2.2; D-11 |
| Federal lithium waste rule proposed, not published | Research §6 |

**Not sourced from the draft Vision brief.** No figure in this document comes from `Battery Material Management Platform Vision.md` — see RN-4.

---

*Next Sketch LLC · Confidential · August 2026*
