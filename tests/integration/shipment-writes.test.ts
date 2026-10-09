import { beforeEach, describe, expect, it } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import type {
  ShipmentTransportDetails,
  StorageWriteAttribution,
} from "@/data/contracts";
import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import type { ResolvedRule } from "@/domain/rules/resolve";
import { ACCUMULATION_RULE_KEY } from "@/domain/storage/placement";
import { readShippingPaperBuild } from "@/features/shipments/server/paper-build";
import {
  assembleShipment,
  changeShipmentContents,
  departShipment,
  generateShippingPaper,
  recordShipmentArrival,
  recordShipmentTransport,
} from "@/features/shipments/server/writes";
import { ConflictError, PermissionError, ValidationError } from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";
import type { Uuid } from "@/types/common";
import type { Container } from "@/types/storage";

/**
 * The shipment writes, end to end against the mock adapter, through the same
 * server functions the Server Actions call — `b1a-05-shipments`' "Done".
 *
 * **No fixture is edited.** The fixtures hold no verified 24-hour number, no
 * shipper certification rule and no labelled container a paper can be
 * generated for (the owner's call: prove generate, void and depart here, with
 * in-memory test data, and let the app show the blocked checklist). Each test
 * builds what it needs on a freshly reset store: a verified number, a
 * certification rule version whose text is test data, and containers labelled
 * as unit 06's label generation will label them. Every "now" is fixed.
 */

const AT = "2026-10-09T17:00:00.000Z";
const LATER = "2026-10-12T15:30:00.000Z";
const SOUND_START_DAY = "2026-07-28";

const NO_ATTRIBUTION: StorageWriteAttribution = {
  requestId: null,
  ipAddress: null,
  userAgent: null,
};

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-corr-shipments-0001",
    ...overrides,
  };
}

const HANDLER = ctx();
const ADMIN = ctx({
  userId: ID.USER.platformAdmin,
  role: "platform_admin",
  isPlatformAdmin: true,
});

const DESTINATION = {
  line1: "77 Terminal Road",
  line2: null,
  city: "Moses Lake",
  region: "WA",
  postalCode: "98837",
  country: "US",
};

function transport(
  overrides: Partial<ShipmentTransportDetails> = {},
): ShipmentTransportDetails {
  return {
    transportMode: "ground",
    destinationFacilityName: "Basin Materials Recovery",
    destinationAddress: DESTINATION,
    destinationIdentifier: "WA-RECV-000318",
    carrierName: "Coleridge Hauling",
    transporterIdentifier: null,
    ...overrides,
  };
}

let testRowSeq = 0;
function testId(): Uuid {
  testRowSeq += 1;
  return `0a0000ff-0000-4000-8000-${testRowSeq.toString(16).padStart(12, "0")}`;
}

// --- test data the fixtures do not carry ------------------------------------------------------

/** Cascade's number, verified by a person on a date inside its interval. In memory only. */
function verifyCascadeNumber(): void {
  const s = mockStore();
  s.organizations.replaceAll(
    s.organizations.all().map((org) =>
      org.id === ID.ORG.cascade
        ? {
            ...org,
            emergencyVerifiedAt: "2026-09-01T16:00:00.000Z",
            emergencyVerifiedBy: ID.USER.martaManager,
          }
        : org,
    ),
  );
}

const CERTIFICATION_TEXT =
  "TEST CERTIFICATION STATEMENT — test data, not regulatory text.";

