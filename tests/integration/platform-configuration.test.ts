import { beforeEach, describe, expect, it } from "vitest";
import type { RequestContext } from "@/data/contracts/context";
import { mockAdapter, resetMockStore } from "@/data/mock";
import * as fixtures from "@/data/mock/fixtures";
import * as ID from "@/data/mock/fixtures/ids";
import { validateIntakeGateConfiguration } from "@/domain/intake/thresholds";

/**
 * `platformConfiguration.readIntakeGateConfiguration` — the one read a
 * threshold value ever comes through (D-22, D-40; Rule 2.16).
 *
 * What is proven: the set the adapter hands back is one the domain's
 * validator accepts, and its **shape** is the shape the fixtures already stamp
 * on every intake session (`gateThresholdsApplied`) and every extraction row
 * (`bandCutoffsApplied`). If the two ever diverge, a stamped decision stops
 * reproducing under the configuration in force — the thing the stamp exists
 * for.
 *
 * No threshold value appears in this file. Every comparison is
 * fixture-to-read, never literal-to-read: the values are the mock's database,
 * and this test has no opinion about what they are.
 */

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-corr-config-0001",
    ...overrides,
  };
}

const HANDLER = ctx();
const RAINIER = ctx({
  userId: ID.USER.joRainierHandler,
  organizationId: ID.ORG.rainier,
});

function sortedKeys(value: object): readonly string[] {
  return Object.keys(value).sort();
}

beforeEach(() => {
  resetMockStore();
});

describe("readIntakeGateConfiguration", () => {
  it("returns a set the domain validator accepts, with a traceable version", async () => {
    const configuration =
      await mockAdapter.platformConfiguration.readIntakeGateConfiguration(
        HANDLER,
      );
    const validation = validateIntakeGateConfiguration(configuration);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.configuration).toEqual(configuration);
    expect(configuration.configurationVersion.trim()).not.toBe("");
  });

  it("stamps the shape the fixture sessions already carry as gateThresholdsApplied", async () => {
    const { thresholds } =
      await mockAdapter.platformConfiguration.readIntakeGateConfiguration(
        HANDLER,
      );
    expect(fixtures.intakeSessions.length).toBeGreaterThan(0);
    for (const session of fixtures.intakeSessions) {
      expect(sortedKeys(session.gateThresholdsApplied), session.id).toEqual(
        sortedKeys(thresholds),
      );
      // The values agree too: a fixture decision reproduces under the
      // configuration in force (Rule 2.16). Fixture-to-read, never a literal.
      expect(session.gateThresholdsApplied, session.id).toEqual(thresholds);
    }
  });

  it("stamps the shape the fixture extraction rows already carry as bandCutoffsApplied", async () => {
    const { bandCutoffs } =
      await mockAdapter.platformConfiguration.readIntakeGateConfiguration(
        HANDLER,
      );
    expect(fixtures.labelExtractions.length).toBeGreaterThan(0);
    for (const row of fixtures.labelExtractions) {
      expect(sortedKeys(row.bandCutoffsApplied), row.id).toEqual(
        sortedKeys(bandCutoffs),
      );
      expect(row.bandCutoffsApplied, row.id).toEqual(bandCutoffs);
    }
  });

  it("hands every organisation the same platform floor in B1a — there is no tenant override yet", async () => {
    const cascade =
      await mockAdapter.platformConfiguration.readIntakeGateConfiguration(
        HANDLER,
      );
    const rainier =
      await mockAdapter.platformConfiguration.readIntakeGateConfiguration(
        RAINIER,
      );
    expect(rainier).toEqual(cascade);
  });

  it("hands back a set the caller cannot mutate into the adapter's copy", async () => {
    const first =
      await mockAdapter.platformConfiguration.readIntakeGateConfiguration(
        HANDLER,
      );
    const second =
      await mockAdapter.platformConfiguration.readIntakeGateConfiguration(
        HANDLER,
      );
    // Validation rebuilds the object on every read, so two reads are equal
    // and distinct — a screen holding one cannot poison the next.
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.thresholds).not.toBe(first.thresholds);
  });
});

describe("a malformed set is refused, with every issue named", () => {
  it("names each violation in one pass rather than stopping at the first", () => {
    // Test literals only. Nothing here is a threshold anyone applies.
    const malformed = {
      configurationVersion: "",
      thresholds: {
        minFieldConfidence: 0,
        minMatchScore: 0.5,
        minMatchSeparation: 0.6,
      },
      bandCutoffs: { high: 0.5, medium: 0.7, low: 0.4 },
      matchTolerances: {
        voltageRelative: 2,
        capacityRelative: 0.05,
        energyRelative: "five percent",
      },
    };
    const validation = validateIntakeGateConfiguration(malformed);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues).toEqual([
      "configurationVersion must be a non-empty string",
      "thresholds.minFieldConfidence must be a number in (0, 1]",
      "thresholds.minMatchSeparation must be smaller than thresholds.minMatchScore",
      "bandCutoffs must satisfy high > medium > low",
      "matchTolerances.voltageRelative must be a number in (0, 1]",
      "matchTolerances.energyRelative must be a number in (0, 1]",
      "matchScoring must be an object",
    ]);
  });

  it("names every missing section when the row is an object with nothing in it", () => {
    const validation = validateIntakeGateConfiguration({});
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues).toEqual([
      "configurationVersion must be a non-empty string",
      "thresholds must be an object",
      "bandCutoffs must be an object",
      "matchTolerances must be an object",
      "matchScoring must be an object",
    ]);
  });

  it("refuses anything that is not an object at all", () => {
    for (const value of [null, undefined, "platform-floor", 1, [], true]) {
      const validation = validateIntakeGateConfiguration(value);
      expect(validation.ok, String(value)).toBe(false);
      if (validation.ok) continue;
      expect(validation.issues).toEqual(["configuration is not an object"]);
    }
  });
});
