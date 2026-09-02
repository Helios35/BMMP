import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IntakeConfirmation } from "@/data/contracts/battery";
import type { CreateAuditEvent } from "@/data/contracts/audit";
import type { RequestContext } from "@/data/contracts/context";
import type { CreateDamageAssessment } from "@/data/contracts/condition";
import type { CreateClassificationDecision } from "@/data/contracts/documents";
import type { CreateStorageEvent } from "@/data/contracts/storage";
import {
  configureMockRuntime,
  mockAdapter,
  mockStore,
  resetMockRuntime,
  resetMockStore,
} from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { addDecimal } from "@/domain/units";
import {
  DataIntegrityError,
  IntegrationError,
  PermissionError,
  ValidationError,
} from "@/lib/errors";
import type { IntakeDraft } from "@/types/intake";

/**
 * `intakeSessions.commitConfirmation` — the one transaction, proven through
 * the contract (`TECHNICAL_SPEC.md` §11.1 step 6).
 *
 * Two claims are load-bearing and both are proven here rather than trusted:
 *
 * 1. **All or nothing.** A commit that fails on its last write leaves every
 *    table exactly as it found it, the session and the audit log included.
 *    The mock cannot open a database transaction, so it snapshots and
 *    restores; this suite is what says the restore is complete. A
 *    half-committed intake is a shipping-ready record with no classification
 *    decision or no running clock, and that is the failure this product
 *    exists to prevent.
 * 2. **The preconditions refuse before anything is written.** The three
 *    attributable confirmations (Rules 2.15, 2.21), a confirmed chemistry
 *    (Rule 2.34), a confirmed damage assessment (Rule 6.6), an admissible
 *    container (Rules 4.16, 4.28) — each refusal is compared against a
 *    whole-store snapshot, not against the one table the refusal names.
 *
 * Every payload is built from one helper that changes one thing per test, so
 * a failing test names the precondition and nothing else.
 */

const PAGE = { limit: 50 } as const;

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-corr-commit-0001",
    ...overrides,
  };
}

/** P1 — in W_INTAKE and W_STORAGE, and **not** a platform admin. */
const HANDLER = ctx();
/** P2 — in W_STORAGE and not in W_INTAKE, so the session update is refused. */
const MANAGER = ctx({
  userId: ID.USER.martaManager,
  role: "facility_manager",
});

const AT = "2026-08-19T10:00:00.000Z";
/** The mass the record carries into the container. A test literal, not a threshold. */
const MASS_KG = "12.250";
/** What the client claims; the adapter must overwrite it with `ctx.correlationId`. */
const CLIENT_CORRELATION = "client-supplied-and-ignored";

const SESSION = ID.INTAKE_SESSION.spreadInReview;
const RECORD = ID.BATTERY.midReviewSpread;

/**
 * Every table in the store, copied. `all()` hands back the live array, so the
 * spread is what makes this a snapshot rather than a second pointer.
 */
function snapshotStore(): Readonly<Record<string, readonly unknown[]>> {
  const tables: Record<string, readonly unknown[]> = {};
  for (const [name, table] of Object.entries(mockStore())) {
    if (
      typeof table === "object" &&
      table !== null &&
      "all" in table &&
      typeof table.all === "function"
    ) {
      tables[name] = [...(table.all() as readonly unknown[])];
    }
  }
  return tables;
}

function soundAssessment(): CreateDamageAssessment {
  return {
    batteryRecordId: RECORD,
    intakePhotoId: null,
    assessmentMethod: "visual_inspection",
    status: "assessed_sound",
    findingTypes: ["none_observed"],
    findingDetail: null,
    assessedCondition: "sound",
    isAirTransportProhibited: false,
    governingRuleVersionId: null,
    evaluationTrace: null,
    modelProvider: null,
    modelIdentifier: null,
    modelConfidence: null,
    instrumentVendor: null,
    instrumentModel: null,
    instrumentSerial: null,
    instrumentReadAt: null,
    instrumentReading: null,
    assessedAt: AT,
    assessedBy: ID.USER.danaHandler,
    confirmedBy: ID.USER.danaHandler,
    confirmedAt: AT,
    clearingPhotoIntakePhotoId: null,
    supersedesDamageAssessmentId: null,
  };
}

