import type { RequestContext } from "@/data/contracts/context";
import type {
  IntakeLotPlacement,
  LotMembershipChange,
  LotOpening,
  LotStatusChange,
  StorageWriteAttribution,
} from "@/data/contracts/storage";
import { mayTakeContainerAction } from "@/domain/access/container-actions";
import {
  admitContainerLeavingLot,
  admitContainerToLot,
  admitLotStatusChange,
  type LotAdmission,
} from "@/domain/storage/lot";
import type { LotStatus } from "@/domain/taxonomy/lot-status";
import type { ShipmentStatus } from "@/domain/taxonomy/shipment-status";
import { addDecimal } from "@/domain/units";
import { ConflictError, PermissionError, ValidationError } from "@/lib/errors";
import type { IsoTimestamp, JsonObject, Uuid } from "@/types/common";
import type { Container, Lot } from "@/types/storage";

import { writeTriggerAudit as audit } from "./audit-row";
import { now } from "./factory";
import { formatRecordNumber, nextId, nextSequenceNumber } from "./ids";
import { assertPolicy } from "./policy";
import { sequenceStart } from "./sequence-start";
import { mockStore } from "./store";
import { contentsOf } from "./storage-writes";

/**
 * The lot writes — `LotRepository`'s `open`, `changeMembership` and
 * `changeStatus`, and the lot moves a shipment's own writes make (T-25).
 *
 * **A lot holds containers** (`ERD.md` §6.2): membership is
 * `container.lot_id`, and every change to it is a `lot.membership_changed`
 * with the lot's containers before and after. Each person's write is one
 * operation, all or nothing, snapshotting what it touches as
 * `storage-writes.ts` does; the audit rows go in through the trigger's door,
 * because in Postgres a trigger writes them (`ERD.md` §10.2).
 *
 * **Who** — P1 or P6 (T-25), checked here as well as on the screen: the
 * storage policy lets P2 write `lot` rows, and T-25 does not let P2 assign
 * one, so the narrower rule holds at the adapter. The roll-ups the ERD says a
 * trigger maintains (`chemistry_mix`, `total_mass_kg`, `total_energy_wh`) are
 * maintained here on every lot write.
 */

const store = () => mockStore();

const OPEN_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "draft",
  "ready",
  "documents_issued",
];

