import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { MissingRuleVersionError, ruleOutcome } from "@/domain/rules/outcome";
import type {
  ResolvedRule,
  RuleVersionCandidate,
} from "@/domain/rules/resolve";
import {
  addCivilDays,
  endOfCivilDay,
  startOfCivilDay,
} from "@/domain/storage/clock-display";
import {
  ACCUMULATION_RULE_KEY,
  admitToContainer,
  InvalidRulePayloadError,
  requiredContainerType,
  startStorageClock,
} from "@/domain/storage/placement";
import * as fixtures from "@/data/mock/fixtures";
import { CLOCK, JURISDICTION, RULE_VERSION } from "@/data/mock/fixtures/ids";
import type { JsonObject } from "@/types/common";

/**
 * Placement and the storage clock — Rules 4.4, 4.5, 4.10, 4.13, 4.16, 4.28,
 * 6.17; T-23, T-27.
 *
 * The clock is proven against the fixture rows: the running clocks in the mock
 * database carry due dates and alert ladders that were written by hand, and
 * `startStorageClock` must reproduce every one of them from the fixture rule
 * version and the fixture start instant. Where this file states a period, it
 * reads it from the fixture payload — never from a literal of its own.
 */

const SITE_ZONE = "America/Los_Angeles";

function clockById(id: string) {
  const found = fixtures.storageClocks.find((clock) => clock.id === id);
  if (found === undefined) throw new Error(`No fixture storage clock ${id}`);
  return found;
}

/** The fixture accumulation rule, resolved the way `resolveRules` would resolve it. */
function fixtureAccumulationRule(): ResolvedRule {
  const row = fixtures.ruleVersions.find(
    (candidate) => candidate.id === RULE_VERSION.waAccumulationPeriod2026,
  );
  const rule = fixtures.jurisdictionRules.find(
    (candidate) => candidate.id === row?.jurisdictionRuleId,
  );
  const jurisdiction = fixtures.jurisdictions.find(
    (candidate) => candidate.id === JURISDICTION.washington,
  );
  if (!row || !rule || !jurisdiction) throw new Error("fixture rule missing");
  const version: RuleVersionCandidate = {
    ruleVersionId: row.id,
    jurisdictionRuleId: rule.id,
    jurisdictionId: rule.jurisdictionId,
    ruleKey: rule.ruleKey,
    domain: rule.domain,
    title: rule.title,
    versionLabel: row.versionLabel,
    effectiveOn: row.effectiveOn,
    expiresOn: row.expiresOn,
    citation: row.citation,
    citationUrl: row.citationUrl,
    payload: row.payload,
    payloadSchemaKey: row.payloadSchemaKey,
    appliesToApplicationClasses: rule.appliesToApplicationClasses,
    publishedAt: row.publishedAt,
    isRuleActive: rule.isActive,
  };
  return {
    ruleKey: rule.ruleKey,
    version,
    jurisdiction: {
      id: jurisdiction.id,
      code: jurisdiction.code,
      name: jurisdiction.name,
      level: jurisdiction.level,
    },
    level: jurisdiction.level,
  };
}

const RULE = fixtureAccumulationRule();

function withPayload(
  payload: JsonObject,
  patch: Partial<RuleVersionCandidate> = {},
): ResolvedRule {
  return {
    ...RULE,
    ruleKey: patch.ruleKey ?? RULE.ruleKey,
    version: { ...RULE.version, payload, ...patch },
  };
}

