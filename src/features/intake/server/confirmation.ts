import type {
  CreateAuditEvent,
  CreateClassificationDecision,
  CreateDamageAssessment,
  CreateDateCodeDecode,
  CreateStorageClock,
  CreateStorageEvent,
  IntakeConfirmation,
  RequestContext,
  UpdateBatteryRecord,
} from "@/data/contracts";
import type { ClassificationResult } from "@/domain/classification/waste-stream";
import {
  assessDamage,
  validateFindings,
  type DamageDetermination,
} from "@/domain/condition/damage";
import {
  outstandingCommitItems,
  type OutstandingItem,
} from "@/domain/intake/commit-gate";
import { decodeDateCode } from "@/domain/intake/date-code";
import {
  commitFieldStates,
  hardGatedFieldsConfirmed,
} from "@/domain/intake/draft";
import type { TransportTestMarkingValue } from "@/domain/intake/field-validation";
import {
  evaluationTrace,
  governingRuleVersionId,
} from "@/domain/rules/outcome";
import {
  admitToContainer,
  requiredContainerType,
  startStorageClock,
  type ClockStart,
} from "@/domain/storage/placement";
import type { AssessedCondition } from "@/domain/taxonomy/assessed-condition";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import {
  energyWhFromVoltageAndCapacity,
  parseLabelQuantity,
  toAmpHours,
  toVolts,
  toWattHours,
} from "@/domain/units";
import { RuleResolutionError, ValidationError } from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type {
  Decimal,
  IsoDate,
  IsoTimestamp,
  JsonObject,
  JsonValue,
  Uuid,
} from "@/types/common";
import type {
  DraftFieldState,
  IntakeDraft,
  IntakeSession,
} from "@/types/intake";
import type { Container, StorageClock } from "@/types/storage";
import type { Organization } from "@/types/tenancy";

import {
  COMMIT_REFUSED_BY_GATE,
  commitOutstanding,
  NO_ACCUMULATION_RULE_IN_FORCE,
} from "../copy";
import { systemStepEvent, userEvent, type RequestAttribution } from "./audit";
import {
  previewClassification,
  type IntakeRuleContext,
} from "./classification-preview";

/**
 * The commit payload, recomputed on the server from the draft —
 * `TECHNICAL_SPEC.md` §11.1 step 6; Rules 2.15, 2.21, 2.24, 2.34, 3.6, 4.4,
 * 4.28, 6.1, 6.4.
 *
 * **Nothing the client sent is trusted for a decision.** The draft holds what
 * a person confirmed; everything derived from it — the damage determination,
 * the classification, the container's admission, the clock — is evaluated
 * here by the same pure functions step 3 previewed with, and the result is
 * one whole `IntakeConfirmation` the adapter writes or refuses as a unit.
 *
 * This module is pure apart from its inputs: the session, the record, the
 * draft, the catalog entry, the container and its running clock, and the
 * resolved rule context all arrive as arguments, so the whole of what a commit
 * would write can be asserted against a hand-built draft without a database.
 *
 * **Chemistry has two sources and the mapping can express no third.** The
 * record's `chemistrySource` is copied from the draft, which holds
 * `catalog_match` or `human_entry` or nothing (Rule 2.10); the extraction's
 * `chemistry_code` characters are never written to `chemistry`.
 *
 * **No float reaches a record.** Every nameplate figure goes through
 * `src/domain/units` from the confirmed label text to the column's unit, and
 * a text that does not parse lands as null rather than as a guess.
 */

export interface ConfirmationInput {
  readonly ctx: RequestContext;
  readonly session: IntakeSession;
  readonly record: BatteryRecord;
  readonly draft: IntakeDraft;
  /** The entry the person picked, already loaded. Null on the manual path. */
  readonly catalogEntry: CatalogEntry | null;
  /** The container the draft names, already loaded. Null when unplaced. */
  readonly container: Container | null;
  /** The container's running clock, where it has one (Rule 4.4). */
  readonly runningClock: StorageClock | null;
  readonly rules: IntakeRuleContext;
  readonly organization: Organization;
  /** The `label_extraction` row the date code was read from, for the decode's provenance. */
  readonly dateCodeExtractionId: Uuid | null;
  /** The session's damage photo, when one was captured (T-50 `damage`). */
  readonly damagePhotoId: Uuid | null;
  /** The request day in the site's zone, for the decode's future check (EC-11). */
  readonly today: IsoDate;
  readonly at: IsoTimestamp;
  readonly attribution: RequestAttribution;
}

