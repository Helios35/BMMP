import { beforeEach, describe, expect, it } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import type {
  ContainerContentsMove,
  StorageWriteAttribution,
} from "@/data/contracts/storage";
import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import type { ResolvedRule } from "@/domain/rules/resolve";
import { CARRIED_START_PAYLOAD_KEY } from "@/domain/storage/accumulation";
import { ACCUMULATION_RULE_KEY } from "@/domain/storage/placement";
import {
  PermissionError,
  RuleResolutionError,
  ValidationError,
} from "@/lib/errors";
import type { Container } from "@/types/storage";

/**
 * The container writes wider than CRUD, against the mock adapter —
 * `moveContents`, `recordStorageEvent`, `changeStatus`.
 *
 * **The one hard idea of `b1a-04-containers`: no path makes a start date
 * later** — not a move, a consolidation, a split, a remediation, or placing
 * into a container that was emptied (Rules 4.6, 4.7, 4.9–4.12, 4.17). Every
 * "now" is a fixed instant passed in; nothing here reads the wall clock.
 */

const PAGE = { limit: 100 } as const;
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
    correlationId: "test-corr-containers-0001",
    ...overrides,
  };
}

const HANDLER = ctx();
const MANAGER = ctx({
  userId: ID.USER.martaManager,
  role: "facility_manager",
});
const AUDITOR = ctx({ userId: ID.USER.samAuditor, role: "auditor" });

/** The sound drum's start — the date the two fixture packs carry, having no `place` event of their own. */
const SOUND_START = "2026-07-28T13:05:00.000Z";
/** A fixed "now" inside the sound drum's period. */
const AT = "2026-09-25T17:00:00.000Z";

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

async function freshContainer(
  overrides: Partial<Parameters<typeof mockAdapter.containers.create>[1]> = {},
): Promise<Container> {
  return mockAdapter.containers.create(HANDLER, {
    containerType: "light_category_sound",
    lotId: null,
    shipmentId: null,
    capacityKg: "900.000",
    capacityVolumeM3: null,
    siteAddress: null,
    siteTimeZone: "America/Los_Angeles",
    storageLocation: "Bay 9",
    status: "open",
    sealedAt: null,
    closedAt: null,
    ...overrides,
  });
}

async function move(
  input: Partial<ContainerContentsMove> &
    Pick<ContainerContentsMove, "targetContainerId" | "batteryRecordIds">,
  caller: RequestContext = HANDLER,
) {
  return mockAdapter.containers.moveContents(caller, {
    operation: "move",
    sourceContainerId: ID.CONTAINER.soundDrum,
    at: AT,
    accumulationRule: await accumulationRuleOn("2026-07-28"),
    attribution: NO_ATTRIBUTION,
    ...input,
  });
}

/** A `place` event with its own carried start, as an intake writes one. */
function recordOwnPlacement(batteryRecordId: string, carried: string): void {
  const store = mockStore();
  store.storageEvents.replaceAll([
    ...store.storageEvents.all(),
    {
      id: `0a0000ff-0000-4000-8000-${Math.floor(Math.random() * 1e12)
        .toString(16)
        .padStart(12, "0")}`,
      organizationId: ID.ORG.cascade,
      activityType: "place",
      storageClockId: ID.CLOCK.soundDrum,
      containerId: ID.CONTAINER.soundDrum,
      batteryRecordId,
      lotId: null,
      occurredAt: carried,
      recordedAt: carried,
      recordedBy: ID.USER.danaHandler,
      payload: { [CARRIED_START_PAYLOAD_KEY]: carried },
      governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
      createdAt: carried,
    },
  ]);
}

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

beforeEach(() => {
  resetMockStore();
});

