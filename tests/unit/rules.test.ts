import { describe, expect, it } from "vitest";
import {
  MissingRuleVersionError,
  evaluationTrace,
  governingRuleVersionId,
  ruleOutcome,
  type AppliedRuleVersion,
} from "@/domain/rules/outcome";
import {
  OverlappingRuleVersionsError,
  isInForceOn,
  resolveRules,
  type JurisdictionRef,
  type RuleVersionCandidate,
} from "@/domain/rules/resolve";

/**
 * The rules-as-data primitives — `TECHNICAL_SPEC.md` §6.
 *
 * These are the shapes every rule in `BUSINESS_RULES.md` will be written into.
 * **The rules themselves are not in this unit**, so what is tested here is the
 * machinery: that a decision cannot be recorded without its version, and that a
 * missing rule fails loudly rather than defaulting.
 */

const APPLIED: AppliedRuleVersion = {
  jurisdictionRuleId: "rule-1",
  ruleVersionId: "version-1",
  ruleKey: "storage.accumulation_period",
  versionLabel: "2026",
  citation: "Fixture citation",
  inputs: { containerType: "light_category_sound" },
  outcome: "max_duration_days=365",
};

describe("RuleOutcome", () => {
  it("carries the result, the reasoning, the applied versions and the inputs", () => {
    const outcome = ruleOutcome({
      result: { maxDurationDays: 365 },
      reasoning:
        "The accumulation period in force on the start date is 365 days.",
      ruleVersionsApplied: [APPLIED],
      inputsSnapshot: { jurisdiction: "US-WA" },
    });
    expect(outcome.result).toEqual({ maxDurationDays: 365 });
    expect(outcome.ruleVersionsApplied).toHaveLength(1);
    expect(evaluationTrace(outcome)[0]?.citation).toBe("Fixture citation");
  });

  it("refuses to build an outcome with no applied rule version", () => {
    // This is the whole point of the envelope. A decision with no recorded
    // version cannot be reproduced, which on this product is the same thing as
    // a decision that was never defensible — so it fails at construction rather
    // than showing up in an evaluation_trace two years later.
    expect(() =>
      ruleOutcome({
        result: "light_category",
        reasoning: "Because I said so.",
        ruleVersionsApplied: [],
        inputsSnapshot: {},
        context: "waste classification",
      }),
    ).toThrow(MissingRuleVersionError);
  });

  it("names the version a decision row stamps in governing_rule_version_id", () => {
    const outcome = ruleOutcome({
      result: "light_category",
      reasoning: "Federal baseline applies.",
      ruleVersionsApplied: [
        APPLIED,
        { ...APPLIED, ruleVersionId: "version-2" },
      ],
      inputsSnapshot: {},
    });
    // The FK points at the first; the full set lives in the trace, so "show me
    // everything decided under version X" stays one indexed query.
    expect(governingRuleVersionId(outcome)).toBe("version-1");
    expect(evaluationTrace(outcome)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------

const FEDERAL: JurisdictionRef = {
  id: "j-federal",
  code: "US",
  name: "United States",
  level: "federal",
};
const STATE: JurisdictionRef = {
  id: "j-wa",
  code: "US-WA",
  name: "Washington",
  level: "state",
};
const LOCAL: JurisdictionRef = {
  id: "j-nyc",
  code: "US-NY-nyc",
  name: "New York City",
  level: "local",
};

/** Most specific first, per T-40. */
const CHAIN = [STATE, FEDERAL] as const;

function candidate(
  overrides: Partial<RuleVersionCandidate> &
    Pick<RuleVersionCandidate, "ruleVersionId">,
): RuleVersionCandidate {
  return {
    jurisdictionRuleId: "rule-storage",
    jurisdictionId: STATE.id,
    ruleKey: "storage.accumulation_period",
    domain: "storage_accumulation",
    title: "Accumulation period",
    versionLabel: "2026",
    effectiveOn: "2026-01-01",
    expiresOn: null,
    citation: "Fixture citation",
    citationUrl: null,
    payload: { maxDurationDays: 365 },
    payloadSchemaKey: "storage.accumulation_period.v1",
    appliesToApplicationClasses: null,
    publishedAt: "2025-12-15T00:00:00.000Z",
    isRuleActive: true,
    ...overrides,
  };
}

describe("isInForceOn", () => {
  it("treats the effective range as [effective_on, expires_on)", () => {
    // The same half-open range the GiST exclusion constraint on rule_version
    // uses, so two published versions can never both answer for one day.
    const version = { effectiveOn: "2026-01-01", expiresOn: "2027-01-01" };
    expect(isInForceOn(version, "2025-12-31")).toBe(false);
    expect(isInForceOn(version, "2026-01-01")).toBe(true);
    expect(isInForceOn(version, "2026-12-31")).toBe(true);
    expect(isInForceOn(version, "2027-01-01")).toBe(false);
  });

  it("treats a null expiry as open-ended", () => {
    const version = { effectiveOn: "2026-01-01", expiresOn: null };
    expect(isInForceOn(version, "2099-01-01")).toBe(true);
  });
});

describe("resolveRules", () => {
  it("resolves the version in force on the governing date", () => {
    const result = resolveRules(
      {
        ruleKeys: ["storage.accumulation_period"],
        jurisdictionChain: CHAIN,
        asOf: "2026-08-19",
      },
      [candidate({ ruleVersionId: "v-2026" })],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const resolved = result.resolved.rules["storage.accumulation_period"];
    expect(resolved?.version.ruleVersionId).toBe("v-2026");
    // The resolved answer records which level supplied it (T-40).
    expect(resolved?.level).toBe("state");
  });

  it("lets the most specific jurisdiction win", () => {
    const result = resolveRules(
      {
        ruleKeys: ["storage.accumulation_period"],
        jurisdictionChain: [LOCAL, STATE, FEDERAL],
        asOf: "2026-08-19",
      },
      [
        candidate({ ruleVersionId: "v-federal", jurisdictionId: FEDERAL.id }),
        candidate({ ruleVersionId: "v-state", jurisdictionId: STATE.id }),
        candidate({ ruleVersionId: "v-local", jurisdictionId: LOCAL.id }),
      ],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.resolved.rules["storage.accumulation_period"]?.version
        .ruleVersionId,
    ).toBe("v-local");
  });

  it("falls back to a broader level only when the specific one is silent", () => {
    const result = resolveRules(
      {
        ruleKeys: ["retention.shipment_record"],
        jurisdictionChain: CHAIN,
        asOf: "2026-08-19",
      },
      [
        candidate({
          ruleVersionId: "v-federal-retention",
          ruleKey: "retention.shipment_record",
          jurisdictionId: FEDERAL.id,
        }),
      ],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolved.rules["retention.shipment_record"]?.level).toBe(
      "federal",
    );
  });

  it("never resolves an unpublished version (T-42)", () => {
    // Only a published status is resolvable by a decision. A draft with a
    // shorter period must not quietly govern a clock.
    const result = resolveRules(
      {
        ruleKeys: ["storage.accumulation_period"],
        jurisdictionChain: CHAIN,
        asOf: "2027-06-01",
      },
      [
        candidate({
          ruleVersionId: "v-draft-2027",
          versionLabel: "2027-draft",
          effectiveOn: "2027-01-01",
          publishedAt: null,
          payload: { maxDurationDays: 270 },
        }),
      ],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.unresolved).toEqual([
      { ruleKey: "storage.accumulation_period", reason: "no_rule_on_file" },
    ]);
  });

  it("returns a stated gap rather than a default when no rule is on file", () => {
    // There is no default. Silently applying a fallback threshold to a
    // compliance decision is worse than refusing to decide
    // (Rules 3.4, 3.10; EC-54).
    const result = resolveRules(
      {
        ruleKeys: ["classification.waste_stream"],
        jurisdictionChain: CHAIN,
        asOf: "2026-08-19",
      },
      [],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.unresolved[0]?.reason).toBe("no_rule_on_file");
    // A caller cannot reach `rules` without passing through the branch where
    // they are absent — which is the property a thrown error would not give.
    expect(Object.keys(result.partial.rules)).toHaveLength(0);
  });

  it("distinguishes a missing rule from a rule with no version in force", () => {
    const result = resolveRules(
      {
        ruleKeys: ["storage.accumulation_period"],
        jurisdictionChain: CHAIN,
        asOf: "2025-06-01",
      },
      [candidate({ ruleVersionId: "v-2026" })],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The rule exists; nothing governed that day. A different gap, and a
    // different message to P6.
    expect(result.unresolved[0]?.reason).toBe("no_version_in_force");
  });

  it("narrows to rules that govern the requested application class", () => {
    const result = resolveRules(
      {
        ruleKeys: ["format.threshold"],
        jurisdictionChain: CHAIN,
        asOf: "2026-08-19",
        applicationClass: "small_mobility",
      },
      [
        candidate({
          ruleVersionId: "v-vehicle-only",
          ruleKey: "format.threshold",
          appliesToApplicationClasses: ["vehicle"],
        }),
      ],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.unresolved[0]?.reason).toBe("not_applicable_to_class");
  });

  it("treats a null application-class list as governing every class", () => {
    // `_ANCHORS.md` §0: the rules model carries the medium-format category from
    // the first migration, so a mobility pack resolves against the same rules a
    // vehicle pack does rather than waiting for B3 to add machinery.
    const result = resolveRules(
      {
        ruleKeys: ["storage.accumulation_period"],
        jurisdictionChain: CHAIN,
        asOf: "2026-08-19",
        applicationClass: "small_mobility",
      },
      [
        candidate({
          ruleVersionId: "v-2026",
          appliesToApplicationClasses: null,
        }),
      ],
    );
    expect(result.ok).toBe(true);
  });

  it("ignores a deactivated rule", () => {
    const result = resolveRules(
      {
        ruleKeys: ["storage.accumulation_period"],
        jurisdictionChain: CHAIN,
        asOf: "2026-08-19",
      },
      [candidate({ ruleVersionId: "v-2026", isRuleActive: false })],
    );
    expect(result.ok).toBe(false);
  });

  it("refuses to pick between two published versions in force on one day", () => {
    // rule_version carries a GiST exclusion constraint that makes this
    // impossible in the database. Reaching it means the candidate set is wrong,
    // and guessing which version applied is exactly the ambiguity the
    // constraint exists to remove.
    expect(() =>
      resolveRules(
        {
          ruleKeys: ["storage.accumulation_period"],
          jurisdictionChain: CHAIN,
          asOf: "2026-08-19",
        },
        [
          candidate({ ruleVersionId: "v-a" }),
          candidate({ ruleVersionId: "v-b", versionLabel: "2026-b" }),
        ],
      ),
    ).toThrow(OverlappingRuleVersionsError);
  });

  it("resolves several keys at once and reports each gap separately", () => {
    const result = resolveRules(
      {
        ruleKeys: [
          "storage.accumulation_period",
          "classification.waste_stream",
          "retention.shipment_record",
        ],
        jurisdictionChain: CHAIN,
        asOf: "2026-08-19",
      },
      [
        candidate({ ruleVersionId: "v-storage" }),
        candidate({
          ruleVersionId: "v-classification",
          ruleKey: "classification.waste_stream",
        }),
      ],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.unresolved).toEqual([
      { ruleKey: "retention.shipment_record", reason: "no_rule_on_file" },
    ]);
    // The two that did resolve are still available — but as `partial`, so no
    // caller mistakes a partial answer for a complete one.
    expect(Object.keys(result.partial.rules)).toHaveLength(2);
  });
});