export type ConfirmationBuild =
  | {
      readonly ok: true;
      readonly confirmation: IntakeConfirmation;
      readonly containerId: Uuid | null;
      readonly classification: ClassificationResult;
      readonly determination: DamageDetermination;
      readonly clockStart: ClockStart | null;
    }
  | {
      readonly ok: false;
      readonly code: "VALIDATION" | "RULE_UNRESOLVED";
      readonly message: string;
      readonly outstanding: readonly OutstandingItem[];
    };

/** T-16 has no placement value; the fixtures record a placement as `repackage`. */
const PLACEMENT_ACTIVITY = "repackage";

/** The `storage_clock.subject_type` and `clock_start_basis` the fixtures carry — no `TAXONOMY.md` system governs either column. */
const CLOCK_SUBJECT_CONTAINER = "container";
const CLOCK_START_FIRST_PLACEMENT = "first_placement";

/** T-59 — the only method a person's inspection on step 3 can be. */
const VISUAL_INSPECTION = "visual_inspection";

function fieldOf(
  draft: IntakeDraft,
  fieldCode: LabelFieldCode,
): DraftFieldState | undefined {
  return draft.fields.find((field) => field.fieldCode === fieldCode);
}

/** The value a person confirmed for a field, or nothing. Pending and rejected values do not reach the record. */
function confirmedValue(
  draft: IntakeDraft,
  fieldCode: LabelFieldCode,
): string | null {
  const field = fieldOf(draft, fieldCode);
  if (field === undefined || field.status !== "confirmed") return null;
  const value = field.value?.trim() ?? "";
  return value === "" ? null : value;
}

function quantity(
  text: string | null,
  convert: (quantity: { value: string; unit: string }) => string | null,
): Decimal | null {
  if (text === null) return null;
  const parsed = parseLabelQuantity(text);
  return parsed === null ? null : convert(parsed);
}

/** The tri-state on the card (§2.1.3) to the record's nullable boolean. */
function transportTestSummary(value: string | null): boolean | null {
  switch (value as TransportTestMarkingValue | null) {
    case "present":
      return true;
    case "not_present":
      return false;
    default:
      return null;
  }
}

function certificationMarks(value: string | null): JsonValue | null {
  if (value === null) return null;
  const tokens = value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "");
  return tokens.length === 0 ? null : tokens;
}

/**
 * The confirmed draft as the record's columns.
 *
 * Exported so the mapping is testable on its own: every confirmed field lands
 * on exactly one column, in the column's unit, and nothing unconfirmed lands
 * anywhere.
 */
