import { describe, expect, it } from "vitest";

import {
  classifyWasteStream,
  WASTE_STREAM_RULE_KEY,
  type ClassificationInputs,
} from "@/domain/classification";
import { MissingRuleVersionError, ruleOutcome } from "@/domain/rules/outcome";
import type {
  ResolvedRule,
  RuleVersionCandidate,
} from "@/domain/rules/resolve";
import type { JsonObject } from "@/types/common";

/**
 * Waste-stream classification — Rules 3.1–3.13; T-13, T-14.
 *
 * Every list and switch the evaluator reads is in the payload built here, so
 * this file is also the proof that the module holds no value of its own: the
 * light-category list is whatever the test says it is, and the module's answer
 * moves with it.
 */

const WASHINGTON = {
  id: "0a000005-0000-4000-8000-000000000002",
  code: "US-WA",
  name: "Washington",
  level: "state",
} as const;

function version(
  payload: JsonObject,
  patch: Partial<RuleVersionCandidate> = {},
): RuleVersionCandidate {
  return {
    ruleVersionId: "0a000007-0000-4000-8000-000000000002",
    jurisdictionRuleId: "0a000006-0000-4000-8000-000000000002",
    jurisdictionId: WASHINGTON.id,
    ruleKey: WASTE_STREAM_RULE_KEY,
    domain: "waste_classification",
    title: "Waste stream by chemistry and condition",
    versionLabel: "2026",
    effectiveOn: "2026-01-01",
    expiresOn: null,
    citation: "Fixture citation — not legal text",
    citationUrl: null,
    payload,
    payloadSchemaKey: "classification.waste_stream.v1",
    appliesToApplicationClasses: null,
    publishedAt: "2025-12-15T00:00:00.000Z",
    isRuleActive: true,
    ...patch,
  };
}

function resolved(
  payload: JsonObject,
  patch: Partial<RuleVersionCandidate> = {},
): ResolvedRule {
  const v = version(payload, patch);
  return {
    ruleKey: v.ruleKey,
    version: v,
    jurisdiction: WASHINGTON,
    level: WASHINGTON.level,
  };
}

const LIGHT_LIST = ["li_nmc", "li_lco", "lead_acid_sealed"];

const RULE = resolved({
  lightCategoryChemistries: LIGHT_LIST,
  ddrForcesFullyRegulated: false,
});

function inputs(
  patch: Partial<ClassificationInputs> = {},
): ClassificationInputs {
  return {
    chemistry: "li_nmc",
    chemistryConfirmed: true,
    applicationClass: "vehicle",
    ddrFlags: [],
    handlerSizeClass: "small_handler",
    jurisdictionCode: "US-WA",
    ...patch,
  };
}

describe("Rule 3.10 — no rule is a stated gap, never a default", () => {
  it("is unresolved for a missing jurisdiction profile when the caller passes null", () => {
    const result = classifyWasteStream(inputs(), null);
    expect(result).toEqual({
      kind: "unresolved",
      missingInput: "jurisdiction_profile",
      ruleKey: WASTE_STREAM_RULE_KEY,
      whoCanSupply: "facility_manager_or_platform_admin",
    });
  });

  it("carries the caller's own reason when it names a missing rule version", () => {
    const result = classifyWasteStream(inputs(), {
      missingInput: "rule_version",
    });
    expect(result.kind).toBe("unresolved");
    if (result.kind === "unresolved") {
      expect(result.missingInput).toBe("rule_version");
    }
  });

  it("is decided, not unresolved, when a readable rule is in force", () => {
    expect(classifyWasteStream(inputs(), RULE).kind).toBe("decided");
  });
});

