/**
 * Stable fixture identifiers.
 *
 * Fixed rather than generated, so a Playwright selector, a test assertion and a
 * screenshot all refer to the same row across runs. Real UUID v4 shape, because
 * a screen that renders an id must render one that looks like the one it will
 * render in production.
 */

const uid = (block: string, n: number): string =>
  `${block}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const ORG = {
  cascade: uid("0a000001", 1),
  rainier: uid("0a000001", 2),
  /**
   * Third tenant, holding **no Terms of Service acceptance in force** — E-12's
   * subject, and the only organization where the intake block is reachable.
   * It also holds no battery record at all, which is what makes E-1's five role
   * variants renderable without emptying a table in a test.
   */
  olympic: uid("0a000001", 3),
} as const;

export const USER = {
  /** P1 · Compliance Handler at Cascade. The daily user. */
  danaHandler: uid("0a000002", 1),
  /** P2 · Facility Manager at Cascade. Holds Cascade's binding authority (D-35). */
  martaManager: uid("0a000002", 2),
  /** P5 · Auditor at Cascade. Read-only, externally, everywhere, always. */
  samAuditor: uid("0a000002", 3),
  /** P6 · Platform Admin. Not a membership role. */
  platformAdmin: uid("0a000002", 4),
  /** P1 at Rainier — the second tenant, so isolation is testable. */
  joRainierHandler: uid("0a000002", 5),
  /** P3 · Producer Compliance Officer at Cascade. */
  priyaProducer: uid("0a000002", 6),
  /** P4 · Mobility Supplier Technician at Cascade. */
  omarTechnician: uid("0a000002", 7),
  /** P5 whose grant has **expired** — Rules 1.15, 1.28's subject. */
  leeAuditorExpired: uid("0a000002", 8),
  /** P2 at Olympic, holds Olympic's binding authority. */
  rosaOlympicManager: uid("0a000002", 9),
  /** P1 at Olympic. */
  tomOlympicHandler: uid("0a000002", 10),
} as const;

export const MEMBERSHIP = {
  danaCascade: uid("0a000003", 1),
  martaCascade: uid("0a000003", 2),
  samCascade: uid("0a000003", 3),
  joRainier: uid("0a000003", 4),
  /** Invited, not yet accepted — `user_id` is still null. Token state `valid`. */
  pendingInvite: uid("0a000003", 5),
  priyaCascade: uid("0a000003", 6),
  omarCascade: uid("0a000003", 7),
  /** P6's **recorded support grant** on Cascade, in force (Rules 1.17, 1.18). */
  platformAdminCascadeGrant: uid("0a000003", 8),
  /** P6's **expired** grant on Rainier — platform scope alone buys nothing (Rule 1.17). */
  platformAdminRainierExpired: uid("0a000003", 9),
  /** P5 whose `grantExpiresAt` is in the past — Rule 1.28 mid-session. */
  leeCascadeExpired: uid("0a000003", 10),
  rosaOlympic: uid("0a000003", 11),
  tomOlympic: uid("0a000003", 12),
  /** Marta's second organization — the switcher's only subject (E-16). */
  martaOlympic: uid("0a000003", 13),
  /** Invited, never accepted, past its window. Token state `expired`. */
  expiredInvite: uid("0a000003", 14),
  /** Invited, then withdrawn. Token state `revoked`. */
  revokedInvite: uid("0a000003", 15),
} as const;

export const TOS = {
  cascadeInForce: uid("0a000004", 1),
  rainierInForce: uid("0a000004", 2),
  /** T-47 `not_accepted` — a real row, not an absent one. E-12. */
  olympicNotAccepted: uid("0a000004", 3),
} as const;

export const JURISDICTION = {
  federal: uid("0a000005", 1),
  washington: uid("0a000005", 2),
  // b1b-12 — every other state and DC (T-40 codes; spec §6). Appended in a
  // fixed order, so each id stays the same row forever.
  alabama: uid("0a000005", 3),
  alaska: uid("0a000005", 4),
  arizona: uid("0a000005", 5),
  arkansas: uid("0a000005", 6),
  california: uid("0a000005", 7),
  colorado: uid("0a000005", 8),
  connecticut: uid("0a000005", 9),
  delaware: uid("0a000005", 10),
  districtOfColumbia: uid("0a000005", 11),
  florida: uid("0a000005", 12),
  georgia: uid("0a000005", 13),
  hawaii: uid("0a000005", 14),
  idaho: uid("0a000005", 15),
  illinois: uid("0a000005", 16),
  indiana: uid("0a000005", 17),
  iowa: uid("0a000005", 18),
  kansas: uid("0a000005", 19),
  kentucky: uid("0a000005", 20),
  louisiana: uid("0a000005", 21),
  maine: uid("0a000005", 22),
  maryland: uid("0a000005", 23),
  massachusetts: uid("0a000005", 24),
  michigan: uid("0a000005", 25),
  minnesota: uid("0a000005", 26),
  mississippi: uid("0a000005", 27),
  missouri: uid("0a000005", 28),
  montana: uid("0a000005", 29),
  nebraska: uid("0a000005", 30),
  nevada: uid("0a000005", 31),
  newHampshire: uid("0a000005", 32),
  newJersey: uid("0a000005", 33),
  newMexico: uid("0a000005", 34),
  newYork: uid("0a000005", 35),
  northCarolina: uid("0a000005", 36),
  northDakota: uid("0a000005", 37),
  ohio: uid("0a000005", 38),
  oklahoma: uid("0a000005", 39),
  oregon: uid("0a000005", 40),
  pennsylvania: uid("0a000005", 41),
  rhodeIsland: uid("0a000005", 42),
  southCarolina: uid("0a000005", 43),
  southDakota: uid("0a000005", 44),
  tennessee: uid("0a000005", 45),
  texas: uid("0a000005", 46),
  utah: uid("0a000005", 47),
  vermont: uid("0a000005", 48),
  virginia: uid("0a000005", 49),
  westVirginia: uid("0a000005", 50),
  wisconsin: uid("0a000005", 51),
  wyoming: uid("0a000005", 52),
} as const;

export const JURISDICTION_RULE = {
  waAccumulationPeriod: uid("0a000006", 1),
  waWasteClassification: uid("0a000006", 2),
  federalTransport: uid("0a000006", 3),
  federalRetention: uid("0a000006", 4),
  /** Authored by planning in brief 06 (D-58 item 2). */
  federalShipperCertification: uid("0a000006", 5),
  /** The container label phrase — the owner's call in b1a-06. */
  waContainerLabel: uid("0a000006", 6),
  /** DDR packaging and marking — `SPEC_ddr-packaging-rule-data_2026-10-22.md`, b1a-08. */
  federalDdrPackaging: uid("0a000006", 7),
  // b1b-12 — each Appendix A state's two producer rules (Rule 8.7).
  waProducerCoverage: uid("0a000006", 8),
  waProducerObligations: uid("0a000006", 9),
  ilProducerCoverage: uid("0a000006", 10),
  ilProducerObligations: uid("0a000006", 11),
  coProducerCoverage: uid("0a000006", 12),
  coProducerObligations: uid("0a000006", 13),
  ctProducerCoverage: uid("0a000006", 14),
  ctProducerObligations: uid("0a000006", 15),
  vtProducerCoverage: uid("0a000006", 16),
  vtProducerObligations: uid("0a000006", 17),
  neProducerCoverage: uid("0a000006", 18),
  neProducerObligations: uid("0a000006", 19),
  wiProducerCoverage: uid("0a000006", 20),
  wiProducerObligations: uid("0a000006", 21),
  orProducerCoverage: uid("0a000006", 22),
  orProducerObligations: uid("0a000006", 23),
  meProducerCoverage: uid("0a000006", 24),
  meProducerObligations: uid("0a000006", 25),
  caProducerCoverage: uid("0a000006", 26),
  caProducerObligations: uid("0a000006", 27),
  nyProducerCoverage: uid("0a000006", 28),
  nyProducerObligations: uid("0a000006", 29),
  mnProducerCoverage: uid("0a000006", 30),
  mnProducerObligations: uid("0a000006", 31),
  njProducerCoverage: uid("0a000006", 32),
  njProducerObligations: uid("0a000006", 33),
  iaProducerCoverage: uid("0a000006", 34),
  iaProducerObligations: uid("0a000006", 35),
  dcProducerCoverage: uid("0a000006", 36),
  dcProducerObligations: uid("0a000006", 37),
  // b1b-13 — Appendix B's six states' filings rule (Rule 8.18).
  vtProducerFilings: uid("0a000006", 38),
  ctProducerFilings: uid("0a000006", 39),
  meProducerFilings: uid("0a000006", 40),
  caProducerFilings: uid("0a000006", 41),
  coProducerFilings: uid("0a000006", 42),
  njProducerFilings: uid("0a000006", 43),
} as const;

export const RULE_VERSION = {
  waAccumulationPeriod2026: uid("0a000007", 1),
  waWasteClassification2026: uid("0a000007", 2),
  federalTransport2026: uid("0a000007", 3),
  federalRetention2026: uid("0a000007", 4),
  /** Drafted, never published — so "only a published version resolves" is testable. */
  waAccumulationPeriodDraft2027: uid("0a000007", 5),
  federalShipperCertification2026: uid("0a000007", 6),
  waContainerLabel2026: uid("0a000007", 7),
  federalDdrPackaging2026: uid("0a000007", 8),
  /** b2-09 — v2: the packing level authored, with its citation (D-72 #9). Supersedes v1. */
  federalDdrPackaging2026v2: uid("0a000007", 9),
  // b1b-12 — Appendix A's versions, one per rule, California's coverage twice.
  waProducerCoverage: uid("0a000007", 10),
  waProducerObligations: uid("0a000007", 11),
  ilProducerCoverage: uid("0a000007", 12),
  ilProducerObligations: uid("0a000007", 13),
  coProducerCoverage: uid("0a000007", 14),
  coProducerObligations: uid("0a000007", 15),
  ctProducerCoverage: uid("0a000007", 16),
  ctProducerObligations: uid("0a000007", 17),
  vtProducerCoverage: uid("0a000007", 18),
  vtProducerObligations: uid("0a000007", 19),
  neProducerCoverage: uid("0a000007", 20),
  neProducerObligations: uid("0a000007", 21),
  wiProducerCoverage: uid("0a000007", 22),
  wiProducerObligations: uid("0a000007", 23),
  orProducerCoverage: uid("0a000007", 24),
  orProducerObligations: uid("0a000007", 25),
  meProducerCoverage: uid("0a000007", 26),
  meProducerObligations: uid("0a000007", 27),
  caProducerCoverage: uid("0a000007", 28),
  /** California's scheduled coverage version (SB 501), in force from 2027-01-01. */
  caProducerCoverage2027: uid("0a000007", 29),
  caProducerObligations: uid("0a000007", 30),
  nyProducerCoverage: uid("0a000007", 31),
  nyProducerObligations: uid("0a000007", 32),
  mnProducerCoverage: uid("0a000007", 33),
  mnProducerObligations: uid("0a000007", 34),
  njProducerCoverage: uid("0a000007", 35),
  njProducerObligations: uid("0a000007", 36),
  iaProducerCoverage: uid("0a000007", 37),
  iaProducerObligations: uid("0a000007", 38),
  dcProducerCoverage: uid("0a000007", 39),
  dcProducerObligations: uid("0a000007", 40),
  // b1b-13 — Appendix B's versions, one per state, dated as its obligations version.
  vtProducerFilings: uid("0a000007", 41),
  ctProducerFilings: uid("0a000007", 42),
  meProducerFilings: uid("0a000007", 43),
  caProducerFilings: uid("0a000007", 44),
  coProducerFilings: uid("0a000007", 45),
  njProducerFilings: uid("0a000007", 46),
} as const;

export const CATALOG = {
  /** Vehicle traction pack, NMC. */
  vehicleTractionNmc: uid("0a000008", 1),
  /** Mobility scooter pack, sealed lead-acid. **Small mobility, live at B1a.** */
  mobilityScooterSla: uid("0a000008", 2),
  /** Laptop cell, LCO. */
  laptopCellLco: uid("0a000008", 3),
  /** b1b-12 — an alkaline AA cell: portable nearly everywhere, not covered in Minnesota. */
  tidewaterAlkalineAa: uid("0a000008", 4),
  /** b1b-12 — a 30 lb, 1,536 Wh floor-scrubber pack: large in WA, medium in CT, not covered in DC. */
  kestrelScrubberLfp: uid("0a000008", 5),
  /** b1b-12 — a trolling-motor pack with **no weight on file**: can't tell. */
  harborTrollingLfp: uid("0a000008", 6),
  /** b1b-12 — zinc-air hearing-aid cells, T-01 `other`: can't tell. */
  brightlineZincAir: uid("0a000008", 7),
} as const;

export const BATTERY = {
  /** Vehicle traction pack — confirmed, classified, stored. */
  vehicleTraction: uid("0a000009", 1),
  /** Mobility scooter pack — sits in the same list and the same container as the vehicle pack. */
  mobilityScooter: uid("0a000009", 2),
  /** Swollen laptop pack — DDR flag set, air transport prohibited, quarantined. */
  swollenLaptop: uid("0a000009", 3),
  /** Scuffed label, no catalog match — in review, chemistry unconfirmed. */
  scuffedNoMatch: uid("0a000009", 4),
  /** Mid-review, per-field confidence spread across all four bands. */
  midReviewSpread: uid("0a000009", 5),
  /** Rainier's record. Cascade must never see it. */
  rainierScooter: uid("0a000009", 6),
  /** b1a-08 — a swollen NV-TP400 traction pack, on SH-0003: the lithium DDR record. */
  ddrLithiumOnMixed: uid("0a000009", 7),
  /** b1a-08 — a leaking lead-acid scooter pack: DDR, no packaging rule on file (D-71). */
  ddrNoPackagingRule: uid("0a000009", 8),
  /** b1a-08 — in review: an exact match whose label voltage disagrees (Rule 2.35). */
  labelMismatchInReview: uid("0a000009", 9),
  /** b2-09 — a Ridgeline RM-24V50 whose maker and model match recall 26-041: a possible match. */
  recallBrandModel: uid("0a000009", 10),
  /** b2-09 — a traction pack out of a Corvane Ion LX 2022, matching vehicle recall 26V-118. */
  recallVehicle: uid("0a000009", 11),
  /** b2-09 — the recalled pack: a recall recorded by hand, confirmed, quarantined. */
  recalledQuarantined: uid("0a000009", 12),
  /** b2-09 — out of a Kestrel; the vehicle source does not answer, so it reads not checked. */
  recallCheckFails: uid("0a000009", 13),
  /** b2-09 — no confirmed catalog entry and no source make: nothing to match against. */
  nothingToMatch: uid("0a000009", 14),
  /** b2-09 — sound, on air shipment SH-0004 with an issued paper, with a possible match (Rule 6.14). */
  airShipmentRecall: uid("0a000009", 15),
  /** b2-10 — the copy target: its label photo carries a look-alike fingerprint; its label look check failed. */
  photoCopyTarget: uid("0a000009", 16),
  /** b2-10 — a `model_assisted_visual` assessment: one suggestion accepted, one rejected. */
  modelAssisted: uid("0a000009", 17),
  /** b2-11 — BR-0017: lithium metal, no damage assessment, no rated energy, the oldest age band, no marks read. */
  rankingLithiumMetal: uid("0a000009", 18),
  /** b2-11 — BR-0018: alkaline, a device-sourced pack whose last check found no match. */
  rankingAlkaline: uid("0a000009", 19),
  /** b2-11 — BR-0019: T-01 `other`, level on every factor with BR-0020. */
  rankingLevelFirst: uid("0a000009", 20),
  /** b2-11 — BR-0020: the other half of the level pair. */
  rankingLevelSecond: uid("0a000009", 21),
} as const;

export const INTAKE_SESSION = {
  vehicleCompleted: uid("0a00000a", 1),
  scuffedInReview: uid("0a00000a", 2),
  spreadInReview: uid("0a00000a", 3),
  /** b1a-08 — the label-vs-catalog disagreement in review. */
  labelMismatchInReview: uid("0a00000a", 4),
  /** b2-10 — BR-0015's intake. */
  copyTargetCompleted: uid("0a00000a", 5),
  /** b2-10 — BR-0016's intake. */
  modelAssistedCompleted: uid("0a00000a", 6),
} as const;

export const PHOTO = {
  vehicleOriginal: uid("0a00000b", 1),
  vehicleCrop: uid("0a00000b", 2),
  scuffedOriginal: uid("0a00000b", 3),
  scuffedCrop: uid("0a00000b", 4),
  spreadOriginal: uid("0a00000b", 5),
  spreadCrop: uid("0a00000b", 6),
  swollenDamage: uid("0a00000b", 7),
  labelMismatchOriginal: uid("0a00000b", 8),
  labelMismatchCrop: uid("0a00000b", 9),
  /** b2-10 — BR-0015's label photo, the copy target's fingerprint (Rule 2.37). */
  copyTargetOriginal: uid("0a00000b", 10),
  copyTargetCrop: uid("0a00000b", 11),
  /** b2-10 — BR-0016's label photo, crop and damage photo (Rule 6.25). */
  modelAssistedOriginal: uid("0a00000b", 12),
  modelAssistedCrop: uid("0a00000b", 13),
  modelAssistedDamage: uid("0a00000b", 14),
} as const;

export const EXTRACTION_RUN = {
  vehicle: uid("0a00000c", 1),
  scuffed: uid("0a00000c", 2),
  spread: uid("0a00000c", 3),
  labelMismatch: uid("0a00000c", 4),
} as const;

export const CONTAINER = {
  /** Light category, sound. Holds the vehicle pack and the mobility pack together. */
  soundDrum: uid("0a00000d", 1),
  /** Light category, DDR. Quarantine. */
  quarantineDrum: uid("0a00000d", 2),
  /** **Past its accumulation period — the hard `overdue` state.** */
  overdueDrum: uid("0a00000d", 3),
  /** b1a-08 — overdue, in lot L-0002, so the lot reads overdue (Rule 4.24). */
  lotOverdueDrum: uid("0a00000d", 4),
  /** b1a-08 — quarantine holding the lithium DDR record, on SH-0003 alone. */
  mixedDdrQuarantine: uid("0a00000d", 5),
  /** b1a-08 — quarantine holding the no-rule DDR record, on SH-0003 in lot L-0003. */
  noRuleDdrQuarantine: uid("0a00000d", 6),
  /** b2-09 — sound, holding the three records whose checks the fixtures record. */
  recallChecks: uid("0a00000d", 7),
  /** b2-09 — quarantine holding the recalled pack. */
  recalledQuarantine: uid("0a00000d", 8),
  /** b2-09 — sound, on air shipment SH-0004. */
  airShipmentSound: uid("0a00000d", 9),
  /** b2-11 — C-0010, holding BR-0017: storage aggregation "Not fully recorded". */
  rankingUnknownEnergy: uid("0a00000d", 10),
} as const;

export const LOT = {
  augustConsolidation: uid("0a00000e", 1),
  /** b1a-08 — closed, holding the overdue C-0004. */
  overdueHold: uid("0a00000e", 2),
  /** b1a-08 — allocated to SH-0003, holding C-0006. */
  mixedShipment: uid("0a00000e", 3),
} as const;

export const CLOCK = {
  soundDrum: uid("0a00000f", 1),
  quarantineDrum: uid("0a00000f", 2),
  overdueDrum: uid("0a00000f", 3),
  lotOverdueDrum: uid("0a00000f", 4),
  mixedDdrQuarantine: uid("0a00000f", 5),
  noRuleDdrQuarantine: uid("0a00000f", 6),
  recallChecks: uid("0a00000f", 7),
  recalledQuarantine: uid("0a00000f", 8),
  airShipmentSound: uid("0a00000f", 9),
  rankingUnknownEnergy: uid("0a00000f", 10),
} as const;

export const ALERT = {
  overdueDrum: uid("0a000010", 1),
  reviewQueue: uid("0a000010", 2),
  /** b2-09 — the `recall_match` alerts the three open possible matches raised. */
  recallBrandModel: uid("0a000010", 3),
  recallVehicle: uid("0a000010", 4),
  recallAirShipment: uid("0a000010", 5),
} as const;

export const CLASSIFICATION = {
  vehicleTraction: uid("0a000011", 1),
  mobilityScooter: uid("0a000011", 2),
  swollenLaptop: uid("0a000011", 3),
  /** Blocked — chemistry is unconfirmed, so no classification can be derived. */
  scuffedBlocked: uid("0a000011", 4),
  ddrLithiumOnMixed: uid("0a000011", 5),
  ddrNoPackagingRule: uid("0a000011", 6),
  recallBrandModel: uid("0a000011", 7),
  recallVehicle: uid("0a000011", 8),
  recalledQuarantined: uid("0a000011", 9),
  recallCheckFails: uid("0a000011", 10),
  airShipmentRecall: uid("0a000011", 11),
} as const;

export const SHIPMENT = {
  julyDelivered: uid("0a000012", 1),
  augustDraft: uid("0a000012", 2),
  /** b1a-08 — a mixed shipment (Rule 5.1) holding a lithium DDR record. */
  mixedDdr: uid("0a000012", 3),
  /** b2-09 — by air, documents issued, holding C-0009 (Rule 6.14). */
  airIssued: uid("0a000012", 4),
} as const;

export const DOCUMENT_RENDER = {
  julyShippingPaper: uid("0a000013", 1),
  soundDrumLabel: uid("0a000013", 2),
  /** b2-09 — SH-0004's issued paper. */
  airShippingPaper: uid("0a000013", 3),
  /** b1b-13 — California's notice for the 2026-07-01 deadline, issued by Priya (spec §6). */
  caNoticePacket: uid("0a000013", 4),
} as const;

export const SHIPPING_PAPER = {
  july: uid("0a000014", 1),
  /** b2-09 — SH-0004's issued paper. */
  airIssued: uid("0a000014", 2),
} as const;

export const CONTAINER_LABEL = {
  soundDrum: uid("0a000015", 1),
} as const;

export const DAMAGE = {
  vehicleSound: uid("0a000016", 1),
  mobilitySound: uid("0a000016", 2),
  swollenDamaged: uid("0a000016", 3),
  ddrLithiumOnMixed: uid("0a000016", 4),
  ddrNoPackagingRule: uid("0a000016", 5),
  recallBrandModel: uid("0a000016", 6),
  recallVehicle: uid("0a000016", 7),
  recalledQuarantined: uid("0a000016", 8),
  recallCheckFails: uid("0a000016", 9),
  nothingToMatch: uid("0a000016", 10),
  airShipmentRecall: uid("0a000016", 11),
  /** b2-10 — BR-0015, assessed sound by visual inspection. */
  photoCopyTarget: uid("0a000016", 12),
  /** b2-10 — BR-0016, `model_assisted_visual`. */
  modelAssisted: uid("0a000016", 13),
  /** b2-11 — the ranking fixtures' assessments. BR-0017 has none, on purpose. */
  rankingAlkaline: uid("0a000016", 14),
  rankingLevelFirst: uid("0a000016", 15),
  rankingLevelSecond: uid("0a000016", 16),
} as const;

/** b2-10 — photo check runs (Rules 2.36, 2.37, 6.25). */
export const PHOTO_CHECK = {
  /** BR-0016's damage photo: dent and surface marking proposed. */
  modelAssistedProposal: uid("0a00001e", 1),
  /** BR-0015's label look check: the service did not answer (Rule 2.36). */
  copyTargetLabelLookFailed: uid("0a00001e", 2),
  /** BR-0015's copy check: no copy found. */
  copyTargetCopyCheck: uid("0a00001e", 3),
} as const;

/** b2-10 — catalog reference label photos (Rule 2.36). */
export const REFERENCE_PHOTO = {
  /** The vehicle traction entry's current reference. The scooter and laptop entries have none. */
  vehicleTractionNmc: uid("0a00001f", 1),
} as const;

/** b2-09 — recall associations (`recall_match`, Rules 10.13–10.16). */
export const RECALL_MATCH = {
  /** Possible — BR-0009, consumer recall 26-041. */
  brandModel: uid("0a00001c", 1),
  /** Possible — BR-0010, vehicle recall 26V-118. */
  vehicle: uid("0a00001c", 2),
  /** Confirmed, recorded by hand — BR-0011. */
  recordedByHand: uid("0a00001c", 3),
  /** Possible — BR-0014 on SH-0004, vehicle recall 26V-118. */
  airShipment: uid("0a00001c", 4),
} as const;

/** b2-09 — recall check runs, the `recall_check` table argued for unit 17 (Rule 10.18). */
export const RECALL_CHECK = {
  brandModelBattery: uid("0a00001d", 1),
  vehicleBattery: uid("0a00001d", 2),
  vehicleSource: uid("0a00001d", 3),
  failsBattery: uid("0a00001d", 4),
  failsVehicle: uid("0a00001d", 5),
  nothingToMatch: uid("0a00001d", 6),
  airShipmentBattery: uid("0a00001d", 7),
  airShipmentVehicle: uid("0a00001d", 8),
  /** b2-11 — BR-0018's device check: no match. */
  rankingAlkalineDevice: uid("0a00001d", 9),
} as const;

export const STORAGE_EVENT = {
  vehiclePlaced: uid("0a000017", 1),
  mobilityPlaced: uid("0a000017", 2),
  swollenQuarantined: uid("0a000017", 3),
  overdueInspected: uid("0a000017", 4),
  ddrLithiumPlaced: uid("0a000017", 5),
  ddrNoRulePlaced: uid("0a000017", 6),
} as const;

export const AUDIT = {
  vehicleConfirmed: uid("0a000018", 1),
  swollenDdrSet: uid("0a000018", 2),
  overdueClockChanged: uid("0a000018", 3),
  julyPaperIssued: uid("0a000018", 4),
  /** b1a-08 — the Rule 2.35 disagreement on BR-0008's history. */
  labelMismatchRouted: uid("0a000018", 5),
  /** b2-11 — Cascade's seeded ranking run (Rule 10.26). */
  hazardRankingSeeded: uid("0a000018", 6),
  /** b1b-12 — Cascade's seeded obligations run, as the nightly job (Rule 8.11). */
  producerObligationsSeeded: uid("0a000018", 7),
  /** b1b-12 — Priya marks DC's deadline done (Rule 8.12). */
  dcDeadlineCompleted: uid("0a000018", 8),
  /** b1b-12 — marking it done resolves its overdue alert (Rule 8.13). */
  dcDeadlineAlertResolved: uid("0a000018", 9),
  /** b1b-13 — Priya issues California's notice (Rule 8.19). */
  caNoticeIssued: uid("0a000018", 10),
  /** b1b-13 — she marks its deadline done, with the packet as evidence (Rule 8.19). */
  caNoticeDeadlineCompleted: uid("0a000018", 11),
  /** b1b-13 — marking it done resolves its overdue alert (Rule 8.13). */
  caNoticeAlertResolved: uid("0a000018", 12),
} as const;

/** b2-11 — Cascade's seeded ranking run, so the screens show a ranking before Rank now. */
export const HAZARD_RANKING_RUN = {
  cascadeSeeded: uid("0a000020", 1),
} as const;

/** b2-11 — the seeded run's rows, numbered in the order the run writes them. */
export const hazardRankingRowId = (n: number): string => uid("0a000021", n);

export const DATE_CODE = {
  vehicle: uid("0a000019", 1),
  /** Undecodable — an honest null, not a guess (Rule 2.24). */
  scuffed: uid("0a000019", 2),
} as const;

export const FORMAT_CLASSIFICATION = {
  /** The mobility pack under Washington's thresholds — `medium_format`. */
  mobilityScooterWa: uid("0a00001a", 1),
  /** The same battery under federal scope — a different answer, which is the entire point. */
  mobilityScooterFederal: uid("0a00001a", 2),
} as const;

/** b1b-12 — the products Priya declares for Cascade (Rule 8.6). */
export const PRODUCER_PRODUCT = {
  tidewaterAlkalineAa: uid("0a000022", 1),
  kestrelScrubberLfp: uid("0a000022", 2),
  harborTrollingLfp: uid("0a000022", 3),
  haldenLaptop: uid("0a000022", 4),
  northvaleTraction: uid("0a000022", 5),
  brightlineZincAir: uid("0a000022", 6),
} as const;

/** b1b-12 — the seeded run's rows, numbered in the order the run writes them. */
export const producerObligationRowId = (n: number): string =>
  uid("0a000023", n);
export const obligationDeadlineRowId = (n: number): string =>
  uid("0a000024", n);
export const obligationAlertRowId = (n: number): string => uid("0a000025", n);

/** b1b-12 — the seeded run's id, on its audit row. */
export const PRODUCER_RUN = {
  cascadeSeeded: uid("0a000026", 1),
} as const;

/** b1b-13 — Priya's sales entries (Rule 8.17), numbered in the order she recorded them. */
export const producerSalesRecordId = (n: number): string => uid("0a000027", n);

/** b1b-13 — the entries a spec names. */
export const PRODUCER_SALES = {
  /** Tidewater in Illinois, 2025, as first recorded — replaced. */
  tidewaterIllinois2025: producerSalesRecordId(2),
  /** Its correction. */
  tidewaterIllinois2025Corrected: producerSalesRecordId(19),
} as const;
