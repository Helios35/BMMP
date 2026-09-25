import { describe, expect, it } from "vitest";

import {
  admitContentsMove,
  assertNeverLater,
  carriedAccumulationStart,
  CARRIED_START_PAYLOAD_KEY,
  CONTENTS_MOVE_OPERATIONS,
  earliestInstant,
  emptiesSource,
  isLater,
  planReceipt,
  StartDateWouldMoveLaterError,
  type MoveContainerFacts,
} from "@/domain/storage/accumulation";
import {
  admitToContainer,
  placementRequired,
} from "@/domain/storage/placement";

/**
 * Start dates travel and only ever move earlier — Rules 4.4, 4.7, 4.9–4.12,
 * 4.16, 4.28; EC-23, EC-24, EC-25.
 *
 * The one hard idea in `b1a-04-containers`: **the clock can never be reset,
 * paused or re-dated, not by a control and not by moving batteries around.**
 * Every test here is a way someone might try.
 */

const JAN = "2026-01-05T17:00:00.000Z";
const MAR = "2026-03-02T18:30:00.000Z";
const JUN = "2026-06-20T16:00:00.000Z";
const SEP = "2026-09-01T15:00:00.000Z";

function container(
  overrides: Partial<MoveContainerFacts> = {},
): MoveContainerFacts {
  return {
    id: "c-source",
    status: "open",
    containerType: "light_category_sound",
    siteTimeZone: "America/Los_Angeles",
    siteAddress: null,
    accumulationStartedAt: JAN,
    clockStatus: "running",
    contentCount: 3,
    ...overrides,
  };
}

const FRESH = container({
  id: "c-fresh",
  accumulationStartedAt: null,
  clockStatus: null,
  contentCount: 0,
});

describe("the date a battery carries (Rule 4.9)", () => {
  it("is its own first placement, read from the `place` event's payload", () => {
    expect(
      carriedAccumulationStart({
        events: [
          {
            activityType: "place",
            occurredAt: SEP,
            payload: { [CARRIED_START_PAYLOAD_KEY]: MAR },
          },
        ],
        containerAccumulationStartedAt: JAN,
      }),
    ).toBe(MAR);
  });

  it("is the placement instant where a `place` event carries no date", () => {
    expect(
      carriedAccumulationStart({
        events: [{ activityType: "place", occurredAt: MAR, payload: null }],
        containerAccumulationStartedAt: JAN,
      }),
    ).toBe(MAR);
  });

  it("is the earliest of several placements — a move never makes it later", () => {
    expect(
      carriedAccumulationStart({
        events: [
          { activityType: "place", occurredAt: SEP, payload: null },
          {
            activityType: "place",
            occurredAt: JUN,
            payload: { [CARRIED_START_PAYLOAD_KEY]: MAR },
          },
        ],
        containerAccumulationStartedAt: null,
      }),
    ).toBe(MAR);
  });

  it("falls back to its container's start without its own evidence — never later than the truth", () => {
    // Unit 02 filed first placements as `repackage`. Such a record carries its
    // drum's date, which is the earliest it could possibly be.
    expect(
      carriedAccumulationStart({
        events: [
          {
            activityType: "repackage",
            occurredAt: SEP,
            payload: { placement: "first" },
          },
        ],
        containerAccumulationStartedAt: JAN,
      }),
    ).toBe(JAN);
  });

  it("is null for a record that was never placed", () => {
    expect(
      carriedAccumulationStart({
        events: [],
        containerAccumulationStartedAt: null,
      }),
    ).toBeNull();
  });
});

