import { beforeEach, describe, expect, it } from "vitest";

import { data } from "@/data";
import type { RequestContext, UpdateBatteryRecord } from "@/data/contracts";
import { resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { recordDamageAssessmentFor } from "@/features/battery-record/server/condition";
import {
  applyCatalogRematch,
  findCatalogCandidatesForRecord,
} from "@/features/battery-record/server/rematch";
import {
  assertRecordEditable,
  reclassifyRecord,
  resolveClassificationRule,
} from "@/features/battery-record/server/reclassify";
import { voidBatteryRecordFor } from "@/features/battery-record/server/void";
import { ValidationError } from "@/lib/errors";

/**
 * The write paths on `/batteries/[id]`, against the mock through the contract.
 *
 * Each helper takes a hand-built `RequestContext` and an instant, exactly as
 * the Server Action hands them over, so what is proven here is the work and
 * not the wrapper. The rules under test, each with a refusal and an
 * acceptance:
 *
 * - Rule 6.11 — a damaged finding clears only with a reason and a photo;
 * - Rule 6.12 — both assessments stay, the old one superseded, never edited;
 * - Rules 6.4, 6.5, 6.8 — the flags move through `applyConditionOutcome` and
 *   never through `update`;
 * - Rules 3.14, 3.15 — a re-classification appends and supersedes;
 * - Rule 3.25 — a void keeps the row and its decisions.
 *
 * P1 cannot read the audit log (Rule 12.8), so the trail is read as P2.
 */

const AT = "2026-09-02T17:00:00.000Z";
const PAGE = { limit: 50 } as const;

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-corr-record-writes",
    ...overrides,
  };
}

const HANDLER = ctx();
const MANAGER = ctx({
  userId: ID.USER.martaManager,
  role: "facility_manager",
});

async function auditTrail(entityTable: string, entityId: string) {
  const page = await data.auditEvents.list(MANAGER, {
    entityTable,
    entityId,
    ...PAGE,
  });
  return page.items;
}

async function recordOrThrow(id: string) {
  const record = await data.batteryRecords.get(HANDLER, id);
  if (record === null) throw new Error(`record ${id} is missing`);
  return record;
}

beforeEach(() => {
  resetMockStore();
});