/** A federal shipper-certification rule version. Its words are test data. */
function addCertificationRule(): void {
  const s = mockStore();
  const ruleId = testId();
  s.jurisdictionRules.replaceAll([
    ...s.jurisdictionRules.all(),
    {
      id: ruleId,
      jurisdictionId: ID.JURISDICTION.federal,
      ruleKey: "transport.shipper_certification",
      domain: "transport",
      title: "Shipper certification (test)",
      description: null,
      appliesToApplicationClasses: null,
      isActive: true,
      createdAt: "2025-12-01T00:00:00.000Z",
      updatedAt: "2025-12-01T00:00:00.000Z",
      createdBy: ID.USER.platformAdmin,
      updatedBy: ID.USER.platformAdmin,
    },
  ]);
  s.ruleVersions.replaceAll([
    ...s.ruleVersions.all(),
    {
      id: testId(),
      jurisdictionRuleId: ruleId,
      versionLabel: "test",
      effectiveOn: "2026-01-01",
      expiresOn: null,
      citation: "Shipper certification — test citation, not legal text",
      citationUrl: null,
      sourceDocumentRef: "test",
      payload: { statement: CERTIFICATION_TEXT },
      payloadSchemaKey: "transport.shipper_certification.v1",
      supersedesRuleVersionId: null,
      status: "active",
      publishedAt: "2025-12-15T00:00:00.000Z",
      publishedBy: ID.USER.platformAdmin,
      createdAt: "2025-12-01T00:00:00.000Z",
      createdBy: ID.USER.platformAdmin,
    },
  ]);
}

async function accumulationRuleOn(day: string): Promise<ResolvedRule> {
  const resolution = await mockAdapter.ruleVersions.resolve(HANDLER, {
    ruleKeys: [ACCUMULATION_RULE_KEY],
    jurisdictionId: ID.JURISDICTION.washington,
    asOf: day,
  });
  if (!resolution.ok) throw new Error(`no accumulation rule on ${day}`);
  const rule = resolution.resolved.rules[ACCUMULATION_RULE_KEY];
  if (rule === undefined) throw new Error("rule missing");
  return rule;
}

/** A label printed for the container's current start — what unit 06's label generation will write. */
async function label(containerId: Uuid): Promise<void> {
  const s = mockStore();
  const container = await s.containers.getOrThrow(HANDLER, containerId);
  if (container.accumulationStartedAt === null) {
    throw new Error("label: the container has no start");
  }
  const renderId = testId();
  const labelId = testId();
  s.documentRenders.replaceAll([
    ...s.documentRenders.all(),
    {
      id: renderId,
      organizationId: ID.ORG.cascade,
      documentType: "container_label",
      shipmentId: null,
      containerId,
      batteryRecordId: null,
      evidencePackId: null,
      templateKey: "container_label.test",
      templateVersion: "test",
      rendererName: "test",
      rendererVersion: "test",
      inputSnapshot: {},
      inputSnapshotHash: "",
      verificationCode: "",
      ruleVersionsApplied: [],
      storageObjectPath: "",
      contentHash: "",
      byteSize: 0,
      pageCount: null,
      renderedAt: AT,
      renderedBy: ID.USER.danaHandler,
      renderDurationMs: null,
      status: "issued",
      supersedesDocumentRenderId: null,
      supersededAt: null,
      createdAt: AT,
    },
  ]);
  s.containerLabels.replaceAll([
    ...s.containerLabels.all(),
    {
      id: labelId,
      organizationId: ID.ORG.cascade,
      containerId,
      documentRenderId: renderId,
      labelText: "TEST LABEL",
      contentsDescription: "Test contents",
      accumulationStartedAt: container.accumulationStartedAt,
      handlerIdentifier: null,
      qrPayloadUrl: `https://example.test/containers/${containerId}`,
      governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
      evaluationTrace: [],
      supersedesContainerLabelId: null,
      generatedAt: AT,
      generatedBy: ID.USER.danaHandler,
      createdAt: AT,
    },
  ]);
  await s.containers.update(HANDLER, containerId, {
    currentContainerLabelId: labelId,
  });
}