describe("a receiving container's start (Rules 4.10–4.12)", () => {
  it("EC-23 — a fresh container takes the older date of what arrives, never today's", () => {
    const plan = planReceipt({
      operation: "move",
      target: { accumulationStartedAt: null, accumulationStartSource: null },
      carriedStarts: [MAR],
    });
    expect(plan.accumulationStartedAt).toBe(MAR);
    // Inherited, not first placement: the date is the battery's, not the move's.
    expect(plan.accumulationStartSource).toBe("inherited_on_receipt");
    expect(plan.clockStartBasis).toBe("inherited_on_receipt");
    expect(plan.startChanged).toBe(true);
  });

  it("moves an existing start earlier when older stock arrives (Rule 4.10)", () => {
    const plan = planReceipt({
      operation: "move",
      target: {
        accumulationStartedAt: SEP,
        accumulationStartSource: "first_placement",
      },
      carriedStarts: [JUN, MAR],
    });
    expect(plan.accumulationStartedAt).toBe(MAR);
    expect(plan.previousAccumulationStartedAt).toBe(SEP);
    expect(plan.accumulationStartSource).toBe("inherited_on_receipt");
  });

  it("keeps the start, and its source, when newer stock arrives", () => {
    const plan = planReceipt({
      operation: "move",
      target: {
        accumulationStartedAt: JAN,
        accumulationStartSource: "first_placement",
      },
      carriedStarts: [SEP],
    });
    expect(plan.accumulationStartedAt).toBe(JAN);
    expect(plan.accumulationStartSource).toBe("first_placement");
    expect(plan.clockStartBasis).toBeNull();
    expect(plan.startChanged).toBe(false);
  });

  it("EC-24 — consolidating a nearly overdue drum into a new one carries the old date", () => {
    const plan = planReceipt({
      operation: "consolidate",
      target: {
        accumulationStartedAt: SEP,
        accumulationStartSource: "first_placement",
      },
      carriedStarts: [JAN, JAN, MAR],
    });
    expect(plan.accumulationStartedAt).toBe(JAN);
    expect(plan.accumulationStartSource).toBe("inherited_on_consolidation");
  });

  it("EC-25 — a split relieves only the new container holding only new stock", () => {
    // The old stock stays; the source keeps its date (nothing here changes it).
    // The new container takes the earliest of *its own* contents.
    const newStock = planReceipt({
      operation: "split",
      target: { accumulationStartedAt: null, accumulationStartSource: null },
      carriedStarts: [JUN, SEP],
    });
    expect(newStock.accumulationStartedAt).toBe(JUN);
    expect(newStock.accumulationStartSource).toBe("inherited_on_split");

    // Split the *old* stock out instead: it carries its old date with it.
    const oldStock = planReceipt({
      operation: "split",
      target: { accumulationStartedAt: null, accumulationStartSource: null },
      carriedStarts: [JAN],
    });
    expect(oldStock.accumulationStartedAt).toBe(JAN);
  });

  it("never produces a later start, for any operation and any arrival", () => {
    const instants = [JAN, MAR, JUN, SEP];
    for (const operation of CONTENTS_MOVE_OPERATIONS) {
      for (const before of [null, ...instants]) {
        for (const a of instants) {
          for (const b of instants) {
            const plan = planReceipt({
              operation,
              target: {
                accumulationStartedAt: before,
                accumulationStartSource:
                  before === null ? null : "first_placement",
              },
              carriedStarts: [a, b],
            });
            if (before !== null) {
              expect(
                isLater(before, plan.accumulationStartedAt),
                `${operation}: ${before} → ${plan.accumulationStartedAt}`,
              ).toBe(false);
            }
            // …and never later than anything that arrived.
            expect(
              isLater(earliestInstant([a, b]) ?? a, plan.accumulationStartedAt),
            ).toBe(false);
          }
        }
      }
    }
  });

  it("refuses outright if a later start were ever computed", () => {
    expect(() => assertNeverLater(JAN, MAR)).toThrow(
      StartDateWouldMoveLaterError,
    );
    expect(() => assertNeverLater(MAR, JAN)).not.toThrow();
    expect(() => assertNeverLater(null, SEP)).not.toThrow();
  });

  it("refuses a receipt that moves nothing", () => {
    expect(() =>
      planReceipt({
        operation: "move",
        target: { accumulationStartedAt: JAN, accumulationStartSource: null },
        carriedStarts: [],
      }),
    ).toThrow(RangeError);
  });
});

