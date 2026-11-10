import type { BatteryRecord } from "@/types/battery-record";
import type { DamageAssessment } from "@/types/condition";
import type { IntakePhoto, IntakeSession } from "@/types/intake";
import type { CatalogReferencePhoto, PhotoCheck } from "@/types/photo-check";

import {
  EMPTY_PASSPORT,
  NO_ASSESSMENT_INSTRUMENT,
  NO_PERFORMANCE,
  NO_SOURCE_DEVICE,
} from "./b2-09";
import * as ID from "./ids";

/**
 * The rows `b2-10-photo-checks` adds — **added, never edited** (STATE §7.1).
 * Each base array in `./index.ts` gains these at its end and no existing row
 * changes. Four scenarios, one per fixture item in the brief:
 *
 * | Scenario | Rows |
 * | --- | --- |
 * | Reference photos (Rule 2.36) | The vehicle traction entry's reference; the scooter and laptop entries have none |
 * | The copy target (Rule 2.37) | BR-0015, unplaced; its label photo carries the fingerprint `label-resaved.png` is close to |
 * | A model-assisted assessment (Rule 6.25) | BR-0016, unplaced; dent and surface marking proposed on its damage photo, surface marking accepted, dent rejected |
 * | A failed photo check (Rules 2.36, 6.26) | BR-0015's label look check — the service did not answer; recorded, never flagged |
 *
 * **No row carries a number about a photo** (D-75 #5). The fingerprint is the
 * vision fixture's (`FIXTURE_COPY_TARGET_FINGERPRINT`); a unit test holds the
 * two together.
 */

const T = {
  referenceSet: "2026-11-02T09:00:00.000Z",
  copyTargetIntake: "2026-11-03T15:00:00.000Z",
  modelAssistedIntake: "2026-11-04T10:30:00.000Z",
} as const;

/** `src/lib/vision/providers/fixture.ts` `FIXTURE_COPY_TARGET_FINGERPRINT`. */
const COPY_TARGET_FINGERPRINT = "fixture64:9e3c5a1f7b2d4c80";

const PHOTO_CHECK_PROVIDER = {
  provider: "fixture",
  modelIdentifier: "fixture-photo-checker",
  promptVersion: "2026-11-10",
} as const;

const LOOK_ALIKE_CONFIGURATION_VERSION = "look-alike-2026-11";

// --- the reference photo ---------------------------------------------------------------------

/**
 * An 8×6 synthetic PNG — a label-coloured rectangle on the clean label's
 * ground. A platform image, never a tenant's photo (D-75 #1); the fixture
 * provider never looks at the pixels, so its size is beside the point.
 */
const REFERENCE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAGklEQVR4nGPQt/PDihgISHz5+AKOiJMgwQ4AHN8zoUAuuNAAAAAASUVORK5CYII=";

const REFERENCE_PATH = `platform/catalog/${ID.CATALOG.vehicleTractionNmc}/${ID.REFERENCE_PHOTO.vehicleTractionNmc}.png`;

export const catalogReferencePhotos: readonly CatalogReferencePhoto[] = [
  {
    id: ID.REFERENCE_PHOTO.vehicleTractionNmc,
    catalogEntryId: ID.CATALOG.vehicleTractionNmc,
    storageObjectPath: REFERENCE_PATH,
    contentHash:
      "b210c0de5eed0000000000000000000000000000000000000000000000000001",
    byteSize: 83,
    mimeType: "image/png",
    widthPx: 8,
    heightPx: 6,
    fileName: "northvale-nv-tp400-96s-reference.png",
    isExifStripped: true,
    setBy: ID.USER.platformAdmin,
    setAt: T.referenceSet,
    supersededAt: null,
    supersedesCatalogReferencePhotoId: null,
    createdAt: T.referenceSet,
  },
];

/** The seeded objects, keyed `bucket:path` as the mock object store keys them. */
export function seededObjects(): readonly (readonly [
  string,
  { readonly bytes: Uint8Array; readonly contentType: string },
])[] {
  return [
    [
      `catalog-reference-photos:${REFERENCE_PATH}`,
      {
        bytes: Uint8Array.from(atob(REFERENCE_PNG_BASE64), (char) =>
          char.charCodeAt(0),
        ),
        contentType: "image/png",
      },
    ],
  ];
}

