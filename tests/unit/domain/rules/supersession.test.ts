import { describe, expect, it } from "vitest";

import {
  closedBySuccessors,
  resolveRules,
  type RuleVersionCandidate,
} from "@/domain/rules/resolve";

/**
 * A published successor ends the version it supersedes — Rule 12.22;
 * D-72 #9 (`transport.ddr_packaging` v2, the first published successor).
 *
 * A published version is immutable, so an open-ended one can never be given
 * an end date. Publishing a successor that names it is how it ends, from the
 * successor's effective date; before that date the predecessor still
 * governs, and a draft successor ends nothing (T-42).
 */

const JURISDICTION = {
  id: "j-us",
  code: "US",
  name: "United States",
  level: "federal",
} as const;

function version(
  overrides: Partial<RuleVersionCandidate> &
    Pick<RuleVersionCandidate, "ruleVersionId" | "versionLabel">,
): RuleVersionCandidate {
  return {
    jurisdictionRuleId: "r-1",
    jurisdictionId: JURISDICTION.id,
    ruleKey: "transport.ddr_packaging",
    domain: "transport",
    title: "DDR packaging",
    effectiveOn: "2026-01-01",
    expiresOn: null,
    citation: "49 CFR 173.185(f)",
    citationUrl: null,
    payload: {},
    payloadSchemaKey: "transport.ddr_packaging.v1",
    appliesToApplicationClasses: null,
    publishedAt: "2026-01-01T00:00:00.000Z",
    isRuleActive: true,
    supersedesRuleVersionId: null,
    ...overrides,
  };
}

const V1 = version({ ruleVersionId: "v1", versionLabel: "2026" });
const V2 = version({
  ruleVersionId: "v2",
  versionLabel: "2026.2",
  effectiveOn: "2026-10-28",
  supersedesRuleVersionId: "v1",
  publishedAt: "2026-10-28T00:00:00.000Z",
});

function resolvedOn(
  asOf: string,
  candidates: readonly RuleVersionCandidate[],
): string | undefined {
  const resolution = resolveRules(
    {
      ruleKeys: ["transport.ddr_packaging"],
      jurisdictionChain: [JURISDICTION],
      asOf,
    },
    candidates,
  );
  return resolution.ok
    ? resolution.resolved.rules["transport.ddr_packaging"]?.version
        .ruleVersionId
    : undefined;
}

describe("closedBySuccessors", () => {
  it("closes a predecessor on its published successor's effective date", () => {
    expect(closedBySuccessors([V1, V2]).get("v1")).toBe("2026-10-28");
  });

  it("is closed by nothing a draft names", () => {
    expect(
      closedBySuccessors([V1, { ...V2, publishedAt: null }]).has("v1"),
    ).toBe(false);
  });
});

describe("resolveRules with a published successor", () => {
  it("resolves the predecessor before the successor's date", () => {
    expect(resolvedOn("2026-10-09", [V1, V2])).toBe("v1");
  });

  it("resolves the successor from its date, with no overlap refused", () => {
    expect(resolvedOn("2026-10-28", [V1, V2])).toBe("v2");
    expect(resolvedOn("2027-03-01", [V1, V2])).toBe("v2");
  });

  it("still refuses two open-ended versions that do not supersede each other", () => {
    expect(() =>
      resolvedOn("2026-11-01", [V1, { ...V2, supersedesRuleVersionId: null }]),
    ).toThrow();
  });
});
