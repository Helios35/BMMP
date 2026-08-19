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
} as const;

export const USER = {
  /** P1 · Compliance Handler at Cascade. The daily user. */
  danaHandler: uid("0a000002", 1),
  /** P2 · Facility Manager at Cascade. */
  martaManager: uid("0a000002", 2),
  /** P5 · Auditor at Cascade. Read-only, externally, everywhere, always. */
  samAuditor: uid("0a000002", 3),
  /** P6 · Platform Admin. Not a membership role. */
  platformAdmin: uid("0a000002", 4),
  /** P1 at Rainier — the second tenant, so isolation is testable. */
  joRainierHandler: uid("0a000002", 5),
} as const;

export const MEMBERSHIP = {
  danaCascade: uid("0a000003", 1),
  martaCascade: uid("0a000003", 2),
  samCascade: uid("0a000003", 3),
  joRainier: uid("0a000003", 4),
  /** Invited, not yet accepted — `user_id` is still null. */
  pendingInvite: uid("0a000003", 5),
} as const;

export const TOS = {
  cascadeInForce: uid("0a000004", 1),
  rainierInForce: uid("0a000004", 2),
} as const;

export const JURISDICTION = {
  federal: uid("0a000005", 1),
  washington: uid("0a000005", 2),
} as const;

export const JURISDICTION_RULE = {
  waAccumulationPeriod: uid("0a000006", 1),
  waWasteClassification: uid("0a000006", 2),
  federalTransport: uid("0a000006", 3),
  federalRetention: uid("0a000006", 4),
} as const;

export const RULE_VERSION = {
  waAccumulationPeriod2026: uid("0a000007", 1),
  waWasteClassification2026: uid("0a000007", 2),
  federalTransport2026: uid("0a000007", 3),
  federalRetention2026: uid("0a000007", 4),
  /** Drafted, never published — so "only a published version resolves" is testable. */
  waAccumulationPeriodDraft2027: uid("0a000007", 5),
} as const;

export const CATALOG = {
  /** Vehicle traction pack, NMC. */
  vehicleTractionNmc: uid("0a000008", 1),
  /** Mobility scooter pack, sealed lead-acid. **Small mobility, live at B1a.** */
  mobilityScooterSla: uid("0a000008", 2),
  /** Laptop cell, LCO. */
  laptopCellLco: uid("0a000008", 3),
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
} as const;

export const INTAKE_SESSION = {
  vehicleCompleted: uid("0a00000a", 1),
  scuffedInReview: uid("0a00000a", 2),
  spreadInReview: uid("0a00000a", 3),
} as const;

export const PHOTO = {
  vehicleOriginal: uid("0a00000b", 1),
  vehicleCrop: uid("0a00000b", 2),
  scuffedOriginal: uid("0a00000b", 3),
  scuffedCrop: uid("0a00000b", 4),
  spreadOriginal: uid("0a00000b", 5),
  spreadCrop: uid("0a00000b", 6),
  swollenDamage: uid("0a00000b", 7),
} as const;

export const EXTRACTION_RUN = {
  vehicle: uid("0a00000c", 1),
  scuffed: uid("0a00000c", 2),
  spread: uid("0a00000c", 3),
} as const;

export const CONTAINER = {
  /** Light category, sound. Holds the vehicle pack and the mobility pack together. */
  soundDrum: uid("0a00000d", 1),
  /** Light category, DDR. Quarantine. */
  quarantineDrum: uid("0a00000d", 2),
  /** **Past its accumulation period — the hard `overdue` state.** */
  overdueDrum: uid("0a00000d", 3),
} as const;

export const LOT = {
  augustConsolidation: uid("0a00000e", 1),
} as const;

export const CLOCK = {
  soundDrum: uid("0a00000f", 1),
  quarantineDrum: uid("0a00000f", 2),
  overdueDrum: uid("0a00000f", 3),
} as const;

export const ALERT = {
  overdueDrum: uid("0a000010", 1),
  reviewQueue: uid("0a000010", 2),
} as const;

export const CLASSIFICATION = {
  vehicleTraction: uid("0a000011", 1),
  mobilityScooter: uid("0a000011", 2),
  swollenLaptop: uid("0a000011", 3),
  /** Blocked — chemistry is unconfirmed, so no classification can be derived. */
  scuffedBlocked: uid("0a000011", 4),
} as const;

export const SHIPMENT = {
  julyDelivered: uid("0a000012", 1),
  augustDraft: uid("0a000012", 2),
} as const;

export const DOCUMENT_RENDER = {
  julyShippingPaper: uid("0a000013", 1),
  soundDrumLabel: uid("0a000013", 2),
} as const;

export const SHIPPING_PAPER = {
  july: uid("0a000014", 1),
} as const;

export const CONTAINER_LABEL = {
  soundDrum: uid("0a000015", 1),
} as const;

export const DAMAGE = {
  vehicleSound: uid("0a000016", 1),
  mobilitySound: uid("0a000016", 2),
  swollenDamaged: uid("0a000016", 3),
} as const;

export const STORAGE_EVENT = {
  vehiclePlaced: uid("0a000017", 1),
  mobilityPlaced: uid("0a000017", 2),
  swollenQuarantined: uid("0a000017", 3),
  overdueInspected: uid("0a000017", 4),
} as const;

export const AUDIT = {
  vehicleConfirmed: uid("0a000018", 1),
  swollenDdrSet: uid("0a000018", 2),
  overdueClockChanged: uid("0a000018", 3),
  julyPaperIssued: uid("0a000018", 4),
} as const;

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
