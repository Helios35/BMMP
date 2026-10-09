import type { RequestContext } from "@/data/contracts/context";
import type {
  CreateShipment,
  IssuedShippingPaper,
  ShipmentArrival,
  ShipmentAssembly,
  ShipmentContentsChange,
  ShipmentContentsChangeResult,
  ShipmentDeparture,
  ShipmentDepartureResult,
  ShipmentReadiness,
  ShipmentTransportChange,
  ShipmentTransportDetails,
  ShippingPaperIssue,
  ShippingPaperVoid,
  VoidedShippingPaper,
} from "@/data/contracts/documents";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import type { BatteryRecord } from "@/types/battery-record";
import type {
  IsoTimestamp,
  JsonObject,
  PostalAddress,
  Uuid,
} from "@/types/common";
import type {
  DocumentRender,
  Shipment,
  ShippingPaper,
} from "@/types/documents";
import type { Container, StorageClock } from "@/types/storage";
import { isInForceOn } from "@/domain/rules/resolve";
import { civilDateInZone } from "@/domain/storage/clock-display";
import {
  containerLabelFlags,
  labelInForce,
} from "@/domain/storage/container-label-flags";
import type { ShipmentStatus } from "@/domain/taxonomy/shipment-status";
import {
  airTransportRefusal,
  assessAirTransport,
  type AirTransportAssessment,
  type AirTransportSubject,
} from "@/domain/transport/air-transport";
import {
  admitContainerToShipment,
  type ShipmentAdmissionTarget,
  type ShipmentContainerFacts,
} from "@/domain/transport/container-admission";
import {
  admitArrival,
  admitDeparture,
  shipmentRetention,
} from "@/domain/transport/departure";
import { emergencyVerification } from "@/domain/transport/emergency-verification";
import { SHIPMENT_RETENTION_RULE_KEY } from "@/domain/transport/rule-data";
import type { ShippingPaperPayload } from "@/domain/transport/shipping-paper";
import { addDecimal } from "@/domain/units";
import {
  ConflictError,
  DataIntegrityError,
  RuleResolutionError,
  ValidationError,
} from "@/lib/errors";

import { writeTriggerAudit as audit } from "./audit-row";
import {
  DOCUMENTS_BUCKET,
  recordRenderFailure,
  writeRender,
} from "./document-writes";
import { now } from "./factory";
import { formatRecordNumber, nextId, nextSequenceNumber } from "./ids";
import { hasStoredObject, snapshotObjects } from "./object-store";
import { assertPolicy } from "./policy";
import { mockStore } from "./store";
import { contentsOf } from "./storage-writes";

/**
 * The shipment writes that are wider than CRUD — `ShipmentRepository`'s
 * `assemble`, `changeContents`, `recordTransport`, `settleReadiness`,
 * `issueShippingPaper`, `recordDeparture` and `recordArrival`.
 *
 * **Each is one operation, all or nothing**, as `./storage-writes.ts`'s are:
 * check every precondition the rows can show, snapshot every table the write
 * can touch, write, and on any failure put every table back. Audit rows go in
 * through the `security definer` door, because in Postgres a trigger writes
 * them (`ERD.md` §10.2).
 *
 * **This module is the authority on the rows, and the domain is the authority
 * on the rules.** Step 1's refusals, the air block and departure's
 * preconditions are the pure functions in `src/domain/transport`, run here
 * against what the store holds — so the screen's reason and the server's
 * refusal are the same sentence. **The air block has no parameter that admits
 * it, for any role** (Rule 6.8): an air request holding a damaged, defective
 * or recalled record is refused, recorded and audited before anything moves.
 */

const store = () => mockStore();

/** Shipments that have not departed, and so hold their containers (Rule 5.25). */
const OPEN_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "draft",
  "ready",
  "documents_issued",
];

/** Where the stored clock stop says why it stopped. Free text in `ERD.md` §6.3, as `emptied` is. */
const DEPARTURE_STOP_REASON = "shipped";

// --- the row builder, shared with the repository's `create` ---------------------------------

/** A new shipment row — the sequence-numbered identity, and nothing a caller may set. */
export function buildShipmentRow(
  ctx: RequestContext,
  input: CreateShipment,
  id: Uuid,
): Shipment {
  const organization = store()
    .organizations.all()
    .find((org) => org.id === ctx.organizationId);
  const seq = nextSequenceNumber(
    ctx.organizationId,
    "shipment",
    organization?.shipmentSeq ?? 0,
  );
  return {
    ...input,
    id,
    organizationId: ctx.organizationId,
    shipmentNumber: formatRecordNumber("SH", seq),
    airTransportBlockedReason: null,
    totalMassKg: null,
    totalEnergyWh: null,
    offeredAt: null,
    shippedAt: null,
    receivedAt: null,
    receivedConfirmationRef: null,
    retentionExpiresOn: null,
    retentionRuleVersionId: null,
    createdAt: now(),
    updatedAt: now(),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  };
}

// --- all or nothing --------------------------------------------------------------------------

function snapshot(): () => void {
  const s = store();
  const tables = [
    s.shipments,
    s.containers,
    s.batteryRecords,
    s.storageClocks,
    s.alerts,
    s.shippingPapers,
    s.documentRenders,
    s.auditEvents,
  ] as const;
  const saved = tables.map((table) => [...table.all()]);
  // Bytes a rolled-back issue stored go with it: never a row pointing at
  // bytes that are not there, and never bytes no row answers for.
  const restoreObjects = snapshotObjects();
  return () => {
    tables.forEach((table, index) => {
      (table.replaceAll as (rows: readonly unknown[]) => void)(
        saved[index] ?? [],
      );
    });
    restoreObjects();
  };
}

