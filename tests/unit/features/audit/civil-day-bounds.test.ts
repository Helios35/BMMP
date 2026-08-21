import { describe, expect, it } from "vitest";

import {
  endOfCivilDayInZone,
  isCivilDate,
  startOfCivilDayInZone,
} from "@/features/audit/civil-day-bounds";

/**
 * `/audit`'s date range resolves calendar dates in the **organization's** zone —
 * Rule 12.20.
 *
 * The interesting cases are the ones a UTC implementation gets wrong: a
 * daylight-saving boundary, and a zone whose day starts before UTC's.
 */

describe("isCivilDate", () => {
  it("accepts a calendar date and rejects everything else", () => {
    expect(isCivilDate("2026-06-12")).toBe(true);
    expect(isCivilDate(undefined)).toBe(false);
    expect(isCivilDate("")).toBe(false);
    expect(isCivilDate("yesterday")).toBe(false);
    expect(isCivilDate("2026-6-12")).toBe(false);
    // Shaped like a date and not one. A range parameter that is not a date is
    // dropped rather than rendering an error page (§7.4 rule 2).
    expect(isCivilDate("2026-02-30")).toBe(false);
  });
});

describe("startOfCivilDayInZone", () => {
  it("is midnight in the zone, not midnight in UTC", () => {
    // 2026-06-12 is daylight time in Los Angeles: UTC−7.
    expect(startOfCivilDayInZone("2026-06-12", "America/Los_Angeles")).toBe(
      "2026-06-12T07:00:00.000Z",
    );
    // 2026-01-12 is standard time: UTC−8. A fixed offset would be an hour out
    // for half the year, which puts the first rows of a day outside the filter
    // the reader typed.
    expect(startOfCivilDayInZone("2026-01-12", "America/Los_Angeles")).toBe(
      "2026-01-12T08:00:00.000Z",
    );
  });

  it("lands on the right side of a spring-forward morning", () => {
    // 2026-03-08 is the day the clocks go forward in the United States; local
    // midnight is still UTC−8 even though most of the day is UTC−7.
    expect(startOfCivilDayInZone("2026-03-08", "America/Los_Angeles")).toBe(
      "2026-03-08T08:00:00.000Z",
    );
  });

  it("is identity in UTC", () => {
    expect(startOfCivilDayInZone("2026-06-12", "UTC")).toBe(
      "2026-06-12T00:00:00.000Z",
    );
  });
});

describe("endOfCivilDayInZone", () => {
  it("is the last instant of the day, inclusive", () => {
    expect(endOfCivilDayInZone("2026-06-12", "America/Los_Angeles")).toBe(
      "2026-06-13T06:59:59.999Z",
    );
    expect(endOfCivilDayInZone("2026-06-12", "UTC")).toBe(
      "2026-06-12T23:59:59.999Z",
    );
  });

  it("keeps a 23-hour day whole", () => {
    // The spring-forward day is 23 hours long. Adding a fixed 24 hours to the
    // start would spill into the next day and pull the next day's first rows in.
    const start = Date.parse(
      startOfCivilDayInZone("2026-03-08", "America/Los_Angeles"),
    );
    const end = Date.parse(
      endOfCivilDayInZone("2026-03-08", "America/Los_Angeles"),
    );
    expect(end - start).toBe(23 * 60 * 60 * 1000 - 1);
  });
});
