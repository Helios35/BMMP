import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { evaluateStorageClock } from "@/domain/storage/clock-evaluation";
import type { StorageClock } from "@/types/storage";

const { POST } = await import("@/app/api/jobs/storage-clock-alerts/route");

/**
 * The storage-clock alert job — `POST /api/jobs/storage-clock-alerts`,
 * `TECHNICAL_SPEC.md` §7.2, §11.2; Rules 4.6, 4.13–4.15; brief 07 outcome 6.
 *
 * What is proven:
 *
 * 1. **It fires once, and a second run fires nothing.**
 * 2. It runs **the on-write re-tier's evaluation** — the stored band and next
 *    alert are exactly `evaluateStorageClock`'s answer.
 * 3. **It never pauses, extends or restarts a clock**: start, due and schedule
 *    are untouched; only `nextAlertAt` moves, and only forward.
 * 4. Every row it writes is T-60 `scheduled_job` with no person, inside the
 *    organization that owns the clock.
 * 5. The route refuses an unset secret (`503`) and a wrong or missing one
 *    (`401`), as `application/problem+json`.
 */

const JOB = {
  job: "storage-clock-alerts",
  correlationId: "job-run-0001",
} as const;

/** The sound drum's first tier, 2027-04-29 at the site — the instant it is due. */
const FIRST_TIER = "2027-04-29T07:00:00.000Z";
/** After the sound drum's period has elapsed. */
const AFTER_DUE = "2027-07-29T12:00:00.000Z";

function clock(id: string): StorageClock {
  const found = mockStore()
    .storageClocks.all()
    .find((row) => row.id === id);
  if (found === undefined) throw new Error(`no clock ${id}`);
  return found;
}

function jobRows() {
  return mockStore()
    .auditEvents.all()
    .filter((row) => row.correlationId === JOB.correlationId);
}

beforeEach(() => {
  resetMockStore();
});

describe("runStorageClockAlerts", () => {
  it("fires a due alert once, and a second run over the same instant fires nothing", async () => {
    const first = await mockAdapter.jobs.runStorageClockAlerts(JOB, FIRST_TIER);
    expect(first.evaluated).toBeGreaterThanOrEqual(1);
    expect(first.fired).toBeGreaterThanOrEqual(1);
    const alerts = mockStore()
      .alerts.all()
      .filter(
        (alert) =>
          alert.storageClockId === ID.CLOCK.soundDrum &&
          alert.resolvedAt === null,
      );
    expect(alerts).toHaveLength(1);

    const second = await mockAdapter.jobs.runStorageClockAlerts(
      JOB,
      FIRST_TIER,
    );
    expect(second).toEqual({ evaluated: 0, fired: 0 });
    expect(
      mockStore()
        .alerts.all()
        .filter((alert) => alert.storageClockId === ID.CLOCK.soundDrum),
    ).toHaveLength(1);
  });

  it("stores exactly the on-write evaluation, and only moves the next alert forward", async () => {
    const before = clock(ID.CLOCK.soundDrum);
    const expected = evaluateStorageClock(before, FIRST_TIER);

    await mockAdapter.jobs.runStorageClockAlerts(JOB, FIRST_TIER);
    const after = clock(ID.CLOCK.soundDrum);

    expect(after.alertBand).toBe(expected.alertBand);
    expect(after.status).toBe(expected.status);
    expect(after.nextAlertAt).toBe(expected.nextAlertAt);
    expect((after.nextAlertAt ?? "") > (before.nextAlertAt ?? "")).toBe(true);
    // Rule 4.6 — never paused, extended or restarted.
    expect(after.clockStartAt).toBe(before.clockStartAt);
    expect(after.dueAt).toBe(before.dueAt);
    expect(after.alertSchedule).toEqual(before.alertSchedule);
    expect(after.maxDurationDays).toBe(before.maxDurationDays);
    expect(after.stoppedAt).toBeNull();
  });

  it("writes every row as the scheduled job, with no person, in the clock's organization", async () => {
    await mockAdapter.jobs.runStorageClockAlerts(JOB, FIRST_TIER);
    const rows = jobRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.actorType).toBe("scheduled_job");
      expect(row.actorUserId).toBeNull();
      expect(row.actorLabel).toBe("storage-clock-alerts");
      expect(row.organizationId).toBe(ID.ORG.cascade);
    }
    expect(rows.map((row) => row.eventType)).toContain(
      "storage_clock.status_changed",
    );
  });

  it("makes an elapsed container overdue, as the re-tier would, and fires once", async () => {
    const run = await mockAdapter.jobs.runStorageClockAlerts(JOB, AFTER_DUE);
    expect(run.fired).toBeGreaterThanOrEqual(1);
    expect(clock(ID.CLOCK.soundDrum).status).toBe("overdue");
    expect(clock(ID.CLOCK.soundDrum).nextAlertAt).toBeNull();
    const container = mockStore()
      .containers.all()
      .find((row) => row.id === ID.CONTAINER.soundDrum);
    expect(container?.status).toBe("overdue");
    expect(jobRows().map((row) => row.eventType)).toContain(
      "container.status_changed",
    );

    expect(
      await mockAdapter.jobs.runStorageClockAlerts(JOB, AFTER_DUE),
    ).toEqual({ evaluated: 0, fired: 0 });
  });

  it("picks nothing before anything is due", async () => {
    expect(
      await mockAdapter.jobs.runStorageClockAlerts(
        JOB,
        "2026-10-14T12:00:00.000Z",
      ),
    ).toEqual({ evaluated: 0, fired: 0 });
  });
});

describe("POST /api/jobs/storage-clock-alerts", () => {
  const SECRET = "test-cron-secret-0001";

  function call(authorization?: string): Promise<Response> {
    return POST(
      new Request("https://bmmp.test/api/jobs/storage-clock-alerts", {
        method: "POST",
        headers: authorization === undefined ? {} : { authorization },
      }),
    );
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("refuses everyone with 503 when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.code).toBe("NOT_CONFIGURED");
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it.each([
    ["a wrong secret", "Bearer not-the-secret"],
    ["no bearer prefix", SECRET],
    ["no header", undefined],
  ])("refuses %s with 401", async (_case, header) => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const response = await call(header);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(((await response.json()) as { code: string }).code).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("runs with the right secret, and a second call fires nothing", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(FIRST_TIER));

    const first = await call(`Bearer ${SECRET}`);
    expect(first.status).toBe(200);
    const once = (await first.json()) as { evaluated: number; fired: number };
    expect(once.fired).toBeGreaterThanOrEqual(1);

    const second = await call(`Bearer ${SECRET}`);
    expect(await second.json()).toEqual({ evaluated: 0, fired: 0 });
  });
});
