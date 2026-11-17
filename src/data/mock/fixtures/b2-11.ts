import type { BatteryRecord } from "@/types/battery-record";
import type { DamageAssessment, RecallCheckRun } from "@/types/condition";
import type { Container, StorageClock } from "@/types/storage";

import {
  EMPTY_PASSPORT,
  NO_ASSESSMENT_INSTRUMENT,
  NO_PERFORMANCE,
  NO_SOURCE_DEVICE,
} from "./b2-09";
import * as ID from "./ids";

/**
 * The rows `b2-11-risk-ranking` adds — **added, never edited** (STATE §7.1).
 * Each base array in `./index.ts` gains these at its end and no existing row
 * changes. With Cascade's existing held records they put **every level of
 * every factor** in the set, and a "Not recorded" for each (Rule 10.20):
 *
 * | Record | What it adds |
 * | --- | --- |
 * | BR-0017, in C-0010 | Lithium metal · no damage assessment · made 2014 (the oldest age band) · the label read with no marks · no rated energy, so C-0010's storage aggregation is "Not fully recorded" |
 * | BR-0018 | Alkaline · a device-sourced pack whose last check found no match |
 * | BR-0019, BR-0020 | T-01 `other` (chemistry "Not recorded") — **level on every factor**, the level pair |
 *
 * Cascade's existing records already carry the rest: damaged (BR-0003),
 * cosmetic (BR-0002), a confirmed and possible recalls (BR-0011, BR-0009),
 * lithium-ion and lead-acid, both T-21 bands and `not_captured`, no date
 * (BR-0013) and marks read (BR-0001). **Rainier holds exactly one held
 * battery** — the `not_ranked` organization the brief asks for already
 * exists, so no fourth organization is added (build-notes §4).
 *
 * Unplaced where nothing depends on a container, as BR-0013 and BR-0015 are:
 * a seeded container's contents are other specs' to count.
 */

const T = {
  rankingIntake: "2026-11-05T16:00:00.000Z",
} as const;

const WA_ACCUMULATION_APPLIED = {
  jurisdictionRuleId: ID.JURISDICTION_RULE.waAccumulationPeriod,
  ruleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
  ruleKey: "storage.accumulation_period",
  versionLabel: "2026",
  citation:
    "WA universal waste accumulation period — see rule_version.citation",
  inputs: { containerType: "light_category_sound" },
  outcome: "max_duration_days=365",
} as const;

// --- the container that holds an unknown amount -------------------------------------------------

