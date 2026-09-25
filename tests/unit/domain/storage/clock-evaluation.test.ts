import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { addCivilDays, startOfCivilDay } from "@/domain/storage/clock-display";
import {
  alertAudienceRoles,
  evaluateStorageClock,
  storageClockAlert,
  type ClockStateFacts,
} from "@/domain/storage/clock-evaluation";
import { startStorageClock } from "@/domain/storage/placement";
import { fixtureAccumulationRule } from "./fixture-rule";

/**
 * The alert job's evaluation — Rules 4.10, 4.13, 4.15, 4.29; T-27, T-48;
 * EC-30.
 *
 * Every date comes from a clock started by `startStorageClock` against the
 * fixture rule version, and every "now" is passed in. Nothing here states a
 * period of its own.
 */

const ZONE = "America/Los_Angeles";
const RULE = fixtureAccumulationRule();

function clockStartedAt(placedAt: string): ClockStateFacts & {
  readonly clockStartAt: string;
  readonly maxDurationDays: number;
} {
  const started = startStorageClock(
    { placedAt, timeZone: ZONE, existingClock: null },
    RULE,
  ).result;
  return {
    status: "running",
    alertBand: "none",
    dueAt: started.dueAt,
    alertSchedule: started.alertSchedule,
    timeZone: ZONE,
    stoppedAt: null,
    clockStartAt: started.clockStartAt,
    maxDurationDays: started.maxDurationDays,
  };
}

const CLOCK = clockStartedAt("2026-03-02T18:30:00.000Z");

function tierDate(tier: string): string {
  const value = CLOCK.alertSchedule[tier];
  if (typeof value !== "string") throw new Error(`no ${tier} tier`);
  return value;
}

describe("evaluateStorageClock", () => {
  it("is running, outside every band, the day it starts", () => {
    const evaluation = evaluateStorageClock(CLOCK, CLOCK.clockStartAt);
    expect(evaluation).toMatchObject({
      status: "running",
      alertBand: "none",
      changed: false,
    });
    // The next look is the first tier's day, at the site.
    expect(evaluation.nextAlertAt).toBe(
      startOfCivilDay(tierDate("early"), ZONE),
    );
  });

  it("enters each tier on its scheduled day at the site — the ladder is data", () => {
    for (const tier of ["early", "mid", "final"] as const) {
      const evaluation = evaluateStorageClock(
        CLOCK,
        startOfCivilDay(tierDate(tier), ZONE),
      );
      expect(evaluation.status).toBe("approaching_limit");
      expect(evaluation.alertBand).toBe(tier);
      expect(evaluation.changed).toBe(true);
    }
  });

  it("is not in a tier the day before it (Rule 4.29)", () => {
    const dayBefore = addCivilDays(tierDate("early"), -1);
    const lateThatDay = new Date(
      Date.parse(startOfCivilDay(tierDate("early"), ZONE)) - 1,
    ).toISOString();
    expect(evaluateStorageClock(CLOCK, lateThatDay).alertBand).toBe("none");
    expect(dayBefore < tierDate("early")).toBe(true);
  });

  it("is overdue the instant after `due_at`, and not a millisecond before (Rule 4.15)", () => {
    expect(evaluateStorageClock(CLOCK, CLOCK.dueAt).status).toBe(
      "approaching_limit",
    );
    const after = new Date(Date.parse(CLOCK.dueAt) + 1).toISOString();
    const evaluation = evaluateStorageClock(CLOCK, after);
    expect(evaluation).toMatchObject({
      status: "overdue",
      alertBand: "overdue",
      nextAlertAt: null,
    });
  });

  it("EC-30 — a daylight-saving boundary neither creates nor erases a day", () => {
    // Starts in winter (PST); the whole period crosses spring-forward and
    // fall-back. The last day inside the period ends at local midnight.
    const winter = clockStartedAt("2026-01-10T20:00:00.000Z");
    const lastLocalMoment = winter.dueAt;
    expect(evaluateStorageClock(winter, lastLocalMoment).status).not.toBe(
      "overdue",
    );
    const firstMomentAfter = new Date(
      Date.parse(lastLocalMoment) + 1,
    ).toISOString();
    expect(evaluateStorageClock(winter, firstMomentAfter).status).toBe(
      "overdue",
    );
  });

  it("never moves a band backwards, and never clears overdue", () => {
    const stored: ClockStateFacts = {
      ...CLOCK,
      status: "overdue",
      alertBand: "overdue",
    };
    expect(evaluateStorageClock(stored, CLOCK.clockStartAt)).toMatchObject({
      status: "overdue",
      alertBand: "overdue",
      changed: false,
    });
    const midStored: ClockStateFacts = {
      ...CLOCK,
      status: "approaching_limit",
      alertBand: "mid",
    };
    expect(
      evaluateStorageClock(midStored, startOfCivilDay(tierDate("early"), ZONE))
        .alertBand,
    ).toBe("mid");
  });

  it("leaves a stopped clock exactly as it is", () => {
    const stopped: ClockStateFacts = {
      ...CLOCK,
      status: "stopped",
      stoppedAt: "2026-05-01T00:00:00.000Z",
    };
    const after = new Date(Date.parse(CLOCK.dueAt) + 1).toISOString();
    expect(evaluateStorageClock(stopped, after)).toMatchObject({
      status: "stopped",
      changed: false,
      nextAlertAt: null,
    });
  });
});

