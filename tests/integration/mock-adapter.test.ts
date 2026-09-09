import { beforeEach, describe, expect, it } from "vitest";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts/context";
import { mockAdapter, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { PermissionError, ValidationError } from "@/lib/errors";

/**
 * The mock adapter, through the contract — the seam assembled rather than in
 * pieces.
 *
 * Two things are being proven here, and both are load-bearing:
 *
 * 1. **The mock enforces tenant scope and role in code**, because it has no
 *    row-level security. Without that, the Playwright suite passes on mock and
 *    leaks on Supabase (`TECHNICAL_SPEC.md` §5.2), and the seam's central claim
 *    — that the same suite passes both ways — is false.
 * 2. **The fixtures carry the awkward cases**, because friendly fixtures produce
 *    screens that fall over on contact with real data
 *    (`PROJECT_SETUP_BMMP.md` §3.2).
 */

const PAGE = { limit: 50 } as const;

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-corr-0001",
    ...overrides,
  };
}

const HANDLER = ctx();
const MANAGER = ctx({
  userId: ID.USER.martaManager,
  role: "facility_manager",
});
const AUDITOR = ctx({ userId: ID.USER.samAuditor, role: "auditor" });
const RAINIER = ctx({
  userId: ID.USER.joRainierHandler,
  organizationId: ID.ORG.rainier,
});

beforeEach(() => {
  resetMockStore();
});

describe("the seam", () => {
  it("serves the mock adapter under DATA_ADAPTER=mock", () => {
    expect(data.describe()).toEqual({ name: "mock", kind: "fake" });
  });

  it("exposes a repository for every B1a entity and none for the six later ones (D-24)", () => {
    // All 32 entities are typed. The contract covers B1a's 26 only: adding a
    // method at the phase that needs it is normal; carrying six unused ones
    // through 32 weeks of prototype churn is not.
    const b1a = [
      "organizations",
      "users",
      "memberships",
      "tosAcceptances",
      "jurisdictions",
      "jurisdictionRules",
      "ruleVersions",
      "formatClassifications",
      "batteryRecords",
      "catalogEntries",
      "intakeSessions",
      "intakePhotos",
      "labelExtractions",
      "dateCodeDecodes",
      "containers",
      "lots",
      "storageClocks",
      "storageEvents",
      "alerts",
      "classificationDecisions",
      "shipments",
      "shippingPapers",
      "containerLabels",
      "documentRenders",
      "damageAssessments",
      "auditEvents",
    ] as const;
    expect(b1a).toHaveLength(26);
    for (const key of b1a) {
      expect(mockAdapter[key], key).toBeDefined();
    }
    for (const later of [
      "grades",
      "hazardRankings",
      "recallMatches",
      "producerObligations",
      "obligationDeadlines",
      "evidencePacks",
    ]) {
      expect(
        (mockAdapter as unknown as Record<string, unknown>)[later],
        later,
      ).toBeUndefined();
    }
  });

  it("implements every contract method — nothing is stubbed with a TODO", async () => {
    // Each of the four wider-than-CRUD repositories is exercised, because those
    // are the ones a stub would hide behind.
    await expect(
      mockAdapter.catalogEntries.findCandidates(HANDLER, { limit: 5 }),
    ).resolves.toBeInstanceOf(Array);
    await expect(
      mockAdapter.ruleVersions.resolve(HANDLER, {
        ruleKeys: ["storage.accumulation_period"],
        jurisdictionId: ID.JURISDICTION.washington,
        asOf: "2026-08-19",
      }),
    ).resolves.toHaveProperty("ok");
    await expect(
      mockAdapter.jurisdictions.chainFrom(HANDLER, ID.JURISDICTION.washington),
    ).resolves.toHaveLength(2);
    await expect(
      mockAdapter.documentRenders.verify(
        HANDLER,
        ID.DOCUMENT_RENDER.julyShippingPaper,
      ),
    ).rejects.toThrow(/integrity check/);
  });
});