// --- the records -----------------------------------------------------------------------------

function northvalePack(input: {
  readonly id: string;
  readonly recordNumber: string;
  readonly intakeSessionId: string;
  readonly serialNumber: string;
  readonly assessedCondition: BatteryRecord["assessedCondition"];
  readonly at: string;
}): BatteryRecord {
  return {
    ...EMPTY_PASSPORT,
    ...NO_PERFORMANCE,
    ...NO_SOURCE_DEVICE,
    id: input.id,
    organizationId: ID.ORG.cascade,
    recordNumber: input.recordNumber,
    batteryPassportIdentifier: null,
    // Unplaced, like BR-0013: nothing here depends on a container, and a seeded
    // container's contents are other specs' to count.
    status: "confirmed",
    intakeSessionId: input.intakeSessionId,
    catalogEntryId: ID.CATALOG.vehicleTractionNmc,
    containerId: null,
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
    assessedCondition: input.assessedCondition,
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
    createdAt: input.at,
    updatedAt: input.at,
    createdBy: ID.USER.danaHandler,
    updatedBy: ID.USER.danaHandler,
  };
}

export const batteryRecords: readonly BatteryRecord[] = [
  northvalePack({
    id: ID.BATTERY.photoCopyTarget,
    recordNumber: "BR-0015",
    intakeSessionId: ID.INTAKE_SESSION.copyTargetCompleted,
    serialNumber: "NVTP4000000110315",
    assessedCondition: "sound",
    at: T.copyTargetIntake,
  }),
  northvalePack({
    id: ID.BATTERY.modelAssisted,
    recordNumber: "BR-0016",
    intakeSessionId: ID.INTAKE_SESSION.modelAssistedCompleted,
    serialNumber: "NVTP4000000110416",
    assessedCondition: "cosmetic_wear_only",
    at: T.modelAssistedIntake,
  }),
];

function completedSession(input: {
  readonly id: string;
  readonly batteryRecordId: string;
  readonly correlationId: string;
  readonly at: string;
}): IntakeSession {
  return {
    id: input.id,
    organizationId: ID.ORG.cascade,
    batteryRecordId: input.batteryRecordId,
    status: "completed",
    currentStep: "complete",
    isReviewRequired: false,
    reviewReasonCodes: null,
    gateThresholdsApplied: {
      minFieldConfidence: 0.9,
      minMatchScore: 0.82,
      minMatchSeparation: 0.12,
    },
    reviewedBy: ID.USER.danaHandler,
    reviewedAt: input.at,
    reviewOutcome: "confirmed",
    correlationId: input.correlationId,
    deviceContext: { app: "bmmp-web", version: "0.1.0", device: "handheld" },
    startedBy: ID.USER.danaHandler,
    startedAt: input.at,
    completedAt: input.at,
    abandonedAt: null,
    createdAt: input.at,
    updatedAt: input.at,
  };
}

export const intakeSessions: readonly IntakeSession[] = [
  completedSession({
    id: ID.INTAKE_SESSION.copyTargetCompleted,
    batteryRecordId: ID.BATTERY.photoCopyTarget,
    correlationId: "corr-copy-target-0015",
    at: T.copyTargetIntake,
  }),
  completedSession({
    id: ID.INTAKE_SESSION.modelAssistedCompleted,
    batteryRecordId: ID.BATTERY.modelAssisted,
    correlationId: "corr-model-assisted-0016",
    at: T.modelAssistedIntake,
  }),
];