export function mapDraftToRecordUpdate(
  draft: IntakeDraft,
  catalogEntry: CatalogEntry | null,
  at: IsoTimestamp,
): UpdateBatteryRecord {
  const model = confirmedValue(draft, "model");
  const chemistryField = fieldOf(draft, "chemistry_code");
  const voltage = quantity(confirmedValue(draft, "voltage"), toVolts);
  const capacity = quantity(confirmedValue(draft, "capacity_ah"), toAmpHours);
  const energyRead = quantity(confirmedValue(draft, "energy_wh"), toWattHours);
  // Energy is derived only where the label did not print it and both inputs
  // are on the record — a computed figure never overrides a printed one.
  const energy =
    energyRead ??
    (voltage !== null && capacity !== null
      ? energyWhFromVoltageAndCapacity(voltage, capacity)
      : null);
  const manufacturedOn: IsoDate | null =
    draft.manufacturedOnEntered ??
    draft.dateCodeDecode?.decodedManufacturedOn ??
    null;

  const chemistryConfirmed =
    chemistryField !== undefined &&
    chemistryField.status === "confirmed" &&
    chemistryField.confirmedBy !== null;

  return {
    manufacturerName: confirmedValue(draft, "manufacturer"),
    // The label prints one string; the record splits it. The entry's own model
    // name is the product's, the confirmed string is the part as printed.
    modelName: catalogEntry?.modelName ?? model,
    partNumber: model,
    chemistry: chemistryConfirmed ? draft.chemistry : null,
    chemistrySource: chemistryConfirmed ? draft.chemistrySource : null,
    chemistryConfirmedBy: chemistryConfirmed
      ? (chemistryField?.confirmedBy ?? null)
      : null,
    chemistryConfirmedAt: chemistryConfirmed
      ? (chemistryField?.confirmedAt ?? null)
      : null,
    nominalVoltageV: voltage,
    ratedCapacityAh: capacity,
    ratedEnergyWh: energy,
    serialNumber: confirmedValue(draft, "serial_number"),
    dateCodeRaw: confirmedValue(draft, "date_code"),
    certificationMarks: certificationMarks(
      confirmedValue(draft, "certification_marks"),
    ),
    hasUn383Summary: transportTestSummary(
      confirmedValue(draft, "transport_test_marking"),
    ),
    // T-04 — the one visual inference this product makes, and it still passed
    // the gate as a proposal (Rule 2.25). Absent, the column keeps its value.
    ...(draft.formFactorProposal === null
      ? {}
      : { cellFormFactor: draft.formFactorProposal }),
    ...(catalogEntry === null
      ? {}
      : {
          applicationClass: catalogEntry.applicationClass,
          batteryMassKg: catalogEntry.massKg,
          brandName: catalogEntry.brandName,
        }),
    ...(draft.stateOfCharge === null
      ? {}
      : {
          stateOfChargeBand: draft.stateOfCharge.band,
          stateOfChargePercentAtIntake: draft.stateOfCharge.percent,
          socSource: draft.stateOfCharge.source,
          socAssessedAt: at,
        }),
    ...(draft.sourceDevice === null
      ? {}
      : {
          sourceDeviceType: draft.sourceDevice.type,
          sourceDeviceIdentifier: draft.sourceDevice.identifier,
          sourceDeviceMake: draft.sourceDevice.make,
          sourceDeviceModel: draft.sourceDevice.model,
          sourceDeviceModelYear: draft.sourceDevice.modelYear,
          provenanceSourceType: draft.sourceDevice.provenanceSourceType,
          provenanceRecordedAt: at,
        }),
    manufacturedOn,
  };
}

function confirmedFields(
  draft: IntakeDraft,
): IntakeConfirmation["confirmedFields"] {
  const fields = draft.fields.flatMap((field) =>
    field.status === "confirmed" &&
    field.confirmedBy !== null &&
    field.confirmedAt !== null
      ? [
          {
            fieldCode: field.fieldCode,
            confirmedBy: field.confirmedBy,
            confirmedAt: field.confirmedAt,
          },
        ]
      : [],
  );
  // Assessed condition is confirmed on step 3 as a condition, not as a text
  // field on the card (Rule 6.2); its attribution lives on the draft's
  // condition and is carried here under its own T-09 code.
  const condition = draft.condition;
  if (
    condition !== null &&
    condition.confirmedBy !== null &&
    condition.confirmedAt !== null
  ) {
    return [
      ...fields.filter((field) => field.fieldCode !== "assessed_condition"),
      {
        fieldCode: "assessed_condition",
        confirmedBy: condition.confirmedBy,
        confirmedAt: condition.confirmedAt,
      },
    ];
  }
  return fields;
}

function toJsonObject(
  snapshot: Readonly<Record<string, JsonValue>>,
): JsonObject {
  return { ...snapshot };
}