describe("tenant isolation", () => {
  it("never returns another organization's record from a list", async () => {
    const page = await mockAdapter.batteryRecords.list(HANDLER, PAGE);
    const ids = page.items.map((record) => record.id);
    expect(ids).toContain(ID.BATTERY.vehicleTraction);
    expect(ids).not.toContain(ID.BATTERY.rainierScooter);
    for (const record of page.items) {
      expect(record.organizationId).toBe(ID.ORG.cascade);
    }
  });

  it("resolves another organization's id as not found, never as forbidden", async () => {
    // Existence is not disclosed across tenants under any circumstances
    // (Rule 1.2; `SITE_ARCHITECTURE.md` §5.3 rule 5). A 403 here would confirm
    // the record exists.
    const found = await mockAdapter.batteryRecords.get(
      HANDLER,
      ID.BATTERY.rainierScooter,
    );
    expect(found).toBeNull();
  });

  it("shows each tenant only its own records, from the same adapter", async () => {
    const cascade = await mockAdapter.batteryRecords.list(HANDLER, PAGE);
    const rainier = await mockAdapter.batteryRecords.list(RAINIER, PAGE);
    expect(rainier.items).toHaveLength(1);
    expect(rainier.items[0]?.id).toBe(ID.BATTERY.rainierScooter);
    expect(cascade.items.length).toBeGreaterThan(1);
  });

  it("scopes an organization read to the caller's own tenant", async () => {
    expect(
      await mockAdapter.organizations.get(HANDLER, ID.ORG.rainier),
    ).toBeNull();
    expect(
      (await mockAdapter.organizations.get(HANDLER, ID.ORG.cascade))?.name,
    ).toBe("Cascade Auto Recyclers");
  });

  it("writes into the caller's tenant, never one the caller names", async () => {
    // create/append inputs carry no organizationId; the adapter sets it from
    // ctx, so a caller cannot write into another tenant even by accident.
    const created = await mockAdapter.containers.create(HANDLER, {
      containerType: "light_category_sound",
      lotId: null,
      shipmentId: null,
      capacityKg: "900.000",
      capacityVolumeM3: "0.2080",
      siteAddress: null,
      siteTimeZone: "America/Los_Angeles",
      storageLocation: "Bay 3",
      status: "open",
      sealedAt: null,
      closedAt: null,
    });
    expect(created.organizationId).toBe(ID.ORG.cascade);
    // And the counter is per-organization, allocated inside the insert.
    expect(created.containerCode).toBe("C-0004");
    // The accumulation start date is not settable by any caller: it is set by
    // the first placement and travels with the records (Rule 4.4).
    expect(created.accumulationStartedAt).toBeNull();
  });

  it("shares the platform catalog and hides another tenant's proposals", async () => {
    const page = await mockAdapter.catalogEntries.list(HANDLER, PAGE);
    expect(page.items.length).toBe(3);
    for (const entry of page.items) {
      expect(entry.organizationId).toBeNull();
    }
  });
});