describe("Edit assessed condition — Rule 6.11, the only clearing path", () => {
  it("refuses to clear a damaged finding without a supporting photo, and writes nothing", async () => {
    const before = await data.damageAssessments.list(HANDLER, {
      batteryRecordId: ID.BATTERY.swollenLaptop,
      ...PAGE,
    });

    await expect(
      recordDamageAssessmentFor(
        HANDLER,
        {
          recordId: ID.BATTERY.swollenLaptop,
          findingTypes: ["none_observed"],
          isDefective: false,
          reason: "Re-inspected after the pack settled; no swelling now.",
          clearingPhotoIntakePhotoId: null,
        },
        AT,
      ),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "clearingPhotoIntakePhotoId",
    });

    const after = await data.damageAssessments.list(HANDLER, {
      batteryRecordId: ID.BATTERY.swollenLaptop,
      ...PAGE,
    });
    expect(after.total).toBe(before.total);

    const record = await recordOrThrow(ID.BATTERY.swollenLaptop);
    expect(record.ddrFlags).toEqual(["damaged"]);
    expect(record.isAirTransportProhibited).toBe(true);
    expect(record.status).toBe("quarantined");
  });

  it("refuses a superseding assessment with no stated reason", async () => {
    await expect(
      recordDamageAssessmentFor(
        HANDLER,
        {
          recordId: ID.BATTERY.vehicleTraction,
          findingTypes: ["none_observed"],
          isDefective: false,
          reason: null,
          clearingPhotoIntakePhotoId: null,
        },
        AT,
      ),
    ).rejects.toMatchObject({ name: "ValidationError", field: "reason" });
  });

  it("refuses an impossible finding set at the boundary (Rule 6.3)", async () => {
    await expect(
      recordDamageAssessmentFor(
        HANDLER,
        {
          recordId: ID.BATTERY.vehicleTraction,
          findingTypes: ["none_observed", "swelling"],
          isDefective: false,
          reason: "Typed both by mistake.",
          clearingPhotoIntakePhotoId: null,
        },
        AT,
      ),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "findingTypes",
    });
  });

  it("clears with a photo: both assessments present, the old one superseded, the flags cleared, the trail written", async () => {
    const reason = "Re-inspected after the pack settled; no swelling now.";
    const outcome = await recordDamageAssessmentFor(
      HANDLER,
      {
        recordId: ID.BATTERY.swollenLaptop,
        findingTypes: ["none_observed"],
        isDefective: false,
        reason,
        clearingPhotoIntakePhotoId: ID.PHOTO.swollenDamage,
      },
      AT,
    );

    // Rule 6.12 — side by side, the old one superseded and otherwise intact.
    const assessments = await data.damageAssessments.list(HANDLER, {
      batteryRecordId: ID.BATTERY.swollenLaptop,
      ...PAGE,
    });
    expect(assessments.total).toBe(2);
    const old = assessments.items.find(
      (row) => row.id === ID.DAMAGE.swollenDamaged,
    );
    const fresh = assessments.items.find(
      (row) => row.id === outcome.assessment.id,
    );
    expect(old?.status).toBe("superseded");
    expect(old?.findingTypes).toEqual(["swelling"]);
    expect(old?.assessedCondition).toBe("damaged");
    expect(fresh?.status).toBe("assessed_sound");
    expect(fresh?.supersedesDamageAssessmentId).toBe(ID.DAMAGE.swollenDamaged);
    expect(fresh?.clearingPhotoIntakePhotoId).toBe(ID.PHOTO.swollenDamage);
    expect(fresh?.confirmedBy).toBe(ID.USER.danaHandler);
    expect(fresh?.assessmentMethod).toBe("visual_inspection");
    expect(fresh?.findingDetail).toEqual({ reason });

    // Rules 6.4, 6.5 — the record's legal booleans follow the determination.
    const record = await recordOrThrow(ID.BATTERY.swollenLaptop);
    expect(record.ddrFlags).toEqual([]);
    expect(record.isAirTransportProhibited).toBe(false);
    expect(record.assessedCondition).toBe("sound");
    expect(record.conditionConfirmedBy).toBe(ID.USER.danaHandler);
    expect(record.conditionConfirmedAt).toBe(AT);

    // The trail: the person on the assessment row, rule evaluation on the
    // flag row, one correlation id across the act.
    const assessmentTrail = await auditTrail(
      "damage_assessment",
      outcome.assessment.id,
    );
    const recorded = assessmentTrail.find(
      (event) => event.eventType === "damage_assessment.recorded",
    );
    expect(recorded?.actorUserId).toBe(ID.USER.danaHandler);
    expect(recorded?.actorType).toBe("user");
    expect(recorded?.reason).toBe(reason);
    expect(recorded?.beforeState).toMatchObject({
      damageAssessmentId: ID.DAMAGE.swollenDamaged,
      status: "assessed_damaged",
    });
    expect(recorded?.afterState).toMatchObject({
      damageAssessmentId: outcome.assessment.id,
      status: "assessed_sound",
    });

    const recordTrail = await auditTrail(
      "battery_record",
      ID.BATTERY.swollenLaptop,
    );
    const flagRow = recordTrail.find(
      (event) =>
        event.eventType === "battery_record.ddr_flag_set" &&
        event.correlationId === HANDLER.correlationId,
    );
    expect(flagRow?.actorType).toBe("system");
    expect(flagRow?.actorLabel).toBe("condition_evaluation");
    expect(flagRow?.beforeState).toEqual({
      ddrFlags: ["damaged"],
      isAirTransportProhibited: true,
    });
    expect(flagRow?.afterState).toMatchObject({
      ddrFlags: [],
      isAirTransportProhibited: false,
    });

    // Rules 3.15, 6.20 — re-classified: a new active decision, the old one
    // superseded and not edited.
    expect(outcome.reclassification.kind).toBe("decided");
    const decisions = await data.classificationDecisions.list(HANDLER, {
      batteryRecordId: ID.BATTERY.swollenLaptop,
      ...PAGE,
    });
    const previous = decisions.items.find(
      (row) => row.id === ID.CLASSIFICATION.swollenLaptop,
    );
    const active = decisions.items.filter((row) => row.status === "active");
    expect(previous?.status).toBe("superseded");
    expect(previous?.basisCodes).toEqual(["federal_default", "damage_state"]);
    expect(active).toHaveLength(1);
    expect(active[0]?.supersedesClassificationDecisionId).toBe(
      ID.CLASSIFICATION.swollenLaptop,
    );
    expect(active[0]?.basisCodes).toEqual(["federal_default"]);

    // Placed with no flag left: in storage. It sits in a quarantine drum, and
    // moving it is `/containers`' write path (unit 04).
    expect(record.status).toBe("stored");
  });
});

