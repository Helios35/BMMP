import { data } from "@/data";
import type { CreateDamageAssessment, RequestContext } from "@/data/contracts";
import { assessDamage, validateFindings } from "@/domain/condition/damage";
import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import { ValidationError } from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";
import type { IsoTimestamp, JsonObject, Uuid } from "@/types/common";
import type { DamageAssessment } from "@/types/condition";
import { systemEvent, userEvent, writeAuditEvent } from "./audit";
import {
  assertRecordEditable,
  reclassifyRecord,
  resolveClassificationRule,
  type ReclassificationOutcome,
} from "./reclassify";

/**
 * **Edit assessed condition** — Rules 6.2–6.6, 6.11, 6.12, 6.20; T-46, T-49.
 *
 * A new `damage_assessment` is appended and the one it replaces is marked
 * superseded; nothing on the old row moves. Both stay visible side by side on
 * the History tab, permanently (Rule 6.12) — a reversed damage finding is the
 * first thing an auditor looks for.
 *
 * **The only path that clears a damaged finding is this one, with a stated
 * reason and a supporting photograph** (Rule 6.11). The requirement is
 * enforced here, from the assessment currently on the record as `src/data`
 * reports it, and never from what the client says the prior state was.
 *
 * **The two legal booleans move through one door.** `batteryRecords.update`
 * strips `ddrFlags` and `isAirTransportProhibited`; only
 * `applyConditionOutcome` writes them, and it takes the determination the
 * domain produced from the confirmed findings together with the person who
 * confirmed them (Rules 6.4, 6.5, 6.6, 6.8).
 *
 * ## Why the reason is required whenever a prior assessment exists
 *
 * Rule 6.11 requires it for a clearing. The dialog requires it for any
 * superseding assessment, because an assessment that replaces another with no
 * stated reason is a change nobody can later explain — and the server holds
 * the same rule so the dialog is a courtesy rather than the enforcement.
 */

/** T-59 — the method a person's visual assessment records. */
const VISUAL_INSPECTION = "visual_inspection";

/** Bounded read — one record carries a handful of assessments over its life. */
const ASSESSMENTS_PER_RECORD_LIMIT = 50;

export interface RecordDamageAssessmentRequest {
  readonly recordId: Uuid;
  readonly findingTypes: readonly DamageFindingType[];
  readonly isDefective: boolean;
  readonly reason: string | null;
  readonly clearingPhotoIntakePhotoId: Uuid | null;
}

export interface RecordDamageAssessmentOutcome {
  readonly assessment: DamageAssessment;
  readonly supersededAssessmentId: Uuid | null;
  readonly record: BatteryRecord;
  readonly flagsChanged: boolean;
  readonly reclassification: ReclassificationOutcome;
}

const FINDINGS_MESSAGES = {
  empty: "Choose at least one finding. None observed is a finding.",
  none_observed_not_exclusive:
    "None observed cannot be combined with another finding.",
  unknown_finding: "One of the findings is not a recognised finding type.",
} as const;

function sameFlags(a: readonly DdrFlag[], b: readonly DdrFlag[]): boolean {
  return a.length === b.length && a.every((flag) => b.includes(flag));
}

function assessmentSnapshot(row: DamageAssessment): JsonObject {
  return {
    damageAssessmentId: row.id,
    status: row.status,
    assessedCondition: row.assessedCondition,
    findingTypes: [...row.findingTypes],
    isAirTransportProhibited: row.isAirTransportProhibited,
  };
}

/** The assessment currently governing the record, newest first where the data holds more than one. */
export async function readCurrentAssessment(
  ctx: RequestContext,
  recordId: Uuid,
): Promise<DamageAssessment | null> {
  const page = await data.damageAssessments.list(ctx, {
    batteryRecordId: recordId,
    isCurrent: true,
    limit: ASSESSMENTS_PER_RECORD_LIMIT,
  });
  return (
    [...page.items].sort((a, b) =>
      b.assessedAt.localeCompare(a.assessedAt),
    )[0] ?? null
  );
}