function snapshot(): () => void {
  const s = store();
  const tables = [s.lots, s.containers, s.auditEvents] as const;
  const saved = tables.map((table) => [...table.all()]);
  return () => {
    tables.forEach((table, index) => {
      (table.replaceAll as (rows: readonly unknown[]) => void)(
        saved[index] ?? [],
      );
    });
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

// --- reading what the rows say ----------------------------------------------------------

/** The containers whose `lot_id` names the lot, oldest first. */
export function lotMembers(ctx: RequestContext, lotId: Uuid): Container[] {
  return store()
    .containers.all()
    .filter(
      (container) =>
        container.organizationId === ctx.organizationId &&
        container.lotId === lotId,
    )
    .sort((a, b) => a.containerCode.localeCompare(b.containerCode));
}

function memberIds(ctx: RequestContext, lotId: Uuid): Uuid[] {
  return lotMembers(ctx, lotId).map((container) => container.id);
}

function lotFacts(ctx: RequestContext, lot: Lot) {
  return {
    id: lot.id,
    lotCode: lot.lotCode,
    status: lot.status,
    memberCount: lotMembers(ctx, lot.id).length,
  };
}

function openShipmentOf(
  ctx: RequestContext,
  container: Container,
): { readonly shipmentNumber: string } | null {
  if (container.shipmentId === null) return null;
  const shipment = store()
    .shipments.all()
    .find(
      (row) =>
        row.organizationId === ctx.organizationId &&
        row.id === container.shipmentId,
    );
  if (shipment === undefined) return null;
  return OPEN_SHIPMENT_STATUSES.includes(shipment.status)
    ? { shipmentNumber: shipment.shipmentNumber }
    : null;
}

function memberFacts(ctx: RequestContext, container: Container) {
  const lot =
    container.lotId === null
      ? undefined
      : store()
          .lots.all()
          .find((row) => row.id === container.lotId);
  return {
    containerCode: container.containerCode,
    status: container.status,
    lot: lot === undefined ? null : { id: lot.id, lotCode: lot.lotCode },
    onOpenShipment: openShipmentOf(ctx, container),
  };
}

// --- refusals ---------------------------------------------------------------------------

function assertLotActor(ctx: RequestContext): void {
  assertPolicy(ctx, "lot", "update");
  if (ctx.isPlatformAdmin || mayTakeContainerAction(ctx.role, "manage_lot")) {
    return;
  }
  throw new PermissionError({
    userMessage:
      "Only a Compliance Handler or a Platform Admin can create, change or dissolve a lot (T-25).",
    correlationId: ctx.correlationId,
    context: { role: ctx.role },
  });
}

function assertAdmitted(ctx: RequestContext, admission: LotAdmission): void {
  if (admission.ok) return;
  throw new ValidationError({
    userMessage: admission.message,
    correlationId: ctx.correlationId,
  });
}

// --- the roll-ups -------------------------------------------------------------------------

/**
 * `chemistry_mix`, `total_mass_kg`, `total_energy_wh` from what the lot's
 * containers hold now — the trigger's job under Postgres (`ERD.md` §6.2). A
 * figure no record carries is not invented: an unknown mass adds nothing, and
 * a total with no known figure behind it is null.
 */
export async function rollUpLot(
  ctx: RequestContext,
  lotId: Uuid,
): Promise<Lot> {
  const records = lotMembers(ctx, lotId).flatMap((container) =>
    contentsOf(ctx, container.id),
  );
  const mix: Record<string, number> = {};
  let mass: string | null = null;
  let energy: string | null = null;
  for (const record of records) {
    if (record.chemistry !== null) {
      mix[record.chemistry] = (mix[record.chemistry] ?? 0) + 1;
    }
    if (record.batteryMassKg !== null) {
      mass = addDecimal(mass ?? "0", record.batteryMassKg);
    }
    if (record.ratedEnergyWh !== null) {
      energy = addDecimal(energy ?? "0", record.ratedEnergyWh);
    }
  }
  return store().lots.update(ctx, lotId, {
    chemistryMix: Object.keys(mix).length === 0 ? null : mix,
    totalMassKg: mass,
    totalEnergyWh: energy,
    updatedAt: now(),
  } as Partial<Lot>);
}

// --- the lot's own rows -----------------------------------------------------------------

async function insertLot(
  ctx: RequestContext,
  description: string | null,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<Lot> {
  const organization = store()
    .organizations.all()
    .find((org) => org.id === ctx.organizationId);
  const seq = nextSequenceNumber(
    ctx.organizationId,
    "lot",
    sequenceStart(ctx.organizationId, "lot", organization?.lotSeq ?? 0),
  );
  const lot = await store().lots.insert(ctx, {
    id: nextId(),
    organizationId: ctx.organizationId,
    lotCode: formatRecordNumber("L", seq),
    description:
      description === null || description.trim() === ""
        ? null
        : description.trim(),
    chemistryMix: null,
    totalMassKg: null,
    totalEnergyWh: null,
    status: "open",
    createdAt: now(),
    updatedAt: now(),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  await audit(ctx, at, attribution, {
    eventType: "lot.created",
    entityTable: "lot",
    entityId: lot.id,
    beforeState: null,
    afterState: {
      lotCode: lot.lotCode,
      status: lot.status,
      description: lot.description,
    },
  });
  return lot;
}

async function setMembership(
  ctx: RequestContext,
  lot: Lot,
  container: Container,
  lotId: Uuid | null,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<void> {
  const before = memberIds(ctx, lot.id);
  await store().containers.update(ctx, container.id, {
    lotId,
    updatedAt: now(),
    updatedBy: ctx.userId,
  });
  await audit(ctx, at, attribution, {
    eventType: "lot.membership_changed",
    entityTable: "lot",
    entityId: lot.id,
    beforeState: { containerIds: before },
    afterState: {
      containerIds: memberIds(ctx, lot.id),
      [lotId === null ? "left" : "joined"]: container.id,
    },
    changedFields: ["containerIds"],
  });
}

/**
 * A lot's status move, audited — the shipment writes' door for `allocated`,
 * `closed` on release and `shipped` (T-25). It checks the T-25 table and not
 * the person: the shipment's own write already did.
 */
export async function moveLotStatus(
  ctx: RequestContext,
  lot: Lot,
  to: LotStatus,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
  context: JsonObject,
): Promise<Lot> {
  assertAdmitted(ctx, admitLotStatusChange(lotFacts(ctx, lot), to));
  const updated = await store().lots.update(ctx, lot.id, {
    status: to,
    updatedAt: now(),
    updatedBy: ctx.userId,
  });
  await audit(ctx, at, attribution, {
    eventType: "lot.status_changed",
    entityTable: "lot",
    entityId: lot.id,
    beforeState: { status: lot.status },
    afterState: { status: to, ...context },
    changedFields: ["status"],
  });
  return updated;
}

// --- LotRepository ---------------------------------------------------------------------

export async function openLot(
  ctx: RequestContext,
  input: LotOpening,
): Promise<Lot> {
  assertPolicy(ctx, "lot", "insert");
  assertLotActor(ctx);
  const container =
    input.containerId === null
      ? null
      : await store().containers.getOrThrow(ctx, input.containerId);
  if (container !== null) {
    // The lot does not exist yet; it would be open and empty.
    assertAdmitted(
      ctx,
      admitContainerToLot(
        { id: "", lotCode: "the new lot", status: "open", memberCount: 0 },
        memberFacts(ctx, container),
      ),
    );
  }
  return atomically(async () => {
    const lot = await insertLot(
      ctx,
      input.description,
      input.at,
      input.attribution,
    );
    if (container === null) return lot;
    await setMembership(
      ctx,
      lot,
      container,
      lot.id,
      input.at,
      input.attribution,
    );
    return rollUpLot(ctx, lot.id);
  });
}

export async function changeLotMembership(
  ctx: RequestContext,
  input: LotMembershipChange,
): Promise<Lot> {
  assertLotActor(ctx);
  assertPolicy(ctx, "container", "update");
  const lot = await store().lots.getOrThrow(ctx, input.lotId);
  const container = await store().containers.getOrThrow(ctx, input.containerId);
  if (input.change === "join") {
    if (container.lotId === lot.id) {
      throw new ConflictError({
        userMessage: `${container.containerCode} is already in ${lot.lotCode}. Nothing was changed.`,
        correlationId: ctx.correlationId,
      });
    }
    assertAdmitted(
      ctx,
      admitContainerToLot(lotFacts(ctx, lot), memberFacts(ctx, container)),
    );
  } else {
    if (container.lotId !== lot.id) {
      throw new ConflictError({
        userMessage: `${container.containerCode} is not in ${lot.lotCode}. Nothing was changed.`,
        correlationId: ctx.correlationId,
      });
    }
    assertAdmitted(
      ctx,
      admitContainerLeavingLot(lotFacts(ctx, lot), container),
    );
  }
  return atomically(async () => {
    await setMembership(
      ctx,
      lot,
      container,
      input.change === "join" ? lot.id : null,
      input.at,
      input.attribution,
    );
    return rollUpLot(ctx, lot.id);
  });
}

export async function changeLotStatus(
  ctx: RequestContext,
  input: LotStatusChange,
): Promise<Lot> {
  assertLotActor(ctx);
  const lot = await store().lots.getOrThrow(ctx, input.lotId);
  assertAdmitted(ctx, admitLotStatusChange(lotFacts(ctx, lot), input.status));
  return atomically(async () => {
    // T-25 — dissolving returns every member to its prior state: out of any
    // lot, its own status untouched. The lot row stays, for audit.
    if (input.status === "dissolved") {
      for (const container of lotMembers(ctx, lot.id)) {
        await setMembership(
          ctx,
          lot,
          container,
          null,
          input.at,
          input.attribution,
        );
      }
    }
    const moved = await moveLotStatus(
      ctx,
      lot,
      input.status,
      input.at,
      input.attribution,
      {},
    );
    return input.status === "dissolved" ? rollUpLot(ctx, moved.id) : moved;
  });
}

// --- intake step A4 -------------------------------------------------------------------------

/**
 * Step A4's lot, inside `commitConfirmation`'s own operation: the container
 * the record was just placed in joins an open lot or opens a new one. The
 * caller has already snapshotted; this writes and audits, and refuses what
 * `admitContainerToLot` refuses.
 */
export async function placeContainerInLot(
  ctx: RequestContext,
  container: Container,
  placement: IntakeLotPlacement,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<void> {
  assertLotActor(ctx);
  if (placement.kind === "join") {
    const lot = await store().lots.getOrThrow(ctx, placement.lotId);
    if (container.lotId === lot.id) {
      await rollUpLot(ctx, lot.id);
      return;
    }
    assertAdmitted(
      ctx,
      admitContainerToLot(lotFacts(ctx, lot), memberFacts(ctx, container)),
    );
    await setMembership(ctx, lot, container, lot.id, at, attribution);
    await rollUpLot(ctx, lot.id);
    return;
  }
  assertAdmitted(
    ctx,
    admitContainerToLot(
      { id: "", lotCode: "the new lot", status: "open", memberCount: 0 },
      memberFacts(ctx, container),
    ),
  );
  const lot = await insertLot(ctx, placement.description, at, attribution);
  await setMembership(ctx, lot, container, lot.id, at, attribution);
  await rollUpLot(ctx, lot.id);
}
