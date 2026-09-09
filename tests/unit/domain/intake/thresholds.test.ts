import { describe, expect, it } from "vitest";

import {
  validateIntakeGateConfiguration,
  type IntakeGateConfiguration,
} from "@/domain/intake/thresholds";

/**
 * The shape of the gate configuration — D-22, D-40, Rule 2.16.
 *
 * The module under test holds no value, no default and no example. **Every
 * number below is this test's own**, invented so the validator has something
 * to refuse; none is the platform's, and nothing here asserts what "the"
 * threshold is. A coherent set is accepted whole; an incoherent one is refused
 * with every issue named, because a gate with a half-valid configuration is a
 * gate that lets a record through on the half that parsed.
 */

const VALID: IntakeGateConfiguration = {
  configurationVersion: "test-1",
  thresholds: {
    minFieldConfidence: 0.8,
    minMatchScore: 0.7,
    minMatchSeparation: 0.1,
  },
  bandCutoffs: { high: 0.8, medium: 0.5, low: 0.2 },
  matchTolerances: {
    voltageRelative: 0.05,
    capacityRelative: 0.05,
    energyRelative: 0.05,
  },
  matchScoring: {
    labelPatternScore: 0.9,
    similarityCeiling: 0.8,
    numericAgreementBonus: 0.05,
  },
};

function issuesOf(value: unknown): readonly string[] {
  const validation = validateIntakeGateConfiguration(value);
  return validation.ok ? [] : validation.issues;
}

/** The valid set with one section dropped entirely. */
function without(section: keyof IntakeGateConfiguration): unknown {
  return Object.fromEntries(
    Object.entries(VALID).filter(([key]) => key !== section),
  );
}