describe("a move carries the earliest start (Rules 4.9, 4.10; EC-23)", () => {
  it("gives a newer container the older date — never the date of the move", async () => {
    const fresh = await freshContainer();
    const result = await move({
      targetContainerId: fresh.id,
      batteryRecordIds: [ID.BATTERY.vehicleTraction],
    });

    expect(result.target.accumulationStartedAt).toBe(SOUND_START);
    expect(result.target.accumulationStartSource).toBe("inherited_on_receipt");
    expect(result.targetClock.clockStartAt).toBe(SOUND_START);
    expect(result.targetClock.clockStartBasis).toBe("inherited_on_receipt");
    expect(result.targetClock.subjectType).toBe("container");
    expect(result.previousTargetStart).toBeNull();
    expect(result.targetStartChanged).toBe(true);

    // The source keeps its date; it still holds the mobility pack.
    const source = await mockAdapter.containers.get(
      HANDLER,
      ID.CONTAINER.soundDrum,
    );
    expect(source?.accumulationStartedAt).toBe(SOUND_START);
    expect(result.sourceEmptied).toBe(false);

    const record = await mockAdapter.batteryRecords.get(
      HANDLER,
      ID.BATTERY.vehicleTraction,
    );
    expect(record?.containerId).toBe(fresh.id);
    // Only the container moved — the two legal booleans are untouched.
    expect(record?.isAirTransportProhibited).toBe(false);
  });

  it("writes `repackage` off the source and `place` into the target, carrying the date (T-16)", async () => {
    const fresh = await freshContainer();
    await move({
      targetContainerId: fresh.id,
      batteryRecordIds: [ID.BATTERY.vehicleTraction],
    });
    const events = await mockAdapter.storageEvents.list(HANDLER, {
      ...PAGE,
      batteryRecordId: ID.BATTERY.vehicleTraction,
      occurredAfter: "2026-09-01T00:00:00.000Z",
    });
    const kinds = events.items.map((event) => [
      event.activityType,
      event.containerId,
    ]);
    expect(kinds).toContainEqual(["repackage", ID.CONTAINER.soundDrum]);
    expect(kinds).toContainEqual(["place", fresh.id]);
    const place = events.items.find((event) => event.activityType === "place");
    expect(place?.payload).toMatchObject({
      [CARRIED_START_PAYLOAD_KEY]: SOUND_START,
      fromContainerId: ID.CONTAINER.soundDrum,
    });
  });

  it("keeps the receiving start when newer stock arrives", async () => {
    // The mobility pack's own first placement is later than the drum's start.
    recordOwnPlacement(ID.BATTERY.mobilityScooter, "2026-08-12T09:41:03.000Z");
    const older = await freshContainer();
    await move({
      targetContainerId: older.id,
      batteryRecordIds: [ID.BATTERY.vehicleTraction],
    });
    const second = await move({
      targetContainerId: older.id,
      batteryRecordIds: [ID.BATTERY.mobilityScooter],
      accumulationRule: null,
    });
    expect(second.target.accumulationStartedAt).toBe(SOUND_START);
    expect(second.targetStartChanged).toBe(false);
    expect(second.sourceEmptied).toBe(true);
  });

  it("makes a container overdue on receipt when the carried date says so (Rule 4.10; E-6)", async () => {
    const fresh = await freshContainer();
    // A year and more after the drum's start — the carried date is past its period.
    const later = "2027-09-01T17:00:00.000Z";
    const result = await move({
      targetContainerId: fresh.id,
      batteryRecordIds: [ID.BATTERY.vehicleTraction],
      at: later,
    });
    expect(result.targetBecameOverdue).toBe(true);
    expect(result.target.status).toBe("overdue");
    expect(result.targetClock.status).toBe("overdue");
    expect(result.targetClock.alertBand).toBe("overdue");

    // The alert is a record, raised now, critical, and never a chance of anything.
    const alerts = await mockAdapter.alerts.list(HANDLER, {
      ...PAGE,
      containerId: fresh.id,
      isOpen: true,
    });
    expect(alerts.items).toHaveLength(1);
    expect(alerts.items[0]).toMatchObject({
      alertType: "storage_clock",
      severity: "critical",
      storageClockId: result.targetClock.id,
      raisedAt: later,
    });
    expect(alerts.items[0]?.body).not.toMatch(/probability|chance|risk/i);

    // …and it now refuses anything new, with its stated reason (Rule 4.16).
    await expect(
      move({
        targetContainerId: fresh.id,
        batteryRecordIds: [ID.BATTERY.mobilityScooter],
        at: later,
        accumulationRule: null,
      }),
    ).rejects.toThrow(/accepts no new items/);
  });
});