describe("role enforcement, using the same sets Postgres uses", () => {
  it("refuses a write from a role that holds no policy for the table", async () => {
    // P2 is not in W_INTAKE, so `battery_record` insert is refused — by the
    // policy in Postgres, and by the same role set here.
    await expect(
      mockAdapter.intakeSessions.create(MANAGER, {
        status: "open",
        currentStep: "photo_capture",
        isReviewRequired: false,
        reviewReasonCodes: null,
        gateThresholdsApplied: {},
        correlationId: "test",
        deviceContext: null,
        startedBy: MANAGER.userId,
        startedAt: "2026-08-19T10:00:00.000Z",
        abandonedAt: null,
      }),
    ).rejects.toThrow(PermissionError);
  });

  it("names the role and what was attempted, rather than denying silently", async () => {
    // Every denial states its reason in plain language; a silently disabled
    // control is a defect (Rule 1.26).
    await expect(
      mockAdapter.containers.create(AUDITOR, {
        containerType: "light_category_sound",
        lotId: null,
        shipmentId: null,
        capacityKg: null,
        capacityVolumeM3: null,
        siteAddress: null,
        siteTimeZone: "America/Los_Angeles",
        storageLocation: null,
        status: "open",
        sealedAt: null,
        closedAt: null,
      }),
    ).rejects.toThrow(/cannot insert container/);
  });

  it("keeps P5 out of every write path (Rule 1.14)", async () => {
    // P5 appears in no writer set. That is the enforcement, not a convention.
    await expect(
      mockAdapter.lots.create(AUDITOR, {
        description: "Auditor's lot",
        status: "open",
      }),
    ).rejects.toThrow(PermissionError);
    await expect(
      mockAdapter.storageEvents.append(AUDITOR, {
        activityType: "inspect",
        storageClockId: null,
        containerId: ID.CONTAINER.soundDrum,
        batteryRecordId: null,
        lotId: null,
        occurredAt: "2026-08-19T10:00:00.000Z",
        recordedAt: "2026-08-19T10:00:00.000Z",
        recordedBy: AUDITOR.userId,
        payload: null,
        governingRuleVersionId: null,
      }),
    ).rejects.toThrow(PermissionError);
  });

  it("keeps P1 out of the audit log and lets P2 and P5 read it (Rule 12.8)", async () => {
    await expect(mockAdapter.auditEvents.list(HANDLER, PAGE)).rejects.toThrow(
      PermissionError,
    );
    await expect(
      mockAdapter.auditEvents.list(MANAGER, PAGE),
    ).resolves.toHaveProperty("total", 4);
    await expect(
      mockAdapter.auditEvents.list(AUDITOR, PAGE),
    ).resolves.toHaveProperty("total", 4);
  });

  it("refuses a rule-version publish from anyone but P6", async () => {
    await expect(
      mockAdapter.ruleVersions.publish(
        MANAGER,
        ID.RULE_VERSION.waAccumulationPeriodDraft2027,
      ),
    ).rejects.toThrow(PermissionError);
  });

  it("refuses to let P6 accept or move a tenant's Terms of Service (Rules 1.19, 7.4)", async () => {
    // One of exactly three things platform scope cannot buy, and it is enforced
    // rather than documented.
    const platformAdmin = ctx({
      userId: ID.USER.platformAdmin,
      role: "platform_admin",
      isPlatformAdmin: true,
    });
    await expect(
      mockAdapter.tosAcceptances.setStatus(
        platformAdmin,
        ID.TOS.cascadeInForce,
        {
          status: "revoked",
        },
      ),
    ).rejects.toThrow(/never accept or move/);
  });
});

