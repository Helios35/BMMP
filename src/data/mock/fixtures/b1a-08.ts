import type { AuditEvent } from "@/types/audit";
import type { BatteryRecord } from "@/types/battery-record";
import type { DamageAssessment } from "@/types/condition";
import type { ClassificationDecision, Shipment } from "@/types/documents";
import type {
  IntakePhoto,
  IntakeSession,
  LabelExtraction,
} from "@/types/intake";
import type {
  Container,
  Lot,
  StorageClock,
  StorageEvent,
} from "@/types/storage";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";
import { seedDraftFromExtraction } from "@/domain/intake/draft";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";

import * as ID from "./ids";

/**
 * The rows `b1a-08-leftovers` adds — **added, never edited** (STATE §7.1).
 * Each base array in `./index.ts` gains these at its end and no existing row
 * changes. Four scenarios, one per brief outcome:
 *
 * | Scenario | Rows |
 * | --- | --- |
 * | A lot holding an overdue container (Rules 4.23, 4.24) | `LOT.overdueHold` (closed) holding `CONTAINER.lotOverdueDrum` (C-0004, overdue) |
 * | A mixed shipment with a lithium DDR record (Rules 5.1, 6.16) | `SHIPMENT.mixedDdr` (SH-0003, draft): `CONTAINER.mixedDdrQuarantine` (C-0005) chosen alone + `LOT.mixedShipment` (allocated) holding C-0006 |
 * | A DDR record with no packaging rule on file (D-71) | `BATTERY.ddrNoPackagingRule` (BR-0007, sealed lead-acid, leaking) in C-0006 on SH-0003 |
 * | An exact match whose label voltage disagrees with its catalog entry (Rule 2.35) | `BATTERY.labelMismatchInReview` (BR-0008) and `INTAKE_SESSION.labelMismatchInReview`, in review with T-52 `label_catalog_mismatch` |
 *
 * The lithium DDR record is BR-0006, a swollen NV-TP400 traction pack in
 * C-0005. Codes take the next numbers in Cascade's sequences; the mock starts
 * each counter above the highest code on file, because the organization row's
 * `*_seq` columns are a fixture this unit may not edit — the first
 * migration's seed sets them to match (build-notes, ERD argument).
 */

const T = {
  /** C-0004 — past its accumulation period: a 365-day clock started over a year ago. */
  lotOverdueStart: "2025-06-30T15:30:00.000Z",
  lotOverdueDue: "2026-06-30T06:59:59.999Z",
  ddrLithiumIntake: "2026-10-20T16:05:00.000Z",
  ddrNoRuleIntake: "2026-10-20T16:40:00.000Z",
  lotsAssembled: "2026-10-21T08:30:00.000Z",
  mixedShipmentCreated: "2026-10-22T10:00:00.000Z",
  mismatchIntake: "2026-10-21T09:12:00.000Z",
} as const;

const WA_ACCUMULATION_APPLIED: AppliedRuleVersion = {
  jurisdictionRuleId: ID.JURISDICTION_RULE.waAccumulationPeriod,
  ruleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
  ruleKey: "storage.accumulation_period",
  versionLabel: "2026",
  citation:
    "WA universal waste accumulation period — see rule_version.citation",
  inputs: { containerType: "light_category_ddr" },
  outcome: "max_duration_days=365",
};

const WA_CLASSIFICATION_APPLIED: AppliedRuleVersion = {
  jurisdictionRuleId: ID.JURISDICTION_RULE.waWasteClassification,
  ruleVersionId: ID.RULE_VERSION.waWasteClassification2026,
  ruleKey: "classification.waste_stream",
  versionLabel: "2026",
  citation: "WA waste classification — see rule_version.citation",
  inputs: {},
  outcome: "light_category",
};

const EMPTY_PASSPORT = {
  materialComposition: null,
  hazardousSubstances: null,
  criticalRawMaterials: null,
  recycledContent: null,
  carbonFootprint: null,
  dismantlingInformation: null,
  safetyInformation: null,
  extinguishingAgent: null,
  certificationMarks: null,
  un383TestSummaryRef: null,
  hasUn383Summary: null,
  hasSeparateCollectionSymbol: null,
  passportExtension: null,
} as const;

const NO_OVERRIDE = {
  isOverride: false,
  overrideReason: null,
  overriddenBy: null,
  derivedWasteClassification: null,
  isLessRegulatedThanDerived: false,
  ruleGapReportedAt: null,
  ruleGapClosedByRuleVersionId: null,
} as const;

