import { beforeEach, describe, expect, it } from "vitest";

import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { recordDamageAssessmentFor } from "@/features/battery-record/server/condition";
import {
  readRankingLookup,
  readRankingView,
} from "@/features/hazard-ranking/server/read-rankings";
import {
  rankNowFor,
  runHazardRankingJob,
} from "@/features/hazard-ranking/server/run";
import { PermissionError } from "@/lib/errors";

import { ctx, HANDLER, MANAGER, NO_ATTRIBUTION } from "./document-support";

/**
 * Ranking runs end to end on the mock — Rules 10.24, 10.26; D-77 #6.
 *
 * A run writes one row per ranked item, marks the previous rows not current
 * and writes one `hazard_ranking.computed` row; Rank now is P2's and P6's; the
 * job writes as `scheduled_job` and never touches an organization with
 * nothing to rank (Olympic's audit log stays empty).
 */

const NOW = "2026-11-17T18:00:00.000Z";
const LATER = "2026-11-17T19:00:00.000Z";

const AUDITOR = ctx({ userId: ID.USER.samAuditor, role: "auditor" });
const PLATFORM_ADMIN = ctx({
  userId: ID.USER.platformAdmin,
  role: "platform_admin",
  isPlatformAdmin: true,
});
const RAINIER_MANAGER = ctx({
  userId: ID.USER.joRainierHandler,
  organizationId: ID.ORG.rainier,
  role: "facility_manager",
});

beforeEach(() => {
  resetMockStore();
});

function rowsOf(organizationId: string) {
  return mockStore()
    .hazardRankings.all()
    .filter((row) => row.organizationId === organizationId);
}

function runAudits(organizationId: string) {
  return mockStore()
    .auditEvents.all()
    .filter(
      (row) =>
        row.eventType === "hazard_ranking.computed" &&
        row.organizationId === organizationId,
    );
}

describe("the seeded run", () => {
  it('ranks Cascade before anyone presses Rank now, and nothing reads "Changed since"', async () => {
    const current = rowsOf(ID.ORG.cascade).filter((row) => row.isCurrent);
    expect(current.length).toBeGreaterThan(0);
    expect(runAudits(ID.ORG.cascade)).toHaveLength(1);
    const lookup = await readRankingLookup(MANAGER, "battery_record", NOW);
    const view = lookup.viewFor(ID.BATTERY.vehicleTraction);
    expect(view.kind).toBe("ranked");
    if (view.kind === "ranked") {
      expect(view.changedSince).toBe(false);
      expect(view.setText).toMatch(/held batteries at Cascade/);
      expect(view.asOf).not.toBe("");
    }
    // Rainier is not seeded: its one battery reads "Not ranked yet".
    expect(rowsOf(ID.ORG.rainier)).toHaveLength(0);
  });
});

describe("Rank now (Rule 10.24)", () => {
  it("writes a row per ranked item, retires the previous rows and writes one audit row naming the person", async () => {
    const before = rowsOf(ID.ORG.cascade);
    const recorded = await rankNowFor(MANAGER, NOW, NO_ATTRIBUTION);
    const after = rowsOf(ID.ORG.cascade);
    const current = after.filter((row) => row.isCurrent);

    expect(recorded.ranked).toBe(current.length);
    expect(current.every((row) => row.runId === recorded.runId)).toBe(true);
    expect(after.length).toBe(before.length + current.length);
    // The seeded rows are kept, append-only, and no longer current.
    for (const old of before) {
      expect(after.find((row) => row.id === old.id)?.isCurrent).toBe(false);
    }
    expect(current.every((row) => row.supersedesHazardRankingId !== null)).toBe(
      true,
    );

    const audits = runAudits(ID.ORG.cascade);
    expect(audits).toHaveLength(2);
    expect(audits.at(-1)).toMatchObject({
      actorUserId: ID.USER.martaManager,
      actorType: "user",
      entityId: recorded.runId,
    });
  });

  it("is P2's and P6's: P1 and the auditor are refused and nothing is written", async () => {
    const before = mockStore().hazardRankings.all().length;
    await expect(rankNowFor(HANDLER, NOW, NO_ATTRIBUTION)).rejects.toThrow(
      PermissionError,
    );
    await expect(rankNowFor(AUDITOR, NOW, NO_ATTRIBUTION)).rejects.toThrow(
      PermissionError,
    );
    expect(mockStore().hazardRankings.all()).toHaveLength(before);
    await expect(
      rankNowFor(PLATFORM_ADMIN, NOW, NO_ATTRIBUTION),
    ).resolves.toMatchObject({ ranked: expect.any(Number) });
  });

  it("is `not_ranked` for an organization with exactly one held battery", async () => {
    const before = await readRankingView(
      RAINIER_MANAGER,
      "battery_record",
      ID.BATTERY.rainierScooter,
      NOW,
    );
    expect(before).toMatchObject({ kind: "not_ranked_yet" });

    await rankNowFor(RAINIER_MANAGER, NOW, NO_ATTRIBUTION);
    const view = await readRankingView(
      RAINIER_MANAGER,
      "battery_record",
      ID.BATTERY.rainierScooter,
      LATER,
    );
    expect(view.kind).toBe("ranked");
    if (view.kind === "ranked") {
      expect(view.band).toBe("not_ranked");
      expect(view.positionText).toBe("1st of 1");
      expect(view.summary).toBe("Not ranked");
    }
  });
});