function photo(input: {
  readonly id: string;
  readonly intakeSessionId: string;
  readonly parentIntakePhotoId: string | null;
  readonly photoType: IntakePhoto["photoType"];
  readonly contentHash: string;
  readonly lookFingerprint: string | null;
  readonly at: string;
}): IntakePhoto {
  const isCrop = input.parentIntakePhotoId !== null;
  return {
    id: input.id,
    organizationId: ID.ORG.cascade,
    intakeSessionId: input.intakeSessionId,
    parentIntakePhotoId: input.parentIntakePhotoId,
    photoType: input.photoType,
    storageObjectPath: `org/${ID.ORG.cascade}/${input.intakeSessionId}/${input.id}.png`,
    contentHash: input.contentHash,
    byteSize: isCrop ? 1_204 : 2_311,
    mimeType: "image/png",
    widthPx: isCrop ? 254 : 640,
    heightPx: isCrop ? 120 : 480,
    cropGeometry: isCrop
      ? {
          x: 189,
          y: 160,
          width: 254,
          height: 120,
          sourceWidth: 640,
          sourceHeight: 480,
        }
      : null,
    cropMethod: isCrop ? "auto_detected" : null,
    capturedAt: input.at,
    dataUseEligibility: "training_eligible",
    isExifStripped: true,
    takenBy: ID.USER.danaHandler,
    createdAt: input.at,
    lookFingerprint: input.lookFingerprint,
  };
}

export const intakePhotos: readonly IntakePhoto[] = [
  photo({
    id: ID.PHOTO.copyTargetOriginal,
    intakeSessionId: ID.INTAKE_SESSION.copyTargetCompleted,
    parentIntakePhotoId: null,
    photoType: "label",
    contentHash:
      "b210a1c0e0000000000000000000000000000000000000000000000000000015",
    lookFingerprint: COPY_TARGET_FINGERPRINT,
    at: T.copyTargetIntake,
  }),
  photo({
    id: ID.PHOTO.copyTargetCrop,
    intakeSessionId: ID.INTAKE_SESSION.copyTargetCompleted,
    parentIntakePhotoId: ID.PHOTO.copyTargetOriginal,
    photoType: "label_crop",
    contentHash:
      "b210a1c0e0000000000000000000000000000000000000000000000000000015",
    lookFingerprint: null,
    at: T.copyTargetIntake,
  }),
  photo({
    id: ID.PHOTO.modelAssistedOriginal,
    intakeSessionId: ID.INTAKE_SESSION.modelAssistedCompleted,
    parentIntakePhotoId: null,
    photoType: "label",
    contentHash:
      "b210a55e5ed00000000000000000000000000000000000000000000000000016",
    lookFingerprint: "fixture64:41d07e22c9a65b13",
    at: T.modelAssistedIntake,
  }),
  photo({
    id: ID.PHOTO.modelAssistedCrop,
    intakeSessionId: ID.INTAKE_SESSION.modelAssistedCompleted,
    parentIntakePhotoId: ID.PHOTO.modelAssistedOriginal,
    photoType: "label_crop",
    contentHash:
      "b210a55e5ed00000000000000000000000000000000000000000000000000016",
    lookFingerprint: null,
    at: T.modelAssistedIntake,
  }),
  photo({
    id: ID.PHOTO.modelAssistedDamage,
    intakeSessionId: ID.INTAKE_SESSION.modelAssistedCompleted,
    parentIntakePhotoId: null,
    photoType: "damage",
    contentHash:
      "b210da3a6e000000000000000000000000000000000000000000000000000016",
    lookFingerprint: "fixture64:c4f19a3e0d7b2265",
    at: T.modelAssistedIntake,
  }),
];

// --- the assessments ------------------------------------------------------------------------

