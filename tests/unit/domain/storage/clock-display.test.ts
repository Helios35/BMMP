import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  civilDateInZone,
  civilDaysBetween,
  storageClockDisplay,
} from "@/domain/storage/clock-display";
import * as fixtures from "@/data/mock/fixtures";
import { CLOCK } from "@/data/mock/fixtures/ids";
import type { StorageClock } from "@/types/storage";

/**
 * The storage-clock day maths — `UX_SPEC.md` §2.4, Rules 4.5, 4.15, 4.29.
 *
 * The module is pure, so this is where the product's clock arithmetic is proven:
 * calendar days in the **site's** zone, a daylight-saving boundary that neither
 * creates nor erases a day, no negative "remaining", and **no period, threshold
 * or deadline written as a literal anywhere in the module** (Rule 1.23).
 */

const SITE_ZONE = "America/Los_Angeles";

function clockById(id: string): StorageClock {
  const found = fixtures.storageClocks.find((clock) => clock.id === id);
  if (found === undefined) throw new Error(`No fixture storage clock ${id}`);
  return found;
}

const OVERDUE = clockById(CLOCK.overdueDrum);
const RUNNING = clockById(CLOCK.soundDrum);

describe("civil dates in the site's zone", () => {
  it("reads an instant as the calendar in that zone reads it, not as UTC", () => {
    // 07:00Z on 12 June is still 11 June in Los Angeles. A container is not
    // overdue because a server is in a different zone (Rule 4.29).
    expect(civilDateInZone("2026-06-12T06:59:59.999Z", SITE_ZONE)).toBe(
      "2026-06-11",
    );
    expect(civilDateInZone("2026-06-12T06:59:59.999Z", "UTC")).toBe(
      "2026-06-12",
    );
  });

  it("counts whole calendar days between two civil dates", () => {
    expect(civilDaysBetween("2026-06-01", "2026-06-30")).toBe(29);
    expect(civilDaysBetween("2026-06-30", "2026-06-01")).toBe(-29);
    expect(civilDaysBetween("2026-06-01", "2026-06-01")).toBe(0);
  });
});

describe("daylight saving neither creates nor erases a day (EC-30)", () => {
  it("counts two days across the spring-forward boundary, not 1.958", () => {
    // 2026-03-08 is the US spring-forward. Noon to noon across it is 47 elapsed
    // hours, which a millisecond difference would floor to one day.
    const display = storageClockDisplay(
      "2026-03-07T20:00:00.000Z",
      "2027-03-07T20:00:00.000Z",
      RUNNING.maxDurationDays,
      "2026-03-09T19:00:00.000Z",
      SITE_ZONE,
    );
    expect(display.startDateInZone).toBe("2026-03-07");
    expect(display.asOfDateInZone).toBe("2026-03-09");
    expect(display.elapsedDays).toBe(2);
  });

  it("counts two days across the autumn fall-back boundary too", () => {
    // 2026-11-01 is the US fall-back: 49 elapsed hours across the same two days.
    const display = storageClockDisplay(
      "2026-10-31T19:00:00.000Z",
      "2027-10-31T19:00:00.000Z",
      RUNNING.maxDurationDays,
      "2026-11-02T20:00:00.000Z",
      SITE_ZONE,
    );
    expect(display.elapsedDays).toBe(2);
  });
});

describe("a clock inside its period", () => {
  it("reports elapsed, remaining and a percentage from the stored duration", () => {
    const display = storageClockDisplay(
      RUNNING.clockStartAt,
      RUNNING.dueAt,
      RUNNING.maxDurationDays,
      "2026-08-21T12:00:00.000Z",
      RUNNING.timeZone,
    );
    expect(display.startDateInZone).toBe("2026-07-28");
    expect(display.elapsedDays).toBe(24);
    expect(display.overrunDays).toBe(0);
    expect(display.isPastDueByDate).toBe(false);
    expect(display.remainingDays).toBeGreaterThan(0);
    expect(display.percent).toBe(
      Math.round((24 / RUNNING.maxDurationDays) * 100),
    );
  });
});

describe("a clock past its due date", () => {
  const display = storageClockDisplay(
    OVERDUE.clockStartAt,
    OVERDUE.dueAt,
    OVERDUE.maxDurationDays,
    "2026-08-21T12:00:00.000Z",
    OVERDUE.timeZone,
  );

  it("never reports a negative remaining", () => {
    // A negative "remaining" reads as a number to plan against. There is nothing
    // remaining; there is an overrun, and it is stated separately.
    expect(display.remainingDays).toBe(0);
    expect(display.isPastDueByDate).toBe(true);
  });

  it("states the overrun as a positive figure", () => {
    expect(display.overrunDays).toBeGreaterThan(0);
    expect(display.overrunDays).toBe(
      civilDaysBetween(display.dueDateInZone, display.asOfDateInZone),
    );
  });

  it("clamps the percentage at the top of the bar", () => {
    expect(display.percent).toBe(100);
  });
});

describe("degenerate inputs are rendered, never crashed on", () => {
  it("treats a non-positive stored duration as full rather than dividing by zero", () => {
    const display = storageClockDisplay(
      "2026-01-01T08:00:00.000Z",
      "2026-01-02T08:00:00.000Z",
      0,
      "2026-01-05T08:00:00.000Z",
      SITE_ZONE,
    );
    expect(display.percent).toBe(100);
  });

  it("floors elapsed at zero when the clock has not started yet", () => {
    const display = storageClockDisplay(
      "2026-06-10T08:00:00.000Z",
      "2027-06-10T08:00:00.000Z",
      RUNNING.maxDurationDays,
      "2026-06-01T08:00:00.000Z",
      SITE_ZONE,
    );
    expect(display.elapsedDays).toBe(0);
    expect(display.percent).toBe(0);
  });
});

describe("Rule 1.23 — no period, threshold or deadline is a literal here", () => {
  it("contains no accumulation-period number in the module source", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../src/domain/storage/clock-display.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    // Comments are stripped first: citing Rule 4.5's "never assumes one year" is
    // the opposite of hard-coding one year, and a test that could not tell them
    // apart would push the next builder to delete the citation.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // The duration always arrives as an argument. Any of these appearing would
    // mean the module had started deciding how long a period is, which is
    // jurisdiction data and never code (Rule 1.23, `_ANCHORS.md` §7.4).
    for (const forbidden of [
      "365",
      "180",
      "270",
      "one year",
      "12 months",
      "days remaining",
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });
});