describe("validateIntakeGateConfiguration", () => {
  it("accepts a coherent set and returns it field by field", () => {
    const result = validateIntakeGateConfiguration(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.configuration).toEqual(VALID);
    }
  });

  it("refuses anything that is not an object", () => {
    expect(validateIntakeGateConfiguration(null).ok).toBe(false);
    expect(validateIntakeGateConfiguration("0.9").ok).toBe(false);
    expect(validateIntakeGateConfiguration([]).ok).toBe(false);
  });

  it("refuses a score of zero — zero would pass everything", () => {
    const result = validateIntakeGateConfiguration({
      ...VALID,
      thresholds: { ...VALID.thresholds, minFieldConfidence: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain(
        "thresholds.minFieldConfidence must be a number in (0, 1]",
      );
    }
  });

  it("refuses a score above one and a non-finite score", () => {
    expect(
      validateIntakeGateConfiguration({
        ...VALID,
        bandCutoffs: { ...VALID.bandCutoffs, high: 1.5 },
      }).ok,
    ).toBe(false);
    expect(
      validateIntakeGateConfiguration({
        ...VALID,
        bandCutoffs: { ...VALID.bandCutoffs, low: Number.NaN },
      }).ok,
    ).toBe(false);
  });

  it("refuses cutoffs that are not strictly descending", () => {
    const result = validateIntakeGateConfiguration({
      ...VALID,
      bandCutoffs: { high: 0.5, medium: 0.5, low: 0.2 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain(
        "bandCutoffs must satisfy high > medium > low",
      );
    }
  });

  it("refuses a separation that is not smaller than the match score", () => {
    const result = validateIntakeGateConfiguration({
      ...VALID,
      thresholds: { ...VALID.thresholds, minMatchSeparation: 0.7 },
    });
    expect(result.ok).toBe(false);
  });

  it("refuses an empty version", () => {
    const result = validateIntakeGateConfiguration({
      ...VALID,
      configurationVersion: "  ",
    });
    expect(result.ok).toBe(false);
  });

  it("reports every issue rather than the first", () => {
    const result = validateIntakeGateConfiguration({
      configurationVersion: "",
      thresholds: null,
      bandCutoffs: null,
      matchTolerances: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("a coherent set is rebuilt, not aliased", () => {
  it("drops extra keys and shares no object with the input", () => {
    const input = { ...VALID, unexpected: "ignored" };
    const validation = validateIntakeGateConfiguration(input);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.configuration).not.toHaveProperty("unexpected");
    expect(validation.configuration).not.toBe(input);
    expect(validation.configuration.thresholds).not.toBe(input.thresholds);
  });

  it("accepts a score of exactly one — the interval is (0, 1], closed at the top", () => {
    expect(
      validateIntakeGateConfiguration({
        ...VALID,
        // The stamp and the cutoff are one number, so both move together.
        thresholds: { ...VALID.thresholds, minFieldConfidence: 1 },
        bandCutoffs: { ...VALID.bandCutoffs, high: 1 },
      }).ok,
    ).toBe(true);
  });
});

describe("the version, each way it can be wrong", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["a number", 3],
  ])("refuses a version that is %s, naming it", (_label, version) => {
    expect(issuesOf({ ...VALID, configurationVersion: version })).toContain(
      "configurationVersion must be a non-empty string",
    );
  });
});

describe("each threshold, each way it can be wrong", () => {
  const keys = [
    "minFieldConfidence",
    "minMatchScore",
    "minMatchSeparation",
  ] as const;
  const bad: readonly [string, unknown][] = [
    ["zero", 0],
    ["negative", -0.2],
    ["above one", 1.2],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a string", "0.5"],
    ["missing", undefined],
  ];

  for (const key of keys) {
    it.each(bad)(`refuses thresholds.${key} when it is %s`, (_label, value) => {
      expect(
        issuesOf({
          ...VALID,
          thresholds: { ...VALID.thresholds, [key]: value },
        }),
      ).toContain(`thresholds.${key} must be a number in (0, 1]`);
    });
  }

  it("names a separation equal to the score floor", () => {
    expect(
      issuesOf({
        ...VALID,
        thresholds: {
          ...VALID.thresholds,
          minMatchScore: 0.5,
          minMatchSeparation: 0.5,
        },
      }),
    ).toContain(
      "thresholds.minMatchSeparation must be smaller than thresholds.minMatchScore",
    );
  });

  it("names a separation larger than the score floor", () => {
    expect(
      issuesOf({
        ...VALID,
        thresholds: {
          ...VALID.thresholds,
          minMatchScore: 0.5,
          minMatchSeparation: 0.7,
        },
      }),
    ).toContain(
      "thresholds.minMatchSeparation must be smaller than thresholds.minMatchScore",
    );
  });

  it("names a missing thresholds section", () => {
    expect(issuesOf(without("thresholds"))).toContain(
      "thresholds must be an object",
    );
  });
});

describe("the band cutoffs, each way they can be wrong", () => {
  for (const key of ["high", "medium", "low"] as const) {
    it(`names bandCutoffs.${key} outside (0, 1]`, () => {
      expect(
        issuesOf({
          ...VALID,
          bandCutoffs: { ...VALID.bandCutoffs, [key]: 0 },
        }),
      ).toContain(`bandCutoffs.${key} must be a number in (0, 1]`);
    });
  }

  it("names cutoffs that ascend", () => {
    expect(
      issuesOf({
        ...VALID,
        bandCutoffs: { high: 0.2, medium: 0.5, low: 0.8 },
      }),
    ).toContain("bandCutoffs must satisfy high > medium > low");
  });

  it("does not report the ordering when a cutoff is already unusable", () => {
    // One cause, one issue: a NaN band cannot be ordered, and saying so twice
    // would send the fixer chasing a second defect that is not there.
    expect(
      issuesOf({
        ...VALID,
        bandCutoffs: { high: Number.NaN, medium: 0.5, low: 0.2 },
      }),
    ).toEqual(["bandCutoffs.high must be a number in (0, 1]"]);
  });

  it("names a missing bandCutoffs section", () => {
    expect(issuesOf(without("bandCutoffs"))).toContain(
      "bandCutoffs must be an object",
    );
  });
});

describe("the match tolerances, each way they can be wrong", () => {
  for (const key of [
    "voltageRelative",
    "capacityRelative",
    "energyRelative",
  ] as const) {
    it(`names matchTolerances.${key} outside (0, 1]`, () => {
      expect(
        issuesOf({
          ...VALID,
          matchTolerances: { ...VALID.matchTolerances, [key]: 1.5 },
        }),
      ).toContain(`matchTolerances.${key} must be a number in (0, 1]`);
    });
  }

  it("names a missing matchTolerances section", () => {
    expect(issuesOf(without("matchTolerances"))).toContain(
      "matchTolerances must be an object",
    );
  });
});

describe("the whole", () => {
  it("refuses a non-object with a single issue", () => {
    for (const value of [null, undefined, "config", 0.5, [], true]) {
      expect(issuesOf(value), String(value)).toEqual([
        "configuration is not an object",
      ]);
    }
  });

  it("names every issue across every section in one pass, in declaration order", () => {
    expect(
      issuesOf({
        configurationVersion: "",
        thresholds: {
          minFieldConfidence: 0.8,
          minMatchScore: 0.2,
          minMatchSeparation: 0.4,
        },
        bandCutoffs: { high: 0.2, medium: 0.6, low: 0.3 },
        matchTolerances: {
          voltageRelative: 0,
          capacityRelative: 0.04,
          energyRelative: 0.04,
        },
      }),
    ).toEqual([
      "configurationVersion must be a non-empty string",
      "thresholds.minMatchSeparation must be smaller than thresholds.minMatchScore",
      "bandCutoffs must satisfy high > medium > low",
      "thresholds.minFieldConfidence must equal bandCutoffs.high — the gate compares bands, and the stamp must name the cutoff it applied",
      "matchTolerances.voltageRelative must be a number in (0, 1]",
      "matchScoring must be an object",
    ]);
  });

  it("never accepts a set partially — one issue is a refusal of the whole", () => {
    const validation = validateIntakeGateConfiguration({
      ...VALID,
      matchTolerances: { ...VALID.matchTolerances, energyRelative: 0 },
    });
    expect(validation.ok).toBe(false);
    expect(validation).not.toHaveProperty("configuration");
  });
});