export const damageAssessments: readonly DamageAssessment[] = [
  {
    ...NO_ASSESSMENT_INSTRUMENT,
    id: ID.DAMAGE.photoCopyTarget,
    organizationId: ID.ORG.cascade,
    batteryRecordId: ID.BATTERY.photoCopyTarget,
    intakePhotoId: null,
    assessmentMethod: "visual_inspection",
    status: "assessed_sound",
    findingTypes: ["none_observed"],
    findingDetail: null,
    assessedCondition: "sound",
    isAirTransportProhibited: false,
    governingRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    assessedAt: T.copyTargetIntake,
    assessedBy: ID.USER.danaHandler,
    confirmedBy: ID.USER.danaHandler,
    confirmedAt: T.copyTargetIntake,
    createdAt: T.copyTargetIntake,
    proposalDecisions: [],
  },
  {
    ...NO_ASSESSMENT_INSTRUMENT,
    // How the proposal arrived, never who decided: a person did (Rule 6.6).
    modelProvider: PHOTO_CHECK_PROVIDER.provider,
    modelIdentifier: PHOTO_CHECK_PROVIDER.modelIdentifier,
    id: ID.DAMAGE.modelAssisted,
    organizationId: ID.ORG.cascade,
    batteryRecordId: ID.BATTERY.modelAssisted,
    intakePhotoId: ID.PHOTO.modelAssistedDamage,
    assessmentMethod: "model_assisted_visual",
    status: "assessed_sound",
    // Surface marking accepted; the dent was the model's and was rejected.
    findingTypes: ["surface_marking"],
    findingDetail: null,
    assessedCondition: "cosmetic_wear_only",
    isAirTransportProhibited: false,
    governingRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    assessedAt: T.modelAssistedIntake,
    assessedBy: ID.USER.danaHandler,
    confirmedBy: ID.USER.danaHandler,
    confirmedAt: T.modelAssistedIntake,
    createdAt: T.modelAssistedIntake,
    proposalDecisions: [
      {
        photoCheckId: ID.PHOTO_CHECK.modelAssistedProposal,
        intakePhotoId: ID.PHOTO.modelAssistedDamage,
        findingType: "dent",
        decision: "rejected",
        decidedBy: ID.USER.danaHandler,
        decidedAt: T.modelAssistedIntake,
      },
      {
        photoCheckId: ID.PHOTO_CHECK.modelAssistedProposal,
        intakePhotoId: ID.PHOTO.modelAssistedDamage,
        findingType: "surface_marking",
        decision: "accepted",
        decidedBy: ID.USER.danaHandler,
        decidedAt: T.modelAssistedIntake,
      },
    ],
  },
];

// --- the check runs ---------------------------------------------------------------------------

function run(
  input: Pick<
    PhotoCheck,
    | "id"
    | "intakePhotoId"
    | "intakeSessionId"
    | "batteryRecordId"
    | "checkKind"
    | "outcome"
    | "ranAt"
  > &
    Partial<PhotoCheck>,
): PhotoCheck {
  return {
    organizationId: ID.ORG.cascade,
    proposedFindings: [],
    catalogEntryId: null,
    catalogReferencePhotoId: null,
    matchedPhotoIds: [],
    matchedBatteryRecordIds: [],
    errorCode: null,
    ...PHOTO_CHECK_PROVIDER,
    costUsd: null,
    latencyMs: null,
    configurationVersion: null,
    ranBy: ID.USER.danaHandler,
    createdAt: input.ranAt,
    ...input,
  };
}

export const photoChecks: readonly PhotoCheck[] = [
  run({
    id: ID.PHOTO_CHECK.modelAssistedProposal,
    intakePhotoId: ID.PHOTO.modelAssistedDamage,
    intakeSessionId: ID.INTAKE_SESSION.modelAssistedCompleted,
    batteryRecordId: ID.BATTERY.modelAssisted,
    checkKind: "damage_proposal",
    outcome: "proposed",
    proposedFindings: ["dent", "surface_marking"],
    ranAt: T.modelAssistedIntake,
  }),
  run({
    id: ID.PHOTO_CHECK.copyTargetLabelLookFailed,
    intakePhotoId: ID.PHOTO.copyTargetCrop,
    intakeSessionId: ID.INTAKE_SESSION.copyTargetCompleted,
    batteryRecordId: ID.BATTERY.photoCopyTarget,
    checkKind: "label_look",
    outcome: "failed",
    catalogEntryId: ID.CATALOG.vehicleTractionNmc,
    catalogReferencePhotoId: ID.REFERENCE_PHOTO.vehicleTractionNmc,
    errorCode: "unavailable",
    // A call that did not complete reports no model or prompt.
    modelIdentifier: null,
    promptVersion: null,
    ranAt: T.copyTargetIntake,
  }),
  run({
    id: ID.PHOTO_CHECK.copyTargetCopyCheck,
    intakePhotoId: ID.PHOTO.copyTargetOriginal,
    intakeSessionId: ID.INTAKE_SESSION.copyTargetCompleted,
    batteryRecordId: ID.BATTERY.photoCopyTarget,
    checkKind: "look_alike",
    outcome: "no_copy_found",
    modelIdentifier: null,
    promptVersion: null,
    configurationVersion: LOOK_ALIKE_CONFIGURATION_VERSION,
    ranAt: T.copyTargetIntake,
  }),
];