export async function recordDamageAssessmentFor(
  ctx: RequestContext,
  input: RecordDamageAssessmentRequest,
  at: IsoTimestamp,
): Promise<RecordDamageAssessmentOutcome> {
  const record = await data.batteryRecords.get(ctx, input.recordId);
  if (record === null) {
    // Absent and another tenant's are one answer (Rule 1.2).
    throw new ValidationError({
      userMessage: "This record could not be found.",
      correlationId: ctx.correlationId,
    });
  }
  assertRecordEditable(ctx, record);

  // Rules 6.3, 6.4 — the boundary refuses an impossible set before the domain
  // sees it; `assessDamage` would throw rather than guess.
  const findings = validateFindings(input.findingTypes);
  if (!findings.ok) {
    throw new ValidationError({
      userMessage: FINDINGS_MESSAGES[findings.reason],
      field: "findingTypes",
      correlationId: ctx.correlationId,
    });
  }
  const determination = assessDamage(input.findingTypes, {
    isDefective: input.isDefective,
  });

  const current = await readCurrentAssessment(ctx, record.id);

  if (current !== null && input.reason === null) {
    throw new ValidationError({
      userMessage:
        "State why the assessed condition is changing. The reason is recorded beside both assessments.",
      field: "reason",
      correlationId: ctx.correlationId,
    });
  }

  const isClearing =
    current !== null &&
    current.status === "assessed_damaged" &&
    determination.assessmentStatus !== "assessed_damaged";

  if (isClearing && input.clearingPhotoIntakePhotoId === null) {
    // Rule 6.11 — a damaged finding clears only with at least one supporting
    // photograph. No photo, no clearing; the flag stands.
    throw new ValidationError({
      userMessage:
        "Clearing a damaged finding needs a supporting photo. The damaged flag stays until one is attached.",
      field: "clearingPhotoIntakePhotoId",
      correlationId: ctx.correlationId,
    });
  }

  let clearingPhotoId: Uuid | null = null;
  if (isClearing && input.clearingPhotoIntakePhotoId !== null) {
    const photo = await data.intakePhotos.get(
      ctx,
      input.clearingPhotoIntakePhotoId,
    );
    if (photo === null) {
      throw new ValidationError({
        userMessage:
          "The supporting photo could not be found. Attach it again before clearing the finding.",
        field: "clearingPhotoIntakePhotoId",
        correlationId: ctx.correlationId,
      });
    }
    clearingPhotoId = photo.id;
  }

  // The rule version that will govern the re-classification is the one the
  // record's condition is recorded under (`condition_rule_version_id`), so it
  // is resolved before the assessment is appended and reused after.
  const rule = await resolveClassificationRule(ctx, record, at);

  const row: CreateDamageAssessment = {
    batteryRecordId: record.id,
    // The photo this assessment rests on. For a clearing it is the clearing
    // evidence itself, so the History tab's evidence line shows it.
    intakePhotoId: clearingPhotoId,
    assessmentMethod: VISUAL_INSPECTION,
    status: determination.assessmentStatus,
    findingTypes: determination.findingTypes,
    findingDetail: input.reason === null ? null : { reason: input.reason },
    assessedCondition: determination.assessedCondition,
    isAirTransportProhibited: determination.isAirTransportProhibited,
    governingRuleVersionId: rule.ruleVersionId,
    // Rules 6.2–6.6 are mechanical set membership, not a jurisdiction rule
    // evaluation, so there is no applied-version trace to record here.
    evaluationTrace: null,
    modelProvider: null,
    modelIdentifier: null,
    modelConfidence: null,
    instrumentVendor: null,
    instrumentModel: null,
    instrumentSerial: null,
    instrumentReadAt: null,
    instrumentReading: null,
    assessedAt: at,
    assessedBy: ctx.userId,
    confirmedBy: ctx.userId,
    confirmedAt: at,
    clearingPhotoIntakePhotoId: clearingPhotoId,
    supersedesDamageAssessmentId: current?.id ?? null,
  };

  const assessment = await data.damageAssessments.append(ctx, row);

  if (current !== null) {
    await data.damageAssessments.markSuperseded(ctx, current.id, assessment.id);
  }

  const flagsBefore = record.ddrFlags;
  const updated = await data.batteryRecords.applyConditionOutcome(
    ctx,
    record.id,
    {
      assessedCondition: determination.assessedCondition,
      ddrFlags: determination.ddrFlags,
      isAirTransportProhibited: determination.isAirTransportProhibited,
      conditionRuleVersionId: rule.ruleVersionId,
      conditionConfirmedBy: ctx.userId,
      conditionConfirmedAt: at,
    },
  );

  await writeAuditEvent(
    ctx,
    userEvent(ctx, {
      eventType: "damage_assessment.recorded",
      entityTable: "damage_assessment",
      entityId: assessment.id,
      occurredAt: at,
      beforeState: current === null ? null : assessmentSnapshot(current),
      afterState: assessmentSnapshot(assessment),
      changedFields: ["assessedCondition", "findingTypes", "status"],
      governingRuleVersionId: rule.ruleVersionId,
      reason: input.reason,
    }),
  );

  const flagsChanged =
    !sameFlags(flagsBefore, updated.ddrFlags) ||
    record.isAirTransportProhibited !== updated.isAirTransportProhibited;

  if (flagsChanged) {
    // Rule evaluation set the flags from the confirmed finding (Rules 6.4,
    // 6.5); the person is on the assessment row above, not here.
    await writeAuditEvent(
      ctx,
      systemEvent(ctx, "condition_evaluation", {
        eventType: "battery_record.ddr_flag_set",
        entityTable: "battery_record",
        entityId: record.id,
        occurredAt: at,
        beforeState: {
          ddrFlags: [...flagsBefore],
          isAirTransportProhibited: record.isAirTransportProhibited,
        },
        afterState: {
          ddrFlags: [...updated.ddrFlags],
          isAirTransportProhibited: updated.isAirTransportProhibited,
          damageAssessmentId: assessment.id,
        },
        changedFields: ["ddrFlags", "isAirTransportProhibited"],
        governingRuleVersionId: updated.conditionRuleVersionId,
        reason: input.reason,
      }),
    );
  }

  // Rules 3.15, 6.20 — a condition change re-runs the classification check.
  const reclassification = await reclassifyRecord(ctx, {
    record: updated,
    rule,
    at,
    trigger: "condition_change",
  });

  return {
    assessment,
    supersededAssessmentId: current?.id ?? null,
    record: reclassification.record,
    flagsChanged,
    reclassification,
  };
}