describe("Edit assessed condition — sound to damaged sets the flags through the one door", () => {
  it("update alone strips the legal booleans (Rules 6.4, 6.5, 6.8)", async () => {
    const attempted = {
      ddrFlags: ["damaged"],
      isAirTransportProhibited: true,
    } as unknown as UpdateBatteryRecord;
    const stripped = await data.batteryRecords.update(
      HANDLER,
      ID.BATTERY.vehicleTraction,
      attempted,
    );
    expect(stripped.ddrFlags).toEqual([]);
    expect(stripped.isAirTransportProhibited).toBe(false);
  });

  it("a confirmed swelling finding sets the flags, quarantines the placed record and re-classifies", async () => {
    const outcome = await recordDamageAssessmentFor(
      HANDLER,
      {
        recordId: ID.BATTERY.vehicleTraction,
        findingTypes: ["swelling"],
        isDefective: false,
        reason: "Swelling found on re-inspection.",
        clearingPhotoIntakePhotoId: null,
      },
      AT,
    );

    const record = await recordOrThrow(ID.BATTERY.vehicleTraction);
    expect(record.ddrFlags).toEqual(["damaged"]);
    expect(record.isAirTransportProhibited).toBe(true);
    expect(record.assessedCondition).toBe("damaged_or_defective");
    expect(record.status).toBe("quarantined");
    expect(outcome.flagsChanged).toBe(true);
    expect(outcome.supersededAssessmentId).toBe(ID.DAMAGE.vehicleSound);

    const decisions = await data.classificationDecisions.list(HANDLER, {
      batteryRecordId: ID.BATTERY.vehicleTraction,
      ...PAGE,
    });
    const active = decisions.items.filter((row) => row.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0]?.basisCodes).toContain("damage_state");
    expect(active[0]?.inputsSnapshot).toMatchObject({ ddrFlags: ["damaged"] });

    const trail = await auditTrail(
      "battery_record",
      ID.BATTERY.vehicleTraction,
    );
    // Two transitions, two rows: into `reclassifying`, then to where it
    // settled — the column moved twice and the trail shows both halves.
    const statusMoves = trail
      .filter(
        (event) =>
          event.eventType === "battery_record.status_changed" &&
          event.correlationId === HANDLER.correlationId,
      )
      .map((event) => [event.beforeState, event.afterState]);
    expect(statusMoves).toHaveLength(2);
    expect(statusMoves).toContainEqual([
      { status: "stored" },
      { status: "reclassifying" },
    ]);
    expect(statusMoves).toContainEqual([
      { status: "reclassifying" },
      { status: "quarantined" },
    ]);

    // Every row of the act shares the correlation id.
    const act = trail.filter(
      (event) => event.correlationId === HANDLER.correlationId,
    );
    expect(act.length).toBeGreaterThanOrEqual(2);
  });

  it("the defective flag comes from the functional checkbox, not from a finding (T-30)", async () => {
    await recordDamageAssessmentFor(
      HANDLER,
      {
        recordId: ID.BATTERY.mobilityScooter,
        findingTypes: ["none_observed"],
        isDefective: true,
        reason: "Will not hold charge under load.",
        clearingPhotoIntakePhotoId: null,
      },
      AT,
    );
    const record = await recordOrThrow(ID.BATTERY.mobilityScooter);
    expect(record.ddrFlags).toEqual(["defective"]);
    expect(record.isAirTransportProhibited).toBe(true);
  });
});