describe("consolidation and split (Rules 4.11, 4.12; EC-24, EC-25)", () => {
  it("EC-24 — consolidating into a newer container carries the oldest date", async () => {
    // A newer container holding newer stock: the mobility pack, split out.
    recordOwnPlacement(ID.BATTERY.mobilityScooter, "2026-08-12T09:41:03.000Z");
    const newer = await freshContainer();
    const split = await move({
      operation: "split",
      targetContainerId: newer.id,
      batteryRecordIds: [ID.BATTERY.mobilityScooter],
      accumulationRule: await accumulationRuleOn("2026-08-12"),
    });
    expect(split.target.accumulationStartedAt).toBe("2026-08-12T09:41:03.000Z");
    expect(split.target.accumulationStartSource).toBe("inherited_on_split");

    // Now consolidate the old drum's remainder into it.
    const consolidated = await move({
      operation: "consolidate",
      targetContainerId: newer.id,
      batteryRecordIds: [ID.BATTERY.vehicleTraction],
    });
    expect(consolidated.target.accumulationStartedAt).toBe(SOUND_START);
    expect(consolidated.target.accumulationStartSource).toBe(
      "inherited_on_consolidation",
    );
    expect(consolidated.targetClock.clockStartAt).toBe(SOUND_START);
    expect(consolidated.targetClock.clockStartBasis).toBe(
      "inherited_on_consolidation",
    );
    // The old drum reached empty: its clock stopped, its date stays as evidence.
    expect(consolidated.sourceEmptied).toBe(true);
    const drumClock = await mockAdapter.storageClocks.get(
      HANDLER,
      ID.CLOCK.soundDrum,
    );
    expect(drumClock?.status).toBe("stopped");
    expect(drumClock?.clockStartAt).toBe(SOUND_START);
  });

  it("EC-25 — a split relieves the new container holding new stock, and the source keeps its date", async () => {
    recordOwnPlacement(ID.BATTERY.mobilityScooter, "2026-08-12T09:41:03.000Z");
    const fresh = await freshContainer();
    const result = await move({
      operation: "split",
      targetContainerId: fresh.id,
      batteryRecordIds: [ID.BATTERY.mobilityScooter],
      accumulationRule: await accumulationRuleOn("2026-08-12"),
    });
    expect(result.target.accumulationStartedAt).toBe(
      "2026-08-12T09:41:03.000Z",
    );
    // The source still holds the old stock and never moves later.
    expect(result.source.accumulationStartedAt).toBe(SOUND_START);
  });

  it("never lets any container's start move later, across a sequence of moves", async () => {
    recordOwnPlacement(ID.BATTERY.mobilityScooter, "2026-08-12T09:41:03.000Z");
    const startsBefore = new Map(
      mockStore()
        .containers.all()
        .map((row) => [row.id, row.accumulationStartedAt]),
    );
    const a = await freshContainer();
    await move({
      operation: "split",
      targetContainerId: a.id,
      batteryRecordIds: [ID.BATTERY.mobilityScooter],
      accumulationRule: await accumulationRuleOn("2026-08-12"),
    });
    await move({
      sourceContainerId: ID.CONTAINER.soundDrum,
      targetContainerId: a.id,
      batteryRecordIds: [ID.BATTERY.vehicleTraction],
    });
    for (const row of mockStore().containers.all()) {
      const before = startsBefore.get(row.id);
      if (before === undefined || before === null) continue;
      expect(
        Date.parse(row.accumulationStartedAt ?? before) <= Date.parse(before),
        `${row.containerCode} moved later`,
      ).toBe(true);
    }
  });
});