async function atomically<T>(write: () => Promise<T>): Promise<T> {
  const restore = snapshot();
  try {
    return await write();
  } catch (cause) {
    restore();
    throw cause;
  }
}

// --- reading what the rows say ----------------------------------------------------------------

function containersOf(ctx: RequestContext, shipmentId: Uuid): Container[] {
  return store()
    .containers.all()
    .filter(
      (container) =>
        container.organizationId === ctx.organizationId &&
        container.shipmentId === shipmentId,
    );
}

function recordsIn(
  ctx: RequestContext,
  containers: readonly Container[],
): BatteryRecord[] {
  return containers.flatMap((container) => contentsOf(ctx, container.id));
}

/** The record's current, human-confirmed damage assessment's findings — or null when it has none (Rule 6.1). */
function currentFindings(
  ctx: RequestContext,
  recordId: Uuid,
): readonly string[] | null {
  const current = store()
    .damageAssessments.all()
    .filter(
      (assessment) =>
        assessment.organizationId === ctx.organizationId &&
        assessment.batteryRecordId === recordId &&
        (assessment.status === "assessed_sound" ||
          assessment.status === "assessed_damaged"),
    )
    .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt))[0];
  return current === undefined ? null : current.findingTypes;
}

function conditionCitation(record: BatteryRecord): string | null {
  if (record.conditionRuleVersionId === null) return null;
  return (
    store()
      .ruleVersions.all()
      .find((version) => version.id === record.conditionRuleVersionId)
      ?.citation ?? null
  );
}

export function airSubject(
  ctx: RequestContext,
  record: BatteryRecord,
): AirTransportSubject {
  return {
    recordId: record.id,
    recordNumber: record.recordNumber,
    ddrFlags: record.ddrFlags,
    isAirTransportProhibited: record.isAirTransportProhibited,
    currentFindings: currentFindings(ctx, record.id) ?? [],
    citation: conditionCitation(record),
  };
}

function openShipmentNumber(
  ctx: RequestContext,
  container: Container,
  exceptShipmentId: Uuid | null,
): { readonly shipmentNumber: string } | null {
  if (container.shipmentId === null) return null;
  if (container.shipmentId === exceptShipmentId) return null;
  const shipment = store()
    .shipments.all()
    .find(
      (row) =>
        row.id === container.shipmentId &&
        row.organizationId === ctx.organizationId,
    );
  if (shipment === undefined) return null;
  if (!OPEN_SHIPMENT_STATUSES.includes(shipment.status)) return null;
  return { shipmentNumber: shipment.shipmentNumber };
}

/** A container as step 1's admission reads it, from the rows. */
export function shipmentContainerFacts(
  ctx: RequestContext,
  container: Container,
  exceptShipmentId: Uuid | null,
): ShipmentContainerFacts {
  const contents = contentsOf(ctx, container.id);
  const labels = store()
    .containerLabels.all()
    .filter(
      (label) =>
        label.organizationId === ctx.organizationId &&
        label.containerId === container.id,
    );
  const label = labelInForce(container.currentContainerLabelId, labels);
  return {
    id: container.id,
    organizationId: container.organizationId,
    containerCode: container.containerCode,
    status: container.status,
    containerType: container.containerType,
    siteTimeZone: container.siteTimeZone,
    siteAddress: container.siteAddress,
    labelFlags: containerLabelFlags({
      contentCount: contents.length,
      currentContainerLabelId: container.currentContainerLabelId,
      accumulationStartedAt: container.accumulationStartedAt,
      label,
    }),
    contents: contents.map((record) => ({
      recordId: record.id,
      recordNumber: record.recordNumber,
      ddrFlags: record.ddrFlags,
      isAirTransportProhibited: record.isAirTransportProhibited,
      hasDamageAssessment: currentFindings(ctx, record.id) !== null,
    })),
    onOtherOpenShipment: openShipmentNumber(ctx, container, exceptShipmentId),
  };
}

function siteOf(container: Container) {
  return {
    siteTimeZone: container.siteTimeZone,
    siteAddress: container.siteAddress,
  };
}

function organizationOf(ctx: RequestContext) {
  const organization = store()
    .organizations.all()
    .find((org) => org.id === ctx.organizationId);
  if (organization === undefined) {
    throw new DataIntegrityError({
      userMessage: "Your organization could not be read. Nothing was changed.",
      correlationId: ctx.correlationId,
    });
  }
  return organization;
}