function damagedAssessment(): CreateDamageAssessment {
  return {
    ...soundAssessment(),
    status: "assessed_damaged",
    findingTypes: ["swelling"],
    assessedCondition: "damaged_or_defective",
    isAirTransportProhibited: true,
  };
}

function lightCategoryDecision(): CreateClassificationDecision {
  return {
    decisionScope: "battery_record",
    batteryRecordId: RECORD,
    containerId: null,
    shipmentId: null,
    jurisdictionId: ID.JURISDICTION.washington,
    status: "active",
    wasteClassification: "light_category",
    basisCodes: ["federal_default"],
    reasoning:
      "Confirmed lithium-ion NMC chemistry falls within the light waste category in this jurisdiction, " +
      "with no state rule displacing the federal baseline and no damage indicator present.",
    governingRuleVersionId: ID.RULE_VERSION.waWasteClassification2026,
    evaluationTrace: [],
    inputsSnapshot: {
      chemistry: "li_nmc",
      applicationClass: "unknown",
      ddrFlags: [],
      jurisdiction: "US-WA",
    },
    decidedAt: AT,
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
}

function placementEvent(): CreateStorageEvent {
  return {
    activityType: "repackage",
    storageClockId: null,
    containerId: null,
    batteryRecordId: null,
    lotId: null,
    occurredAt: AT,
    recordedAt: AT,
    recordedBy: ID.USER.danaHandler,
    payload: null,
    governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
  };
}

function auditEvent(
  eventType: CreateAuditEvent["eventType"],
  entityTable: string,
): CreateAuditEvent {
  return {
    actorUserId: ID.USER.danaHandler,
    actorType: "user",
    actorLabel: null,
    eventType,
    entityTable,
    entityId: RECORD,
    occurredAt: AT,
    recordedAt: AT,
    beforeState: null,
    afterState: null,
    changedFields: null,
    governingRuleVersionId: null,
    ruleVersionsApplied: null,
    correlationId: CLIENT_CORRELATION,
    requestId: null,
    ipAddress: null,
    userAgent: null,
    reason: null,
  };
}

/**
 * The whole, valid, **unplaced** commit: every hard-gated field confirmed by a
 * person, chemistry from a catalog match, a sound assessment that agrees with
 * its outcome, a decision, a decode and two audit events. Each test overrides
 * one thing.
 */
function confirmation(
  overrides: Partial<IntakeConfirmation> = {},
): IntakeConfirmation {
  return {
    intakeSessionId: SESSION,
    batteryRecordId: RECORD,
    batteryRecord: {
      chemistry: "li_nmc",
      chemistrySource: "catalog_match",
      chemistryConfirmedBy: ID.USER.danaHandler,
      chemistryConfirmedAt: AT,
      modelName: "NV-M52-14S",
      batteryMassKg: MASS_KG,
    },
    confirmedFields: [
      { fieldCode: "model", confirmedBy: ID.USER.danaHandler, confirmedAt: AT },
      {
        fieldCode: "chemistry_code",
        confirmedBy: ID.USER.danaHandler,
        confirmedAt: AT,
      },
      {
        fieldCode: "assessed_condition",
        confirmedBy: ID.USER.danaHandler,
        confirmedAt: AT,
      },
    ],
    catalogEntryId: ID.CATALOG.vehicleTractionNmc,
    containerId: null,
    dateCodeDecode: {
      batteryRecordId: RECORD,
      intakeSessionId: SESSION,
      sourceLabelExtractionId: null,
      rawCode: "2312",
      formatKey: "northvale_yyww",
      decodedManufacturedOn: "2023-03-20",
      decodedPrecision: "month",
      decoderVersion: "1.0.0",
      confidence: "1.000",
      decodedByMethod: "deterministic_decoder",
      decodedBy: null,
    },
    damageAssessment: soundAssessment(),
    conditionOutcome: {
      assessedCondition: "sound",
      ddrFlags: [],
      isAirTransportProhibited: false,
      conditionRuleVersionId: null,
      conditionConfirmedBy: ID.USER.danaHandler,
      conditionConfirmedAt: AT,
    },
    classificationDecision: lightCategoryDecision(),
    storageClock: null,
    joinStorageClockId: null,
    storageEvent: null,
    containerAccumulationStartedAt: null,
    auditEvents: [
      auditEvent("battery_record.confirmed", "battery_record"),
      auditEvent("damage_assessment.recorded", "damage_assessment"),
    ],
    ...overrides,
  };
}

/** The same commit, placed into a container that already has a running clock. */
function placedInto(
  containerId: string,
  clockId: string,
  overrides: Partial<IntakeConfirmation> = {},
): IntakeConfirmation {
  return confirmation({
    containerId,
    joinStorageClockId: clockId,
    storageEvent: placementEvent(),
    ...overrides,
  });
}

/** The DDR variant: a swollen pack, damaged, air transport prohibited. */
function ddrOverrides(): Partial<IntakeConfirmation> {
  return {
    damageAssessment: damagedAssessment(),
    conditionOutcome: {
      assessedCondition: "damaged_or_defective",
      ddrFlags: ["damaged"],
      isAirTransportProhibited: true,
      conditionRuleVersionId: null,
      conditionConfirmedBy: ID.USER.danaHandler,
      conditionConfirmedAt: AT,
    },
  };
}

async function expectRefusedAndUntouched(
  input: IntakeConfirmation,
  error: unknown,
  caller: RequestContext = HANDLER,
): Promise<void> {
  const before = snapshotStore();
  await expect(
    mockAdapter.intakeSessions.commitConfirmation(caller, input),
  ).rejects.toThrow(error as never);
  expect(snapshotStore()).toEqual(before);
}

beforeEach(() => {
  resetMockStore();
});

afterEach(() => {
  resetMockRuntime();
});

describe("the three attributable confirmations (Rules 2.15, 2.21)", () => {
  const cases = [
    { missing: "model", label: /Model \/ part number/ },
    { missing: "chemistry_code", label: /Chemistry code/ },
    { missing: "assessed_condition", label: /Assessed condition/ },
  ] as const;

  for (const { missing, label } of cases) {
    it(`refuses with ValidationError and writes nothing when ${missing} is unconfirmed (Rule 2.15)`, async () => {
      const input = confirmation({
        confirmedFields: confirmation().confirmedFields.filter(
          (field) => field.fieldCode !== missing,
        ),
      });
      await expectRefusedAndUntouched(input, ValidationError);
      // The refusal names the field a person still has to confirm.
      await expect(
        mockAdapter.intakeSessions.commitConfirmation(HANDLER, input),
      ).rejects.toThrow(label);
    });
  }

  it("treats a blank confirmedBy as no confirmation at all — 'confirmed by the system' is not a value (Rule 2.21)", async () => {
    const input = confirmation({
      confirmedFields: confirmation().confirmedFields.map((field) =>
        field.fieldCode === "chemistry_code"
          ? { ...field, confirmedBy: "   " }
          : field,
      ),
    });
    await expectRefusedAndUntouched(input, ValidationError);
  });
});

describe("chemistry (Rule 2.34, T-22)", () => {
  it("refuses a null chemistry", async () => {
    await expectRefusedAndUntouched(
      confirmation({
        batteryRecord: { ...confirmation().batteryRecord, chemistry: null },
      }),
      ValidationError,
    );
  });

  it("refuses the `unknown` chemistry — it is the absence of an answer, not one", async () => {
    await expectRefusedAndUntouched(
      confirmation({
        batteryRecord: {
          ...confirmation().batteryRecord,
          chemistry: "unknown",
        },
      }),
      ValidationError,
    );
  });

  it("refuses a chemistry nobody confirmed", async () => {
    await expectRefusedAndUntouched(
      confirmation({
        batteryRecord: {
          ...confirmation().batteryRecord,
          chemistryConfirmedBy: null,
        },
      }),
      ValidationError,
    );
  });
});

describe("the damage assessment (Rules 6.1, 6.6)", () => {
  it("refuses an assessment with confirmedBy null — a model may propose, a model never sets (Rule 6.6)", async () => {
    await expectRefusedAndUntouched(
      confirmation({
        damageAssessment: { ...soundAssessment(), confirmedBy: null },
      }),
      ValidationError,
    );
  });

  it("refuses with DataIntegrityError when the assessment and the condition outcome disagree", async () => {
    // The outcome is meant to be what the assessment produced. Two answers in
    // one payload is a defect in the caller, not a choice to make here.
    await expectRefusedAndUntouched(
      confirmation({
        conditionOutcome: {
          ...confirmation().conditionOutcome,
          assessedCondition: "cosmetic_wear_only",
        },
      }),
      DataIntegrityError,
    );
  });
});

describe("a whole, valid commit (§11.1 step 6)", () => {
  it("writes every row under one correlation id, closes the session, and joins the container's running clock", async () => {
    const container = await mockAdapter.containers.get(
      HANDLER,
      ID.CONTAINER.soundDrum,
    );
    const massBefore = container?.currentNetMassKg ?? null;
    expect(massBefore).not.toBeNull();
    const auditRowsBefore = mockStore().auditEvents.all().length;

    const updated = await mockAdapter.intakeSessions.commitConfirmation(
      HANDLER,
      placedInto(ID.CONTAINER.soundDrum, ID.CLOCK.soundDrum),
    );

    // The record: status follows the payload, never the caller's word for it.
    expect(updated.id).toBe(RECORD);
    expect(updated.status).toBe("stored");
    expect(updated.chemistry).toBe("li_nmc");
    expect(updated.chemistrySource).toBe("catalog_match");
    expect(updated.catalogEntryId).toBe(ID.CATALOG.vehicleTractionNmc);
    expect(updated.containerId).toBe(ID.CONTAINER.soundDrum);
    expect(updated.conditionConfirmedBy).toBe(ID.USER.danaHandler);
    expect(updated.assessedCondition).toBe("sound");
    expect(updated.ddrFlags).toEqual([]);
    expect(updated.isAirTransportProhibited).toBe(false);
    expect(updated.dateCodeDecodeId).not.toBeNull();
    const stored = await mockAdapter.batteryRecords.get(HANDLER, RECORD);
    expect(stored).toEqual(updated);

    // The session is closed, the draft is gone, and the reviewer is the caller.
    const session = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    expect(session?.status).toBe("completed");
    expect(session?.currentStep).toBe("complete");
    expect(session?.isReviewRequired).toBe(false);
    expect(session?.draft).toBeNull();
    expect(session?.reviewedBy).toBe(ID.USER.danaHandler);
    expect(session?.reviewOutcome).toBe("confirmed");
    expect(session?.completedAt).not.toBeNull();
    expect(session?.batteryRecordId).toBe(RECORD);

    // Every appended row exists and points back at the record.
    const decisions = await mockAdapter.classificationDecisions.list(HANDLER, {
      ...PAGE,
      batteryRecordId: RECORD,
    });
    expect(decisions.items).toHaveLength(1);
    expect(decisions.items[0]?.wasteClassification).toBe("light_category");
    expect(decisions.items[0]?.decisionScope).toBe("battery_record");

    const assessments = await mockAdapter.damageAssessments.list(HANDLER, {
      ...PAGE,
      batteryRecordId: RECORD,
    });
    expect(assessments.items).toHaveLength(1);
    expect(assessments.items[0]?.confirmedBy).toBe(ID.USER.danaHandler);

    const decodes = await mockAdapter.dateCodeDecodes.list(HANDLER, {
      ...PAGE,
      batteryRecordId: RECORD,
    });
    expect(decodes.items).toHaveLength(1);
    expect(decodes.items[0]?.id).toBe(updated.dateCodeDecodeId);
    expect(decodes.items[0]?.intakeSessionId).toBe(SESSION);

    const events = await mockAdapter.storageEvents.list(HANDLER, {
      ...PAGE,
      batteryRecordId: RECORD,
    });
    expect(events.items).toHaveLength(1);
    expect(events.items[0]?.containerId).toBe(ID.CONTAINER.soundDrum);
    // Joined, not restarted: the clock is the container's running one
    // (Rule 4.4), and no new clock was created.
    expect(events.items[0]?.storageClockId).toBe(ID.CLOCK.soundDrum);
    const clocks = await mockAdapter.storageClocks.list(HANDLER, {
      ...PAGE,
      containerId: ID.CONTAINER.soundDrum,
    });
    expect(clocks.items).toHaveLength(1);

    // The container's net mass moved by exactly the record's mass, as a
    // decimal string — never a float (§0.8).
    const after = await mockAdapter.containers.get(
      HANDLER,
      ID.CONTAINER.soundDrum,
    );
    expect(after?.currentNetMassKg).toBe(
      addDecimal(massBefore ?? "0", MASS_KG),
    );
    expect(after?.currentNetMassKg).toBe("516.750");
    // Its accumulation start is untouched: this was not its first placement.
    expect(after?.accumulationStartedAt).toBe(container?.accumulationStartedAt);
    expect(after?.accumulationStartSource).toBe(
      container?.accumulationStartSource,
    );

    // Every audit row written carries ctx.correlationId, whatever the payload
    // claimed (§11.1 step 6.8).
    const written = mockStore().auditEvents.all().slice(auditRowsBefore);
    expect(written).toHaveLength(2);
    for (const row of written) {
      expect(row.correlationId).toBe(HANDLER.correlationId);
      expect(row.correlationId).not.toBe(CLIENT_CORRELATION);
      expect(row.organizationId).toBe(ID.ORG.cascade);
      expect(row.actorUserId).toBe(ID.USER.danaHandler);
    }
    expect(written.map((row) => row.eventType)).toEqual([
      "battery_record.confirmed",
      "damage_assessment.recorded",
    ]);
  });

  it("writes the audit rows through the definer door — the caller holds no INSERT on audit_event and is not a platform admin (Rules 12.3, 12.6)", async () => {
    expect(HANDLER.isPlatformAdmin).toBe(false);
    // The policy-checked door refuses this very caller and this very row.
    await expect(
      mockAdapter.auditEvents.append(
        HANDLER,
        auditEvent("battery_record.confirmed", "battery_record"),
      ),
    ).rejects.toThrow(PermissionError);

    await mockAdapter.intakeSessions.commitConfirmation(
      HANDLER,
      confirmation(),
    );

    // The same rows landed anyway, and a reader with audit rights sees them
    // under the commit's correlation id.
    const log = await mockAdapter.auditEvents.list(MANAGER, {
      ...PAGE,
      correlationId: HANDLER.correlationId,
    });
    expect(log.items).toHaveLength(2);
    expect(log.items.map((row) => row.actorType)).toEqual(["user", "user"]);
  });

  it("stores a DDR record as quarantined with the flags set through the commit, though update strips them (Rules 6.4, 6.5)", async () => {
    // `batteryRecords.update` strips the two legal booleans at the boundary; a
    // confirmed damage assessment is the one path that moves them, and the
    // commit carries that assessment.
    const updated = await mockAdapter.intakeSessions.commitConfirmation(
      HANDLER,
      placedInto(
        ID.CONTAINER.quarantineDrum,
        ID.CLOCK.quarantineDrum,
        ddrOverrides(),
      ),
    );
    expect(updated.status).toBe("quarantined");
    expect(updated.ddrFlags).toEqual(["damaged"]);
    expect(updated.isAirTransportProhibited).toBe(true);
    expect(updated.assessedCondition).toBe("damaged_or_defective");
    expect(updated.containerId).toBe(ID.CONTAINER.quarantineDrum);

    const stored = await mockAdapter.batteryRecords.get(HANDLER, RECORD);
    expect(stored?.ddrFlags).toEqual(["damaged"]);
    expect(stored?.isAirTransportProhibited).toBe(true);
  });

  it("starts a new clock and stamps the accumulation start on a container's first placement (Rule 4.4)", async () => {
    // The fixtures' containers all have a running clock, so a first placement
    // needs a container of our own. Its type is the class this record needs.
    const fresh = await mockAdapter.containers.create(HANDLER, {
      containerType: "light_category_sound",
      lotId: null,
      shipmentId: null,
      capacityKg: null,
      capacityVolumeM3: null,
      siteAddress: null,
      siteTimeZone: "America/Los_Angeles",
      storageLocation: "Bay 5",
      status: "open",
      sealedAt: null,
      closedAt: null,
    });
    expect(fresh.accumulationStartedAt).toBeNull();
    expect(fresh.currentNetMassKg).toBeNull();

    // Every figure on the clock is a test literal handed in by the caller —
    // the adapter copies it and evaluates nothing (Rule 4.5).
    const updated = await mockAdapter.intakeSessions.commitConfirmation(
      HANDLER,
      confirmation({
        containerId: fresh.id,
        joinStorageClockId: null,
        storageClock: {
          subjectType: "container",
          batteryRecordId: null,
          containerId: fresh.id,
          clockStartAt: AT,
          clockStartBasis: "first_placement",
          timeZone: "America/Los_Angeles",
          maxDurationDays: 30,
          governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
          evaluationTrace: [],
          dueAt: "2026-09-18T06:59:59.999Z",
          alertSchedule: {},
          alertBand: "none",
          nextAlertAt: null,
          status: "running",
        },
        storageEvent: placementEvent(),
        containerAccumulationStartedAt: AT,
      }),
    );
    expect(updated.status).toBe("stored");
    expect(updated.containerId).toBe(fresh.id);

    const clocks = await mockAdapter.storageClocks.list(HANDLER, {
      ...PAGE,
      containerId: fresh.id,
    });
    expect(clocks.items).toHaveLength(1);
    expect(clocks.items[0]?.clockStartAt).toBe(AT);
    expect(clocks.items[0]?.stoppedAt).toBeNull();

    const events = await mockAdapter.storageEvents.list(HANDLER, {
      ...PAGE,
      batteryRecordId: RECORD,
    });
    expect(events.items[0]?.storageClockId).toBe(clocks.items[0]?.id);

    const after = await mockAdapter.containers.get(HANDLER, fresh.id);
    expect(after?.accumulationStartedAt).toBe(AT);
    expect(after?.accumulationStartSource).toBe("first_placement");
    // A null net mass reads as nothing yet, and the first record's mass is
    // the whole of it.
    expect(after?.currentNetMassKg).toBe(MASS_KG);
  });

  it("leaves an unplaced commit `classified` when a decision is present", async () => {
    const updated = await mockAdapter.intakeSessions.commitConfirmation(
      HANDLER,
      confirmation(),
    );
    expect(updated.status).toBe("classified");
    expect(updated.containerId).toBeNull();
    const events = await mockAdapter.storageEvents.list(HANDLER, {
      ...PAGE,
      batteryRecordId: RECORD,
    });
    expect(events.items).toHaveLength(0);
  });

  it("leaves an unplaced commit `confirmed` when classification could not run (Rule 3.10, E-13)", async () => {
    const updated = await mockAdapter.intakeSessions.commitConfirmation(
      HANDLER,
      confirmation({ classificationDecision: null }),
    );
    expect(updated.status).toBe("confirmed");
    const decisions = await mockAdapter.classificationDecisions.list(HANDLER, {
      ...PAGE,
      batteryRecordId: RECORD,
    });
    expect(decisions.items).toHaveLength(0);
  });

  it("leaves gateThresholdsApplied on the session untouched", async () => {
    const before = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    const stamped = before?.gateThresholdsApplied;
    expect(stamped).toBeTruthy();

    await mockAdapter.intakeSessions.commitConfirmation(
      HANDLER,
      placedInto(ID.CONTAINER.soundDrum, ID.CLOCK.soundDrum),
    );

    const after = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    // The set the gate applied is what makes the decision reproduce after the
    // configuration changes (Rule 2.16). A commit has no business moving it.
    expect(after?.gateThresholdsApplied).toEqual(stamped);
  });
});

describe("placement admission (Rules 4.16, 4.28; T-23)", () => {
  it("refuses an overdue container and names the two ways its contents leave (Rule 4.16)", async () => {
    const input = placedInto(ID.CONTAINER.overdueDrum, ID.CLOCK.overdueDrum);
    await expectRefusedAndUntouched(input, ValidationError);
    await expect(
      mockAdapter.intakeSessions.commitConfirmation(HANDLER, input),
    ).rejects.toThrow(/shipment.*remediation/);
  });

  it("refuses a segregation-class mismatch — a DDR record into the sound drum (Rule 4.28)", async () => {
    const input = placedInto(
      ID.CONTAINER.soundDrum,
      ID.CLOCK.soundDrum,
      ddrOverrides(),
    );
    await expectRefusedAndUntouched(input, ValidationError);
    await expect(
      mockAdapter.intakeSessions.commitConfirmation(HANDLER, input),
    ).rejects.toThrow(/different segregation class/);
  });

  it("refuses a container when classification is undetermined — T-23 gives such a record no container", async () => {
    const input = placedInto(ID.CONTAINER.soundDrum, ID.CLOCK.soundDrum, {
      classificationDecision: null,
    });
    await expectRefusedAndUntouched(input, ValidationError);
    await expect(
      mockAdapter.intakeSessions.commitConfirmation(HANDLER, input),
    ).rejects.toThrow(/no classification yet/);
  });
});

describe("all or nothing — a partial commit leaves nothing written", () => {
  it("restores every table, the session and the audit log when the storage-event append fails", async () => {
    // The seeded key is `<entityName>.<method>` where entityName is the
    // TenantTable's second constructor argument (`store.ts`). The storage
    // event is appended after the decode, the assessment, the decision and
    // the clock join — a late write, so the restore has the most to undo.
    const before = snapshotStore();
    const sessionBefore = await mockAdapter.intakeSessions.get(
      HANDLER,
      SESSION,
    );

    configureMockRuntime({ seededFailures: ["storageEvents.insert"] });
    await expect(
      mockAdapter.intakeSessions.commitConfirmation(
        HANDLER,
        placedInto(ID.CONTAINER.soundDrum, ID.CLOCK.soundDrum),
      ),
    ).rejects.toThrow(IntegrationError);
    resetMockRuntime();

    expect(snapshotStore()).toEqual(before);
    const sessionAfter = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    expect(sessionAfter).toEqual(sessionBefore);
    expect(sessionAfter?.status).toBe("awaiting_confirmation");
    const record = await mockAdapter.batteryRecords.get(HANDLER, RECORD);
    expect(record?.status).toBe("pending_review");
    expect(record?.chemistry).toBeNull();

    // And the same payload succeeds once the fault is cleared — the restore
    // left the store usable, not merely equal.
    const updated = await mockAdapter.intakeSessions.commitConfirmation(
      HANDLER,
      placedInto(ID.CONTAINER.soundDrum, ID.CLOCK.soundDrum),
    );
    expect(updated.status).toBe("stored");
  });

  it("restores everything when the audit append itself fails — no row claims a commit that did not happen (§11.1 step 6.8)", async () => {
    // `insertAsDefiner` skips the policy check and nothing else: the seeded
    // failure still applies, under the same `auditEvents.insert` key.
    const before = snapshotStore();
    const massBefore = (
      await mockAdapter.containers.get(HANDLER, ID.CONTAINER.soundDrum)
    )?.currentNetMassKg;

    configureMockRuntime({ seededFailures: ["auditEvents.insert"] });
    await expect(
      mockAdapter.intakeSessions.commitConfirmation(
        HANDLER,
        placedInto(ID.CONTAINER.soundDrum, ID.CLOCK.soundDrum),
      ),
    ).rejects.toThrow(IntegrationError);
    resetMockRuntime();

    expect(snapshotStore()).toEqual(before);
    const container = await mockAdapter.containers.get(
      HANDLER,
      ID.CONTAINER.soundDrum,
    );
    // The container update had already been applied when the audit append
    // threw; the restore took it back.
    expect(container?.currentNetMassKg).toBe(massBefore);
  });
});

describe("policy, before anything is written", () => {
  it("refuses a P2 caller with PermissionError — facility_manager is not in W_INTAKE (§9.3)", async () => {
    await expectRefusedAndUntouched(confirmation(), PermissionError, MANAGER);
  });
});

describe("the session draft", () => {
  it("accepts a draft through intakeSessions.update and reads it back", async () => {
    const draft: IntakeDraft = {
      fields: [
        {
          fieldCode: "model",
          status: "confirmed",
          value: "NV-M52-14S",
          originalValue: "NV-M52-l4S",
          source: "read_from_label",
          confidenceBand: "low",
          rawText: "NV-M52-l4S",
          isHardGated: true,
          confirmedBy: ID.USER.danaHandler,
          confirmedAt: AT,
        },
      ],
      candidates: [],
      selectedCatalogEntryId: null,
      catalogMatchRejected: false,
      chemistry: null,
      chemistrySource: null,
      formFactorProposal: null,
      manualEntry: false,
      extractionRejected: false,
      dateCodeDecode: null,
      manufacturedOnEntered: null,
      condition: null,
      stateOfCharge: null,
      containerId: null,
      sourceDevice: null,
      labelPhotoId: ID.PHOTO.spreadOriginal,
      labelCropId: ID.PHOTO.spreadCrop,
      extractionRunId: ID.EXTRACTION_RUN.spread,
    };

    const updated = await mockAdapter.intakeSessions.update(HANDLER, SESSION, {
      draft,
    });
    expect(updated.draft).toEqual(draft);
    const read = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    expect(read?.draft).toEqual(draft);
    // The fixture session carries no draft; absent reads as null for the card.
    const untouched = await mockAdapter.intakeSessions.get(
      HANDLER,
      ID.INTAKE_SESSION.scuffedInReview,
    );
    expect(untouched?.draft ?? null).toBeNull();
  });
});