describe("Re-run catalog matching — Rules 2.19, 3.14, 3.15", () => {
  it("ranks candidates and selects none", async () => {
    const candidates = await findCatalogCandidatesForRecord(
      HANDLER,
      ID.BATTERY.vehicleTraction,
      AT,
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);
    expect(candidates[0]?.catalogEntryId).toBe(ID.CATALOG.vehicleTractionNmc);
    // Nothing in the view says "selected"; the caller renders a list and a
    // person picks.
    expect(Object.keys(candidates[0] ?? {})).not.toContain("selected");
  });

  it("supersedes the active decision and edits nothing on it", async () => {
    const before = await data.classificationDecisions.get(
      HANDLER,
      ID.CLASSIFICATION.mobilityScooter,
    );

    // The proposal step is what T-43 `catalog_entry.matched` describes; the
    // person's pick is their own `battery_record.confirmed` row.
    await findCatalogCandidatesForRecord(
      HANDLER,
      ID.BATTERY.mobilityScooter,
      AT,
    );
    const outcome = await applyCatalogRematch(
      HANDLER,
      {
        recordId: ID.BATTERY.mobilityScooter,
        catalogEntryId: ID.CATALOG.laptopCellLco,
      },
      AT,
    );

    const record = await recordOrThrow(ID.BATTERY.mobilityScooter);
    expect(record.catalogEntryId).toBe(ID.CATALOG.laptopCellLco);
    expect(record.chemistry).toBe("li_lco");
    expect(record.chemistrySource).toBe("catalog_match");
    expect(record.chemistryConfirmedBy).toBe(ID.USER.danaHandler);
    expect(record.chemistryConfirmedAt).toBe(AT);
    // What the label read stays; the catalog fills only gaps.
    expect(record.modelName).toBe("RM-24V50");
    expect(outcome.changedFields).toEqual(
      expect.arrayContaining(["catalogEntryId", "chemistry"]),
    );

    const after = await data.classificationDecisions.get(
      HANDLER,
      ID.CLASSIFICATION.mobilityScooter,
    );
    expect(after?.status).toBe("superseded");
    expect(after?.reasoning).toBe(before?.reasoning);
    expect(after?.inputsSnapshot).toEqual(before?.inputsSnapshot);
    expect(after?.governingRuleVersionId).toBe(before?.governingRuleVersionId);

    const decisions = await data.classificationDecisions.list(HANDLER, {
      batteryRecordId: ID.BATTERY.mobilityScooter,
      ...PAGE,
    });
    const active = decisions.items.filter((row) => row.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0]?.supersedesClassificationDecisionId).toBe(
      ID.CLASSIFICATION.mobilityScooter,
    );
    expect(active[0]?.inputsSnapshot).toMatchObject({ chemistry: "li_lco" });
    expect(active[0]?.decidedBy).toBeNull();

    const trail = await auditTrail(
      "battery_record",
      ID.BATTERY.mobilityScooter,
    );
    const changed = trail.find(
      (event) =>
        event.eventType === "battery_record.confirmed" &&
        event.reason === "catalog_rematch",
    );
    expect(changed?.actorUserId).toBe(ID.USER.danaHandler);
    expect(changed?.changedFields).toEqual(
      expect.arrayContaining(["chemistry", "catalogEntryId"]),
    );
    expect(changed?.beforeState).toMatchObject({
      chemistry: "lead_acid_sealed",
    });
    expect(changed?.afterState).toMatchObject({ chemistry: "li_lco" });

    const matched = trail.find(
      (event) => event.eventType === "catalog_entry.matched",
    );
    expect(matched?.actorType).toBe("system");
    expect(matched?.actorLabel).toBe("rematch:candidates");
    expect(Array.isArray(matched?.afterState?.candidateIds)).toBe(true);
  });

  it("refuses an entry that is not available for matching", async () => {
    await expect(
      applyCatalogRematch(
        HANDLER,
        {
          recordId: ID.BATTERY.mobilityScooter,
          catalogEntryId: "0a000008-0000-4000-8000-0000000000ff",
        },
        AT,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("Re-classification — Rule 3.10, nothing defaulted", () => {
  it("with no jurisdiction profile there is no decision and the status is unchanged", async () => {
    const record = await recordOrThrow(ID.BATTERY.vehicleTraction);
    const rule = await resolveClassificationRule(HANDLER, record, AT);

    const outcome = await reclassifyRecord(HANDLER, {
      record,
      rule: { ...rule, resolved: null, ruleVersionId: null },
      at: AT,
      trigger: "condition_change",
    });

    expect(outcome.kind).toBe("unresolved");
    expect(outcome.missingInput).toBe("jurisdiction_profile");
    expect(outcome.decisionId).toBeNull();
    const decisions = await data.classificationDecisions.list(HANDLER, {
      batteryRecordId: ID.BATTERY.vehicleTraction,
      ...PAGE,
    });
    expect(decisions.total).toBe(1);
    expect((await recordOrThrow(ID.BATTERY.vehicleTraction)).status).toBe(
      "stored",
    );
  });

  it("resolves the site's rule version for the governing date", async () => {
    const record = await recordOrThrow(ID.BATTERY.vehicleTraction);
    const rule = await resolveClassificationRule(HANDLER, record, AT);
    expect(rule.ruleVersionId).toBe(ID.RULE_VERSION.waWasteClassification2026);
    expect(rule.asOf).toBe("2026-09-02");
    expect(rule.site.jurisdictionCode).toBe("US-WA");
  });

  it("refuses to edit a record still in review, and a voided one", async () => {
    const pending = await recordOrThrow(ID.BATTERY.scuffedNoMatch);
    expect(() => assertRecordEditable(HANDLER, pending)).toThrow(
      ValidationError,
    );

    await voidBatteryRecordFor(
      HANDLER,
      { recordId: ID.BATTERY.mobilityScooter, reason: "Duplicate entry." },
      AT,
    );
    const voided = await recordOrThrow(ID.BATTERY.mobilityScooter);
    expect(() => assertRecordEditable(HANDLER, voided)).toThrow(
      ValidationError,
    );
  });
});

describe("Void this record — Rule 3.25", () => {
  it("keeps the row and its decisions, moves the status, records the reason", async () => {
    const reason = "Logged twice; BR-0002 is the duplicate.";
    await voidBatteryRecordFor(
      HANDLER,
      { recordId: ID.BATTERY.vehicleTraction, reason },
      AT,
    );

    const record = await recordOrThrow(ID.BATTERY.vehicleTraction);
    expect(record.status).toBe("voided");
    expect(record.recordNumber).toBe("BR-0001");

    const decisions = await data.classificationDecisions.list(HANDLER, {
      batteryRecordId: ID.BATTERY.vehicleTraction,
      ...PAGE,
    });
    expect(decisions.total).toBe(1);
    expect(decisions.items[0]?.status).toBe("active");

    const listed = await data.batteryRecords.list(HANDLER, {
      excludeVoided: true,
      ...PAGE,
    });
    expect(
      listed.items.some((row) => row.id === ID.BATTERY.vehicleTraction),
    ).toBe(false);

    const trail = await auditTrail(
      "battery_record",
      ID.BATTERY.vehicleTraction,
    );
    const row = trail.find((event) => event.reason === reason);
    expect(row?.eventType).toBe("battery_record.status_changed");
    expect(row?.beforeState).toEqual({ status: "stored" });
    expect(row?.afterState).toEqual({ status: "voided" });
    expect(row?.actorUserId).toBe(ID.USER.danaHandler);
  });

  it("refuses a second void", async () => {
    await voidBatteryRecordFor(
      HANDLER,
      { recordId: ID.BATTERY.vehicleTraction, reason: "Duplicate." },
      AT,
    );
    await expect(
      voidBatteryRecordFor(
        HANDLER,
        { recordId: ID.BATTERY.vehicleTraction, reason: "Again." },
        AT,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