describe("the awkward fixtures", () => {
  it("puts a small mobility-scooter pack in the same list and container as a vehicle pack", async () => {
    // PROJECT_SETUP_BMMP.md §3.2 and SITE_ARCHITECTURE.md §7.8: these screens
    // are where the wide record shows, from the first fixture.
    const page = await mockAdapter.batteryRecords.list(HANDLER, {
      ...PAGE,
      containerId: ID.CONTAINER.soundDrum,
    });
    const classes = page.items.map((record) => record.applicationClass);
    expect(classes).toContain("vehicle");
    expect(classes).toContain("small_mobility");

    const scooter = page.items.find(
      (record) => record.id === ID.BATTERY.mobilityScooter,
    );
    // Lead-acid is first-class, not a lithium schema with an exception.
    expect(scooter?.chemistry).toBe("lead_acid_sealed");
    // Cell and module counts are nullable, so nothing is invented to satisfy a
    // required field.
    expect(scooter?.cellCount).toBeNull();
    expect(scooter?.moduleCount).toBeNull();
    // The provenance field holds a scooter serial and is not named `vin`.
    expect(scooter?.sourceDeviceIdentifier).toContain("SCOOTER");
  });

  it("carries a swollen pack that sets the DDR flag and blocks air transport", async () => {
    const record = await mockAdapter.batteryRecords.get(
      HANDLER,
      ID.BATTERY.swollenLaptop,
    );
    expect(record?.ddrFlags).toEqual(["damaged"]);
    expect(record?.isAirTransportProhibited).toBe(true);
    expect(record?.status).toBe("quarantined");

    const assessment = await mockAdapter.damageAssessments.list(HANDLER, {
      ...PAGE,
      batteryRecordId: ID.BATTERY.swollenLaptop,
    });
    expect(assessment.items[0]?.status).toBe("assessed_damaged");
    expect(assessment.items[0]?.findingTypes).toEqual(["swelling"]);
  });

  it("cannot clear the DDR flag or the air block through the contract (Rules 6.8, 6.11)", async () => {
    // The only clearing path is a superseding human assessment finding no
    // indicator present, with a stated reason and a supporting photograph — and
    // there is no override for any role, including P6.
    //
    // The types leave both fields off the update shape. The cast below forces
    // them past the type on purpose, because a type is the first line and not
    // the last one: in Postgres a trigger is what holds, and the mock has to
    // refuse the same write or a screen would meet the refusal for the first
    // time after migration.
    const update = mockAdapter.batteryRecords.update as unknown as (
      c: RequestContext,
      id: string,
      input: Record<string, unknown>,
    ) => Promise<{
      ddrFlags: readonly string[];
      isAirTransportProhibited: boolean;
      status: string;
    }>;
    const after = await update(HANDLER, ID.BATTERY.swollenLaptop, {
      ddrFlags: [],
      isAirTransportProhibited: false,
      status: "stored",
    });
    expect(after.ddrFlags).toEqual(["damaged"]);
    expect(after.isAirTransportProhibited).toBe(true);
    // Everything else on the same call still applies — the guard strips two
    // fields, it does not reject the whole write.
    expect(after.status).toBe("stored");
  });

  it("cannot declare a new record air-eligible at creation either", async () => {
    // An intake that could set the flags would be a route around Rule 6.8 at
    // the one moment nobody is looking. A new record starts with no flags.
    const created = await mockAdapter.batteryRecords.create(HANDLER, {
      status: "draft",
      batteryPassportIdentifier: null,
      intakeSessionId: null,
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
      cellFormFactor: "unknown",
      assemblyLevel: "unknown",
      applicationClass: "unknown",
      cellCount: null,
      moduleCount: null,
      nominalVoltageV: null,
      minVoltageV: null,
      maxVoltageV: null,
      ratedCapacityAh: null,
      ratedEnergyWh: null,
      originalPowerW: null,
      expectedLifetimeCycles: null,
      operatingTempMinC: null,
      operatingTempMaxC: null,
      internalResistanceMohm: null,
      cRateMax: null,
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
      conditionRuleVersionId: null,
      dateCodeRaw: null,
      dateCodeDecodeId: null,
      sourceDeviceType: null,
      sourceDeviceIdentifier: null,
      sourceDeviceMake: null,
      sourceDeviceModel: null,
      sourceDeviceModelYear: null,
      provenanceSourceType: "unknown_provenance",
      provenanceRecordedAt: null,
      passportExtension: null,
    });
    expect(created.ddrFlags).toEqual([]);
    expect(created.isAirTransportProhibited).toBe(false);
    expect(created.recordNumber).toBe("BR-0006");
  });

  it("carries a container past its accumulation period in the hard overdue state", async () => {
    const container = await mockAdapter.containers.get(
      HANDLER,
      ID.CONTAINER.overdueDrum,
    );
    expect(container?.status).toBe("overdue");

    const clock = await mockAdapter.storageClocks.list(HANDLER, {
      ...PAGE,
      containerId: ID.CONTAINER.overdueDrum,
    });
    expect(clock.items[0]?.status).toBe("overdue");
    expect(clock.items[0]?.alertBand).toBe("overdue");
    // The clock never pauses, so a stopped-at is absent while it is overdue.
    expect(clock.items[0]?.stoppedAt).toBeNull();
    // The duration was copied from the resolved rule version at start, not read
    // from a constant (Rule 4.5).
    expect(clock.items[0]?.maxDurationDays).toBe(365);
    expect(clock.items[0]?.governingRuleVersionId).toBe(
      ID.RULE_VERSION.waAccumulationPeriod2026,
    );
  });

  it("raises the overdue container as an `alert` record, not as view state", async () => {
    const alerts = await mockAdapter.alerts.list(HANDLER, {
      ...PAGE,
      containerId: ID.CONTAINER.overdueDrum,
    });
    expect(alerts.items[0]?.alertType).toBe("storage_clock");
    expect(alerts.items[0]?.severity).toBe("critical");
    // "The system warned them" is itself evidence: the alert has a raised-at
    // time, a routed audience and a frozen trigger snapshot.
    expect(alerts.items[0]?.raisedAt).toBeTruthy();
    expect(alerts.items[0]?.audienceRoles).toContain("facility_manager");
    expect(alerts.items[0]?.triggerSnapshot).toHaveProperty("maxDurationDays");
  });

  it("does not fire a duplicate alert on a re-run", async () => {
    const existing = await mockAdapter.alerts.get(
      HANDLER,
      ID.ALERT.overdueDrum,
    );
    const again = await mockAdapter.alerts.raiseIfAbsent(HANDLER, {
      alertType: "storage_clock",
      severity: "critical",
      title: "duplicate attempt",
      body: "duplicate attempt",
      storageClockId: ID.CLOCK.overdueDrum,
      containerId: ID.CONTAINER.overdueDrum,
      batteryRecordId: null,
      shipmentId: null,
      intakeSessionId: null,
      recallMatchId: null,
      obligationDeadlineId: null,
      siteIdRef: null,
      audienceRoles: ["facility_manager"],
      governingRuleVersionId: null,
      triggerSnapshot: {},
      raisedAt: "2026-08-19T10:00:00.000Z",
      dedupeKey: existing?.dedupeKey ?? "",
      deliveredChannels: null,
    });
    expect(again.id).toBe(ID.ALERT.overdueDrum);
    expect(again.title).not.toBe("duplicate attempt");
  });

  it("carries a scuffed label with no catalog match, blocked rather than defaulted", async () => {
    const record = await mockAdapter.batteryRecords.get(
      HANDLER,
      ID.BATTERY.scuffedNoMatch,
    );
    expect(record?.catalogEntryId).toBeNull();
    expect(record?.chemistry).toBeNull();
    expect(record?.chemistryConfirmedBy).toBeNull();
    expect(record?.status).toBe("pending_review");

    const decision = await mockAdapter.classificationDecisions.list(HANDLER, {
      ...PAGE,
      batteryRecordId: ID.BATTERY.scuffedNoMatch,
    });
    // Blocked, never defaulted (Rules 3.4, 3.10), and no downstream document
    // issues from it (Rule 3.12).
    expect(decision.items[0]?.status).toBe("blocked");
    expect(decision.items[0]?.wasteClassification).toBe("undetermined");
    expect(decision.items[0]?.basisCodes).toEqual(["chemistry_unconfirmed"]);

    // The date code is undecodable — an honest null, never an approximate date.
    const decode = await mockAdapter.dateCodeDecodes.list(HANDLER, {
      ...PAGE,
      batteryRecordId: ID.BATTERY.scuffedNoMatch,
    });
    expect(decode.items[0]?.decodedManufacturedOn).toBeNull();
  });

  it("records what the model read even when it read nothing (Rules 2.11, 2.12)", async () => {
    const rows = await mockAdapter.labelExtractions.list(HANDLER, {
      ...PAGE,
      intakeSessionId: ID.INTAKE_SESSION.scuffedInReview,
    });
    const model = rows.items.find((row) => row.fieldCode === "model");
    // Unread beats guessed: the value is null and the characters the model
    // reported are retained for the reviewer to judge.
    expect(model?.fieldValue).toBeNull();
    expect(model?.confidenceBand).toBe("not_extracted");
    expect(model?.rawText).toBeTruthy();
    expect(model?.isHardGated).toBe(true);
  });

  it("carries a record mid-review with confidence across all four bands", async () => {
    const rows = await mockAdapter.labelExtractions.list(HANDLER, {
      ...PAGE,
      intakeSessionId: ID.INTAKE_SESSION.spreadInReview,
    });
    const bands = new Set(rows.items.map((row) => row.confidenceBand));
    expect([...bands].sort()).toEqual([
      "high",
      "low",
      "medium",
      "not_extracted",
    ]);
    // One row per field per extraction. There is no aggregate confidence
    // anywhere — a blended score standing in for a weak field is forbidden
    // (Rule 2.7).
    expect(rows.items.length).toBe(4);
    for (const row of rows.items) {
      expect(row).not.toHaveProperty("aggregateConfidence");
      // The band reproduces even after the cutoffs change (Rule 2.16).
      expect(row.bandCutoffsApplied).toBeTruthy();
    }
  });

  it("keeps the same battery in two format bands, one per jurisdiction", async () => {
    // The entire premise of the multi-state model, and the reason
    // `format_classification` is a table rather than a column on the record.
    const rows = await mockAdapter.formatClassifications.list(HANDLER, {
      ...PAGE,
      batteryRecordId: ID.BATTERY.mobilityScooter,
    });
    expect(rows.items).toHaveLength(2);
    const byJurisdiction = new Map(
      rows.items.map((row) => [row.jurisdictionId, row.formatCategory]),
    );
    expect(byJurisdiction.get(ID.JURISDICTION.washington)).toBe(
      "medium_format",
    );
    expect(byJurisdiction.get(ID.JURISDICTION.federal)).toBe("not_covered");
  });
});

