import type { BatteryRecord } from "@/types/battery-record";
import type {
  DamageAssessment,
  RecallCheckRun,
  RecallMatch,
} from "@/types/condition";
import type {
  ClassificationDecision,
  DocumentRender,
  Shipment,
  ShippingPaper,
} from "@/types/documents";
import type { RuleVersion } from "@/types/rules-as-data";
import type { Alert, Container, StorageClock } from "@/types/storage";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";

import * as ID from "./ids";

/**
 * The rows `b2-09-recalls` adds — **added, never edited** (STATE §7.1). Each
 * base array in `./index.ts` gains these at its end and no existing row
 * changes. Six scenarios, one per item in the brief, plus the v2 packaging
 * rule (D-72 #9):
 *
 * | Scenario | Rows |
 * | --- | --- |
 * | Maker and model match a fixture recall (Rule 10.12) | BR-0009, Ridgeline RM-24V50 in C-0007; possible match on consumer recall 26-041 |
 * | A vehicle-sourced record matching a traction-battery vehicle recall | BR-0010, out of a Corvane Ion LX 2022, in C-0007; possible match on vehicle recall 26V-118 |
 * | Already confirmed recalled and quarantined (UX §7.2, "a recalled pack") | BR-0011, Halden HM-L58 in quarantine C-0008; a recall recorded by hand, confirmed |
 * | A record whose check fails (Rule 10.17) | BR-0012, out of a Kestrel, in C-0007; the vehicle source did not answer |
 * | Nothing to match against (Rule 10.11) | BR-0013, confirmed with no catalog entry and no source make, unplaced |
 * | Sound, on an open air shipment with an issued paper, with a possible match (Rule 6.14) | BR-0014 in C-0009 on SH-0004 (air, documents issued); possible match on 26V-118 |
 *
 * The recalls themselves are the fixture provider's (`src/lib/recalls/
 * providers/fixture.ts`); these rows are what checks against it recorded.
 * Every possible match has the open `recall_match` alert its check raised.
 * No row carries a number of any kind about a match (Rule 10.13).
 */

const T = {
  airIntake: "2026-10-22T14:00:00.000Z",
  recalledIntake: "2026-10-23T16:20:00.000Z",
  recallRecorded: "2026-10-24T09:10:00.000Z",
  checksIntake: "2026-10-24T15:00:00.000Z",
  nothingIntake: "2026-10-25T11:30:00.000Z",
  airShipmentCreated: "2026-10-26T09:00:00.000Z",
  airPaperIssued: "2026-10-26T10:15:00.000Z",
  rulesAuthored: "2026-10-28T00:00:00.000Z",
} as const;

const CONFIGURATION_VERSION = "recall-match-2026-10";