describe("which container may take a move (Rules 4.1, 4.7, 4.16, 4.28)", () => {
  const source = container();

  it("refuses an overdue container, naming the two ways out (Rule 4.16)", () => {
    const admission = admitContentsMove({
      operation: "move",
      source,
      target: container({ id: "c-overdue", status: "overdue" }),
      movingCount: 1,
    });
    expect(admission.ok).toBe(false);
    if (admission.ok) return;
    expect(admission.reason).toBe("container_overdue");
    expect(admission.message).toMatch(/accepts no new items/);
    expect(admission.message).toMatch(/Ship its contents/);
    expect(admission.message).toMatch(/remediation/);
  });

  it("refuses a different segregation class, with both classes named (Rule 4.28)", () => {
    const admission = admitContentsMove({
      operation: "move",
      source,
      target: container({
        id: "c-quarantine",
        containerType: "light_category_ddr",
      }),
      movingCount: 1,
    });
    expect(admission).toMatchObject({
      ok: false,
      reason: "segregation_class_mismatch",
    });
  });

  it("refuses a container whose clock stopped — its cycle ended (Rule 4.7)", () => {
    const admission = admitContentsMove({
      operation: "move",
      source,
      target: container({
        id: "c-emptied",
        clockStatus: "stopped",
        contentCount: 0,
      }),
      movingCount: 1,
    });
    expect(admission).toMatchObject({
      ok: false,
      reason: "container_cycle_ended",
    });
  });

  it("refuses a container at another site (Rule 4.1)", () => {
    const admission = admitContentsMove({
      operation: "move",
      source,
      target: container({ id: "c-denver", siteTimeZone: "America/Denver" }),
      movingCount: 1,
    });
    expect(admission).toMatchObject({ ok: false, reason: "different_site" });
  });

  it("lets contents leave an overdue container — overdue blocks additions, not departures (EC-27)", () => {
    expect(
      admitContentsMove({
        operation: "move",
        source: container({ status: "overdue" }),
        target: FRESH,
        movingCount: 1,
      }),
    ).toEqual({ ok: true });
  });

  it("keeps a sealed or staged container's contents where they are", () => {
    for (const status of ["closed", "staged", "shipped", "retired"] as const) {
      expect(
        admitContentsMove({
          operation: "move",
          source: container({ status }),
          target: FRESH,
          movingCount: 1,
        }),
      ).toMatchObject({ ok: false, reason: "source_locked" });
    }
  });

  it("refuses the same container, an empty selection, and a battery not in the source", () => {
    expect(
      admitContentsMove({
        operation: "move",
        source,
        target: source,
        movingCount: 1,
      }),
    ).toMatchObject({ reason: "same_container" });
    expect(
      admitContentsMove({
        operation: "move",
        source,
        target: FRESH,
        movingCount: 0,
      }),
    ).toMatchObject({ reason: "nothing_selected" });
    expect(
      admitContentsMove({
        operation: "move",
        source,
        target: FRESH,
        movingCount: 4,
      }),
    ).toMatchObject({ reason: "not_in_source" });
  });

  it("splits only into a container that never held a battery, and leaves something behind", () => {
    expect(
      admitContentsMove({
        operation: "split",
        source,
        target: FRESH,
        movingCount: 1,
      }),
    ).toEqual({ ok: true });
    expect(
      admitContentsMove({
        operation: "split",
        source,
        target: container({ id: "c-used", contentCount: 1 }),
        movingCount: 1,
      }),
    ).toMatchObject({ reason: "split_needs_fresh_container" });
    expect(
      admitContentsMove({
        operation: "split",
        source,
        target: FRESH,
        movingCount: 3,
      }),
    ).toMatchObject({ reason: "split_must_leave_contents" });
  });

  it("consolidates everything, into a container that already holds contents", () => {
    const holding = container({ id: "c-holding", accumulationStartedAt: SEP });
    expect(
      admitContentsMove({
        operation: "consolidate",
        source,
        target: holding,
        movingCount: 3,
      }),
    ).toEqual({ ok: true });
    expect(
      admitContentsMove({
        operation: "consolidate",
        source,
        target: holding,
        movingCount: 2,
      }),
    ).toMatchObject({ reason: "consolidate_takes_everything" });
    expect(
      admitContentsMove({
        operation: "consolidate",
        source,
        target: FRESH,
        movingCount: 3,
      }),
    ).toMatchObject({ reason: "consolidate_needs_contents" });
  });

  it("stops the source's clock only when it reaches empty (Rule 4.7)", () => {
    expect(emptiesSource({ contentCount: 3, movingCount: 3 })).toBe(true);
    expect(emptiesSource({ contentCount: 3, movingCount: 2 })).toBe(false);
  });
});

describe("placement at intake refuses an ended cycle too", () => {
  it("refuses a container whose clock stopped, even when it is open", () => {
    expect(
      admitToContainer(
        { status: "open", containerType: "light_category_sound" },
        "light_category_sound",
        { status: "stopped" },
      ),
    ).toMatchObject({ ok: false, reason: "container_cycle_ended" });
  });
});

describe("D-41 — a classified battery needs a container to commit", () => {
  it("requires a container once a classification is decided", () => {
    expect(placementRequired("light_category")).toBe(true);
    expect(placementRequired("fully_regulated")).toBe(true);
  });

  it("lets an unresolved classification commit unplaced, and says so elsewhere (E-13, Rule 3.10)", () => {
    expect(placementRequired(null)).toBe(false);
    expect(placementRequired("undetermined")).toBe(false);
  });
});
