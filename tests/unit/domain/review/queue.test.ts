import { describe, expect, it } from "vitest";

import {
  flaggedFieldCount,
  groupByContainer,
  isOpenRematchRaise,
  isQueuedIntakeSession,
  nextAfterResolving,
  oldestFirst,
  queuePosition,
  readRematchTrigger,
  rematchDedupeKey,
  rematchTriggerSnapshot,
  reviewQueueCount,
  reviewQueueFraming,
  type QueueAlertState,
} from "@/domain/review/queue";
import { ROLE_CODES } from "@/domain/taxonomy/role";

/**
 * The review queue's rules — `UX_SPEC.md` §3.8, §3.8a, §3.8b; Rules 2.14,
 * 2.22, 2.23; Flow F step 4. Each rule is proven both ways: the case it
 * admits and the case it refuses.
 */

const RAISE: QueueAlertState = {
  alertType: "review_queue",
  batteryRecordId: "br-7",
  resolvedAt: null,
  triggerSnapshot: rematchTriggerSnapshot({
    catalogEntryId: "entry-1",
    matchedOn: ["manufacturer", "model"],
  }),
};

describe("isQueuedIntakeSession — Rule 2.14, and closed sessions leave", () => {
  it("holds a session the gate routed that has not closed", () => {
    expect(
      isQueuedIntakeSession({
        status: "awaiting_confirmation",
        isReviewRequired: true,
      }),
    ).toBe(true);
    expect(
      isQueuedIntakeSession({ status: "failed", isReviewRequired: true }),
    ).toBe(true);
    expect(
      isQueuedIntakeSession({ status: "open", isReviewRequired: true }),
    ).toBe(true);
  });

  it("refuses a session the gate did not route", () => {
    expect(
      isQueuedIntakeSession({
        status: "awaiting_confirmation",
        isReviewRequired: false,
      }),
    ).toBe(false);
  });

  it("refuses a completed or voided session even with the flag still set (Rule 2.23)", () => {
    expect(
      isQueuedIntakeSession({ status: "completed", isReviewRequired: true }),
    ).toBe(false);
    expect(
      isQueuedIntakeSession({ status: "abandoned", isReviewRequired: true }),
    ).toBe(false);
  });
});

describe("isOpenRematchRaise — Flow F step 4", () => {
  it("holds an unresolved review_queue alert on one record naming the approved entry", () => {
    expect(isOpenRematchRaise(RAISE)).toBe(true);
  });

  it("refuses a raise a person already resolved", () => {
    expect(
      isOpenRematchRaise({ ...RAISE, resolvedAt: "2026-09-25T10:00:00.000Z" }),
    ).toBe(false);
  });

  it("refuses the organisation-wide review_queue alert, which names no record", () => {
    expect(
      isOpenRematchRaise({
        ...RAISE,
        batteryRecordId: null,
        triggerSnapshot: { queueDepth: 2 },
      }),
    ).toBe(false);
  });

  it("refuses a record-level alert of another type, and one whose snapshot is not a raise", () => {
    expect(isOpenRematchRaise({ ...RAISE, alertType: "storage_clock" })).toBe(
      false,
    );
    expect(isOpenRematchRaise({ ...RAISE, triggerSnapshot: {} })).toBe(false);
  });
});

describe("the raise's frozen trigger", () => {
  it("round-trips the approved entry and the fields that matched", () => {
    expect(readRematchTrigger(RAISE.triggerSnapshot)).toEqual({
      catalogEntryId: "entry-1",
      matchedOn: ["manufacturer", "model"],
    });
  });

  it("reads nothing from a snapshot another kind of alert wrote", () => {
    expect(readRematchTrigger({ catalogEntryId: "entry-1" })).toBeNull();
    expect(
      readRematchTrigger({ raisedBy: "catalog_entry_approved" }),
    ).toBeNull();
  });

  it("dedupes per record and entry, so a repeated approval raises nothing twice", () => {
    expect(rematchDedupeKey("br-7", "entry-1")).toBe(
      rematchDedupeKey("br-7", "entry-1"),
    );
    expect(rematchDedupeKey("br-7", "entry-1")).not.toBe(
      rematchDedupeKey("br-7", "entry-2"),
    );
  });
});