/**
 * Build the whole commit, or say what still stands in the way.
 *
 * The order is the order of the rules: the three attributable confirmations
 * and the rest of the checklist (§2.1.4(6)); the damage determination from the
 * confirmed findings (Rule 6.4); the classification under the intake-date
 * version (Rule 3.6); then, only when a container was chosen, its admission
 * (Rules 4.16, 4.28) and the clock it starts or joins (Rule 4.4).
 *
 * A gap in the rule data is returned as `RULE_UNRESOLVED` with the remedy
 * named, never filled with a default (Rule 3.10). A classification that could
 * not run at all commits the record **unplaced** with no decision row — the
 * record exists and says why it is not classified, which is more honest than
 * refusing to log a battery a handler is holding.
 */
export function buildIntakeConfirmation(
  input: ConfirmationInput,
): ConfirmationBuild {
  const { ctx, draft, record, at } = input;
  const fields = commitFieldStates(draft);
  const conditionConfirmed =
    draft.condition !== null && draft.condition.confirmedBy !== null;

  const classification = previewClassification(
    {
      chemistry: draft.chemistry,
      chemistryConfirmed: fields.some(
        (field) =>
          field.fieldCode === "chemistry_code" && field.status === "confirmed",
      ),
      applicationClass:
        input.catalogEntry?.applicationClass ?? record.applicationClass,
      ddrFlags: [],
    },
    input.rules,
    input.organization,
  );

  // An unresolved classification does not block the commit here: the record
  // commits unplaced with no decision row and says why (Rule 3.10, E-13).
  // The card lists the gap; the server does not refuse a battery a handler
  // is holding because reference data is missing.
  const outstanding = outstandingCommitItems({
    fields,
    conditionConfirmed,
    ownsCondition: true,
    containerChosen: draft.containerId !== null,
    requiresContainer: false,
    isOffline: false,
    classificationBlocked: false,
  });
  void classification;

  if (outstanding.length > 0 || !hardGatedFieldsConfirmed(draft)) {
    return {
      ok: false,
      code: "VALIDATION",
      message:
        outstanding.length > 0
          ? commitOutstanding(outstanding)
          : COMMIT_REFUSED_BY_GATE,
      outstanding,
    };
  }

  // The draft's condition is confirmed by the check above; the narrowing is
  // restated so the determination below reads from a non-null value.
  const condition = draft.condition;
  if (condition === null || condition.confirmedBy === null) {
    return {
      ok: false,
      code: "VALIDATION",
      message: COMMIT_REFUSED_BY_GATE,
      outstanding,
    };
  }

  // Rule 6.4 — mechanical, from what a person confirmed. `validateFindings`
  // gates the call; a set it rejects was refused when it was recorded.
  const findings = validateFindings(condition.findingTypes);
  if (!findings.ok) {
    throw new ValidationError({
      userMessage: COMMIT_REFUSED_BY_GATE,
      correlationId: ctx.correlationId,
      context: { reason: findings.reason },
    });
  }
  const determination = assessDamage(condition.findingTypes, {
    isDefective: condition.isDefective,
  });

  // Rule 3.9 — chemistry never decides alone; the DDR flags the assessment
  // produced are read beside it, so the decision is re-run with them.
  const decided = previewClassification(
    {
      chemistry: draft.chemistry,
      chemistryConfirmed: true,
      applicationClass:
        input.catalogEntry?.applicationClass ?? record.applicationClass,
      ddrFlags: determination.ddrFlags,
    },
    input.rules,
    input.organization,
  );

  const classificationRuleVersionId =
    decided.kind === "unresolved"
      ? null
      : governingRuleVersionId(decided.outcome);

  const batteryRecord = mapDraftToRecordUpdate(draft, input.catalogEntry, at);

  const assessedCondition: AssessedCondition = determination.assessedCondition;
  const damageAssessment: CreateDamageAssessment = {
    batteryRecordId: record.id,
    intakePhotoId: input.damagePhotoId,
    assessmentMethod: VISUAL_INSPECTION,
    status: determination.assessmentStatus,
    findingTypes: determination.findingTypes,
    findingDetail: null,
    assessedCondition,
    isAirTransportProhibited: determination.isAirTransportProhibited,
    // The version that governed the classification this assessment fed. The
    // damage split itself is taxonomy membership, not a jurisdiction rule.
    governingRuleVersionId: classificationRuleVersionId,
    evaluationTrace: null,
    modelProvider: null,
    modelIdentifier: null,
    modelConfidence: null,
    instrumentVendor: null,
    instrumentModel: null,
    instrumentSerial: null,
    instrumentReadAt: null,
    instrumentReading: null,
    assessedAt: condition.confirmedAt ?? at,
    assessedBy: condition.confirmedBy,
    confirmedBy: condition.confirmedBy,
    confirmedAt: condition.confirmedAt ?? at,
    clearingPhotoIntakePhotoId: null,
    supersedesDamageAssessmentId: null,
  };

  const conditionOutcome: IntakeConfirmation["conditionOutcome"] = {
    assessedCondition,
    ddrFlags: determination.ddrFlags,
    isAirTransportProhibited: determination.isAirTransportProhibited,
    conditionRuleVersionId: classificationRuleVersionId,
    conditionConfirmedBy: condition.confirmedBy,
    conditionConfirmedAt: condition.confirmedAt ?? at,
  };

  const classificationDecision: CreateClassificationDecision | null =
    decided.kind === "unresolved" || input.rules.jurisdiction === null
      ? null
      : {
          decisionScope: "battery_record",
          batteryRecordId: record.id,
          containerId: null,
          shipmentId: null,
          jurisdictionId: input.rules.jurisdiction.id,
          status: decided.status,
          wasteClassification: decided.outcome.result,
          basisCodes: decided.basisCodes,
          reasoning: decided.outcome.reasoning,
          governingRuleVersionId: governingRuleVersionId(decided.outcome),
          evaluationTrace: evaluationTrace(decided.outcome),
          inputsSnapshot: toJsonObject(decided.outcome.inputsSnapshot),
          decidedAt: at,
          decidedBy: null,
          supersedesClassificationDecisionId: null,
          isOverride: false,
          overrideReason: null,
          overriddenBy: null,
          derivedWasteClassification: null,
          isLessRegulatedThanDerived: false,
          ruleGapReportedAt: null,
          ruleGapClosedByRuleVersionId: null,
        };

  // Rule 2.24 — the decode is deterministic and re-run here from the confirmed
  // code under the matched entry's format, as of the request day (EC-11). A
  // person's date, where one was entered, is already on the record above.
  const rawCode = confirmedValue(draft, "date_code");
  const dateCodeDecode: CreateDateCodeDecode | null =
    rawCode === null
      ? null
      : (() => {
          const decode = decodeDateCode(
            rawCode,
            input.catalogEntry?.dateCodeFormatKey ?? null,
            input.today,
          );
          return {
            batteryRecordId: record.id,
            intakeSessionId: input.session.id,
            sourceLabelExtractionId: input.dateCodeExtractionId,
            rawCode,
            formatKey: decode.formatKey,
            decodedManufacturedOn: decode.decodedManufacturedOn,
            decodedPrecision: decode.decodedPrecision,
            decoderVersion: decode.decoderVersion,
            confidence: decode.confidence,
            decodedByMethod: "deterministic_decoder",
            decodedBy: null,
          };
        })();

  // --- placement ---------------------------------------------------------------

  let storageClock: CreateStorageClock | null = null;
  let joinStorageClockId: Uuid | null = null;
  let storageEvent: CreateStorageEvent | null = null;
  let containerAccumulationStartedAt: IsoTimestamp | null = null;
  let clockStart: ClockStart | null = null;
  let placementRuleVersionId: Uuid | null = null;
  const container = draft.containerId === null ? null : input.container;

  if (draft.containerId !== null && container === null) {
    return {
      ok: false,
      code: "VALIDATION",
      message: commitOutstanding([
        { kind: "choose_container", label: "Choose a container" },
      ]),
      outstanding: [{ kind: "choose_container", label: "Choose a container" }],
    };
  }

  if (container !== null) {
    const required = requiredContainerType(
      decided.kind === "unresolved" ? "undetermined" : decided.outcome.result,
      {
        ddrFlags: determination.ddrFlags,
        assessmentStatus: determination.assessmentStatus,
      },
    );
    const admission = admitToContainer(container, required);
    if (!admission.ok) {
      return {
        ok: false,
        code: "VALIDATION",
        message: admission.message,
        outstanding: [],
      };
    }

    const existing = input.runningClock;
    if (input.rules.accumulation.kind !== "resolved") {
      if (existing === null) {
        // Rule 4.5 — no clock starts from a guessed period.
        throw new RuleResolutionError({
          userMessage: NO_ACCUMULATION_RULE_IN_FORCE,
          correlationId: ctx.correlationId,
          context: { lookup: input.rules.accumulation },
        });
      }
      // Rule 4.4 — the record joins the container's running clock; its
      // stamped figures are the authority and no rule is needed to join.
      joinStorageClockId = existing.id;
      placementRuleVersionId = existing.governingRuleVersionId;
    } else {
      const outcome = startStorageClock(
        {
          placedAt: at,
          timeZone: container.siteTimeZone,
          existingClock:
            existing === null ? null : { clockStartAt: existing.clockStartAt },
        },
        input.rules.accumulation.rule,
      );
      clockStart = outcome.result;
      if (outcome.result.joinsExistingClock && existing !== null) {
        joinStorageClockId = existing.id;
        placementRuleVersionId = existing.governingRuleVersionId;
      } else {
        placementRuleVersionId = governingRuleVersionId(outcome);
        storageClock = {
          subjectType: CLOCK_SUBJECT_CONTAINER,
          batteryRecordId: null,
          containerId: container.id,
          clockStartAt: outcome.result.clockStartAt,
          clockStartBasis: CLOCK_START_FIRST_PLACEMENT,
          timeZone: outcome.result.timeZone,
          maxDurationDays: outcome.result.maxDurationDays,
          governingRuleVersionId: placementRuleVersionId,
          evaluationTrace: evaluationTrace(outcome),
          dueAt: outcome.result.dueAt,
          alertSchedule: outcome.result.alertSchedule,
          alertBand: "none",
          nextAlertAt: outcome.result.nextAlertAt,
          status: "running",
        };
        containerAccumulationStartedAt =
          container.accumulationStartedAt === null
            ? outcome.result.clockStartAt
            : null;
      }
    }

    storageEvent = {
      activityType: PLACEMENT_ACTIVITY,
      storageClockId: null,
      containerId: null,
      batteryRecordId: null,
      lotId: container.lotId,
      occurredAt: at,
      recordedAt: at,
      recordedBy: ctx.userId,
      payload: { placement: joinStorageClockId === null ? "first" : "joined" },
      governingRuleVersionId: placementRuleVersionId,
    };
  }

  // --- the audit rows ----------------------------------------------------------
  // The appended rows are minted inside the adapter's transaction, so their
  // ids do not exist yet; every row names the battery record as its entity and
  // carries the table it describes, which is what `/audit` groups by.

  const auditEvents: CreateAuditEvent[] = [
    userEvent(ctx, {
      eventType: "battery_record.confirmed",
      entityTable: "battery_record",
      entityId: record.id,
      at,
      beforeState: { status: record.status },
      afterState: {
        chemistry: batteryRecord.chemistry ?? null,
        chemistrySource: batteryRecord.chemistrySource ?? null,
        catalogEntryId: draft.selectedCatalogEntryId,
        confirmedFields: confirmedFields(draft).map((field) => field.fieldCode),
      },
      changedFields: Object.keys(batteryRecord),
      attribution: input.attribution,
    }),
    userEvent(ctx, {
      eventType: "damage_assessment.recorded",
      entityTable: "damage_assessment",
      entityId: record.id,
      at,
      afterState: {
        assessedCondition,
        findingTypes: [...determination.findingTypes],
        isDefective: condition.isDefective,
        status: determination.assessmentStatus,
      },
      governingRuleVersionId: classificationRuleVersionId,
      attribution: input.attribution,
    }),
  ];

  if (classificationDecision !== null && decided.kind !== "unresolved") {
    auditEvents.push(
      systemStepEvent(ctx, {
        step: "classify",
        provider:
          input.rules.wasteStream.kind === "resolved"
            ? input.rules.wasteStream.rule.ruleKey
            : "unresolved",
        eventType: "classification_decision.recorded",
        entityTable: "classification_decision",
        entityId: record.id,
        at,
        afterState: {
          status: classificationDecision.status,
          wasteClassification: classificationDecision.wasteClassification,
          basisCodes: [...classificationDecision.basisCodes],
          jurisdictionId: classificationDecision.jurisdictionId,
        },
        governingRuleVersionId: classificationDecision.governingRuleVersionId,
        ruleVersionsApplied: evaluationTrace(decided.outcome),
      }),
    );
  }

  if (determination.ddrFlags.length > 0) {
    auditEvents.push(
      systemStepEvent(ctx, {
        step: "assess",
        provider: "damage_assessment",
        eventType: "battery_record.ddr_flag_set",
        entityTable: "battery_record",
        entityId: record.id,
        at,
        beforeState: {
          ddrFlags: [...record.ddrFlags],
          isAirTransportProhibited: record.isAirTransportProhibited,
        },
        afterState: {
          ddrFlags: [...determination.ddrFlags],
          isAirTransportProhibited: determination.isAirTransportProhibited,
        },
        changedFields: ["ddrFlags", "isAirTransportProhibited"],
        governingRuleVersionId: classificationRuleVersionId,
      }),
    );
  }

  if (storageClock !== null && container !== null) {
    auditEvents.push(
      systemStepEvent(ctx, {
        step: "clock",
        provider:
          input.rules.accumulation.kind === "resolved"
            ? input.rules.accumulation.rule.ruleKey
            : "unresolved",
        eventType: "storage_clock.status_changed",
        entityTable: "storage_clock",
        entityId: container.id,
        at,
        beforeState: { status: "not_started" },
        afterState: {
          status: storageClock.status,
          clockStartAt: storageClock.clockStartAt,
          dueAt: storageClock.dueAt,
          containerId: container.id,
        },
        governingRuleVersionId: storageClock.governingRuleVersionId,
        ruleVersionsApplied: storageClock.evaluationTrace,
      }),
    );
  }

  if (storageEvent !== null && container !== null) {
    auditEvents.push(
      systemStepEvent(ctx, {
        step: "place",
        provider:
          input.rules.accumulation.kind === "resolved"
            ? input.rules.accumulation.rule.ruleKey
            : "unresolved",
        eventType: "storage_event.recorded",
        entityTable: "storage_event",
        entityId: record.id,
        at,
        afterState: {
          activityType: storageEvent.activityType,
          containerId: container.id,
          placement: joinStorageClockId === null ? "first" : "joined",
          joinedStorageClockId: joinStorageClockId,
        },
        governingRuleVersionId: placementRuleVersionId,
      }),
    );
  }

  const confirmation: IntakeConfirmation = {
    intakeSessionId: input.session.id,
    batteryRecordId: record.id,
    batteryRecord: {
      ...batteryRecord,
      // Rule 2.24 — a person's date outranks the decode, and the decode the
      // record carries is the one being appended beside it, never a stale one.
      manufacturedOn:
        draft.manufacturedOnEntered ??
        dateCodeDecode?.decodedManufacturedOn ??
        null,
    },
    confirmedFields: confirmedFields(draft),
    catalogEntryId: draft.selectedCatalogEntryId,
    containerId: container?.id ?? null,
    dateCodeDecode,
    damageAssessment,
    conditionOutcome,
    classificationDecision,
    storageClock,
    joinStorageClockId,
    storageEvent,
    containerAccumulationStartedAt,
    auditEvents,
  };

  return {
    ok: true,
    confirmation,
    containerId: container?.id ?? null,
    classification: decided,
    determination,
    clockStart,
  };
}