const NO_ASSESSMENT_INSTRUMENT = {
  evaluationTrace: null,
  modelProvider: null,
  modelIdentifier: null,
  modelConfidence: null,
  instrumentVendor: null,
  instrumentModel: null,
  instrumentSerial: null,
  instrumentReadAt: null,
  instrumentReading: null,
  clearingPhotoIntakePhotoId: null,
  supersedesDamageAssessmentId: null,
} as const;

const NO_SOURCE_DEVICE = {
  sourceDeviceType: null,
  sourceDeviceIdentifier: null,
  sourceDeviceMake: null,
  sourceDeviceModel: null,
  sourceDeviceModelYear: null,
  provenanceSourceType: "unknown_provenance",
  provenanceRecordedAt: null,
} as const;

const NO_PERFORMANCE = {
  minVoltageV: null,
  maxVoltageV: null,
  originalPowerW: null,
  expectedLifetimeCycles: null,
  operatingTempMinC: null,
  operatingTempMaxC: null,
  internalResistanceMohm: null,
  cRateMax: null,
  certificationMarks: null,
} as const;

// --- containers ---------------------------------------------------------------------------

export const containers: readonly Container[] = [
  {
    // Overdue — a hard state, not a warning (Rules 4.15–4.17) — and in a lot,
    // so the lot reads overdue (Rule 4.24). It holds nothing, like C-0003.
    id: ID.CONTAINER.lotOverdueDrum,
    organizationId: ID.ORG.cascade,
    containerCode: "C-0004",
    containerType: "light_category_sound",
    lotId: ID.LOT.overdueHold,
    shipmentId: null,
    capacityKg: "900.000",
    capacityVolumeM3: "0.2080",
    currentNetMassKg: null,
    accumulationStartedAt: T.lotOverdueStart,
    accumulationStartSource: "first_placement",
    siteAddress: null,
    siteTimeZone: "America/Los_Angeles",
    storageLocation: "Bay 1 · Rack D",
    status: "overdue",
    sealedAt: null,
    closedAt: null,
    currentContainerLabelId: null,
    createdAt: T.lotOverdueStart,
    updatedAt: T.lotOverdueDue,
    createdBy: ID.USER.danaHandler,
    updatedBy: null,
  },
  {
    // Quarantine for the swollen traction pack; chosen on SH-0003 on its own.
    id: ID.CONTAINER.mixedDdrQuarantine,
    organizationId: ID.ORG.cascade,
    containerCode: "C-0005",
    containerType: "light_category_ddr",
    lotId: null,
    shipmentId: ID.SHIPMENT.mixedDdr,
    capacityKg: "900.000",
    capacityVolumeM3: "0.2080",
    currentNetMassKg: "480.000",
    accumulationStartedAt: T.ddrLithiumIntake,
    accumulationStartSource: "first_placement",
    siteAddress: null,
    siteTimeZone: "America/Los_Angeles",
    storageLocation: "Bay 4 · Quarantine cage B",
    status: "open",
    sealedAt: null,
    closedAt: null,
    currentContainerLabelId: null,
    createdAt: T.ddrLithiumIntake,
    updatedAt: T.mixedShipmentCreated,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
  {
    // Quarantine for the leaking lead-acid scooter pack; on SH-0003 through
    // its lot, L-0003.
    id: ID.CONTAINER.noRuleDdrQuarantine,
    organizationId: ID.ORG.cascade,
    containerCode: "C-0006",
    containerType: "light_category_ddr",
    lotId: ID.LOT.mixedShipment,
    shipmentId: ID.SHIPMENT.mixedDdr,
    capacityKg: "120.000",
    capacityVolumeM3: "0.0900",
    currentNetMassKg: "24.500",
    accumulationStartedAt: T.ddrNoRuleIntake,
    accumulationStartSource: "first_placement",
    siteAddress: null,
    siteTimeZone: "America/Los_Angeles",
    storageLocation: "Bay 4 · Quarantine cage C",
    status: "open",
    sealedAt: null,
    closedAt: null,
    currentContainerLabelId: null,
    createdAt: T.ddrNoRuleIntake,
    updatedAt: T.mixedShipmentCreated,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
];

// --- lots -----------------------------------------------------------------------------------

export const lots: readonly Lot[] = [
  {
    // Closed — its membership fixed — and reading overdue through C-0004
    // (Rule 4.24). It has no clock of its own (Rule 4.23).
    id: ID.LOT.overdueHold,
    organizationId: ID.ORG.cascade,
    lotCode: "L-0002",
    description: "Bay 1 overdue hold",
    chemistryMix: null,
    totalMassKg: null,
    totalEnergyWh: null,
    status: "closed",
    createdAt: T.lotsAssembled,
    updatedAt: T.lotsAssembled,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
  {
    // Allocated to SH-0003, which also carries C-0005 on its own — Rule
    // 5.1's mix of sources.
    id: ID.LOT.mixedShipment,
    organizationId: ID.ORG.cascade,
    lotCode: "L-0003",
    description: "October damaged scooter pack",
    chemistryMix: { lead_acid_sealed: 1 },
    totalMassKg: "24.500",
    totalEnergyWh: "1200.000",
    status: "allocated",
    createdAt: T.lotsAssembled,
    updatedAt: T.mixedShipmentCreated,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
];

// --- clocks ---------------------------------------------------------------------------------

export const storageClocks: readonly StorageClock[] = [
  {
    id: ID.CLOCK.lotOverdueDrum,
    organizationId: ID.ORG.cascade,
    subjectType: "container",
    batteryRecordId: null,
    containerId: ID.CONTAINER.lotOverdueDrum,
    clockStartAt: T.lotOverdueStart,
    clockStartBasis: "first_placement",
    timeZone: "America/Los_Angeles",
    maxDurationDays: 365,
    governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
    evaluationTrace: [
      {
        ...WA_ACCUMULATION_APPLIED,
        inputs: { containerType: "light_category_sound" },
      },
    ],
    dueAt: T.lotOverdueDue,
    alertSchedule: {
      early: "2026-04-01",
      mid: "2026-05-01",
      final: "2026-05-31",
    },
    alertBand: "overdue",
    nextAlertAt: null,
    stoppedAt: null,
    stopReason: null,
    status: "overdue",
    createdAt: T.lotOverdueStart,
    updatedAt: T.lotOverdueDue,
  },
  {
    id: ID.CLOCK.mixedDdrQuarantine,
    organizationId: ID.ORG.cascade,
    subjectType: "container",
    batteryRecordId: null,
    containerId: ID.CONTAINER.mixedDdrQuarantine,
    clockStartAt: T.ddrLithiumIntake,
    clockStartBasis: "first_placement",
    timeZone: "America/Los_Angeles",
    maxDurationDays: 365,
    governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
    evaluationTrace: [WA_ACCUMULATION_APPLIED],
    dueAt: "2027-10-21T06:59:59.999Z",
    alertSchedule: {
      early: "2027-07-22",
      mid: "2027-08-21",
      final: "2027-09-20",
    },
    alertBand: "none",
    nextAlertAt: "2027-07-22T07:00:00.000Z",
    stoppedAt: null,
    stopReason: null,
    // Quarantine gives no clock relief (Rule 6.19).
    status: "running",
    createdAt: T.ddrLithiumIntake,
    updatedAt: T.ddrLithiumIntake,
  },
  {
    id: ID.CLOCK.noRuleDdrQuarantine,
    organizationId: ID.ORG.cascade,
    subjectType: "container",
    batteryRecordId: null,
    containerId: ID.CONTAINER.noRuleDdrQuarantine,
    clockStartAt: T.ddrNoRuleIntake,
    clockStartBasis: "first_placement",
    timeZone: "America/Los_Angeles",
    maxDurationDays: 365,
    governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
    evaluationTrace: [WA_ACCUMULATION_APPLIED],
    dueAt: "2027-10-21T06:59:59.999Z",
    alertSchedule: {
      early: "2027-07-22",
      mid: "2027-08-21",
      final: "2027-09-20",
    },
    alertBand: "none",
    nextAlertAt: "2027-07-22T07:00:00.000Z",
    stoppedAt: null,
    stopReason: null,
    status: "running",
    createdAt: T.ddrNoRuleIntake,
    updatedAt: T.ddrNoRuleIntake,
  },
];

// --- battery records -----------------------------------------------------------------------

export const batteryRecords: readonly BatteryRecord[] = [
  {
    // A swollen NV-TP400 traction pack — lithium ion, so the packaging rule
    // covers it and the packet prints its marking (Rule 6.15).
    ...EMPTY_PASSPORT,
    ...NO_PERFORMANCE,
    ...NO_SOURCE_DEVICE,
    id: ID.BATTERY.ddrLithiumOnMixed,
    organizationId: ID.ORG.cascade,
    recordNumber: "BR-0006",
    batteryPassportIdentifier: null,
    status: "quarantined",
    intakeSessionId: null,
    catalogEntryId: ID.CATALOG.vehicleTractionNmc,
    containerId: ID.CONTAINER.mixedDdrQuarantine,
    archivedAt: null,
    batteryStatus: "waste",
    manufacturerName: "Northvale Cell Systems",
    manufacturerIdentifier: null,
    manufacturingPlace: null,
    manufacturedOn: "2021-11-01",
    brandName: "Northvale",
    modelName: "NV-TP400",
    partNumber: "NV-TP400-96S",
    serialNumber: "NVTP4000000099120",
    batteryMassKg: "480.000",
    chemistry: "li_nmc",
    cellFormFactor: "prismatic",
    assemblyLevel: "pack",
    applicationClass: "vehicle",
    cellCount: null,
    moduleCount: 8,
    nominalVoltageV: "355.200",
    ratedCapacityAh: "220.000",
    ratedEnergyWh: "78100.000",
    stateOfChargeBand: "not_captured",
    stateOfChargePercentAtIntake: null,
    socSource: null,
    socAssessedAt: null,
    dispositionRoute: "pending",
    assessedCondition: "damaged",
    conditionConfirmedBy: ID.USER.danaHandler,
    conditionConfirmedAt: T.ddrLithiumIntake,
    chemistrySource: "catalog_match_confirmed",
    chemistryConfirmedBy: ID.USER.danaHandler,
    chemistryConfirmedAt: T.ddrLithiumIntake,
    ddrFlags: ["damaged"],
    isAirTransportProhibited: true,
    conditionRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    dateCodeRaw: null,
    dateCodeDecodeId: null,
    createdAt: T.ddrLithiumIntake,
    updatedAt: T.ddrLithiumIntake,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
  {
    // A leaking sealed lead-acid scooter pack — on the DDR path, and no
    // damaged/defective packaging rule covers its chemistry, so the packet
    // says so and departure holds (D-71).
    ...EMPTY_PASSPORT,
    ...NO_PERFORMANCE,
    ...NO_SOURCE_DEVICE,
    id: ID.BATTERY.ddrNoPackagingRule,
    organizationId: ID.ORG.cascade,
    recordNumber: "BR-0007",
    batteryPassportIdentifier: null,
    status: "quarantined",
    intakeSessionId: null,
    catalogEntryId: ID.CATALOG.mobilityScooterSla,
    containerId: ID.CONTAINER.noRuleDdrQuarantine,
    archivedAt: null,
    batteryStatus: "waste",
    manufacturerName: "Ridgeline Mobility",
    manufacturerIdentifier: null,
    manufacturingPlace: null,
    manufacturedOn: "2022-03-01",
    brandName: "Ridgeline",
    modelName: "RM-24V50",
    partNumber: "RM-24V50-AGM",
    serialNumber: "RM2450-0322-02210",
    batteryMassKg: "24.500",
    chemistry: "lead_acid_sealed",
    cellFormFactor: "not_applicable",
    assemblyLevel: "pack",
    applicationClass: "small_mobility",
    cellCount: null,
    moduleCount: null,
    nominalVoltageV: "24.000",
    ratedCapacityAh: "50.000",
    ratedEnergyWh: "1200.000",
    stateOfChargeBand: "not_captured",
    stateOfChargePercentAtIntake: null,
    socSource: null,
    socAssessedAt: null,
    dispositionRoute: "pending",
    assessedCondition: "damaged",
    conditionConfirmedBy: ID.USER.danaHandler,
    conditionConfirmedAt: T.ddrNoRuleIntake,
    chemistrySource: "catalog_match_confirmed",
    chemistryConfirmedBy: ID.USER.danaHandler,
    chemistryConfirmedAt: T.ddrNoRuleIntake,
    ddrFlags: ["damaged"],
    isAirTransportProhibited: true,
    conditionRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    dateCodeRaw: null,
    dateCodeDecodeId: null,
    createdAt: T.ddrNoRuleIntake,
    updatedAt: T.ddrNoRuleIntake,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
  {
    // In review: the label read the traction pack's part number exactly, and
    // printed a voltage its catalog entry does not carry (Rule 2.35).
    ...EMPTY_PASSPORT,
    ...NO_PERFORMANCE,
    ...NO_SOURCE_DEVICE,
    id: ID.BATTERY.labelMismatchInReview,
    organizationId: ID.ORG.cascade,
    recordNumber: "BR-0008",
    batteryPassportIdentifier: null,
    status: "pending_review",
    intakeSessionId: ID.INTAKE_SESSION.labelMismatchInReview,
    catalogEntryId: null,
    containerId: null,
    archivedAt: null,
    batteryStatus: null,
    manufacturerName: null,
    manufacturerIdentifier: null,
    manufacturingPlace: null,
    manufacturedOn: null,
    brandName: null,
    modelName: null,
    partNumber: null,
    serialNumber: null,
    batteryMassKg: null,
    chemistry: null,
    cellFormFactor: "prismatic",
    assemblyLevel: "pack",
    applicationClass: "unknown",
    cellCount: null,
    moduleCount: null,
    nominalVoltageV: null,
    ratedCapacityAh: null,
    ratedEnergyWh: null,
    stateOfChargeBand: "not_captured",
    stateOfChargePercentAtIntake: null,
    socSource: null,
    socAssessedAt: null,
    dispositionRoute: "pending",
    assessedCondition: null,
    conditionConfirmedBy: null,
    conditionConfirmedAt: null,
    chemistrySource: null,
    chemistryConfirmedBy: null,
    chemistryConfirmedAt: null,
    ddrFlags: [],
    isAirTransportProhibited: false,
    conditionRuleVersionId: null,
    dateCodeRaw: null,
    dateCodeDecodeId: null,
    createdAt: T.mismatchIntake,
    updatedAt: T.mismatchIntake,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
];

// --- the label disagreement's intake ---------------------------------------------------------

const MISMATCH_RUN = ID.EXTRACTION_RUN.labelMismatch;

/** The fixture reader's `mismatch` read, as rows — the clean label with the voltage at 400 V. */
const MISMATCH_READ: readonly {
  readonly fieldCode: LabelFieldCode;
  readonly fieldValue: string | null;
  readonly rawConfidence: string;
  readonly rawText: string | null;
  readonly isHardGated: boolean;
}[] = [
  {
    fieldCode: "manufacturer",
    fieldValue: "Northvale Cell Systems",
    rawConfidence: "0.97412",
    rawText: "NORTHVALE CELL SYSTEMS",
    isHardGated: false,
  },
  {
    fieldCode: "model",
    fieldValue: "NV-TP400-96S",
    rawConfidence: "0.96108",
    rawText: "NV-TP400-96S",
    isHardGated: true,
  },
  {
    fieldCode: "chemistry_code",
    fieldValue: "Li-ion NMC",
    rawConfidence: "0.95217",
    rawText: "Li-ion NMC",
    isHardGated: true,
  },
  {
    fieldCode: "voltage",
    fieldValue: "400 V",
    rawConfidence: "0.95211",
    rawText: "400V",
    isHardGated: false,
  },
  {
    fieldCode: "capacity_ah",
    fieldValue: "220 Ah",
    rawConfidence: "0.94655",
    rawText: "220Ah",
    isHardGated: false,
  },
  {
    fieldCode: "energy_wh",
    fieldValue: "78100 Wh",
    rawConfidence: "0.94012",
    rawText: "78100Wh",
    isHardGated: false,
  },
  {
    fieldCode: "date_code",
    fieldValue: "2144",
    rawConfidence: "0.93408",
    rawText: "2144",
    isHardGated: false,
  },
  {
    fieldCode: "serial_number",
    fieldValue: "NVTP4000000099311",
    rawConfidence: "0.95531",
    rawText: "NVTP4000000099311",
    isHardGated: false,
  },
  {
    fieldCode: "certification_marks",
    fieldValue: "UN38.3, CE",
    rawConfidence: "0.9418",
    rawText: "UN38.3 CE",
    isHardGated: false,
  },
  {
    fieldCode: "transport_test_marking",
    fieldValue: "present",
    rawConfidence: "0.93726",
    rawText: "UN38.3",
    isHardGated: false,
  },
  {
    fieldCode: "assessed_condition",
    fieldValue: null,
    rawConfidence: "0",
    rawText: null,
    isHardGated: true,
  },
];

const exMismatch = (n: number): string =>
  `0a00001b-0000-4000-8000-${(0x100 + n).toString(16).padStart(12, "0")}`;

export const labelExtractions: readonly LabelExtraction[] = MISMATCH_READ.map(
  (field, index) => ({
    id: exMismatch(index + 1),
    organizationId: ID.ORG.cascade,
    intakeSessionId: ID.INTAKE_SESSION.labelMismatchInReview,
    intakePhotoId: ID.PHOTO.labelMismatchCrop,
    extractionRunId: MISMATCH_RUN,
    fieldCode: field.fieldCode,
    fieldValue: field.fieldValue,
    confidenceBand: field.fieldValue === null ? "not_extracted" : "high",
    rawConfidence: field.rawConfidence,
    isHardGated: field.isHardGated,
    rawText: field.rawText,
    bandCutoffsApplied: { high: 0.9, medium: 0.7, low: 0.4 },
    evidenceBbox: null,
    provider: "fixture",
    modelIdentifier: "fixture-label-reader",
    promptVersion: "2026-08-01",
    schemaVersion: "label-extraction.v1",
    rawResponse: null,
    latencyMs: 1_790,
    tokenUsage: null,
    costUsd: null,
    errorCode: null,
    requestedAt: T.mismatchIntake,
    respondedAt: T.mismatchIntake,
    createdAt: T.mismatchIntake,
  }),
);

export const intakePhotos: readonly IntakePhoto[] = [
  {
    id: ID.PHOTO.labelMismatchOriginal,
    organizationId: ID.ORG.cascade,
    intakeSessionId: ID.INTAKE_SESSION.labelMismatchInReview,
    parentIntakePhotoId: null,
    photoType: "label",
    storageObjectPath: `org/${ID.ORG.cascade}/${ID.INTAKE_SESSION.labelMismatchInReview}/${ID.PHOTO.labelMismatchOriginal}.jpg`,
    contentHash:
      "88a9b0c1d2e3f405162738495a6b7c8d9eafb0c1d2e3f405162738495a6b7c8d",
    byteSize: 1_702_448,
    mimeType: "image/jpeg",
    widthPx: 2048,
    heightPx: 1536,
    cropGeometry: null,
    cropMethod: null,
    capturedAt: T.mismatchIntake,
    dataUseEligibility: "training_eligible",
    isExifStripped: true,
    takenBy: ID.USER.danaHandler,
    createdAt: T.mismatchIntake,
  },
  {
    id: ID.PHOTO.labelMismatchCrop,
    organizationId: ID.ORG.cascade,
    intakeSessionId: ID.INTAKE_SESSION.labelMismatchInReview,
    parentIntakePhotoId: ID.PHOTO.labelMismatchOriginal,
    photoType: "label_crop",
    storageObjectPath: `org/${ID.ORG.cascade}/${ID.INTAKE_SESSION.labelMismatchInReview}/${ID.PHOTO.labelMismatchCrop}.jpg`,
    contentHash:
      "99b0c1d2e3f405162738495a6b7c8d9eafb0c1d2e3f405162738495a6b7c8d9e",
    byteSize: 201_337,
    mimeType: "image/jpeg",
    widthPx: 812,
    heightPx: 384,
    cropGeometry: {
      x: 604,
      y: 512,
      width: 812,
      height: 384,
      sourceWidth: 2048,
      sourceHeight: 1536,
    },
    cropMethod: "auto_region_detection",
    capturedAt: T.mismatchIntake,
    dataUseEligibility: "training_eligible",
    isExifStripped: true,
    takenBy: ID.USER.danaHandler,
    createdAt: T.mismatchIntake,
  },
];

export const intakeSessions: readonly IntakeSession[] = [
  {
    id: ID.INTAKE_SESSION.labelMismatchInReview,
    organizationId: ID.ORG.cascade,
    batteryRecordId: ID.BATTERY.labelMismatchInReview,
    status: "awaiting_confirmation",
    currentStep: "extraction_review",
    isReviewRequired: true,
    reviewReasonCodes: ["label_catalog_mismatch"],
    gateThresholdsApplied: {
      minFieldConfidence: 0.9,
      minMatchScore: 0.82,
      minMatchSeparation: 0.12,
    },
    reviewedBy: null,
    reviewedAt: null,
    reviewOutcome: null,
    correlationId: "corr-mismatch-0008",
    deviceContext: { app: "bmmp-web", version: "0.1.0", device: "handheld" },
    startedBy: ID.USER.danaHandler,
    startedAt: T.mismatchIntake,
    completedAt: null,
    abandonedAt: null,
    createdAt: T.mismatchIntake,
    updatedAt: T.mismatchIntake,
    // The draft the pipeline would have written: the read, and the one exact
    // match the part number resolves to (Rule 2.18) — not selected; a person
    // picks (Rule 2.19).
    draft: {
      ...seedDraftFromExtraction(
        MISMATCH_READ.map((field) => ({
          fieldCode: field.fieldCode,
          fieldValue: field.fieldValue,
          confidenceBand: field.fieldValue === null ? "not_extracted" : "high",
          isHardGated: field.isHardGated,
          rawText: field.rawText,
        })),
        [
          {
            catalogEntryId: ID.CATALOG.vehicleTractionNmc,
            matchScore: 1,
            matchMethodCode: "exact_part_number",
            matchedOn: ["model"],
          },
        ],
        null,
        null,
      ),
      labelPhotoId: ID.PHOTO.labelMismatchOriginal,
      labelCropId: ID.PHOTO.labelMismatchCrop,
      extractionRunId: MISMATCH_RUN,
    },
  },
];

// --- conditions, decisions, placements ---------------------------------------------------

export const damageAssessments: readonly DamageAssessment[] = [
  {
    ...NO_ASSESSMENT_INSTRUMENT,
    id: ID.DAMAGE.ddrLithiumOnMixed,
    organizationId: ID.ORG.cascade,
    batteryRecordId: ID.BATTERY.ddrLithiumOnMixed,
    intakePhotoId: null,
    assessmentMethod: "human_visual_inspection",
    status: "assessed_damaged",
    findingTypes: ["swelling"],
    findingDetail: {
      swelling: {
        severity: "pronounced",
        note: "Module housing bowed along the long edge",
      },
    },
    assessedCondition: "damaged",
    isAirTransportProhibited: true,
    governingRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    assessedAt: T.ddrLithiumIntake,
    assessedBy: ID.USER.danaHandler,
    confirmedBy: ID.USER.danaHandler,
    confirmedAt: T.ddrLithiumIntake,
    createdAt: T.ddrLithiumIntake,
  },
  {
    ...NO_ASSESSMENT_INSTRUMENT,
    id: ID.DAMAGE.ddrNoPackagingRule,
    organizationId: ID.ORG.cascade,
    batteryRecordId: ID.BATTERY.ddrNoPackagingRule,
    intakePhotoId: null,
    assessmentMethod: "human_visual_inspection",
    status: "assessed_damaged",
    findingTypes: ["leakage"],
    findingDetail: {
      leakage: {
        severity: "minor",
        note: "Electrolyte residue at the vent",
      },
    },
    assessedCondition: "damaged",
    isAirTransportProhibited: true,
    governingRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    assessedAt: T.ddrNoRuleIntake,
    assessedBy: ID.USER.danaHandler,
    confirmedBy: ID.USER.danaHandler,
    confirmedAt: T.ddrNoRuleIntake,
    createdAt: T.ddrNoRuleIntake,
  },
];

export const classificationDecisions: readonly ClassificationDecision[] = [
  {
    ...NO_OVERRIDE,
    id: ID.CLASSIFICATION.ddrLithiumOnMixed,
    organizationId: ID.ORG.cascade,
    decisionScope: "battery_record",
    batteryRecordId: ID.BATTERY.ddrLithiumOnMixed,
    containerId: null,
    shipmentId: null,
    jurisdictionId: ID.JURISDICTION.washington,
    status: "active",
    wasteClassification: "light_category",
    basisCodes: ["federal_default", "damage_state"],
    reasoning:
      "Confirmed lithium-ion NMC chemistry falls within the light waste category in this jurisdiction. " +
      "A confirmed swelling finding sets the damaged flag, which changes handling and packaging and removes " +
      "air transport as an option; it does not move the record out of the light category here.",
    governingRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    evaluationTrace: [
      {
        ...WA_CLASSIFICATION_APPLIED,
        inputs: { chemistry: "li_nmc", ddrFlags: ["damaged"] },
      },
    ],
    inputsSnapshot: {
      chemistry: "li_nmc",
      applicationClass: "vehicle",
      ddrFlags: ["damaged"],
      jurisdiction: "US-WA",
    },
    decidedAt: T.ddrLithiumIntake,
    decidedBy: null,
    supersedesClassificationDecisionId: null,
    createdAt: T.ddrLithiumIntake,
  },
  {
    ...NO_OVERRIDE,
    id: ID.CLASSIFICATION.ddrNoPackagingRule,
    organizationId: ID.ORG.cascade,
    decisionScope: "battery_record",
    batteryRecordId: ID.BATTERY.ddrNoPackagingRule,
    containerId: null,
    shipmentId: null,
    jurisdictionId: ID.JURISDICTION.washington,
    status: "active",
    wasteClassification: "light_category",
    basisCodes: ["federal_default", "damage_state"],
    reasoning:
      "Confirmed sealed lead-acid chemistry falls within the light waste category in this jurisdiction. " +
      "A confirmed leakage finding sets the damaged flag, which changes handling and packaging and removes " +
      "air transport as an option; it does not move the record out of the light category here.",
    governingRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    evaluationTrace: [
      {
        ...WA_CLASSIFICATION_APPLIED,
        inputs: { chemistry: "lead_acid_sealed", ddrFlags: ["damaged"] },
      },
    ],
    inputsSnapshot: {
      chemistry: "lead_acid_sealed",
      applicationClass: "small_mobility",
      ddrFlags: ["damaged"],
      jurisdiction: "US-WA",
    },
    decidedAt: T.ddrNoRuleIntake,
    decidedBy: null,
    supersedesClassificationDecisionId: null,
    createdAt: T.ddrNoRuleIntake,
  },
];

export const storageEvents: readonly StorageEvent[] = [
  {
    id: ID.STORAGE_EVENT.ddrLithiumPlaced,
    organizationId: ID.ORG.cascade,
    activityType: "place",
    storageClockId: ID.CLOCK.mixedDdrQuarantine,
    containerId: ID.CONTAINER.mixedDdrQuarantine,
    batteryRecordId: ID.BATTERY.ddrLithiumOnMixed,
    lotId: null,
    occurredAt: T.ddrLithiumIntake,
    recordedAt: T.ddrLithiumIntake,
    recordedBy: ID.USER.danaHandler,
    payload: { carriedAccumulationStart: T.ddrLithiumIntake },
    governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
    createdAt: T.ddrLithiumIntake,
  },
  {
    id: ID.STORAGE_EVENT.ddrNoRulePlaced,
    organizationId: ID.ORG.cascade,
    activityType: "place",
    storageClockId: ID.CLOCK.noRuleDdrQuarantine,
    containerId: ID.CONTAINER.noRuleDdrQuarantine,
    batteryRecordId: ID.BATTERY.ddrNoPackagingRule,
    lotId: ID.LOT.mixedShipment,
    occurredAt: T.ddrNoRuleIntake,
    recordedAt: T.ddrNoRuleIntake,
    recordedBy: ID.USER.danaHandler,
    payload: { carriedAccumulationStart: T.ddrNoRuleIntake },
    governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
    createdAt: T.ddrNoRuleIntake,
  },
];

// --- the mixed shipment ----------------------------------------------------------------------

export const shipments: readonly Shipment[] = [
  {
    // Rule 5.1 — C-0005 chosen on its own and L-0003 chosen whole. A draft:
    // its containers carry no label yet, so its checklist names that.
    id: ID.SHIPMENT.mixedDdr,
    organizationId: ID.ORG.cascade,
    shipmentNumber: "SH-0003",
    status: "draft",
    originAddress: {
      line1: "1420 Industrial Way SW",
      line2: null,
      city: "Tumwater",
      region: "WA",
      postalCode: "98512",
      country: "US",
    },
    destinationFacilityName: "Basin Materials Recovery",
    destinationAddress: {
      line1: "77 Terminal Road",
      line2: null,
      city: "Moses Lake",
      region: "WA",
      postalCode: "98837",
      country: "US",
    },
    destinationIdentifier: "WA-RECV-000318",
    transporterName: null,
    transporterIdentifier: null,
    carrierName: "Coleridge Hauling",
    packagingExceptions: ["none"],
    transportMode: "ground",
    airTransportBlockedReason: null,
    classificationDecisionId: null,
    totalMassKg: null,
    totalEnergyWh: null,
    offeredAt: null,
    shippedAt: null,
    receivedAt: null,
    receivedConfirmationRef: null,
    retentionExpiresOn: null,
    retentionRuleVersionId: null,
    createdAt: T.mixedShipmentCreated,
    updatedAt: T.mixedShipmentCreated,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
];

// --- history ---------------------------------------------------------------------------------

export const auditEvents: readonly AuditEvent[] = [
  {
    // Rules 2.35, 12.15 — the disagreement on the record's history, with the
    // values compared and the tolerance in force.
    id: ID.AUDIT.labelMismatchRouted,
    sequenceNo: 5,
    organizationId: ID.ORG.cascade,
    actorUserId: null,
    actorType: "system",
    actorLabel: "intake-pipeline:gate",
    eventType: "battery_record.routed_to_review",
    entityTable: "battery_record",
    entityId: ID.BATTERY.labelMismatchInReview,
    occurredAt: T.mismatchIntake,
    recordedAt: T.mismatchIntake,
    beforeState: { status: "draft" },
    afterState: {
      status: "pending_review",
      reasonCodes: ["label_catalog_mismatch"],
      fieldsBelowThreshold: [],
      thresholdsApplied: {
        minFieldConfidence: 0.9,
        minMatchScore: 0.82,
        minMatchSeparation: 0.12,
      },
      labelCatalog: {
        catalogEntryId: ID.CATALOG.vehicleTractionNmc,
        compared: [
          "manufacturer",
          "model",
          "voltage",
          "capacity_ah",
          "energy_wh",
        ],
        disagreements: [
          {
            fieldCode: "voltage",
            labelSays: "400 V",
            catalogSays: "355.200",
            toleranceRelative: 0.02,
          },
        ],
        configurationVersion: "platform-floor-2026-08",
      },
    },
    changedFields: ["status"],
    governingRuleVersionId: null,
    ruleVersionsApplied: null,
    correlationId: "corr-mismatch-0008",
    requestId: null,
    ipAddress: null,
    userAgent: null,
    reason: "label_catalog_mismatch",
    createdAt: T.mismatchIntake,
  },
];