describe("reviewQueueFraming — from the capability map, never a role literal", () => {
  it("P1 and P6 confirm; P2 reads the unidentified view; P3, P4 and P5 see nothing", () => {
    const framings = Object.fromEntries(
      ROLE_CODES.map((role) => [role, reviewQueueFraming(role)]),
    );
    expect(framings).toEqual({
      compliance_handler: "confirming",
      facility_manager: "unidentified",
      producer_compliance_officer: null,
      mobility_supplier_technician: null,
      auditor: null,
      platform_admin: "confirming",
    });
  });
});

describe("reviewQueueCount — one membership, framed per reader", () => {
  const membership = { sessionCount: 3, rematchCount: 2 };

  it("counts every item for the roles that work the queue", () => {
    expect(reviewQueueCount(membership, "confirming")).toBe(5);
  });

  it("counts only the unidentified items for P2 — a raised record is already identified", () => {
    expect(reviewQueueCount(membership, "unidentified")).toBe(3);
  });

  it("is zero when nothing waits, for either reader", () => {
    const empty = { sessionCount: 0, rematchCount: 0 };
    expect(reviewQueueCount(empty, "confirming")).toBe(0);
    expect(reviewQueueCount(empty, "unidentified")).toBe(0);
  });
});

describe("oldest first, and moving through the queue (§3.8a)", () => {
  const items = [
    { id: "b", queuedSince: "2026-08-20T00:00:00.000Z" },
    { id: "a", queuedSince: "2026-08-18T00:00:00.000Z" },
    { id: "c", queuedSince: "2026-08-20T00:00:00.000Z" },
  ];

  it("orders by the time an item joined, ties broken by id", () => {
    expect(oldestFirst(items).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("states position with its neighbours, and nothing for an item not queued", () => {
    expect(queuePosition(["a", "b", "c"], "b")).toEqual({
      index: 1,
      total: 3,
      previousId: "a",
      nextId: "c",
    });
    expect(queuePosition(["a", "b", "c"], "z")).toBeNull();
  });

  it("offers the next item once one leaves, the previous at the end, and nothing when it was the last", () => {
    expect(nextAfterResolving(["a", "b", "c"], "a")).toBe("b");
    expect(nextAfterResolving(["a", "b", "c"], "c")).toBe("b");
    expect(nextAfterResolving(["a"], "a")).toBeNull();
  });
});

describe("groupByContainer — P2 audits a physical space (§3.8b)", () => {
  it("groups by container in the caller's order, oldest first within each, the unkeyed last", () => {
    const groups = groupByContainer(
      [
        {
          id: "s1",
          queuedSince: "2026-08-21T00:00:00.000Z",
          containerId: "c2",
        },
        {
          id: "s2",
          queuedSince: "2026-08-19T00:00:00.000Z",
          containerId: null,
        },
        {
          id: "s3",
          queuedSince: "2026-08-22T00:00:00.000Z",
          containerId: "c1",
        },
        {
          id: "s4",
          queuedSince: "2026-08-18T00:00:00.000Z",
          containerId: "c2",
        },
      ],
      ["c1", "c2"],
    );
    expect(
      groups.map((group) => [
        group.containerId,
        group.items.map((item) => item.id),
      ]),
    ).toEqual([
      ["c1", ["s3"]],
      ["c2", ["s4", "s1"]],
      [null, ["s2"]],
    ]);
  });

  it("drops nothing when no container is named at all", () => {
    const groups = groupByContainer(
      [
        {
          id: "s1",
          queuedSince: "2026-08-21T00:00:00.000Z",
          containerId: null,
        },
      ],
      [],
    );
    expect(groups).toHaveLength(1);
  });
});

describe("flaggedFieldCount — the read's quality, not the checklist", () => {
  it("counts pending fields read below the passing band", () => {
    expect(
      flaggedFieldCount([
        { fieldCode: "model", status: "pending", confidenceBand: "low" },
        { fieldCode: "voltage", status: "pending", confidenceBand: "medium" },
        {
          fieldCode: "manufacturer",
          status: "pending",
          confidenceBand: "high",
        },
      ]),
    ).toBe(2);
  });

  it("does not count a field a person already confirmed or rejected, or the condition row", () => {
    expect(
      flaggedFieldCount([
        { fieldCode: "model", status: "confirmed", confidenceBand: "low" },
        {
          fieldCode: "serial_number",
          status: "rejected",
          confidenceBand: "low",
        },
        {
          fieldCode: "assessed_condition",
          status: "pending",
          confidenceBand: "not_extracted",
        },
      ]),
    ).toBe(0);
  });
});