describe("civil-day boundaries in the site's zone", () => {
  it("starts a civil day at local midnight, expressed in UTC", () => {
    expect(startOfCivilDay("2027-04-29", SITE_ZONE)).toBe(
      "2027-04-29T07:00:00.000Z",
    );
    // Standard time: the same date is an hour later in UTC.
    expect(startOfCivilDay("2027-01-15", SITE_ZONE)).toBe(
      "2027-01-15T08:00:00.000Z",
    );
    expect(startOfCivilDay("2027-04-29", "UTC")).toBe(
      "2027-04-29T00:00:00.000Z",
    );
  });

  it("ends a civil day one millisecond before the next begins", () => {
    expect(endOfCivilDay("2027-07-27", SITE_ZONE)).toBe(
      "2027-07-28T06:59:59.999Z",
    );
  });

  it("holds across the spring-forward day, which is twenty-three hours long", () => {
    // 2026-03-08 is the US spring-forward.
    expect(startOfCivilDay("2026-03-08", SITE_ZONE)).toBe(
      "2026-03-08T08:00:00.000Z",
    );
    expect(endOfCivilDay("2026-03-08", SITE_ZONE)).toBe(
      "2026-03-09T06:59:59.999Z",
    );
  });

  it("adds and subtracts whole calendar days", () => {
    expect(addCivilDays("2026-07-28", 365)).toBe("2027-07-28");
    expect(addCivilDays("2027-07-28", -90)).toBe("2027-04-29");
    expect(addCivilDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(() => addCivilDays("2026-07-28", 1.5)).toThrow(RangeError);
  });
});

describe("Rules 4.4, 4.5, 4.13 — the clock reproduces the fixture rows exactly", () => {
  it.each([CLOCK.soundDrum, CLOCK.quarantineDrum])(
    "reproduces due, ladder and next alert for fixture clock %s",
    (id) => {
      const stored = clockById(id);
      const outcome = startStorageClock(
        {
          placedAt: stored.clockStartAt,
          timeZone: stored.timeZone,
          existingClock: null,
        },
        RULE,
      );
      expect(outcome.result).toMatchObject({
        clockStartAt: stored.clockStartAt,
        maxDurationDays: stored.maxDurationDays,
        dueAt: stored.dueAt,
        alertSchedule: stored.alertSchedule,
        nextAlertAt: stored.nextAlertAt,
        timeZone: stored.timeZone,
        joinsExistingClock: false,
      });
      expect(outcome.ruleVersionsApplied).toHaveLength(1);
      expect(outcome.ruleVersionsApplied[0]).toMatchObject({
        ruleVersionId: stored.governingRuleVersionId,
        ruleKey: ACCUMULATION_RULE_KEY,
        citation: RULE.version.citation,
        outcome: `max_duration_days=${stored.maxDurationDays}`,
      });
    },
  );

  it("does not reproduce them under a different period — the figure is the payload's", () => {
    const stored = clockById(CLOCK.soundDrum);
    const shorter = withPayload({
      ...RULE.version.payload,
      maxDurationDays: stored.maxDurationDays - 1,
    });
    const outcome = startStorageClock(
      {
        placedAt: stored.clockStartAt,
        timeZone: stored.timeZone,
        existingClock: null,
      },
      shorter,
    );
    expect(outcome.result.dueAt).not.toBe(stored.dueAt);
    expect(outcome.result.maxDurationDays).toBe(stored.maxDurationDays - 1);
  });

  it("dates every tier the payload declares and nothing it does not", () => {
    const outcome = startStorageClock(
      {
        placedAt: "2026-07-28T13:05:00.000Z",
        timeZone: SITE_ZONE,
        existingClock: null,
      },
      withPayload({
        maxDurationDays: 10,
        alertOffsetsDays: { final: 3 },
        measure: "days",
      }),
    );
    expect(outcome.result.alertSchedule).toEqual({ final: "2026-08-04" });
    expect(outcome.result.nextAlertAt).toBe(
      startOfCivilDay("2026-08-04", SITE_ZONE),
    );
    expect(outcome.result.dueAt).toBe(endOfCivilDay("2026-08-06", SITE_ZONE));
  });
});

describe("Rule 4.4 — a record joins the container's running clock", () => {
  it("keeps the existing start and says no new clock is written", () => {
    const stored = clockById(CLOCK.soundDrum);
    const outcome = startStorageClock(
      {
        placedAt: "2026-08-20T18:00:00.000Z",
        timeZone: stored.timeZone,
        existingClock: { clockStartAt: stored.clockStartAt },
      },
      RULE,
    );
    expect(outcome.result.clockStartAt).toBe(stored.clockStartAt);
    expect(outcome.result.dueAt).toBe(stored.dueAt);
    expect(outcome.result.joinsExistingClock).toBe(true);
    expect(outcome.reasoning).toContain("joins the container's running clock");
    expect(outcome.inputsSnapshot.placedAt).toBe("2026-08-20T18:00:00.000Z");
  });

  it("starts from the placement when there is no clock to join", () => {
    const outcome = startStorageClock(
      {
        placedAt: "2026-08-20T18:00:00.000Z",
        timeZone: SITE_ZONE,
        existingClock: null,
      },
      RULE,
    );
    expect(outcome.result.clockStartAt).toBe("2026-08-20T18:00:00.000Z");
    expect(outcome.result.joinsExistingClock).toBe(false);
  });
});

describe("Rule 4.5 — an unreadable payload refuses rather than guesses", () => {
  const start = {
    placedAt: "2026-07-28T13:05:00.000Z",
    timeZone: SITE_ZONE,
    existingClock: null,
  };

  it.each([
    ["a missing period", { alertOffsetsDays: { early: 1 }, measure: "days" }],
    [
      "a zero period",
      { maxDurationDays: 0, alertOffsetsDays: { early: 1 }, measure: "days" },
    ],
    [
      "a fractional period",
      { maxDurationDays: 1.5, alertOffsetsDays: { early: 1 }, measure: "days" },
    ],
    [
      "a measure other than days",
      {
        maxDurationDays: 10,
        alertOffsetsDays: { early: 1 },
        measure: "months",
      },
    ],
    [
      "no ladder at all",
      { maxDurationDays: 10, alertOffsetsDays: {}, measure: "days" },
    ],
    [
      "a tier T-27 does not name",
      { maxDurationDays: 10, alertOffsetsDays: { soon: 1 }, measure: "days" },
    ],
    [
      "a negative offset",
      { maxDurationDays: 10, alertOffsetsDays: { early: -1 }, measure: "days" },
    ],
  ])("throws InvalidRulePayloadError on %s", (_label, payload) => {
    expect(() =>
      startStorageClock(start, withPayload(payload as unknown as JsonObject)),
    ).toThrow(InvalidRulePayloadError);
  });

  it("throws on a schema key it does not know", () => {
    expect(() =>
      startStorageClock(
        start,
        withPayload(RULE.version.payload, {
          payloadSchemaKey: "storage.accumulation_period.v2",
        }),
      ),
    ).toThrow(InvalidRulePayloadError);
  });

  it("throws when handed a different rule", () => {
    expect(() =>
      startStorageClock(
        start,
        withPayload(RULE.version.payload, {
          ruleKey: "classification.waste_stream",
        }),
      ),
    ).toThrow(InvalidRulePayloadError);
  });

  it("accepts the fixture payload", () => {
    expect(() => startStorageClock(start, RULE)).not.toThrow();
  });

  it("cannot produce an outcome with no applied version (TECHNICAL_SPEC.md §6.3)", () => {
    expect(() =>
      ruleOutcome({
        result: null,
        reasoning: "no version",
        ruleVersionsApplied: [],
        inputsSnapshot: {},
        context: ACCUMULATION_RULE_KEY,
      }),
    ).toThrow(MissingRuleVersionError);
  });
});

describe("requiredContainerType (T-23)", () => {
  it("names no container for an undetermined classification", () => {
    expect(
      requiredContainerType("undetermined", {
        ddrFlags: [],
        assessmentStatus: "assessed_sound",
      }),
    ).toBeNull();
  });

  it("routes a flagged record to the quarantine class (Rules 6.17, 6.18)", () => {
    expect(
      requiredContainerType("light_category", {
        ddrFlags: ["damaged"],
        assessmentStatus: "assessed_damaged",
      }),
    ).toBe("light_category_ddr");
  });

  it("holds an unassessed record and stores a sound one", () => {
    expect(
      requiredContainerType("fully_regulated", {
        ddrFlags: [],
        assessmentStatus: "not_assessed",
      }),
    ).toBe("fully_regulated_hold");
    expect(
      requiredContainerType("fully_regulated", {
        ddrFlags: [],
        assessmentStatus: "assessed_sound",
      }),
    ).toBe("fully_regulated_sound");
  });
});

describe("admitToContainer", () => {
  const open = {
    status: "open",
    containerType: "light_category_sound",
  } as const;

  it("admits an open container of the required type", () => {
    expect(admitToContainer(open, "light_category_sound")).toEqual({
      ok: true,
    });
  });

  it("refuses when the classification is undetermined, whatever the container", () => {
    const admission = admitToContainer(open, null);
    expect(admission).toMatchObject({
      ok: false,
      reason: "classification_undetermined",
    });
  });

  it("Rule 4.16 — refuses an overdue container and names the two paths out", () => {
    const admission = admitToContainer(
      { ...open, status: "overdue" },
      "light_category_sound",
    );
    expect(admission).toMatchObject({ ok: false, reason: "container_overdue" });
    if (admission.ok) return;
    expect(admission.message).toMatch(/ship/i);
    expect(admission.message).toMatch(/remediation/i);
  });

  it("refuses a container that is not open, stating its status", () => {
    const admission = admitToContainer(
      { ...open, status: "closed" },
      "light_category_sound",
    );
    expect(admission).toMatchObject({
      ok: false,
      reason: "container_not_open",
    });
    if (admission.ok) return;
    expect(admission.message).toContain("Closed");
  });

  it("Rule 4.28 — refuses a segregation mismatch and names both classes", () => {
    const admission = admitToContainer(open, "light_category_ddr");
    expect(admission).toMatchObject({
      ok: false,
      reason: "segregation_class_mismatch",
    });
    if (admission.ok) return;
    expect(admission.message).toContain("Light waste — sound");
    expect(admission.message).toContain("Light waste — damaged / defective");
  });

  it("reports overdue before a mismatch — the container's state comes first", () => {
    const admission = admitToContainer(
      { status: "overdue", containerType: "fully_regulated_ddr" },
      "light_category_sound",
    );
    expect(admission).toMatchObject({ ok: false, reason: "container_overdue" });
  });
});

describe("Rule 1.23 — no period, threshold or deadline is a literal in the module", () => {
  it("contains no accumulation-period number in placement.ts", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../../../src/domain/storage/placement.ts", import.meta.url),
      ),
      "utf8",
    );
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const forbidden of [
      "365",
      "180",
      "270",
      "90",
      "60",
      "30",
      "one year",
      "12 months",
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });
});