/** A second vehicle pack in the sound drum, with its assessment and decision — test rows. */
function anotherVehiclePack(): BatteryRecord {
  const s = mockStore();
  const source = s.batteryRecords
    .all()
    .find((record) => record.id === ID.BATTERY.vehicleTraction);
  const assessment = s.damageAssessments
    .all()
    .find((row) => row.id === ID.DAMAGE.vehicleSound);
  const decision = s.classificationDecisions
    .all()
    .find((row) => row.id === ID.CLASSIFICATION.vehicleTraction);
  if (
    source === undefined ||
    assessment === undefined ||
    decision === undefined
  ) {
    throw new Error("fixture vehicle pack missing");
  }
  const record: BatteryRecord = {
    ...source,
    id: testId(),
    recordNumber: "BR-0901",
    serialNumber: "TEST-SERIAL-0901",
    batteryMassKg: "455.500",
  };
  s.batteryRecords.replaceAll([...s.batteryRecords.all(), record]);
  s.damageAssessments.replaceAll([
    ...s.damageAssessments.all(),
    { ...assessment, id: testId(), batteryRecordId: record.id },
  ]);
  s.classificationDecisions.replaceAll([
    ...s.classificationDecisions.all(),
    { ...decision, id: testId(), batteryRecordId: record.id },
  ]);
  return record;
}

/** A fresh container holding the given sound-drum packs, its start carried from the drum, and labelled. */
async function labelledContainerHolding(
  recordIds: readonly Uuid[],
  location: string,
): Promise<Container> {
  const fresh = await mockAdapter.containers.create(HANDLER, {
    containerType: "light_category_sound",
    lotId: null,
    shipmentId: null,
    capacityKg: "900.000",
    capacityVolumeM3: null,
    siteAddress: null,
    siteTimeZone: "America/Los_Angeles",
    storageLocation: location,
    status: "open",
    sealedAt: null,
    closedAt: null,
  });
  await mockAdapter.containers.moveContents(HANDLER, {
    operation: "move",
    sourceContainerId: ID.CONTAINER.soundDrum,
    targetContainerId: fresh.id,
    batteryRecordIds: recordIds,
    at: AT,
    accumulationRule: await accumulationRuleOn(SOUND_START_DAY),
    attribution: NO_ATTRIBUTION,
  });
  await label(fresh.id);
  return mockStore().containers.getOrThrow(HANDLER, fresh.id);
}

function runningClockOf(containerId: Uuid) {
  return mockStore()
    .storageClocks.all()
    .find(
      (clock) => clock.containerId === containerId && clock.stoppedAt === null,
    );
}

function auditRows(eventType: string, entityId?: Uuid) {
  return mockStore()
    .auditEvents.all()
    .filter(
      (row) =>
        row.eventType === eventType &&
        (entityId === undefined || row.entityId === entityId),
    );
}

beforeEach(() => {
  resetMockStore();
});

// ---------------------------------------------------------------------------------------------