describe("the payload is read defensively", () => {
  it.each([
    ["not an object", "nonsense"],
    ["a missing chemistry list", { ddrForcesFullyRegulated: false }],
    [
      "a list holding a non-string",
      { lightCategoryChemistries: [1], ddrForcesFullyRegulated: false },
    ],
    [
      "a non-boolean switch",
      { lightCategoryChemistries: LIGHT_LIST, ddrForcesFullyRegulated: "yes" },
    ],
    [
      "a non-boolean displacement flag",
      {
        lightCategoryChemistries: LIGHT_LIST,
        ddrForcesFullyRegulated: false,
        displacesFederalBaseline: 1,
      },
    ],
  ])("treats %s as an unresolved rule version", (_label, payload) => {
    const result = classifyWasteStream(
      inputs(),
      resolved(payload as unknown as JsonObject),
    );
    expect(result).toMatchObject({
      kind: "unresolved",
      missingInput: "rule_version",
    });
  });

  it("refuses a payload under a schema key it does not know", () => {
    const result = classifyWasteStream(
      inputs(),
      resolved(
        {
          lightCategoryChemistries: LIGHT_LIST,
          ddrForcesFullyRegulated: false,
        },
        { payloadSchemaKey: "classification.waste_stream.v2" },
      ),
    );
    expect(result).toMatchObject({
      kind: "unresolved",
      missingInput: "rule_version",
    });
  });

  it("refuses a resolved rule under a different rule key", () => {
    const result = classifyWasteStream(
      inputs(),
      resolved(
        {
          lightCategoryChemistries: LIGHT_LIST,
          ddrForcesFullyRegulated: false,
        },
        { ruleKey: "storage.accumulation_period" },
      ),
    );
    expect(result).toMatchObject({
      kind: "unresolved",
      missingInput: "rule_version",
    });
  });
});

describe("Rules 3.3, 3.4 — unconfirmed chemistry blocks", () => {
  it.each([
    ["null chemistry", inputs({ chemistry: null })],
    ["the unknown value", inputs({ chemistry: "unknown" })],
    ["a chemistry no one confirmed", inputs({ chemistryConfirmed: false })],
  ])(
    "blocks on %s with chemistry_unconfirmed as the only basis",
    (_label, given) => {
      const result = classifyWasteStream(given, RULE);
      expect(result.kind).toBe("blocked");
      if (result.kind !== "blocked") return;
      expect(result.status).toBe("blocked");
      expect(result.basisCodes).toEqual(["chemistry_unconfirmed"]);
      expect(result.outcome.result).toBe("undetermined");
      expect(result.outcome.reasoning).toContain(
        "has not been human-confirmed",
      );
      expect(result.outcome.ruleVersionsApplied[0]?.outcome).toBe("blocked");
      expect(result.outcome.inputsSnapshot.chemistryConfirmed).toBe(
        given.chemistryConfirmed,
      );
    },
  );

  it("does not block a confirmed chemistry", () => {
    expect(classifyWasteStream(inputs(), RULE).kind).toBe("decided");
  });
});

describe("light category from the payload's list", () => {
  it("decides light_category on federal_default for a listed chemistry with no flag", () => {
    const result = classifyWasteStream(inputs(), RULE);
    expect(result.kind).toBe("decided");
    if (result.kind !== "decided") return;
    expect(result.status).toBe("active");
    expect(result.outcome.result).toBe("light_category");
    expect(result.basisCodes).toEqual(["federal_default"]);
    expect(result.outcome.reasoning).toContain(
      "falls within the light waste category",
    );
    expect(result.outcome.reasoning).toContain("no damage indicator present");
  });

  it("decides fully_regulated on chemistry_out_of_scope for a chemistry the list omits", () => {
    const result = classifyWasteStream(
      inputs({ chemistry: "lithium_metal" }),
      RULE,
    );
    if (result.kind !== "decided") throw new Error(result.kind);
    expect(result.outcome.result).toBe("fully_regulated");
    expect(result.basisCodes).toEqual(["chemistry_out_of_scope"]);
    expect(result.outcome.reasoning).toContain(
      "is not within the light waste category",
    );
  });

  it("moves with the list — the module holds no chemistry of its own", () => {
    const narrower = resolved({
      lightCategoryChemistries: ["lead_acid_sealed"],
      ddrForcesFullyRegulated: false,
    });
    const result = classifyWasteStream(inputs(), narrower);
    if (result.kind !== "decided") throw new Error(result.kind);
    expect(result.outcome.result).toBe("fully_regulated");
  });
});