describe("what a move refuses — and it changes nothing when it does", () => {
  it("refuses the overdue drum with the stated reason, and names both ways out (Rule 4.16)", async () => {
    const before = snapshotStore();
    await expect(
      move({
        targetContainerId: ID.CONTAINER.overdueDrum,
        batteryRecordIds: [ID.BATTERY.vehicleTraction],
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      move({
        targetContainerId: ID.CONTAINER.overdueDrum,
        batteryRecordIds: [ID.BATTERY.vehicleTraction],
      }),
    ).rejects.toThrow(
      /overdue and accepts no new items\. Ship its contents or record a remediation/,
    );
    expect(snapshotStore()).toEqual(before);
  });

  it("refuses a different segregation class (Rule 4.28)", async () => {
    await expect(
      move({
        targetContainerId: ID.CONTAINER.quarantineDrum,
        batteryRecordIds: [ID.BATTERY.vehicleTraction],
      }),
    ).rejects.toThrow(/This record needs/);
  });

  it("refuses a container whose cycle ended, even though it is open (Rule 4.7; ERD §6.1)", async () => {
    const fresh = await freshContainer();
    // Move both packs out: the drum reaches empty and its clock stops.
    await move({
      targetContainerId: fresh.id,
      batteryRecordIds: [
        ID.BATTERY.vehicleTraction,
        ID.BATTERY.mobilityScooter,
      ],
    });
    await expect(
      mockAdapter.containers.moveContents(HANDLER, {
        operation: "move",
        sourceContainerId: fresh.id,
        targetContainerId: ID.CONTAINER.soundDrum,
        batteryRecordIds: [ID.BATTERY.vehicleTraction],
        at: AT,
        accumulationRule: null,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(/accumulation cycle has ended/);
  });

  it("refuses when no accumulation period is on record for the start date (Rule 4.5)", async () => {
    const before = snapshotStore();
    const fresh = await freshContainer();
    const afterCreate = snapshotStore();
    await expect(
      move({
        targetContainerId: fresh.id,
        batteryRecordIds: [ID.BATTERY.vehicleTraction],
        accumulationRule: null,
      }),
    ).rejects.toThrow(RuleResolutionError);
    expect(snapshotStore()).toEqual(afterCreate);
    expect(before).not.toEqual(afterCreate);
  });

  it("refuses a Facility Manager — records are added or removed by P1 and P6 (§5.5)", async () => {
    const fresh = await freshContainer();
    await expect(
      move(
        {
          targetContainerId: fresh.id,
          batteryRecordIds: [ID.BATTERY.vehicleTraction],
        },
        MANAGER,
      ),
    ).rejects.toThrow(PermissionError);
  });

  it("refuses the auditor outright (Rule 1.14)", async () => {
    const fresh = await freshContainer();
    await expect(
      move(
        {
          targetContainerId: fresh.id,
          batteryRecordIds: [ID.BATTERY.vehicleTraction],
        },
        AUDITOR,
      ),
    ).rejects.toThrow(PermissionError);
  });
});

describe("recording a storage event (Rules 3.21, 4.17)", () => {
  it("records an inspection for P2, audited", async () => {
    const event = await mockAdapter.containers.recordStorageEvent(MANAGER, {
      kind: "inspect",
      containerId: ID.CONTAINER.soundDrum,
      occurredAt: "2026-09-25T16:00:00.000Z",
      note: "Lid sealed; no visible change.",
      at: AT,
      attribution: NO_ATTRIBUTION,
    });
    expect(event.activityType).toBe("inspect");
    expect(event.recordedBy).toBe(ID.USER.martaManager);
    const log = await mockAdapter.auditEvents.list(MANAGER, {
      ...PAGE,
      entityId: ID.CONTAINER.soundDrum,
      eventType: "storage_event.recorded",
    });
    expect(log.items).toHaveLength(1);
  });

  it("refuses a P1 remediation — P2 or P6 only (§5.5, T-16)", async () => {
    await expect(
      mockAdapter.containers.recordStorageEvent(HANDLER, {
        kind: "remediate",
        containerId: ID.CONTAINER.overdueDrum,
        occurredAt: AT,
        statement: "Moved to the hazmat cage.",
        at: AT,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(PermissionError);
  });

  it("records a P2 remediation with its statement, and changes no date and no status", async () => {
    const before = await mockAdapter.containers.get(
      MANAGER,
      ID.CONTAINER.overdueDrum,
    );
    const clockBefore = await mockAdapter.storageClocks.get(
      MANAGER,
      ID.CLOCK.overdueDrum,
    );
    const event = await mockAdapter.containers.recordStorageEvent(MANAGER, {
      kind: "remediate",
      containerId: ID.CONTAINER.overdueDrum,
      occurredAt: AT,
      statement:
        "Contents collected by the county HHW contractor, manifest 4471.",
      at: AT,
      attribution: NO_ATTRIBUTION,
    });
    expect(event.activityType).toBe("remediate");
    expect(event.payload).toMatchObject({
      statement:
        "Contents collected by the county HHW contractor, manifest 4471.",
    });

    const after = await mockAdapter.containers.get(
      MANAGER,
      ID.CONTAINER.overdueDrum,
    );
    const clockAfter = await mockAdapter.storageClocks.get(
      MANAGER,
      ID.CLOCK.overdueDrum,
    );
    expect(after?.accumulationStartedAt).toBe(before?.accumulationStartedAt);
    expect(after?.status).toBe("overdue");
    expect(clockAfter?.clockStartAt).toBe(clockBefore?.clockStartAt);
    expect(clockAfter?.dueAt).toBe(clockBefore?.dueAt);
    const alert = await mockAdapter.alerts.get(MANAGER, ID.ALERT.overdueDrum);
    expect(alert?.resolvedAt).toBeNull();

    const log = await mockAdapter.auditEvents.list(MANAGER, {
      ...PAGE,
      entityId: ID.CONTAINER.overdueDrum,
      eventType: "storage_event.recorded",
    });
    expect(log.items[0]?.reason).toMatch(/manifest 4471/);
  });

  it("refuses a remediation without a statement, and on a container that is not overdue", async () => {
    await expect(
      mockAdapter.containers.recordStorageEvent(MANAGER, {
        kind: "remediate",
        containerId: ID.CONTAINER.overdueDrum,
        occurredAt: AT,
        statement: "   ",
        at: AT,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      mockAdapter.containers.recordStorageEvent(MANAGER, {
        kind: "remediate",
        containerId: ID.CONTAINER.soundDrum,
        occurredAt: AT,
        statement: "Nothing to remediate.",
        at: AT,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(/not overdue/);
  });

  it("refuses an event dated in the future", async () => {
    await expect(
      mockAdapter.containers.recordStorageEvent(MANAGER, {
        kind: "inspect",
        containerId: ID.CONTAINER.soundDrum,
        occurredAt: "2026-09-26T00:00:00.000Z",
        note: null,
        at: AT,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(/future/);
  });
});

describe("closing and retiring (T-24; Rule 4.30)", () => {
  it("marks a holding container ready to ship — closed, sealed, audited", async () => {
    const closed = await mockAdapter.containers.changeStatus(MANAGER, {
      containerId: ID.CONTAINER.soundDrum,
      status: "closed",
      at: AT,
      attribution: NO_ATTRIBUTION,
    });
    expect(closed.status).toBe("closed");
    expect(closed.sealedAt).toBe(AT);
    // The clock keeps counting: closing is not a pause (Rule 4.6).
    const clock = await mockAdapter.storageClocks.get(
      MANAGER,
      ID.CLOCK.soundDrum,
    );
    expect(clock?.stoppedAt).toBeNull();
  });

  it("retires only an empty container, and only for P2 or P6", async () => {
    const fresh = await freshContainer();
    await expect(
      mockAdapter.containers.changeStatus(HANDLER, {
        containerId: fresh.id,
        status: "retired",
        at: AT,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(PermissionError);
    await expect(
      mockAdapter.containers.changeStatus(MANAGER, {
        containerId: ID.CONTAINER.soundDrum,
        status: "retired",
        at: AT,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(ValidationError);
    const retired = await mockAdapter.containers.changeStatus(MANAGER, {
      containerId: fresh.id,
      status: "retired",
      at: AT,
      attribution: NO_ATTRIBUTION,
    });
    expect(retired.status).toBe("retired");
  });
});