describe("ship a container end to end (Flow B; Rules 4.7, 5.12, 5.17, 5.18, 5.26)", () => {
  it("assembles, issues the builder's paper, departs — stopping only what left — and arrives", async () => {
    verifyCascadeNumber();
    addCertificationRule();
    const shipped = await labelledContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Test bay — shipped",
    );

    const shipment = await assembleShipment(
      HANDLER,
      { containerIds: [shipped.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    // T-28 — derived from the checklist, not declared.
    expect(shipment.status).toBe("ready");
    expect(auditRows("shipment.created", shipment.id)).toHaveLength(1);

    // The paper's content equals the checklist's builder output.
    const { build } = await readShippingPaperBuild(HANDLER, shipment, AT);
    expect(build.kind).toBe("complete");
    if (build.kind !== "complete") return;
    const issued = await generateShippingPaper(
      HANDLER,
      shipment.id,
      AT,
      NO_ATTRIBUTION,
    );
    expect(issued.shipment.status).toBe("documents_issued");
    expect(issued.shippingPaper.lines).toEqual(build.outcome.result.lines);
    expect(issued.documentRender.inputSnapshot).toEqual(build.outcome.result);
    expect(issued.shippingPaper.basicDescription).toBe(
      "UN3480, Lithium ion batteries, 9",
    );
    expect(issued.shippingPaper.emergencyResponsePhone).toBe("+1-800-555-0142");
    expect(issued.shippingPaper.shipperCertificationText).toBe(
      CERTIFICATION_TEXT,
    );
    expect(issued.documentRender.status).toBe("issued");
    expect(issued.documentRender.documentType).toBe("shipping_paper");
    expect(
      auditRows("document_render.issued", issued.documentRender.id),
    ).toHaveLength(1);

    // Departure stops the clock of what left, and nothing else's.
    const shippedClock = runningClockOf(shipped.id);
    const soundDrumClock = runningClockOf(ID.CONTAINER.soundDrum);
    const quarantineClock = runningClockOf(ID.CONTAINER.quarantineDrum);
    expect(shippedClock).toBeDefined();
    expect(soundDrumClock).toBeDefined();

    const departure = await departShipment(
      HANDLER,
      shipment.id,
      LATER,
      NO_ATTRIBUTION,
    );
    expect(departure.stoppedClockIds).toEqual([shippedClock?.id]);
    expect(departure.shippedRecordIds).toEqual([ID.BATTERY.vehicleTraction]);
    expect(departure.shipment).toMatchObject({
      status: "dispatched",
      shippedAt: LATER,
      // Read from the federal retention rule version — never a literal.
      retentionExpiresOn: "2029-10-12",
      retentionRuleVersionId: ID.RULE_VERSION.federalRetention2026,
    });
    expect(runningClockOf(shipped.id)).toBeUndefined();
    const stopped = mockStore()
      .storageClocks.all()
      .find((clock) => clock.id === shippedClock?.id);
    expect(stopped).toMatchObject({
      status: "stopped",
      stoppedAt: LATER,
      stopReason: "shipped",
    });
    // The sound drum still holds the mobility pack, and its clock still runs.
    expect(runningClockOf(ID.CONTAINER.soundDrum)?.id).toBe(soundDrumClock?.id);
    expect(runningClockOf(ID.CONTAINER.quarantineDrum)?.id).toBe(
      quarantineClock?.id,
    );
    const record = await mockAdapter.batteryRecords.get(
      HANDLER,
      ID.BATTERY.vehicleTraction,
    );
    expect(record?.status).toBe("shipped");
    expect(
      (await mockAdapter.containers.get(HANDLER, shipped.id))?.status,
    ).toBe("shipped");

    // Arrival closes the shipment and its records (Rule 5.26).
    const closed = await recordShipmentArrival(
      HANDLER,
      { shipmentId: shipment.id, receivedConfirmationRef: "RCPT-TEST-1" },
      LATER,
      NO_ATTRIBUTION,
    );
    expect(closed.status).toBe("closed");
    expect(
      (
        await mockAdapter.batteryRecords.get(
          HANDLER,
          ID.BATTERY.vehicleTraction,
        )
      )?.status,
    ).toBe("closed");
  });

  it("refuses departure of a shipment with no issued paper", async () => {
    verifyCascadeNumber();
    addCertificationRule();
    const container = await labelledContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Test bay — early",
    );
    const shipment = await assembleShipment(
      HANDLER,
      { containerIds: [container.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    await expect(
      departShipment(HANDLER, shipment.id, LATER, NO_ATTRIBUTION),
    ).rejects.toThrow(/no issued shipping paper/);
    expect(runningClockOf(container.id)).toBeDefined();
  });

  it("issues nothing while a precondition is unmet, and names the count", async () => {
    // No verification, no certification rule: the fixtures as they stand.
    const container = await labelledContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Test bay — blocked",
    );
    const shipment = await assembleShipment(
      HANDLER,
      { containerIds: [container.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    expect(shipment.status).toBe("draft");
    const { build } = await readShippingPaperBuild(HANDLER, shipment, AT);
    expect(build.checklist.unmet).toEqual(["emergency_contact", "rule_data"]);
    await expect(
      generateShippingPaper(HANDLER, shipment.id, AT, NO_ATTRIBUTION),
    ).rejects.toThrow(/2 preconditions are unmet/);
    expect(
      mockStore()
        .shippingPapers.all()
        .filter((paper) => paper.shipmentId === shipment.id),
    ).toHaveLength(0);
  });
});

describe("a contents change voids an issued paper and keeps it (Rules 5.13–5.15)", () => {
  it("voids with the reason and the actor, returns to regeneration, and the correction references it", async () => {
    verifyCascadeNumber();
    addCertificationRule();
    const second = anotherVehiclePack();
    const first = await labelledContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Test bay — A",
    );
    const pulled = await labelledContainerHolding([second.id], "Test bay — B");

    const shipment = await assembleShipment(
      HANDLER,
      { containerIds: [first.id, pulled.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    const issued = await generateShippingPaper(
      HANDLER,
      shipment.id,
      AT,
      NO_ATTRIBUTION,
    );
    expect(issued.shippingPaper.lines?.[0]?.numberAndTypeOfPackages).toContain(
      "2 containers",
    );

    // A void records its reason.
    await expect(
      changeShipmentContents(
        HANDLER,
        { shipmentId: shipment.id, containerIds: [first.id], reason: null },
        LATER,
        NO_ATTRIBUTION,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const changed = await changeShipmentContents(
      HANDLER,
      {
        shipmentId: shipment.id,
        containerIds: [first.id],
        reason: "One drum pulled off the truck at the dock.",
      },
      LATER,
      NO_ATTRIBUTION,
    );
    expect(changed.voidedDocumentRenderId).toBe(issued.documentRender.id);
    expect(changed.removedContainerIds).toEqual([pulled.id]);
    // Back to a state requiring regeneration — and, its checklist met, ready.
    expect(changed.shipment.status).toBe("ready");

    // Retained, marked void, still readable.
    const voided = await mockAdapter.documentRenders.get(
      HANDLER,
      issued.documentRender.id,
    );
    expect(voided?.status).toBe("voided");
    expect(
      await mockAdapter.shippingPapers.get(HANDLER, issued.shippingPaper.id),
    ).toEqual(issued.shippingPaper);
    const [voidRow] = auditRows(
      "document_render.voided",
      issued.documentRender.id,
    );
    expect(voidRow?.reason).toBe("One drum pulled off the truck at the dock.");
    expect(voidRow?.actorUserId).toBe(ID.USER.danaHandler);
    expect(
      (await mockAdapter.containers.get(HANDLER, pulled.id))?.shipmentId,
    ).toBeNull();

    // The correction is a new paper that references the voided one.
    const corrected = await generateShippingPaper(
      HANDLER,
      shipment.id,
      LATER,
      NO_ATTRIBUTION,
    );
    expect(corrected.shippingPaper.supersedesShippingPaperId).toBe(
      issued.shippingPaper.id,
    );
    expect(corrected.documentRender.supersedesDocumentRenderId).toBe(
      issued.documentRender.id,
    );
    expect(corrected.shippingPaper.lines?.[0]?.records).toHaveLength(1);
  });

  it("never re-issues over a current paper (Rule 5.12)", async () => {
    verifyCascadeNumber();
    addCertificationRule();
    const container = await labelledContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Test bay — twice",
    );
    const shipment = await assembleShipment(
      HANDLER,
      { containerIds: [container.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    await generateShippingPaper(HANDLER, shipment.id, AT, NO_ATTRIBUTION);
    await expect(
      generateShippingPaper(HANDLER, shipment.id, AT, NO_ATTRIBUTION),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("air is refused server-side for a shipment holding a damaged record (Rules 6.7, 6.8, 12.6)", () => {
  async function shipmentHoldingTheSwollenPack() {
    await label(ID.CONTAINER.quarantineDrum);
    return assembleShipment(
      HANDLER,
      {
        containerIds: [ID.CONTAINER.quarantineDrum],
        transport: transport(),
      },
      AT,
      NO_ATTRIBUTION,
    );
  }

  it("refuses the mode, records the reason on the shipment, and audits the attempt", async () => {
    const shipment = await shipmentHoldingTheSwollenPack();
    await expect(
      recordShipmentTransport(
        HANDLER,
        {
          shipmentId: shipment.id,
          transport: transport({ transportMode: "air" }),
        },
        LATER,
        NO_ATTRIBUTION,
      ),
    ).rejects.toThrow(/BR-0003 \(swelling\)/);

    const after = await mockAdapter.shipments.get(HANDLER, shipment.id);
    expect(after?.transportMode).toBe("ground");
    expect(after?.airTransportBlockedReason).toContain(
      "Air transport is not available",
    );
    const [denial] = auditRows("denial.recorded", shipment.id);
    expect(denial).toMatchObject({
      entityTable: "shipment",
      actorUserId: ID.USER.danaHandler,
    });
    expect(denial?.reason).toContain("BR-0003");
  });

  it("refuses P6 exactly as it refuses P1 — there is no override", async () => {
    const shipment = await shipmentHoldingTheSwollenPack();
    await expect(
      recordShipmentTransport(
        ADMIN,
        {
          shipmentId: shipment.id,
          transport: transport({ transportMode: "air" }),
        },
        LATER,
        NO_ATTRIBUTION,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(auditRows("denial.recorded", shipment.id)).toHaveLength(1);
  });

  it("refuses an air assembly holding a damaged record, before anything is written", async () => {
    await label(ID.CONTAINER.quarantineDrum);
    const before = mockStore().shipments.all().length;
    await expect(
      assembleShipment(
        HANDLER,
        {
          containerIds: [ID.CONTAINER.quarantineDrum],
          transport: transport({ transportMode: "air" }),
        },
        AT,
        NO_ATTRIBUTION,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockStore().shipments.all()).toHaveLength(before);
    expect(auditRows("denial.recorded")).toHaveLength(1);
  });

  it("blocks departure while the damaged/defective packet is absent (Rule 6.16)", async () => {
    verifyCascadeNumber();
    addCertificationRule();
    const shipment = await shipmentHoldingTheSwollenPack();
    await generateShippingPaper(HANDLER, shipment.id, AT, NO_ATTRIBUTION);
    await expect(
      departShipment(HANDLER, shipment.id, LATER, NO_ATTRIBUTION),
    ).rejects.toThrow(/damaged\/defective packet/);
    expect(runningClockOf(ID.CONTAINER.quarantineDrum)).toBeDefined();
  });
});

describe("step 1's refusals hold at the adapter (Rules 4.19, 4.22, 5.25)", () => {
  it("refuses an unlabeled container with its reason", async () => {
    await expect(
      assembleShipment(
        HANDLER,
        {
          containerIds: [ID.CONTAINER.quarantineDrum],
          transport: transport(),
        },
        AT,
        NO_ATTRIBUTION,
      ),
    ).rejects.toThrow(/no label in force/);
  });

  it("refuses an empty container", async () => {
    await expect(
      assembleShipment(
        HANDLER,
        { containerIds: [ID.CONTAINER.overdueDrum], transport: transport() },
        AT,
        NO_ATTRIBUTION,
      ),
    ).rejects.toThrow(/holds nothing/);
  });

  it("refuses a container already on another open shipment, naming it", async () => {
    const container = await labelledContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Test bay — twice-assigned",
    );
    const first = await assembleShipment(
      HANDLER,
      { containerIds: [container.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    await expect(
      assembleShipment(
        HANDLER,
        { containerIds: [container.id], transport: transport() },
        AT,
        NO_ATTRIBUTION,
      ),
    ).rejects.toThrow(new RegExp(`already on ${first.shipmentNumber}`));
  });
});

describe("a handler cannot set a shipping identifier; P6 can, with a reason (Rule 5.9; D-50)", () => {
  it("strips the transport identity from a handler's update", async () => {
    await mockAdapter.catalogEntries.update(
      HANDLER,
      ID.CATALOG.mobilityScooterSla,
      { unIdentifier: "un3480", hazardClass: "9" } as never,
    );
    const entry = await mockAdapter.catalogEntries.get(
      HANDLER,
      ID.CATALOG.mobilityScooterSla,
    );
    expect(entry?.unIdentifier).toBeNull();
    expect(entry?.hazardClass).toBeNull();
  });

  it("refuses a handler's identity edit, and a handler's entry that carries identifiers", async () => {
    await expect(
      mockAdapter.catalogEntries.editTransportIdentity(
        HANDLER,
        ID.CATALOG.mobilityScooterSla,
        {
          unIdentifier: "un3480",
          properShippingName: "Typed by a handler",
          hazardClass: "9",
          packingGroup: "not_applicable",
          reason: "Trying",
          at: AT,
          attribution: NO_ATTRIBUTION,
        },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
    expect(auditRows("catalog_entry.updated")).toHaveLength(0);

    const source = mockStore()
      .catalogEntries.all()
      .find((entry) => entry.id === ID.CATALOG.vehicleTractionNmc);
    if (source === undefined) throw new Error("fixture entry missing");
    await expect(
      mockAdapter.catalogEntries.create(HANDLER, {
        organizationId: ID.ORG.cascade,
        manufacturerName: "Test",
        brandName: null,
        modelName: "T-1",
        partNumber: "T-1",
        gtin: null,
        applicationClass: source.applicationClass,
        removability: source.removability,
        chemistry: source.chemistry,
        cellFormFactor: null,
        nominalVoltageV: null,
        ratedCapacityAh: null,
        ratedEnergyWh: null,
        massKg: null,
        unIdentifier: "un3480",
        properShippingName: null,
        hazardClass: null,
        packingGroup: "not_applicable",
        un383SummaryUrl: null,
        labelTextPatterns: null,
        dateCodeFormatKey: null,
        sourceType: "handler_proposed",
        sourceUrl: null,
        status: "proposed",
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("P6 edits the identity with a reason, audited with the before and after", async () => {
    const updated = await mockAdapter.catalogEntries.editTransportIdentity(
      ADMIN,
      ID.CATALOG.laptopCellLco,
      {
        unIdentifier: "un3481",
        properShippingName: "Lithium ion batteries contained in equipment",
        hazardClass: "9",
        packingGroup: "ii",
        reason: "Packing group corrected against the manufacturer datasheet.",
        at: AT,
        attribution: NO_ATTRIBUTION,
      },
    );
    expect(updated.packingGroup).toBe("ii");
    const [row] = auditRows("catalog_entry.updated", ID.CATALOG.laptopCellLco);
    expect(row).toMatchObject({
      actorUserId: ID.USER.platformAdmin,
      actorType: "platform_admin",
      reason: "Packing group corrected against the manufacturer datasheet.",
      beforeState: expect.objectContaining({ packingGroup: "not_applicable" }),
      afterState: expect.objectContaining({ packingGroup: "ii" }),
      changedFields: ["packingGroup"],
    });
  });

  it("refuses P6 without a reason, and an edit that changes nothing", async () => {
    const edit = {
      unIdentifier: "un3481" as const,
      properShippingName: "Lithium ion batteries contained in equipment",
      hazardClass: "9",
      packingGroup: "not_applicable" as const,
      at: AT,
      attribution: NO_ATTRIBUTION,
    };
    await expect(
      mockAdapter.catalogEntries.editTransportIdentity(
        ADMIN,
        ID.CATALOG.laptopCellLco,
        { ...edit, packingGroup: "ii", reason: "  " },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      mockAdapter.catalogEntries.editTransportIdentity(
        ADMIN,
        ID.CATALOG.laptopCellLco,
        { ...edit, reason: "No change" },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