describe('"Changed since" (Rule 10.24)', () => {
  it("reads on a record, its container and its lot once damage is assessed on it", async () => {
    await recordDamageAssessmentFor(
      HANDLER,
      {
        recordId: ID.BATTERY.vehicleTraction,
        findingTypes: ["swelling"],
        isDefective: false,
        reason: "Casing bulge found on the weekly walk.",
        clearingPhotoIntakePhotoId: null,
      },
      NOW,
    );
    const record = await readRankingView(
      MANAGER,
      "battery_record",
      ID.BATTERY.vehicleTraction,
      LATER,
    );
    expect(record).toMatchObject({ kind: "ranked", changedSince: true });
    const container = await readRankingView(
      MANAGER,
      "container",
      ID.CONTAINER.soundDrum,
      LATER,
    );
    expect(container).toMatchObject({ kind: "ranked", changedSince: true });

    // A new run reads the new assessment, and the flag clears.
    await rankNowFor(MANAGER, LATER, NO_ATTRIBUTION);
    const ranked = await readRankingView(
      MANAGER,
      "battery_record",
      ID.BATTERY.vehicleTraction,
      LATER,
    );
    expect(ranked).toMatchObject({ kind: "ranked", changedSince: false });
    if (ranked.kind === "ranked") {
      expect(
        ranked.factors.find((factor) => factor.code === "damage_indicators")
          ?.level,
      ).toBe("Damaged or defective");
    }
  });
});

describe("the job (POST /api/jobs/hazard-ranking)", () => {
  it("ranks every organization with something held, as scheduled_job, and leaves Olympic's log empty", async () => {
    const olympicBefore = mockStore()
      .auditEvents.all()
      .filter((row) => row.organizationId === ID.ORG.olympic).length;
    const run = await runHazardRankingJob(
      { job: "hazard-ranking", correlationId: "test-job-0001" },
      NOW,
    );
    expect(run.ranked).toBeGreaterThan(0);
    expect(runAudits(ID.ORG.rainier)).toHaveLength(1);
    expect(runAudits(ID.ORG.rainier)[0]).toMatchObject({
      actorType: "scheduled_job",
      actorUserId: null,
      actorLabel: "hazard-ranking",
    });
    expect(
      mockStore()
        .auditEvents.all()
        .filter((row) => row.organizationId === ID.ORG.olympic),
    ).toHaveLength(olympicBefore);
    expect(rowsOf(ID.ORG.olympic)).toHaveLength(0);
  });
});

describe("the list sort and band filter (UX_SPEC.md §3.5)", () => {
  it("sorts a damaged record above a sound one, and filters by the current band", async () => {
    const page = await mockAdapter.batteryRecords.list(MANAGER, {
      sortBy: "hazardRanking",
      sortDirection: "asc",
      excludeVoided: true,
      excludeDrafts: true,
      limit: 100,
    });
    const order = page.items.map((row) => row.recordNumber);
    expect(order.indexOf("BR-0003")).toBeLessThan(order.indexOf("BR-0001"));

    const bandOne = await mockAdapter.batteryRecords.list(MANAGER, {
      hazardRankingBand: "band_1",
      limit: 100,
    });
    expect(bandOne.items.length).toBeGreaterThan(0);
    const lookup = await readRankingLookup(MANAGER, "battery_record", NOW);
    for (const record of bandOne.items) {
      expect(lookup.viewFor(record.id)).toMatchObject({ band: "band_1" });
    }
  });

  it("sorts containers and lots by their current ranking too", async () => {
    const containers = await mockAdapter.containers.list(MANAGER, {
      sortBy: "hazardRanking",
      sortDirection: "asc",
      limit: 100,
    });
    const codes = containers.items.map((row) => row.containerCode);
    // The empty containers have no ranking and sort last.
    expect(codes.slice(-2).sort()).toEqual(["C-0003", "C-0004"]);
    const lots = await mockAdapter.lots.list(MANAGER, {
      sortBy: "hazardRanking",
      sortDirection: "asc",
      limit: 100,
    });
    expect(lots.items.at(-1)?.lotCode).toBe("L-0002");
  });
});