describe("rule resolution through the adapter", () => {
  it("walks the chain and resolves the version in force", async () => {
    const resolution = await mockAdapter.ruleVersions.resolve(HANDLER, {
      ruleKeys: ["storage.accumulation_period", "retention.shipment_record"],
      jurisdictionId: ID.JURISDICTION.washington,
      asOf: "2026-08-19",
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    // Most specific first: the state rule answers for accumulation, the federal
    // one for retention.
    expect(
      resolution.resolved.rules["storage.accumulation_period"]?.level,
    ).toBe("state");
    expect(resolution.resolved.rules["retention.shipment_record"]?.level).toBe(
      "federal",
    );
  });

  it("never resolves the unpublished 2027 draft (T-42)", async () => {
    const resolution = await mockAdapter.ruleVersions.resolve(HANDLER, {
      ruleKeys: ["storage.accumulation_period"],
      jurisdictionId: ID.JURISDICTION.washington,
      asOf: "2027-06-01",
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    // The draft would have shortened the period to 270 days. It governs nothing
    // until P6 publishes it.
    const version =
      resolution.resolved.rules["storage.accumulation_period"]?.version;
    expect(version?.ruleVersionId).toBe(
      ID.RULE_VERSION.waAccumulationPeriod2026,
    );
    expect(version?.payload).toMatchObject({ maxDurationDays: 365 });
  });

  it("reports a stated gap rather than defaulting when no rule is on file", async () => {
    const resolution = await mockAdapter.ruleVersions.resolve(HANDLER, {
      ruleKeys: ["fire_code.stored_quantity"],
      jurisdictionId: ID.JURISDICTION.washington,
      asOf: "2026-08-19",
    });
    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.unresolved[0]).toEqual({
      ruleKey: "fire_code.stored_quantity",
      reason: "no_rule_on_file",
    });
  });
});

describe("intake confirmation", () => {
  it("refuses to commit without every hard-gated field confirmed (Rule 2.15)", async () => {
    // The gate decides which queue, not whether a human is involved. Chemistry,
    // model and condition are confirmed by a person on both paths, at every
    // confidence band. The full commit suite — every gated field on its own,
    // the partial-commit rollback, the placement refusals — lives in
    // tests/integration/intake-commit.test.ts; this is the seam's own proof
    // that the refusal exists at all.
    const at = "2026-08-19T10:00:00.000Z";
    await expect(
      mockAdapter.intakeSessions.commitConfirmation(HANDLER, {
        intakeSessionId: ID.INTAKE_SESSION.spreadInReview,
        batteryRecordId: ID.BATTERY.midReviewSpread,
        batteryRecord: {
          chemistry: "li_nmc",
          chemistrySource: "catalog_match",
          chemistryConfirmedBy: ID.USER.danaHandler,
          chemistryConfirmedAt: at,
          modelName: "NV-M52-14S",
        },
        // Only one of the three hard-gated fields confirmed.
        confirmedFields: [
          {
            fieldCode: "model",
            confirmedBy: ID.USER.danaHandler,
            confirmedAt: at,
          },
        ],
        catalogEntryId: null,
        containerId: null,
        dateCodeDecode: null,
        damageAssessment: {
          batteryRecordId: ID.BATTERY.midReviewSpread,
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
          assessedAt: at,
          assessedBy: ID.USER.danaHandler,
          confirmedBy: ID.USER.danaHandler,
          confirmedAt: at,
          clearingPhotoIntakePhotoId: null,
          supersedesDamageAssessmentId: null,
        },
        conditionOutcome: {
          assessedCondition: "sound",
          ddrFlags: [],
          isAirTransportProhibited: false,
          conditionRuleVersionId: null,
          conditionConfirmedBy: ID.USER.danaHandler,
          conditionConfirmedAt: at,
        },
        classificationDecision: null,
        storageClock: null,
        joinStorageClockId: null,
        storageEvent: null,
        containerAccumulationStartedAt: null,
        auditEvents: [],
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("shipment offer", () => {
  it("refuses to offer a shipment with no issued shipping paper (Rule 5.3)", async () => {
    // In Postgres a trigger refuses this transition; here the same refusal is
    // in code, so a screen built against the mock meets it at the same moment.
    await expect(
      mockAdapter.shipments.offer(HANDLER, ID.SHIPMENT.augustDraft, {
        offeredAt: "2026-08-19T10:00:00.000Z",
      }),
    ).rejects.toThrow(/no issued shipping paper/);
  });
});