function sameIds(a: readonly Uuid[], b: readonly Uuid[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function unique(ids: readonly Uuid[]): Uuid[] {
  return [...new Set(ids)];
}

function trimmedTransport(
  transport: ShipmentTransportDetails,
): ShipmentTransportDetails {
  const blankToNull = (value: string | null) =>
    value === null || value.trim() === "" ? null : value.trim();
  return {
    transportMode: transport.transportMode,
    destinationFacilityName: transport.destinationFacilityName.trim(),
    destinationAddress: transport.destinationAddress,
    destinationIdentifier: blankToNull(transport.destinationIdentifier),
    carrierName: transport.carrierName.trim(),
    transporterIdentifier: blankToNull(transport.transporterIdentifier),
  };
}

function requireTransportDetails(
  ctx: RequestContext,
  transport: ShipmentTransportDetails,
): void {
  const required: readonly [string, string][] = [
    ["destinationFacilityName", transport.destinationFacilityName],
    ["carrierName", transport.carrierName],
    ["destinationAddress", transport.destinationAddress.line1],
  ];
  for (const [field, value] of required) {
    if (value.trim() === "") {
      throw new ValidationError({
        userMessage:
          "Record the destination facility, its address and the carrier before the shipment is saved.",
        correlationId: ctx.correlationId,
        field,
      });
    }
  }
}

// --- the air block, refused and audited ------------------------------------------------------

/**
 * Rule 12.6 — an attempted air selection is evidence. The refusal is written
 * **outside** the all-or-nothing block, because the operation it refused is
 * the one that rolls back, and the record of the attempt must not roll back
 * with it.
 */
async function refuseAir(
  ctx: RequestContext,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
  assessment: Extract<AirTransportAssessment, { readonly available: false }>,
  shipment: Shipment | null,
  attempted: string,
): Promise<never> {
  const message = airTransportRefusal(assessment);
  if (shipment !== null) {
    await store().shipments.update(ctx, shipment.id, {
      airTransportBlockedReason: message,
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
  }
  await audit(ctx, at, attribution, {
    eventType: "denial.recorded",
    entityTable: shipment === null ? "user" : "shipment",
    entityId: shipment === null ? ctx.userId : shipment.id,
    beforeState: null,
    afterState: {
      attempted,
      transportMode: "air",
      outcome: "rejected",
      blockingRecordIds: assessment.blockingRecords.map(
        (record) => record.recordId,
      ),
    },
    reason: `air_transport_blocked:${assessment.blockingRecords.map((record) => record.recordNumber).join(",")}`,
  });
  throw new ValidationError({
    userMessage: message,
    correlationId: ctx.correlationId,
    field: "transportMode",
    context: { rule: "6.7" },
  });
}

function refuseAdmission(ctx: RequestContext, message: string): never {
  throw new ValidationError({
    userMessage: message,
    correlationId: ctx.correlationId,
    field: "containerIds",
  });
}

// --- assemble ----------------------------------------------------------------------------------

export async function assemble(
  ctx: RequestContext,
  input: ShipmentAssembly,
): Promise<Shipment> {
  assertPolicy(ctx, "shipment", "insert");
  assertPolicy(ctx, "container", "update");

  const transport = trimmedTransport(input.transport);
  requireTransportDetails(ctx, transport);
  const containerIds = unique(input.containerIds);
  if (containerIds.length === 0) {
    refuseAdmission(ctx, "Choose at least one container to ship.");
  }

  const s = store();
  const containers: Container[] = [];
  for (const id of containerIds) {
    containers.push(await s.containers.getOrThrow(ctx, id));
  }

  // Rules 6.7, 6.8 — refused before anything is written, and audited.
  const air = assessAirTransport(
    recordsIn(ctx, containers).map((record) => airSubject(ctx, record)),
  );
  if (transport.transportMode === "air" && !air.available) {
    await refuseAir(ctx, input.at, input.attribution, air, null, "assemble");
  }

  const [first] = containers;
  const target: ShipmentAdmissionTarget = {
    organizationId: ctx.organizationId,
    transportMode: transport.transportMode,
    origin: first === undefined ? null : siteOf(first),
  };
  for (const container of containers) {
    const admission = admitContainerToShipment(
      shipmentContainerFacts(ctx, container, null),
      target,
    );
    if (!admission.ok) refuseAdmission(ctx, admission.message);
  }

  const organization = organizationOf(ctx);
  const origin: PostalAddress =
    first?.siteAddress ?? organization.primaryAddress;

  return atomically(async () => {
    const row = buildShipmentRow(
      ctx,
      {
        status: "draft",
        originAddress: origin,
        destinationFacilityName: transport.destinationFacilityName,
        destinationAddress: transport.destinationAddress,
        destinationIdentifier: transport.destinationIdentifier,
        transporterName: null,
        transporterIdentifier: transport.transporterIdentifier,
        carrierName: transport.carrierName,
        // Rule 5.20 — no exception is applied until one is determined.
        packagingExceptions: ["none"],
        transportMode: transport.transportMode,
        classificationDecisionId: null,
      },
      nextId(),
    );
    const shipment = await s.shipments.insert(ctx, row);
    for (const container of containers) {
      await s.containers.update(ctx, container.id, {
        shipmentId: shipment.id,
        updatedAt: now(),
        updatedBy: ctx.userId,
      });
    }
    await audit(ctx, input.at, input.attribution, {
      eventType: "shipment.created",
      entityTable: "shipment",
      entityId: shipment.id,
      beforeState: null,
      afterState: {
        shipmentNumber: shipment.shipmentNumber,
        status: shipment.status,
        transportMode: shipment.transportMode,
        containerIds,
        destinationFacilityName: shipment.destinationFacilityName,
        carrierName: shipment.carrierName,
      },
    });
    return shipment;
  });
}

// --- changeContents -----------------------------------------------------------------------------

/** The paper currently describing a shipment, where one is issued: its newest, with its render. */
function currentPaper(
  ctx: RequestContext,
  shipmentId: Uuid,
): { readonly paper: ShippingPaper; readonly render: DocumentRender } | null {
  const papers = store()
    .shippingPapers.all()
    .filter(
      (paper) =>
        paper.organizationId === ctx.organizationId &&
        paper.shipmentId === shipmentId,
    )
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const [newest] = papers;
  if (newest === undefined) return null;
  const render = store()
    .documentRenders.all()
    .find((row) => row.id === newest.documentRenderId);
  return render === undefined ? null : { paper: newest, render };
}

/**
 * **The one predicate offer, departure and the paper tab's readiness stand
 * on**: the shipment's current paper is issued, and its bytes are stored and
 * hashed. A render without bytes is not a paper anything may travel with.
 */
export function currentIssuedPaperWithBytes(
  ctx: RequestContext,
  shipmentId: Uuid,
): { readonly paper: ShippingPaper; readonly render: DocumentRender } | null {
  const current = currentPaper(ctx, shipmentId);
  if (current === null) return null;
  const { render } = current;
  if (
    render.status !== "issued" ||
    render.contentHash === "" ||
    render.byteSize <= 0 ||
    !hasStoredObject(DOCUMENTS_BUCKET, render.storageObjectPath)
  ) {
    return null;
  }
  return current;
}

/**
 * Rules 5.13, 5.14 — the void, as both doors write it: the render marked
 * `voided` through the trigger's one update, kept in full with its bytes, the
 * reason and the actor on its `document_render.voided` row, and the shipment
 * back to `draft` for regeneration.
 */
async function voidIssuedPaper(
  ctx: RequestContext,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
  shipment: Shipment,
  issued: { readonly paper: ShippingPaper; readonly render: DocumentRender },
  reason: string,
  change: JsonObject,
): Promise<void> {
  await store().documentRenders.updateAsDefiner(ctx, issued.render.id, {
    status: "voided",
  });
  await audit(ctx, at, attribution, {
    eventType: "document_render.voided",
    entityTable: "document_render",
    entityId: issued.render.id,
    beforeState: { status: issued.render.status },
    afterState: {
      status: "voided",
      shipmentId: shipment.id,
      shippingPaperId: issued.paper.id,
      ...change,
    },
    changedFields: ["status"],
    reason,
  });
  await audit(ctx, at, attribution, {
    eventType: "shipment.status_changed",
    entityTable: "shipment",
    entityId: shipment.id,
    beforeState: { status: shipment.status },
    afterState: { status: "draft", ...change },
    changedFields: ["status"],
    reason,
  });
}

export async function changeContents(
  ctx: RequestContext,
  input: ShipmentContentsChange,
): Promise<ShipmentContentsChangeResult> {
  assertPolicy(ctx, "shipment", "update");
  assertPolicy(ctx, "container", "update");
  const s = store();
  const shipment = await s.shipments.getOrThrow(ctx, input.shipmentId);
  if (!OPEN_SHIPMENT_STATUSES.includes(shipment.status)) {
    throw new ConflictError({
      userMessage:
        "This shipment has departed or been closed. Its contents can no longer change.",
      correlationId: ctx.correlationId,
      context: { status: shipment.status },
    });
  }

  const current = containersOf(ctx, shipment.id);
  const currentIds = current.map((container) => container.id);
  const nextIds = unique(input.containerIds);
  const added = nextIds.filter((id) => !currentIds.includes(id));
  const removed = currentIds.filter((id) => !nextIds.includes(id));
  if (added.length === 0 && removed.length === 0) {
    throw new ValidationError({
      userMessage:
        "Nothing changed. The shipment holds those containers already.",
      correlationId: ctx.correlationId,
      field: "containerIds",
    });
  }

  const issued =
    shipment.status === "documents_issued"
      ? currentPaper(ctx, shipment.id)
      : null;
  const voids = issued !== null && issued.render.status === "issued";
  const reason = input.reason?.trim() ?? "";
  if (voids && reason === "") {
    throw new ValidationError({
      userMessage:
        "Changing the contents voids the issued shipping paper. State why — a void records its reason (Rule 5.14).",
      correlationId: ctx.correlationId,
      field: "reason",
    });
  }

  const addedContainers: Container[] = [];
  for (const id of added) {
    addedContainers.push(await s.containers.getOrThrow(ctx, id));
  }
  // Rule 6.13 — a damaged record cannot join an air shipment. Audited.
  if (shipment.transportMode === "air") {
    const air = assessAirTransport(
      recordsIn(ctx, addedContainers).map((record) => airSubject(ctx, record)),
    );
    if (!air.available) {
      await refuseAir(
        ctx,
        input.at,
        input.attribution,
        air,
        shipment,
        "changeContents",
      );
    }
  }
  const remaining = current.filter(
    (container) => !removed.includes(container.id),
  );
  const anchor = remaining[0] ?? addedContainers[0];
  const target: ShipmentAdmissionTarget = {
    organizationId: ctx.organizationId,
    transportMode: shipment.transportMode,
    origin: anchor === undefined ? null : siteOf(anchor),
  };
  for (const container of addedContainers) {
    const admission = admitContainerToShipment(
      shipmentContainerFacts(ctx, container, shipment.id),
      target,
    );
    if (!admission.ok) refuseAdmission(ctx, admission.message);
  }

  return atomically(async () => {
    for (const id of added) {
      await s.containers.update(ctx, id, {
        shipmentId: shipment.id,
        updatedAt: now(),
        updatedBy: ctx.userId,
      });
    }
    for (const id of removed) {
      await s.containers.update(ctx, id, {
        shipmentId: null,
        updatedAt: now(),
        updatedBy: ctx.userId,
      });
    }

    let voidedDocumentRenderId: Uuid | null = null;
    let status = shipment.status;
    const change: JsonObject = {
      addedContainerIds: added,
      removedContainerIds: removed,
    };
    if (voids && issued !== null) {
      // Rule 5.13 — void immediately; Rule 5.14 — retained in full, marked,
      // with the reason and the actor.
      await voidIssuedPaper(
        ctx,
        input.at,
        input.attribution,
        shipment,
        issued,
        reason,
        change,
      );
      voidedDocumentRenderId = issued.render.id;
      status = "draft";
    }
    // TODO(T-43): a contents change on a shipment with no issued paper is an
    // audited act (Rule 12.1) and T-43 has no type for it; the void and the
    // status move above are written where one happens. Never a near neighbour.

    const updated = await s.shipments.update(ctx, shipment.id, {
      status,
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
    return {
      shipment: updated,
      addedContainerIds: added,
      removedContainerIds: removed,
      voidedDocumentRenderId,
    };
  });
}

// --- recordTransport -----------------------------------------------------------------------------

/** Statuses whose transport details may still move — T-18 freezes them once documents are issued. */
const PRE_DOCUMENT_STATUSES: readonly ShipmentStatus[] = ["draft", "ready"];

export async function recordTransport(
  ctx: RequestContext,
  input: ShipmentTransportChange,
): Promise<Shipment> {
  assertPolicy(ctx, "shipment", "update");
  const s = store();
  const shipment = await s.shipments.getOrThrow(ctx, input.shipmentId);
  if (!PRE_DOCUMENT_STATUSES.includes(shipment.status)) {
    throw new ConflictError({
      userMessage:
        "Transport details are fixed once the shipping paper is issued. Changing the contents voids the paper and reopens them.",
      correlationId: ctx.correlationId,
      context: { status: shipment.status },
    });
  }
  const transport = trimmedTransport(input.transport);
  requireTransportDetails(ctx, transport);

  if (transport.transportMode === "air") {
    const air = assessAirTransport(
      recordsIn(ctx, containersOf(ctx, shipment.id)).map((record) =>
        airSubject(ctx, record),
      ),
    );
    if (!air.available) {
      await refuseAir(
        ctx,
        input.at,
        input.attribution,
        air,
        shipment,
        "recordTransport",
      );
    }
  }

  return atomically(async () => {
    // TODO(T-43): an edit to a shipment's transport details is an audited act
    // (Rule 12.1) with no T-43 type; written nowhere rather than under a near
    // neighbour. A refused air attempt is audited above.
    return s.shipments.update(ctx, shipment.id, {
      transportMode: transport.transportMode,
      destinationFacilityName: transport.destinationFacilityName,
      destinationAddress: transport.destinationAddress,
      destinationIdentifier: transport.destinationIdentifier,
      carrierName: transport.carrierName,
      transporterIdentifier: transport.transporterIdentifier,
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
  });
}

// --- settleReadiness ---------------------------------------------------------------------------

export async function settleReadiness(
  ctx: RequestContext,
  input: ShipmentReadiness,
): Promise<Shipment> {
  assertPolicy(ctx, "shipment", "update");
  const s = store();
  const shipment = await s.shipments.getOrThrow(ctx, input.shipmentId);
  if (!PRE_DOCUMENT_STATUSES.includes(shipment.status)) {
    throw new ConflictError({
      userMessage:
        "Readiness is settled only before the shipping paper is issued.",
      correlationId: ctx.correlationId,
      context: { status: shipment.status },
    });
  }
  if (shipment.status === input.readiness) return shipment;
  return atomically(async () => {
    const updated = await s.shipments.update(ctx, shipment.id, {
      status: input.readiness,
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
    await audit(ctx, input.at, input.attribution, {
      eventType: "shipment.status_changed",
      entityTable: "shipment",
      entityId: shipment.id,
      beforeState: { status: shipment.status },
      afterState: { status: input.readiness },
      changedFields: ["status"],
    });
    return updated;
  });
}

// --- issueShippingPaper -------------------------------------------------------------------------

function totalEnergyWh(records: readonly BatteryRecord[]): string | null {
  const energies = records.map((record) => record.ratedEnergyWh);
  if (!energies.every((energy): energy is string => energy !== null)) {
    return null;
  }
  return energies.reduce((total, energy) => addDecimal(total, energy), "0");
}

export async function issueShippingPaper(
  ctx: RequestContext,
  input: ShippingPaperIssue,
): Promise<IssuedShippingPaper> {
  assertPolicy(ctx, "shipment", "update");
  assertPolicy(ctx, "shipping_paper", "insert");
  assertPolicy(ctx, "document_render", "insert");
  const s = store();
  const shipment = await s.shipments.getOrThrow(ctx, input.shipmentId);
  const payload: ShippingPaperPayload = input.paper.result;

  if (shipment.status === "documents_issued") {
    throw new ConflictError({
      userMessage:
        "A shipping paper is already issued for these contents. A paper is never re-issued over a current one — a change to the contents voids it first (Rules 5.12, 5.13).",
      correlationId: ctx.correlationId,
    });
  }
  if (!PRE_DOCUMENT_STATUSES.includes(shipment.status)) {
    throw new ConflictError({
      userMessage:
        "This shipment has departed. Its shipping paper cannot change.",
      correlationId: ctx.correlationId,
      context: { status: shipment.status },
    });
  }
  if (payload.shipmentNumber !== shipment.shipmentNumber) {
    throw new DataIntegrityError({
      userMessage: "Something went wrong and nothing was issued. Try again.",
      correlationId: ctx.correlationId,
      context: { reason: "payload_names_another_shipment" },
    });
  }

  // Rule 5.13 — the paper describes exactly what is on the shipment now.
  const containers = containersOf(ctx, shipment.id);
  const records = recordsIn(ctx, containers);
  if (
    !sameIds(
      containers.map((container) => container.id),
      payload.containerIds,
    ) ||
    !sameIds(
      records.map((record) => record.id),
      payload.recordIds,
    ) ||
    payload.transportMode !== shipment.transportMode
  ) {
    throw new ConflictError({
      userMessage:
        "The shipment changed while its paper was being prepared. Nothing was issued — review it again.",
      correlationId: ctx.correlationId,
      context: { rule: "5.13" },
    });
  }

  if (shipment.transportMode === "air") {
    const air = assessAirTransport(
      records.map((record) => airSubject(ctx, record)),
    );
    if (!air.available) {
      await refuseAir(
        ctx,
        input.at,
        input.attribution,
        air,
        shipment,
        "issueShippingPaper",
      );
    }
  }

  // Rules 5.6, 5.7 — the number on the paper is the organization's, and its
  // verification still stands at the moment of issue.
  const organization = organizationOf(ctx);
  const verification = emergencyVerification(
    {
      phone: organization.emergencyResponsePhone,
      verifiedAt: organization.emergencyVerifiedAt,
      verifiedBy: organization.emergencyVerifiedBy,
      reverificationIntervalMonths:
        organization.emergencyReverificationIntervalMonths,
    },
    input.at,
  );
  if (
    !verification.isInForce ||
    organization.emergencyResponsePhone !== payload.emergencyResponse.phone
  ) {
    throw new ValidationError({
      userMessage:
        "This organization has no verified 24-hour emergency contact number on file. Nothing was issued (Rules 5.6, 5.7).",
      correlationId: ctx.correlationId,
      context: { rule: "5.7" },
    });
  }

  const previous = currentPaper(ctx, shipment.id);
  const [governing] = input.paper.ruleVersionsApplied;
  if (governing === undefined) {
    throw new DataIntegrityError({
      userMessage: "Something went wrong and nothing was issued. Try again.",
      correlationId: ctx.correlationId,
      context: { reason: "no_governing_rule_version" },
    });
  }

  try {
    return await atomically(async () => {
      // §8.2 — the bytes, their hash and the row, or none of them. The
      // corrected paper points at the one it follows (Rule 5.15).
      const render = await writeRender(ctx, {
        compose: input.compose,
        status: "issued",
        at: input.at,
        documentType: "shipping_paper",
        subject: { shipmentId: shipment.id },
        supersedesDocumentRenderId: previous?.render.id ?? null,
      });
      return writePaperRows(ctx, input, shipment, records, render, {
        previousPaperId: previous?.paper.id ?? null,
        governingRuleVersionId: governing.ruleVersionId,
      });
    });
  } catch (error) {
    await recordRenderFailure(ctx, input.at, input.attribution, {
      error,
      documentType: "shipping_paper",
      subject: { entityTable: "shipment", entityId: shipment.id },
      inputs: payload,
    });
    throw error;
  }
}

/** The `shipping_paper` row and the shipment's move to issued, after the render is stored. */
async function writePaperRows(
  ctx: RequestContext,
  input: ShippingPaperIssue,
  shipment: Shipment,
  records: readonly BatteryRecord[],
  render: DocumentRender,
  links: {
    readonly previousPaperId: Uuid | null;
    readonly governingRuleVersionId: Uuid;
  },
): Promise<IssuedShippingPaper> {
  const s = store();
  const payload: ShippingPaperPayload = input.paper.result;
  const [firstLine] = payload.lines;
  if (firstLine === undefined) {
    throw new DataIntegrityError({
      userMessage: "Something went wrong and nothing was issued. Try again.",
      correlationId: ctx.correlationId,
      context: { reason: "payload_has_no_line" },
    });
  }
  const paperRow: ShippingPaper = {
    id: nextId(),
    organizationId: ctx.organizationId,
    shipmentId: shipment.id,
    documentRenderId: render.id,
    unIdentifier: firstLine.unIdentifier,
    properShippingName: firstLine.properShippingName,
    hazardClass: firstLine.hazardClass,
    packingGroup: firstLine.packingGroup,
    basicDescription: firstLine.basicDescription,
    numberAndTypeOfPackages: firstLine.numberAndTypeOfPackages,
    totalQuantityDescription: firstLine.totalQuantityDescription,
    emergencyResponsePhone: payload.emergencyResponse.phone,
    emergencyResponseContractRef: payload.emergencyResponse.contractRef,
    emergencyResponseGuideNumber: payload.emergencyResponse.guideNumber,
    shipperCertificationText: payload.shipperCertification,
    shipperSignatureName: null,
    shipperSignedAt: null,
    specialPermitRefs: null,
    governingRuleVersionId: links.governingRuleVersionId,
    evaluationTrace: input.paper.ruleVersionsApplied,
    supersedesShippingPaperId: links.previousPaperId,
    generatedAt: input.at,
    generatedBy: ctx.userId,
    createdAt: now(),
    lines: payload.lines,
  };
  const shippingPaper = await s.shippingPapers.insert(ctx, paperRow);

  // Issuing is the act that offers (`offer` reads the same predicate), so
  // the status and `offeredAt` move together, here, with the bytes stored.
  const updated = await s.shipments.update(ctx, shipment.id, {
    status: "documents_issued",
    offeredAt: input.at,
    packagingExceptions: payload.packagingException.exceptions,
    totalMassKg: payload.lines.reduce(
      (total, line) => addDecimal(total, line.totalMassKg),
      "0",
    ),
    totalEnergyWh: totalEnergyWh(records),
    airTransportBlockedReason: null,
    updatedAt: now(),
    updatedBy: ctx.userId,
  });

  await audit(ctx, input.at, input.attribution, {
    eventType: "document_render.issued",
    entityTable: "document_render",
    entityId: render.id,
    beforeState: null,
    afterState: {
      documentType: render.documentType,
      shipmentId: shipment.id,
      shippingPaperId: shippingPaper.id,
      lineCount: payload.lines.length,
      contentHash: render.contentHash,
      verificationCode: render.verificationCode,
      supersedesDocumentRenderId: render.supersedesDocumentRenderId,
    },
    governingRuleVersionId: links.governingRuleVersionId,
    ruleVersionsApplied: input.paper.ruleVersionsApplied,
  });
  await audit(ctx, input.at, input.attribution, {
    eventType: "shipment.status_changed",
    entityTable: "shipment",
    entityId: shipment.id,
    beforeState: { status: shipment.status },
    afterState: { status: updated.status, documentRenderId: render.id },
    changedFields: ["status", "offeredAt"],
    governingRuleVersionId: links.governingRuleVersionId,
  });
  return { shipment: updated, shippingPaper, documentRender: render };
}

// --- voidShippingPaper ---------------------------------------------------------------------------

/**
 * D-58 item 8 — the one act that voids an issued paper so its transport
 * details can be corrected. The paper is kept, marked, readable; the reason
 * and the actor are on the void's audit row; the shipment returns to `draft`.
 */
export async function voidShippingPaper(
  ctx: RequestContext,
  input: ShippingPaperVoid,
): Promise<VoidedShippingPaper> {
  assertPolicy(ctx, "shipment", "update");
  const s = store();
  const shipment = await s.shipments.getOrThrow(ctx, input.shipmentId);
  const reason = input.reason.trim();
  if (reason === "") {
    throw new ValidationError({
      userMessage:
        "State why the paper is being voided — a void records its reason (Rule 5.14).",
      correlationId: ctx.correlationId,
      field: "reason",
    });
  }
  const issued =
    shipment.status === "documents_issued"
      ? currentPaper(ctx, shipment.id)
      : null;
  if (issued === null || issued.render.status !== "issued") {
    throw new ConflictError({
      userMessage:
        "This shipment has no issued paper to void. A paper can be voided only after it is issued and before the shipment departs.",
      correlationId: ctx.correlationId,
      context: { status: shipment.status },
    });
  }

  return atomically(async () => {
    await voidIssuedPaper(
      ctx,
      input.at,
      input.attribution,
      shipment,
      issued,
      reason,
      { voided: "transport_correction" },
    );
    const updated = await s.shipments.update(ctx, shipment.id, {
      status: "draft",
      offeredAt: null,
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
    return { shipment: updated, voidedDocumentRenderId: issued.render.id };
  });
}

// --- recordDeparture -----------------------------------------------------------------------------

function storedRecordIds(render: DocumentRender): readonly string[] {
  const ids = render.inputSnapshot.recordIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
}

export async function recordDeparture(
  ctx: RequestContext,
  input: ShipmentDeparture,
): Promise<ShipmentDepartureResult> {
  assertPolicy(ctx, "shipment", "update");
  assertPolicy(ctx, "container", "update");
  assertPolicy(ctx, "storage_clock", "update");
  assertPolicy(ctx, "battery_record", "update");
  assertPolicy(ctx, "alert", "update");
  const s = store();
  const shipment = await s.shipments.getOrThrow(ctx, input.shipmentId);
  const containers = containersOf(ctx, shipment.id);
  const records = recordsIn(ctx, containers);

  // An issued paper describing exactly what leaves, with its bytes stored —
  // a render with no bytes is not a paper anything may travel with.
  const paper = currentPaper(ctx, shipment.id);
  const hasCurrentIssuedPaper =
    paper !== null &&
    paper.render.status === "issued" &&
    sameIds(
      storedRecordIds(paper.render),
      records.map((record) => record.id),
    );
  const currentPaperIsStored =
    currentIssuedPaperWithBytes(ctx, shipment.id) !== null;

  const air = assessAirTransport(
    records.map((record) => airSubject(ctx, record)),
  );
  const ddrRecordNumbers = records
    .filter(
      (record) => record.ddrFlags.length > 0 || record.isAirTransportProhibited,
    )
    .map((record) => record.recordNumber)
    .sort((a, b) => a.localeCompare(b));
  const ddrPacketIssued = store()
    .documentRenders.all()
    .some(
      (render) =>
        render.organizationId === ctx.organizationId &&
        render.shipmentId === shipment.id &&
        render.documentType === "ddr_packet" &&
        render.status === "issued",
    );

  // Rule 5.18 — the period in force at the site on the ship date. The caller
  // resolved it; one not in force on the date computed here means the two
  // read different rows, and nothing is stamped on a guess.
  const timeZone = containers[0]?.siteTimeZone ?? organizationOf(ctx).timeZone;
  const shipDay = civilDateInZone(input.at, timeZone);
  const rule = input.retentionRule;
  if (
    rule !== null &&
    (rule.ruleKey !== SHIPMENT_RETENTION_RULE_KEY ||
      !isInForceOn(rule.version, shipDay))
  ) {
    throw new RuleResolutionError({
      userMessage: `No shipment-record retention period is on record for this site on ${shipDay}. Nothing was recorded.`,
      correlationId: ctx.correlationId,
      context: { rule: "5.18", shipDay },
    });
  }
  const retention = shipmentRetention(input.at, timeZone, rule);

  const admission = admitDeparture({
    status: shipment.status,
    hasCurrentIssuedPaper,
    currentPaperIsStored,
    carrierName: shipment.carrierName,
    transportMode: shipment.transportMode,
    air,
    ddrRecordNumbers,
    ddrPacketIssued,
    retention,
  });
  if (!admission.ok) {
    if (admission.reason === "air_blocked" && !air.available) {
      await refuseAir(
        ctx,
        input.at,
        input.attribution,
        air,
        shipment,
        "recordDeparture",
      );
    }
    throw new ValidationError({
      userMessage: admission.message,
      correlationId: ctx.correlationId,
      context: { reason: admission.reason },
    });
  }
  if (!retention.ok) {
    throw new Error("unreachable: admitDeparture refuses without retention");
  }

  const containerIds = containers.map((container) => container.id);
  const recordIds = records.map((record) => record.id);
  const clocks = store()
    .storageClocks.all()
    .filter(
      (clock) =>
        clock.organizationId === ctx.organizationId &&
        clock.stoppedAt === null &&
        ((clock.containerId !== null &&
          containerIds.includes(clock.containerId)) ||
          (clock.batteryRecordId !== null &&
            recordIds.includes(clock.batteryRecordId))),
    );
  const openClockAlerts = store()
    .alerts.all()
    .filter(
      (alert) =>
        alert.organizationId === ctx.organizationId &&
        alert.resolvedAt === null &&
        alert.alertType === "storage_clock" &&
        alert.containerId !== null &&
        containerIds.includes(alert.containerId),
    );

  return atomically(async () => {
    const at = input.at;
    const updated = await s.shipments.update(ctx, shipment.id, {
      status: "dispatched",
      shippedAt: at,
      retentionExpiresOn: retention.expiresOn,
      retentionRuleVersionId: retention.ruleVersionId,
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
    await audit(ctx, at, input.attribution, {
      eventType: "shipment.status_changed",
      entityTable: "shipment",
      entityId: shipment.id,
      beforeState: { status: shipment.status },
      afterState: {
        status: "dispatched",
        shippedAt: at,
        retentionExpiresOn: retention.expiresOn,
        containerIds,
        recordIds,
      },
      changedFields: ["status", "shippedAt", "retentionExpiresOn"],
      governingRuleVersionId: retention.ruleVersionId,
    });

    for (const container of containers) {
      await s.containers.update(ctx, container.id, {
        status: "shipped",
        closedAt: at,
        updatedAt: now(),
        updatedBy: ctx.userId,
      });
      await audit(ctx, at, input.attribution, {
        eventType: "container.status_changed",
        entityTable: "container",
        entityId: container.id,
        beforeState: { status: container.status },
        afterState: { status: "shipped", shipmentId: shipment.id },
        changedFields: ["status", "closedAt"],
      });
    }

    // Rules 4.7, 5.17 — departure closes the clocks of what left, and only those.
    const stopped: StorageClock[] = [];
    for (const clock of clocks) {
      stopped.push(
        await s.storageClocks.update(ctx, clock.id, {
          status: "stopped",
          stoppedAt: at,
          stopReason: DEPARTURE_STOP_REASON,
          nextAlertAt: null,
          updatedAt: now(),
        }),
      );
      await audit(ctx, at, input.attribution, {
        eventType: "storage_clock.status_changed",
        entityTable: "storage_clock",
        entityId: clock.id,
        beforeState: { status: clock.status },
        afterState: {
          status: "stopped",
          stopReason: DEPARTURE_STOP_REASON,
          shipmentId: shipment.id,
        },
        changedFields: ["status", "stoppedAt", "stopReason"],
        governingRuleVersionId: clock.governingRuleVersionId,
      });
    }

    // D-57 — overdue ends when the contents depart on a shipment; the clock's
    // open alerts close with the reason, through the same audited act D-48 uses.
    for (const alert of openClockAlerts) {
      const resolutionReason = `Contents departed on ${shipment.shipmentNumber}.`;
      await s.alerts.update(ctx, alert.id, {
        resolvedAt: at,
        resolutionReason,
        updatedAt: now(),
      });
      await audit(ctx, at, input.attribution, {
        eventType: "alert.resolved",
        entityTable: "alert",
        entityId: alert.id,
        beforeState: { resolvedAt: null },
        afterState: { resolvedAt: at, shipmentId: shipment.id },
        changedFields: ["resolvedAt", "resolutionReason"],
        reason: resolutionReason,
      });
    }

    for (const record of records) {
      await s.batteryRecords.update(ctx, record.id, {
        status: "shipped",
        updatedAt: now(),
        updatedBy: ctx.userId,
      });
      await audit(ctx, at, input.attribution, {
        eventType: "battery_record.status_changed",
        entityTable: "battery_record",
        entityId: record.id,
        beforeState: { status: record.status },
        afterState: { status: "shipped", shipmentId: shipment.id },
        changedFields: ["status"],
      });
    }
    // TODO(T-16): Flow B4 writes a storage_event for departure, and T-16 has
    // no activity for it. A row under a near neighbour is worse than none.

    return {
      shipment: updated,
      stoppedClockIds: stopped.map((clock) => clock.id),
      shippedRecordIds: recordIds,
    };
  });
}

// --- recordArrival -------------------------------------------------------------------------------

export async function recordArrival(
  ctx: RequestContext,
  input: ShipmentArrival,
): Promise<Shipment> {
  assertPolicy(ctx, "shipment", "update");
  assertPolicy(ctx, "battery_record", "update");
  const s = store();
  const shipment = await s.shipments.getOrThrow(ctx, input.shipmentId);
  const admission = admitArrival(shipment.status);
  if (!admission.ok) {
    throw new ConflictError({
      userMessage: admission.message,
      correlationId: ctx.correlationId,
      context: { status: shipment.status },
    });
  }
  const records = recordsIn(ctx, containersOf(ctx, shipment.id)).filter(
    (record) => record.status === "shipped",
  );
  const reference = input.receivedConfirmationRef?.trim() ?? "";

  return atomically(async () => {
    const at = input.at;
    await s.shipments.update(ctx, shipment.id, {
      status: "delivered",
      receivedAt: at,
      receivedConfirmationRef: reference === "" ? null : reference,
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
    await audit(ctx, at, input.attribution, {
      eventType: "shipment.status_changed",
      entityTable: "shipment",
      entityId: shipment.id,
      beforeState: { status: shipment.status },
      afterState: { status: "delivered", receivedAt: at },
      changedFields: ["status", "receivedAt", "receivedConfirmationRef"],
    });
    for (const record of records) {
      await s.batteryRecords.update(ctx, record.id, {
        status: "closed",
        updatedAt: now(),
        updatedBy: ctx.userId,
      });
      await audit(ctx, at, input.attribution, {
        eventType: "battery_record.status_changed",
        entityTable: "battery_record",
        entityId: record.id,
        beforeState: { status: record.status },
        afterState: { status: "closed", shipmentId: shipment.id },
        changedFields: ["status"],
      });
    }
    // T-28 — delivery and closure are two steps; arrival takes both, so the
    // ledger entry is complete and under the retention stamped at departure.
    const closed = await s.shipments.update(ctx, shipment.id, {
      status: "closed",
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
    await audit(ctx, at, input.attribution, {
      eventType: "shipment.status_changed",
      entityTable: "shipment",
      entityId: shipment.id,
      beforeState: { status: "delivered" },
      afterState: { status: "closed" },
      changedFields: ["status"],
    });
    return closed;
  });
}