describe("Rule 3.9 — the damage state is read beside chemistry", () => {
  it("keeps light_category and adds damage_state when the rule does not force flagged material out", () => {
    const result = classifyWasteStream(inputs({ ddrFlags: ["damaged"] }), RULE);
    if (result.kind !== "decided") throw new Error(result.kind);
    expect(result.outcome.result).toBe("light_category");
    expect(result.basisCodes).toEqual(["federal_default", "damage_state"]);
    expect(result.outcome.reasoning).toContain("the Damaged flag");
    expect(result.outcome.ruleVersionsApplied[0]?.inputs.ddrFlags).toEqual([
      "damaged",
    ]);
  });

  it("decides fully_regulated with damage_state when the rule forces flagged material out", () => {
    const forcing = resolved({
      lightCategoryChemistries: LIGHT_LIST,
      ddrForcesFullyRegulated: true,
    });
    const result = classifyWasteStream(
      inputs({ ddrFlags: ["damaged", "defective"] }),
      forcing,
    );
    if (result.kind !== "decided") throw new Error(result.kind);
    expect(result.outcome.result).toBe("fully_regulated");
    expect(result.basisCodes).toEqual(["federal_default", "damage_state"]);
    expect(result.outcome.reasoning).toContain(
      "the Damaged and Defective flags",
    );
  });

  it("adds damage_state to an out-of-scope chemistry too", () => {
    const result = classifyWasteStream(
      inputs({ chemistry: "lithium_metal", ddrFlags: ["recalled"] }),
      RULE,
    );
    if (result.kind !== "decided") throw new Error(result.kind);
    expect(result.basisCodes).toEqual([
      "chemistry_out_of_scope",
      "damage_state",
    ]);
  });

  it("adds no damage_state when no flag is set", () => {
    const result = classifyWasteStream(inputs(), RULE);
    if (result.kind !== "decided") throw new Error(result.kind);
    expect(result.basisCodes).not.toContain("damage_state");
  });
});

describe("jurisdiction_override only when the payload says so", () => {
  const displacing = resolved({
    lightCategoryChemistries: LIGHT_LIST,
    ddrForcesFullyRegulated: false,
    displacesFederalBaseline: true,
  });

  it("uses jurisdiction_override in place of federal_default", () => {
    const result = classifyWasteStream(inputs(), displacing);
    if (result.kind !== "decided") throw new Error(result.kind);
    expect(result.basisCodes).toEqual(["jurisdiction_override"]);
    expect(result.outcome.reasoning).toContain(
      "displaces the federal baseline",
    );
  });

  it("stays federal_default when the payload is silent", () => {
    const result = classifyWasteStream(inputs(), RULE);
    if (result.kind !== "decided") throw new Error(result.kind);
    expect(result.basisCodes).toEqual(["federal_default"]);
  });
});

describe("Rule 3.7 — everything the decision consumed is frozen", () => {
  it("snapshots every input and copies the citation from the version", () => {
    const result = classifyWasteStream(
      inputs({
        applicationClass: "small_mobility",
        handlerSizeClass: "large_handler",
      }),
      RULE,
    );
    if (result.kind !== "decided") throw new Error(result.kind);
    expect(result.outcome.inputsSnapshot).toEqual({
      chemistry: "li_nmc",
      chemistryConfirmed: true,
      applicationClass: "small_mobility",
      ddrFlags: [],
      jurisdiction: "US-WA",
      handlerSizeClass: "large_handler",
    });
    expect(result.outcome.ruleVersionsApplied).toHaveLength(1);
    expect(result.outcome.ruleVersionsApplied[0]).toMatchObject({
      ruleVersionId: RULE.version.ruleVersionId,
      jurisdictionRuleId: RULE.version.jurisdictionRuleId,
      ruleKey: WASTE_STREAM_RULE_KEY,
      versionLabel: "2026",
      citation: RULE.version.citation,
      outcome: "light_category",
    });
  });

  it("never states a probability of anything in its reasoning", () => {
    const results = [
      classifyWasteStream(inputs(), RULE),
      classifyWasteStream(inputs({ ddrFlags: ["damaged"] }), RULE),
      classifyWasteStream(inputs({ chemistry: null }), RULE),
    ];
    for (const result of results) {
      if (result.kind === "unresolved") throw new Error("unexpected");
      // Rule 1.25 — the same pattern the settings guard applies to its surfaces.
      expect(result.outcome.reasoning).not.toMatch(
        /probability of ignition|likelihood of (?:fire|ignition|thermal)|risk of fire|chance of (?:fire|ignition|thermal runaway)|ignition score|%/i,
      );
    }
  });
});

describe("TECHNICAL_SPEC.md §6.3 — an outcome with no applied version cannot exist", () => {
  it("throws MissingRuleVersionError on an empty applied set", () => {
    expect(() =>
      ruleOutcome({
        result: "light_category",
        reasoning: "no version",
        ruleVersionsApplied: [],
        inputsSnapshot: {},
        context: WASTE_STREAM_RULE_KEY,
      }),
    ).toThrow(MissingRuleVersionError);
  });
});