describe("storageClockAlert", () => {
  const base = {
    containerCode: "C-0009",
    containerId: "container-id",
    storageClockId: "clock-id",
    clockStartAt: CLOCK.clockStartAt,
    dueAt: CLOCK.dueAt,
    maxDurationDays: CLOCK.maxDurationDays,
    timeZone: ZONE,
    governingRuleVersionId: RULE.version.ruleVersionId,
  };

  it("raises overdue at `critical` and a band at `attention` (T-48), never from the band's rank", () => {
    const overdue = storageClockAlert({
      ...base,
      band: "overdue",
      asOf: new Date(Date.parse(CLOCK.dueAt) + 1).toISOString(),
    });
    expect(overdue.severity).toBe("critical");
    expect(overdue.body).toMatch(/accepts no new items/);
    expect(overdue.body).toMatch(/shipment/);
    expect(overdue.body).toMatch(/remediation/);

    for (const band of ["early", "mid", "final"] as const) {
      expect(
        storageClockAlert({ ...base, band, asOf: CLOCK.clockStartAt }).severity,
      ).toBe("attention");
    }
  });

  it("is idempotent per (clock, band) and routed to P1 and P2 (Rules 4.13, 4.14)", () => {
    const alert = storageClockAlert({
      ...base,
      band: "final",
      asOf: CLOCK.clockStartAt,
    });
    expect(alert.dedupeKey).toBe("storage_clock:clock-id:final");
    expect(alert.audienceRoles).toEqual([
      "compliance_handler",
      "facility_manager",
    ]);
    expect(alertAudienceRoles("storage_clock")).toEqual(alert.audienceRoles);
  });

  it("states the condition and never a chance of anything (Rules 1.25, 10.3)", () => {
    for (const band of ["early", "mid", "final", "overdue"] as const) {
      const alert = storageClockAlert({
        ...base,
        band,
        asOf: CLOCK.clockStartAt,
      });
      expect(`${alert.title} ${alert.body}`).not.toMatch(
        /probability|likelihood|risk|chance|%/i,
      );
      expect(alert.body).toContain(ZONE);
    }
  });
});

describe("Rule 1.23 — no period, offset or tier count is a literal in the evaluator", () => {
  it("contains none in the module source", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../src/domain/storage/clock-evaluation.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const forbidden of [
      "365",
      "270",
      "180",
      "90",
      "60",
      "30",
      "one year",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