export const containers: readonly Container[] = [
  {
    id: ID.CONTAINER.rankingUnknownEnergy,
    organizationId: ID.ORG.cascade,
    containerCode: "C-0010",
    containerType: "light_category_sound",
    lotId: null,
    shipmentId: null,
    capacityKg: "250.000",
    capacityVolumeM3: "0.2000",
    currentNetMassKg: "2.400",
    accumulationStartedAt: T.rankingIntake,
    accumulationStartSource: "first_placement",
    siteAddress: null,
    siteTimeZone: "America/Los_Angeles",
    storageLocation: "Bay 3 · Shelf P",
    status: "open",
    sealedAt: null,
    closedAt: null,
    currentContainerLabelId: null,
    createdAt: T.rankingIntake,
    updatedAt: T.rankingIntake,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
];

export const storageClocks: readonly StorageClock[] = [
  {
    id: ID.CLOCK.rankingUnknownEnergy,
    organizationId: ID.ORG.cascade,
    subjectType: "container",
    batteryRecordId: null,
    containerId: ID.CONTAINER.rankingUnknownEnergy,
    clockStartAt: T.rankingIntake,
    clockStartBasis: "first_placement",
    timeZone: "America/Los_Angeles",
    maxDurationDays: 365,
    governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
    evaluationTrace: [WA_ACCUMULATION_APPLIED],
    dueAt: "2027-11-06T06:59:59.999Z",
    alertSchedule: {
      early: "2027-08-06",
      mid: "2027-09-05",
      final: "2027-10-05",
    },
    alertBand: "none",
    nextAlertAt: "2027-08-06T07:00:00.000Z",
    stoppedAt: null,
    stopReason: null,
    status: "running",
    createdAt: T.rankingIntake,
    updatedAt: T.rankingIntake,
  },
];

// --- the records ------------------------------------------------------------------------------

function rankingRecord(input: {
  readonly id: string;
  readonly recordNumber: string;
  readonly status: BatteryRecord["status"];
  readonly containerId: string | null;
  readonly manufacturerName: string;
  readonly modelName: string;
  readonly serialNumber: string;
  readonly manufacturedOn: string;
  readonly chemistry: BatteryRecord["chemistry"];
  readonly certificationMarks: BatteryRecord["certificationMarks"];
  readonly stateOfChargeBand: BatteryRecord["stateOfChargeBand"];
  readonly ratedEnergyWh: string | null;
  readonly batteryMassKg: string;
  readonly assessedCondition: string | null;
  readonly source?: Partial<BatteryRecord>;
}): BatteryRecord {
  const at = T.rankingIntake;
  return {
    ...EMPTY_PASSPORT,
    ...NO_PERFORMANCE,
    ...NO_SOURCE_DEVICE,
    id: input.id,
    organizationId: ID.ORG.cascade,
    recordNumber: input.recordNumber,
    batteryPassportIdentifier: null,
    status: input.status,
    intakeSessionId: null,
    catalogEntryId: null,
    containerId: input.containerId,
    archivedAt: null,
    batteryStatus: "waste",
    manufacturerName: input.manufacturerName,
    manufacturerIdentifier: null,
    manufacturingPlace: null,
    manufacturedOn: input.manufacturedOn,
    brandName: null,
    modelName: input.modelName,
    partNumber: null,
    serialNumber: input.serialNumber,
    batteryMassKg: input.batteryMassKg,
    chemistry: input.chemistry,
    cellFormFactor: "cylindrical",
    assemblyLevel: "pack",
    applicationClass: "consumer_electronics",
    cellCount: null,
    moduleCount: null,
    nominalVoltageV: null,
    ratedCapacityAh: null,
    ratedEnergyWh: input.ratedEnergyWh,
    stateOfChargeBand: input.stateOfChargeBand,
    stateOfChargePercentAtIntake: null,
    socSource: null,
    socAssessedAt: null,
    dispositionRoute: "pending",
    assessedCondition: input.assessedCondition,
    conditionConfirmedBy:
      input.assessedCondition === null ? null : ID.USER.danaHandler,
    conditionConfirmedAt: input.assessedCondition === null ? null : at,
    chemistrySource: "human_entry",
    chemistryConfirmedBy: ID.USER.danaHandler,
    chemistryConfirmedAt: at,
    ddrFlags: [],
    isAirTransportProhibited: false,
    conditionRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    dateCodeRaw: null,
    dateCodeDecodeId: null,
    certificationMarks: input.certificationMarks,
    ...input.source,
    createdAt: at,
    updatedAt: at,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  };
}

export const batteryRecords: readonly BatteryRecord[] = [
  rankingRecord({
    id: ID.BATTERY.rankingLithiumMetal,
    recordNumber: "BR-0017",
    status: "stored",
    containerId: ID.CONTAINER.rankingUnknownEnergy,
    manufacturerName: "Corvane Primary Cells",
    modelName: "LM-9 pack",
    serialNumber: "CV-LM9-14-0617",
    manufacturedOn: "2014-06-01",
    chemistry: "lithium_metal",
    // The label was read, and carries no mark — "None read", not "Not recorded".
    certificationMarks: [],
    stateOfChargeBand: "not_captured",
    // No rated energy on the label: C-0010's aggregation is "Not fully recorded".
    ratedEnergyWh: null,
    batteryMassKg: "2.400",
    // No damage assessment, on purpose: the damage factor reads "Not recorded".
    assessedCondition: null,
  }),
  rankingRecord({
    id: ID.BATTERY.rankingAlkaline,
    recordNumber: "BR-0018",
    status: "confirmed",
    containerId: null,
    manufacturerName: "Brightcell",
    modelName: "AA-24 bulk pack",
    serialNumber: "BC-AA24-23-0218",
    manufacturedOn: "2023-02-01",
    chemistry: "alkaline",
    certificationMarks: ["CE"],
    stateOfChargeBand: "at_or_below_storage_limit",
    ratedEnergyWh: "86.400",
    batteryMassKg: "0.580",
    assessedCondition: "sound",
    source: {
      sourceDeviceType: "consumer_device",
      sourceDeviceIdentifier: "LUM-FL3-0042",
      sourceDeviceMake: "Lumora",
      sourceDeviceModel: "Field Lantern 3",
      sourceDeviceModelYear: null,
      provenanceSourceType: "device_serial",
      provenanceRecordedAt: T.rankingIntake,
    },
  }),
  rankingRecord({
    id: ID.BATTERY.rankingLevelFirst,
    recordNumber: "BR-0019",
    status: "confirmed",
    containerId: null,
    manufacturerName: "Unbranded",
    modelName: "Hand-built pack",
    serialNumber: "HB-24-0519",
    manufacturedOn: "2024-05-01",
    chemistry: "other",
    certificationMarks: ["CE"],
    stateOfChargeBand: "at_or_below_storage_limit",
    ratedEnergyWh: "120.000",
    batteryMassKg: "0.900",
    assessedCondition: "sound",
  }),
  rankingRecord({
    id: ID.BATTERY.rankingLevelSecond,
    recordNumber: "BR-0020",
    status: "confirmed",
    containerId: null,
    manufacturerName: "Unbranded",
    modelName: "Hand-built pack",
    serialNumber: "HB-24-0520",
    manufacturedOn: "2024-05-01",
    chemistry: "other",
    certificationMarks: ["CE"],
    stateOfChargeBand: "at_or_below_storage_limit",
    ratedEnergyWh: "120.000",
    batteryMassKg: "0.900",
    assessedCondition: "sound",
  }),
];

// --- condition ----------------------------------------------------------------------------------

function noneObserved(id: string, batteryRecordId: string): DamageAssessment {
  return {
    ...NO_ASSESSMENT_INSTRUMENT,
    id,
    organizationId: ID.ORG.cascade,
    batteryRecordId,
    intakePhotoId: null,
    assessmentMethod: "human_visual_inspection",
    status: "assessed_sound",
    findingTypes: ["none_observed"],
    findingDetail: null,
    assessedCondition: "sound",
    isAirTransportProhibited: false,
    governingRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    assessedAt: T.rankingIntake,
    assessedBy: ID.USER.danaHandler,
    confirmedBy: ID.USER.danaHandler,
    confirmedAt: T.rankingIntake,
    createdAt: T.rankingIntake,
  };
}

export const damageAssessments: readonly DamageAssessment[] = [
  noneObserved(ID.DAMAGE.rankingAlkaline, ID.BATTERY.rankingAlkaline),
  noneObserved(ID.DAMAGE.rankingLevelFirst, ID.BATTERY.rankingLevelFirst),
  noneObserved(ID.DAMAGE.rankingLevelSecond, ID.BATTERY.rankingLevelSecond),
];

// --- recalls ------------------------------------------------------------------------------------

/** BR-0018's device, checked against the consumer source: no match — the "No match" level. */
export const recallCheckRuns: readonly RecallCheckRun[] = [
  {
    id: ID.RECALL_CHECK.rankingAlkalineDevice,
    organizationId: ID.ORG.cascade,
    batteryRecordId: ID.BATTERY.rankingAlkaline,
    source: "consumer_product_agency",
    identity: "source_device",
    trigger: "intake_commit",
    outcome: "no_match",
    checkErrorCode: null,
    matchIds: [],
    configurationVersion: "recall-match-2026-10",
    ranAt: T.rankingIntake,
    ranBy: ID.USER.danaHandler,
    createdAt: T.rankingIntake,
  },
];

/** When Cascade's seeded ranking ran — after every row above (Rule 10.26). */
export const SEEDED_RANKING_AT = "2026-11-12T15:00:00.000Z";