const WA_ACCUMULATION_APPLIED: AppliedRuleVersion = {
  jurisdictionRuleId: ID.JURISDICTION_RULE.waAccumulationPeriod,
  ruleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
  ruleKey: "storage.accumulation_period",
  versionLabel: "2026",
  citation:
    "WA universal waste accumulation period — see rule_version.citation",
  inputs: { containerType: "light_category_sound" },
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

const FEDERAL_TRANSPORT_APPLIED: AppliedRuleVersion = {
  jurisdictionRuleId: ID.JURISDICTION_RULE.federalTransport,
  ruleVersionId: ID.RULE_VERSION.federalTransport2026,
  ruleKey: "transport.shipping_paper",
  versionLabel: "2026",
  citation: "49 CFR 172.202 — see rule_version.citation",
  inputs: { transportMode: "air" },
  outcome: "shipping_paper_required",
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

const NO_SOURCE_DEVICE = {
  sourceDeviceType: null,
  sourceDeviceIdentifier: null,
  sourceDeviceMake: null,
  sourceDeviceModel: null,
  sourceDeviceModelYear: null,
  provenanceSourceType: "unknown_provenance",
  provenanceRecordedAt: null,
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

// --- containers -------------------------------------------------------------------------------

function soundContainer(input: {
  readonly id: string;
  readonly code: string;
  readonly type: Container["containerType"];
  readonly shipmentId: string | null;
  readonly netMassKg: string;
  readonly startedAt: string;
  readonly location: string;
}): Container {
  return {
    id: input.id,
    organizationId: ID.ORG.cascade,
    containerCode: input.code,
    containerType: input.type,
    lotId: null,
    shipmentId: input.shipmentId,
    capacityKg: "1500.000",
    capacityVolumeM3: "1.2000",
    currentNetMassKg: input.netMassKg,
    accumulationStartedAt: input.startedAt,
    accumulationStartSource: "first_placement",
    siteAddress: null,
    siteTimeZone: "America/Los_Angeles",
    storageLocation: input.location,
    status: "open",
    sealedAt: null,
    closedAt: null,
    currentContainerLabelId: null,
    createdAt: input.startedAt,
    updatedAt: input.startedAt,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  };
}

export const containers: readonly Container[] = [
  soundContainer({
    id: ID.CONTAINER.recallChecks,
    code: "C-0007",
    type: "light_category_sound",
    shipmentId: null,
    netMassKg: "1464.500",
    startedAt: T.checksIntake,
    location: "Bay 2 · Rack R",
  }),
  soundContainer({
    id: ID.CONTAINER.recalledQuarantine,
    code: "C-0008",
    type: "light_category_ddr",
    shipmentId: null,
    netMassKg: "0.310",
    startedAt: T.recalledIntake,
    location: "Bay 4 · Quarantine cage D",
  }),
  soundContainer({
    id: ID.CONTAINER.airShipmentSound,
    code: "C-0009",
    type: "light_category_sound",
    shipmentId: ID.SHIPMENT.airIssued,
    netMassKg: "480.000",
    startedAt: T.airIntake,
    location: "Dock 1 · Outbound",
  }),
];

function clock(input: {
  readonly id: string;
  readonly containerId: string;
  readonly startedAt: string;
  readonly dueAt: string;
  readonly containerType: Container["containerType"];
  readonly schedule: { early: string; mid: string; final: string };
  readonly nextAlertAt: string;
}): StorageClock {
  return {
    id: input.id,
    organizationId: ID.ORG.cascade,
    subjectType: "container",
    batteryRecordId: null,
    containerId: input.containerId,
    clockStartAt: input.startedAt,
    clockStartBasis: "first_placement",
    timeZone: "America/Los_Angeles",
    maxDurationDays: 365,
    governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
    evaluationTrace: [
      {
        ...WA_ACCUMULATION_APPLIED,
        inputs: { containerType: input.containerType },
      },
    ],
    dueAt: input.dueAt,
    alertSchedule: input.schedule,
    alertBand: "none",
    nextAlertAt: input.nextAlertAt,
    stoppedAt: null,
    stopReason: null,
    status: "running",
    createdAt: input.startedAt,
    updatedAt: input.startedAt,
  };
}

export const storageClocks: readonly StorageClock[] = [
  clock({
    id: ID.CLOCK.recallChecks,
    containerId: ID.CONTAINER.recallChecks,
    startedAt: T.checksIntake,
    dueAt: "2027-10-25T06:59:59.999Z",
    containerType: "light_category_sound",
    schedule: { early: "2027-07-26", mid: "2027-08-25", final: "2027-09-24" },
    nextAlertAt: "2027-07-26T07:00:00.000Z",
  }),
  clock({
    id: ID.CLOCK.recalledQuarantine,
    containerId: ID.CONTAINER.recalledQuarantine,
    startedAt: T.recalledIntake,
    dueAt: "2027-10-24T06:59:59.999Z",
    containerType: "light_category_ddr",
    schedule: { early: "2027-07-25", mid: "2027-08-24", final: "2027-09-23" },
    nextAlertAt: "2027-07-25T07:00:00.000Z",
  }),
  clock({
    id: ID.CLOCK.airShipmentSound,
    containerId: ID.CONTAINER.airShipmentSound,
    startedAt: T.airIntake,
    dueAt: "2027-10-23T06:59:59.999Z",
    containerType: "light_category_sound",
    schedule: { early: "2027-07-24", mid: "2027-08-23", final: "2027-09-22" },
    nextAlertAt: "2027-07-24T07:00:00.000Z",
  }),
];

// --- battery records ------------------------------------------------------------------------------

/** A Northvale NV-TP400 traction pack, sound — the vehicle-sourced scenarios share it. */
function tractionPack(input: {
  readonly id: string;
  readonly recordNumber: string;
  readonly containerId: string;
  readonly serialNumber: string;
  readonly at: string;
  readonly source: {
    readonly identifier: string;
    readonly make: string;
    readonly model: string;
    readonly modelYear: number;
  };
}): BatteryRecord {
  return {
    ...EMPTY_PASSPORT,
    ...NO_PERFORMANCE,
    id: input.id,
    organizationId: ID.ORG.cascade,
    recordNumber: input.recordNumber,
    batteryPassportIdentifier: null,
    status: "stored",
    intakeSessionId: null,
    catalogEntryId: ID.CATALOG.vehicleTractionNmc,
    containerId: input.containerId,
    archivedAt: null,
    batteryStatus: "waste",
    manufacturerName: "Northvale Cell Systems",
    manufacturerIdentifier: null,
    manufacturingPlace: null,
    manufacturedOn: "2021-11-01",
    brandName: "Northvale",
    modelName: "NV-TP400",
    partNumber: "NV-TP400-96S",
    serialNumber: input.serialNumber,
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
    assessedCondition: "sound",
    conditionConfirmedBy: ID.USER.danaHandler,
    conditionConfirmedAt: input.at,
    chemistrySource: "catalog_match",
    chemistryConfirmedBy: ID.USER.danaHandler,
    chemistryConfirmedAt: input.at,
    ddrFlags: [],
    isAirTransportProhibited: false,
    conditionRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    dateCodeRaw: null,
    dateCodeDecodeId: null,
    sourceDeviceType: "passenger_vehicle",
    sourceDeviceIdentifier: input.source.identifier,
    sourceDeviceMake: input.source.make,
    sourceDeviceModel: input.source.model,
    sourceDeviceModelYear: input.source.modelYear,
    provenanceSourceType: "vehicle_vin",
    provenanceRecordedAt: input.at,
    createdAt: input.at,
    updatedAt: input.at,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  };
}

export const batteryRecords: readonly BatteryRecord[] = [
  {
    // Ridgeline RM-24V50: the maker and model a fixture consumer recall names.
    ...EMPTY_PASSPORT,
    ...NO_PERFORMANCE,
    ...NO_SOURCE_DEVICE,
    id: ID.BATTERY.recallBrandModel,
    organizationId: ID.ORG.cascade,
    recordNumber: "BR-0009",
    batteryPassportIdentifier: null,
    status: "stored",
    intakeSessionId: null,
    catalogEntryId: ID.CATALOG.mobilityScooterSla,
    containerId: ID.CONTAINER.recallChecks,
    archivedAt: null,
    batteryStatus: "waste",
    manufacturerName: "Ridgeline Mobility",
    manufacturerIdentifier: null,
    manufacturingPlace: null,
    manufacturedOn: "2022-03-01",
    brandName: "Ridgeline",
    modelName: "RM-24V50",
    partNumber: "RM-24V50-AGM",
    serialNumber: "RM2450-0322-03317",
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
    assessedCondition: "sound",
    conditionConfirmedBy: ID.USER.danaHandler,
    conditionConfirmedAt: T.checksIntake,
    chemistrySource: "catalog_match",
    chemistryConfirmedBy: ID.USER.danaHandler,
    chemistryConfirmedAt: T.checksIntake,
    ddrFlags: [],
    isAirTransportProhibited: false,
    conditionRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    dateCodeRaw: null,
    dateCodeDecodeId: null,
    createdAt: T.checksIntake,
    updatedAt: T.checksIntake,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
  tractionPack({
    id: ID.BATTERY.recallVehicle,
    recordNumber: "BR-0010",
    containerId: ID.CONTAINER.recallChecks,
    serialNumber: "NVTP4000000102240",
    at: T.checksIntake,
    source: {
      identifier: "1CVFIXTURE0002204",
      make: "Corvane",
      model: "Ion LX",
      modelYear: 2022,
    },
  }),
  {
    // The recalled pack (UX §7.2): physically sound, recalled by a
    // manufacturer's notice recorded by hand — so it is quarantined and barred
    // from air (Rules 6.5, 6.17, 6.23).
    ...EMPTY_PASSPORT,
    ...NO_PERFORMANCE,
    ...NO_SOURCE_DEVICE,
    id: ID.BATTERY.recalledQuarantined,
    organizationId: ID.ORG.cascade,
    recordNumber: "BR-0011",
    batteryPassportIdentifier: null,
    status: "quarantined",
    intakeSessionId: null,
    catalogEntryId: ID.CATALOG.laptopCellLco,
    containerId: ID.CONTAINER.recalledQuarantine,
    archivedAt: null,
    batteryStatus: "waste",
    manufacturerName: "Halden Micro",
    manufacturerIdentifier: null,
    manufacturingPlace: null,
    manufacturedOn: "2020-02-01",
    brandName: "Halden",
    modelName: "HM-L58",
    partNumber: "HM-L58-6C",
    serialNumber: "HML58-FIXTURE-9024",
    batteryMassKg: "0.310",
    chemistry: "li_lco",
    cellFormFactor: "pouch",
    assemblyLevel: "pack",
    applicationClass: "consumer_electronics",
    cellCount: 6,
    moduleCount: null,
    nominalVoltageV: "11.400",
    ratedCapacityAh: "5.200",
    ratedEnergyWh: "59.280",
    stateOfChargeBand: "not_captured",
    stateOfChargePercentAtIntake: null,
    socSource: null,
    socAssessedAt: null,
    dispositionRoute: "pending",
    assessedCondition: "sound",
    conditionConfirmedBy: ID.USER.danaHandler,
    conditionConfirmedAt: T.recalledIntake,
    chemistrySource: "catalog_match",
    chemistryConfirmedBy: ID.USER.danaHandler,
    chemistryConfirmedAt: T.recalledIntake,
    ddrFlags: ["recalled"],
    isAirTransportProhibited: true,
    conditionRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    dateCodeRaw: null,
    dateCodeDecodeId: null,
    createdAt: T.recalledIntake,
    updatedAt: T.recallRecorded,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
  tractionPack({
    id: ID.BATTERY.recallCheckFails,
    recordNumber: "BR-0012",
    containerId: ID.CONTAINER.recallChecks,
    serialNumber: "NVTP4000000102291",
    at: T.checksIntake,
    source: {
      identifier: "KSTFIXTURE0000818",
      make: "Kestrel",
      model: "Volt 8",
      modelYear: 2021,
    },
  }),
  {
    // Confirmed by a person with no catalog entry and no source make: nothing
    // a recall could name (Rule 10.11). Unplaced — it has no classification
    // decision, because none was derived without a catalog entry.
    ...EMPTY_PASSPORT,
    ...NO_PERFORMANCE,
    ...NO_SOURCE_DEVICE,
    id: ID.BATTERY.nothingToMatch,
    organizationId: ID.ORG.cascade,
    recordNumber: "BR-0013",
    batteryPassportIdentifier: null,
    status: "confirmed",
    intakeSessionId: null,
    catalogEntryId: null,
    containerId: null,
    archivedAt: null,
    batteryStatus: "waste",
    manufacturerName: null,
    manufacturerIdentifier: null,
    manufacturingPlace: null,
    manufacturedOn: null,
    brandName: null,
    modelName: null,
    partNumber: null,
    serialNumber: null,
    batteryMassKg: "1.900",
    chemistry: "li_ion_unspecified",
    cellFormFactor: "cylindrical",
    assemblyLevel: "pack",
    applicationClass: "consumer_electronics",
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
    assessedCondition: "sound",
    conditionConfirmedBy: ID.USER.danaHandler,
    conditionConfirmedAt: T.nothingIntake,
    chemistrySource: "human_entry",
    chemistryConfirmedBy: ID.USER.danaHandler,
    chemistryConfirmedAt: T.nothingIntake,
    ddrFlags: [],
    isAirTransportProhibited: false,
    conditionRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    dateCodeRaw: null,
    dateCodeDecodeId: null,
    createdAt: T.nothingIntake,
    updatedAt: T.nothingIntake,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
  tractionPack({
    id: ID.BATTERY.airShipmentRecall,
    recordNumber: "BR-0014",
    containerId: ID.CONTAINER.airShipmentSound,
    serialNumber: "NVTP4000000102415",
    at: T.airIntake,
    source: {
      identifier: "1CVFIXTURE0002619",
      make: "Corvane",
      model: "Ion LX",
      modelYear: 2022,
    },
  }),
];

// --- condition and classification -------------------------------------------------------------

function soundAssessment(
  id: string,
  batteryRecordId: string,
  at: string,
): DamageAssessment {
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
    assessedAt: at,
    assessedBy: ID.USER.danaHandler,
    confirmedBy: ID.USER.danaHandler,
    confirmedAt: at,
    createdAt: at,
  };
}

export const damageAssessments: readonly DamageAssessment[] = [
  soundAssessment(
    ID.DAMAGE.recallBrandModel,
    ID.BATTERY.recallBrandModel,
    T.checksIntake,
  ),
  soundAssessment(
    ID.DAMAGE.recallVehicle,
    ID.BATTERY.recallVehicle,
    T.checksIntake,
  ),
  soundAssessment(
    ID.DAMAGE.recalledQuarantined,
    ID.BATTERY.recalledQuarantined,
    T.recalledIntake,
  ),
  soundAssessment(
    ID.DAMAGE.recallCheckFails,
    ID.BATTERY.recallCheckFails,
    T.checksIntake,
  ),
  soundAssessment(
    ID.DAMAGE.nothingToMatch,
    ID.BATTERY.nothingToMatch,
    T.nothingIntake,
  ),
  soundAssessment(
    ID.DAMAGE.airShipmentRecall,
    ID.BATTERY.airShipmentRecall,
    T.airIntake,
  ),
];

function lightCategory(input: {
  readonly id: string;
  readonly batteryRecordId: string;
  readonly chemistry: string;
  readonly applicationClass: string;
  readonly ddrFlags: readonly string[];
  readonly at: string;
}): ClassificationDecision {
  const recalled = input.ddrFlags.includes("recalled");
  return {
    ...NO_OVERRIDE,
    id: input.id,
    organizationId: ID.ORG.cascade,
    decisionScope: "battery_record",
    batteryRecordId: input.batteryRecordId,
    containerId: null,
    shipmentId: null,
    jurisdictionId: ID.JURISDICTION.washington,
    status: "active",
    wasteClassification: "light_category",
    basisCodes: recalled
      ? ["federal_default", "damage_state"]
      : ["federal_default"],
    reasoning: recalled
      ? "The confirmed chemistry falls within the light waste category in this jurisdiction. A confirmed " +
        "recall association puts the record on the damaged, defective or recalled path, which changes handling " +
        "and packaging and removes air transport as an option; it does not move the record out of the light category here."
      : "The confirmed chemistry falls within the light waste category in this jurisdiction.",
    governingRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    evaluationTrace: [
      {
        ...WA_CLASSIFICATION_APPLIED,
        inputs: { chemistry: input.chemistry, ddrFlags: [...input.ddrFlags] },
      },
    ],
    inputsSnapshot: {
      chemistry: input.chemistry,
      applicationClass: input.applicationClass,
      ddrFlags: [...input.ddrFlags],
      jurisdiction: "US-WA",
    },
    decidedAt: input.at,
    decidedBy: null,
    supersedesClassificationDecisionId: null,
    createdAt: input.at,
  };
}

export const classificationDecisions: readonly ClassificationDecision[] = [
  lightCategory({
    id: ID.CLASSIFICATION.recallBrandModel,
    batteryRecordId: ID.BATTERY.recallBrandModel,
    chemistry: "lead_acid_sealed",
    applicationClass: "small_mobility",
    ddrFlags: [],
    at: T.checksIntake,
  }),
  lightCategory({
    id: ID.CLASSIFICATION.recallVehicle,
    batteryRecordId: ID.BATTERY.recallVehicle,
    chemistry: "li_nmc",
    applicationClass: "vehicle",
    ddrFlags: [],
    at: T.checksIntake,
  }),
  lightCategory({
    id: ID.CLASSIFICATION.recalledQuarantined,
    batteryRecordId: ID.BATTERY.recalledQuarantined,
    chemistry: "li_lco",
    applicationClass: "consumer_electronics",
    ddrFlags: ["recalled"],
    at: T.recallRecorded,
  }),
  lightCategory({
    id: ID.CLASSIFICATION.recallCheckFails,
    batteryRecordId: ID.BATTERY.recallCheckFails,
    chemistry: "li_nmc",
    applicationClass: "vehicle",
    ddrFlags: [],
    at: T.checksIntake,
  }),
  lightCategory({
    id: ID.CLASSIFICATION.airShipmentRecall,
    batteryRecordId: ID.BATTERY.airShipmentRecall,
    chemistry: "li_nmc",
    applicationClass: "vehicle",
    ddrFlags: [],
    at: T.airIntake,
  }),
];

// --- the air shipment and its issued paper (Rule 6.14) ------------------------------------------

export const shipments: readonly Shipment[] = [
  {
    // By air, documents issued, not departed — the case Rule 6.14 governs.
    id: ID.SHIPMENT.airIssued,
    organizationId: ID.ORG.cascade,
    shipmentNumber: "SH-0004",
    status: "documents_issued",
    originAddress: {
      line1: "1420 Industrial Way SW",
      line2: null,
      city: "Tumwater",
      region: "WA",
      postalCode: "98512",
      country: "US",
    },
    destinationFacilityName: "Cascadia Cell Recovery",
    destinationAddress: {
      line1: "1 Airport Way",
      line2: null,
      city: "Spokane",
      region: "WA",
      postalCode: "99224",
      country: "US",
    },
    destinationIdentifier: "WA-RECV-000452",
    transporterName: null,
    transporterIdentifier: null,
    carrierName: "Coleridge Air",
    packagingExceptions: ["none"],
    transportMode: "air",
    airTransportBlockedReason: null,
    classificationDecisionId: null,
    totalMassKg: "480.000",
    totalEnergyWh: "78100.000",
    offeredAt: T.airPaperIssued,
    shippedAt: null,
    receivedAt: null,
    receivedConfirmationRef: null,
    retentionExpiresOn: null,
    retentionRuleVersionId: null,
    createdAt: T.airShipmentCreated,
    updatedAt: T.airPaperIssued,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  },
];

export const documentRenders: readonly DocumentRender[] = [
  {
    id: ID.DOCUMENT_RENDER.airShippingPaper,
    organizationId: ID.ORG.cascade,
    documentType: "shipping_paper",
    shipmentId: ID.SHIPMENT.airIssued,
    containerId: null,
    batteryRecordId: null,
    evidencePackId: null,
    templateKey: "shipping_paper.us.air",
    templateVersion: "2026.10",
    rendererName: "react-pdf",
    rendererVersion: "4.x",
    inputSnapshot: {
      shipmentNumber: "SH-0004",
      lineCount: 1,
      recordIds: [ID.BATTERY.airShipmentRecall],
    },
    inputSnapshotHash:
      "c3e1a7f9b05d4e2a8c6b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c",
    verificationCode: "c3e1a7f9b05d",
    ruleVersionsApplied: [FEDERAL_TRANSPORT_APPLIED],
    storageObjectPath: `org/${ID.ORG.cascade}/documents/${ID.DOCUMENT_RENDER.airShippingPaper}.pdf`,
    contentHash:
      "d4f2b8a0c16e5f3b9d7c2e4a6b8d0f2c4e6a8b0d2f4c6e8a0b2d4f6c8e0a2b4d",
    byteSize: 81_204,
    pageCount: 1,
    renderedAt: T.airPaperIssued,
    renderedBy: ID.USER.danaHandler,
    renderDurationMs: 1_118,
    status: "issued",
    supersedesDocumentRenderId: null,
    supersededAt: null,
    createdAt: T.airPaperIssued,
  },
];

export const shippingPapers: readonly ShippingPaper[] = [
  {
    id: ID.SHIPPING_PAPER.airIssued,
    organizationId: ID.ORG.cascade,
    shipmentId: ID.SHIPMENT.airIssued,
    documentRenderId: ID.DOCUMENT_RENDER.airShippingPaper,
    unIdentifier: "un3480",
    properShippingName: "Lithium ion batteries",
    hazardClass: "9",
    packingGroup: "not_applicable",
    basicDescription: "UN3480, Lithium ion batteries, 9",
    numberAndTypeOfPackages: "1 crate",
    totalQuantityDescription: "480 kg",
    emergencyResponsePhone: "+1-800-555-0142",
    emergencyResponseContractRef: "ERI-CASCADE-2026-0117",
    emergencyResponseGuideNumber: "147",
    shipperCertificationText:
      "This is to certify that the above-named materials are properly classified, described, packaged, marked and labelled, and are in proper condition for transportation according to the applicable regulations.",
    shipperSignatureName: "Dana Okafor",
    shipperSignedAt: T.airPaperIssued,
    specialPermitRefs: null,
    governingRuleVersionId: ID.RULE_VERSION.federalTransport2026,
    evaluationTrace: [FEDERAL_TRANSPORT_APPLIED],
    supersedesShippingPaperId: null,
    generatedAt: T.airPaperIssued,
    generatedBy: ID.USER.danaHandler,
    createdAt: T.airPaperIssued,
  },
];

// --- recall associations and check runs ------------------------------------------------------------

function possible(input: {
  readonly id: string;
  readonly batteryRecordId: string;
  readonly source: RecallMatch["source"];
  readonly providerRecordId: string;
  readonly identity: RecallMatch["identity"];
  readonly fields: readonly string[];
  readonly recallNumber: string;
  readonly title: string;
  readonly url: string;
  readonly publishedOn: string;
  readonly remedy: string;
  readonly checkedAt: string;
}): RecallMatch {
  return {
    id: input.id,
    organizationId: ID.ORG.cascade,
    batteryRecordId: input.batteryRecordId,
    source: input.source,
    providerRecordId: input.providerRecordId,
    matchedOn: { identity: input.identity, fields: [...input.fields] },
    matchConfidence: null,
    identity: input.identity,
    status: "possible_match",
    recallNumber: input.recallNumber,
    recallTitle: input.title,
    recallUrl: input.url,
    recallPublishedOn: input.publishedOn,
    remedySummary: input.remedy,
    checkedAt: input.checkedAt,
    checkErrorCode: null,
    confirmedBy: null,
    confirmedAt: null,
    dismissedBy: null,
    dismissedReason: null,
    dismissedAt: null,
    createdAt: input.checkedAt,
    updatedAt: input.checkedAt,
  };
}

const VEHICLE_RECALL = {
  source: "vehicle_safety_agency",
  providerRecordId: "fixture-vehicle-26V-118",
  identity: "source_vehicle",
  fields: ["make", "model", "model_year", "component"],
  recallNumber: "26V-118",
  title: "Corvane Ion LX high-voltage battery module",
  url: "https://recalls.example/vehicle/26V-118",
  publishedOn: "2026-08-21",
  remedy: "Dealers will replace the affected battery module, free of charge.",
} as const;

export const recallMatches: readonly RecallMatch[] = [
  possible({
    id: ID.RECALL_MATCH.brandModel,
    batteryRecordId: ID.BATTERY.recallBrandModel,
    source: "consumer_product_agency",
    providerRecordId: "fixture-consumer-26-041",
    identity: "battery",
    fields: ["manufacturer", "model"],
    recallNumber: "26-041",
    title:
      "Ridgeline Mobility Recalls RM-24V50 Scooter Battery Packs Due to Overheating Connectors",
    url: "https://recalls.example/consumer/26-041",
    publishedOn: "2026-09-17",
    remedy: "Replace",
    checkedAt: T.checksIntake,
  }),
  possible({
    ...VEHICLE_RECALL,
    id: ID.RECALL_MATCH.vehicle,
    batteryRecordId: ID.BATTERY.recallVehicle,
    checkedAt: T.checksIntake,
  }),
  {
    // Recorded by hand from a manufacturer's notice — confirmed at once
    // (Rule 10.15); no check produced it, so nothing "matched".
    id: ID.RECALL_MATCH.recordedByHand,
    organizationId: ID.ORG.cascade,
    batteryRecordId: ID.BATTERY.recalledQuarantined,
    source: "manufacturer_notice",
    providerRecordId: "HM-SN-2026-114",
    matchedOn: {},
    matchConfidence: null,
    identity: null,
    status: "confirmed_match",
    recallNumber: "HM-SN-2026-114",
    recallTitle: "Halden HM-L58 laptop packs — service notice",
    recallUrl: null,
    recallPublishedOn: null,
    remedySummary: null,
    checkedAt: T.recallRecorded,
    checkErrorCode: null,
    confirmedBy: ID.USER.danaHandler,
    confirmedAt: T.recallRecorded,
    dismissedBy: null,
    dismissedReason: null,
    dismissedAt: null,
    createdAt: T.recallRecorded,
    updatedAt: T.recallRecorded,
  },
  possible({
    ...VEHICLE_RECALL,
    id: ID.RECALL_MATCH.airShipment,
    batteryRecordId: ID.BATTERY.airShipmentRecall,
    checkedAt: T.airIntake,
  }),
];

function run(input: {
  readonly id: string;
  readonly batteryRecordId: string;
  readonly source: RecallCheckRun["source"];
  readonly identity: RecallCheckRun["identity"];
  readonly outcome: RecallCheckRun["outcome"];
  readonly checkErrorCode?: string;
  readonly matchIds?: readonly string[];
  readonly ranAt: string;
}): RecallCheckRun {
  return {
    id: input.id,
    organizationId: ID.ORG.cascade,
    batteryRecordId: input.batteryRecordId,
    source: input.source,
    identity: input.identity,
    trigger: "intake_commit",
    outcome: input.outcome,
    checkErrorCode: input.checkErrorCode ?? null,
    matchIds: [...(input.matchIds ?? [])],
    configurationVersion: CONFIGURATION_VERSION,
    ranAt: input.ranAt,
    ranBy: ID.USER.danaHandler,
    createdAt: input.ranAt,
  };
}

export const recallCheckRuns: readonly RecallCheckRun[] = [
  run({
    id: ID.RECALL_CHECK.brandModelBattery,
    batteryRecordId: ID.BATTERY.recallBrandModel,
    source: "consumer_product_agency",
    identity: "battery",
    outcome: "candidates_found",
    matchIds: [ID.RECALL_MATCH.brandModel],
    ranAt: T.checksIntake,
  }),
  run({
    id: ID.RECALL_CHECK.vehicleBattery,
    batteryRecordId: ID.BATTERY.recallVehicle,
    source: "consumer_product_agency",
    identity: "battery",
    outcome: "no_match",
    ranAt: T.checksIntake,
  }),
  run({
    id: ID.RECALL_CHECK.vehicleSource,
    batteryRecordId: ID.BATTERY.recallVehicle,
    source: "vehicle_safety_agency",
    identity: "source_vehicle",
    outcome: "candidates_found",
    matchIds: [ID.RECALL_MATCH.vehicle],
    ranAt: T.checksIntake,
  }),
  run({
    id: ID.RECALL_CHECK.failsBattery,
    batteryRecordId: ID.BATTERY.recallCheckFails,
    source: "consumer_product_agency",
    identity: "battery",
    outcome: "no_match",
    ranAt: T.checksIntake,
  }),
  run({
    // Rule 10.17 — the source did not answer: a failed run with its reason,
    // never "no match".
    id: ID.RECALL_CHECK.failsVehicle,
    batteryRecordId: ID.BATTERY.recallCheckFails,
    source: "vehicle_safety_agency",
    identity: "source_vehicle",
    outcome: "failed",
    checkErrorCode: "source_unavailable",
    ranAt: T.checksIntake,
  }),
  run({
    id: ID.RECALL_CHECK.nothingToMatch,
    batteryRecordId: ID.BATTERY.nothingToMatch,
    source: null,
    identity: null,
    outcome: "nothing_to_match",
    ranAt: T.nothingIntake,
  }),
  run({
    id: ID.RECALL_CHECK.airShipmentBattery,
    batteryRecordId: ID.BATTERY.airShipmentRecall,
    source: "consumer_product_agency",
    identity: "battery",
    outcome: "no_match",
    ranAt: T.airIntake,
  }),
  run({
    id: ID.RECALL_CHECK.airShipmentVehicle,
    batteryRecordId: ID.BATTERY.airShipmentRecall,
    source: "vehicle_safety_agency",
    identity: "source_vehicle",
    outcome: "candidates_found",
    matchIds: [ID.RECALL_MATCH.airShipment],
    ranAt: T.airIntake,
  }),
];

function recallAlert(input: {
  readonly id: string;
  readonly matchId: string;
  readonly batteryRecordId: string;
  readonly recordNumber: string;
  readonly recallNumber: string;
  readonly matchedOn: string;
  readonly raisedAt: string;
}): Alert {
  return {
    id: input.id,
    organizationId: ID.ORG.cascade,
    alertType: "recall_match",
    severity: "attention",
    title: `Possible recall match on ${input.recordNumber}`,
    body: `${input.matchedOn} Open the record to confirm or dismiss it. Until a person confirms it, nothing about how the battery is handled changes.`,
    storageClockId: null,
    containerId: null,
    batteryRecordId: input.batteryRecordId,
    shipmentId: null,
    intakeSessionId: null,
    recallMatchId: input.matchId,
    obligationDeadlineId: null,
    siteIdRef: null,
    audienceRoles: ["compliance_handler", "facility_manager"],
    governingRuleVersionId: null,
    triggerSnapshot: {
      matchId: input.matchId,
      recordNumber: input.recordNumber,
      recallNumber: input.recallNumber,
      matchedOn: input.matchedOn,
    },
    raisedAt: input.raisedAt,
    dedupeKey: `recall_match:${input.matchId}`,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolutionReason: null,
    deliveredChannels: null,
    createdAt: input.raisedAt,
    updatedAt: input.raisedAt,
  };
}

const VEHICLE_WORDS =
  "Vehicle make, model and model year match recall 26V-118, and its component names the propulsion or traction battery.";

export const alerts: readonly Alert[] = [
  recallAlert({
    id: ID.ALERT.recallBrandModel,
    matchId: ID.RECALL_MATCH.brandModel,
    batteryRecordId: ID.BATTERY.recallBrandModel,
    recordNumber: "BR-0009",
    recallNumber: "26-041",
    matchedOn: "Manufacturer and model match recall 26-041.",
    raisedAt: T.checksIntake,
  }),
  recallAlert({
    id: ID.ALERT.recallVehicle,
    matchId: ID.RECALL_MATCH.vehicle,
    batteryRecordId: ID.BATTERY.recallVehicle,
    recordNumber: "BR-0010",
    recallNumber: "26V-118",
    matchedOn: VEHICLE_WORDS,
    raisedAt: T.checksIntake,
  }),
  recallAlert({
    id: ID.ALERT.recallAirShipment,
    matchId: ID.RECALL_MATCH.airShipment,
    batteryRecordId: ID.BATTERY.airShipmentRecall,
    recordNumber: "BR-0014",
    recallNumber: "26V-118",
    matchedOn: VEHICLE_WORDS,
    raisedAt: T.airIntake,
  }),
];

// --- rules as data -----------------------------------------------------------------------------------

/**
 * `transport.ddr_packaging` v2 — D-72 #9: the packing level authored, "Packing
 * Group I performance level", cited 49 CFR 173.185(f)(3), which the packet
 * prints beside it. **v1 is not edited**: v2 supersedes it, and a published
 * successor closes its predecessor on its own effective date
 * (`closedBySuccessors`). Every other item is v1's, carried over with its
 * citation. Unit 20 checks the row against the current eCFR text, including
 * whether cushioning must also be absorbent (D-72 #9).
 */
export const ruleVersions: readonly RuleVersion[] = [
  {
    id: ID.RULE_VERSION.federalDdrPackaging2026v2,
    jurisdictionRuleId: ID.JURISDICTION_RULE.federalDdrPackaging,
    versionLabel: "2026.2",
    effectiveOn: "2026-10-28",
    expiresOn: null,
    citation: "49 CFR 173.185(f)",
    citationUrl: null,
    sourceDocumentRef: "Decision Log D-72 #9",
    payload: {
      families: [
        {
          familyKey: "lithium_ion",
          chemistries: [
            "li_nmc",
            "li_nca",
            "li_lfp",
            "li_lco",
            "li_lmo",
            "li_lto",
            "li_ion_unspecified",
          ],
          markingText: "Damaged/defective lithium ion battery",
        },
        {
          familyKey: "lithium_metal",
          chemistries: ["lithium_metal"],
          markingText: "Damaged/defective lithium metal battery",
        },
      ],
      packaging: [
        {
          item: "Inner packaging",
          requirement:
            "Each battery in its own non-metallic inner packaging that completely encloses it",
          citation: "49 CFR 173.185(f)(1)",
        },
        {
          item: "Cushioning",
          requirement:
            "The inner packaging is surrounded by cushioning that is non-combustible and non-conductive",
          citation: "49 CFR 173.185(f)(2)",
        },
        {
          item: "Per package",
          requirement:
            "One battery per inner packaging, one inner packaging per outer packaging",
          citation: "49 CFR 173.185(f); PHMSA DDR brochure (Mar 2023)",
        },
        {
          item: "Outer packaging",
          requirement: "Outer packaging meeting 49 CFR 173.185(f)(3)",
          citation: "49 CFR 173.185(f)(3)",
        },
      ],
      packingLevel: {
        text: "Packing Group I performance level",
        citation: "49 CFR 173.185(f)(3)",
      },
      marking: {
        citation: "49 CFR 173.185(f)(4)",
        minimumHeight: "12 mm (0.47 in)",
        minimumHeightCitation: "49 CFR 173.185(f)(4)",
      },
      air: {
        requirement: "Forbidden",
        citation: "49 CFR 173.185(f)",
      },
    },
    payloadSchemaKey: "transport.ddr_packaging.v2",
    supersedesRuleVersionId: ID.RULE_VERSION.federalDdrPackaging2026,
    status: "active",
    publishedAt: T.rulesAuthored,
    publishedBy: ID.USER.platformAdmin,
    createdAt: T.rulesAuthored,
    createdBy: ID.USER.platformAdmin,
  },
];
