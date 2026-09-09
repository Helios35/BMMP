// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ClassificationOutcome } from "@/components/classification/classification-outcome";
import type { ClassificationResult } from "@/domain/classification/waste-stream";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import type { ClassificationDecision } from "@/types/documents";

/**
 * `ClassificationOutcome` in both of its inputs — the recorded decisions
 * `/batteries/[id]` renders and the preview `/batteries/new` step 3 renders —
 * and in every state `UX_SPEC.md` §3.7 and E-13 give it: decided, blocked,
 * unresolved, and the no-decision record.
 *
 * The citation and the version label here are a test's own strings. Nothing
 * asserts a real citation, because none is written into logic (Rule 1.23).
 */

const APPLIED: AppliedRuleVersion = {
  jurisdictionRuleId: "jr-1",
  ruleVersionId: "rv-1",
  ruleKey: "classification.waste_stream",
  versionLabel: "test-v1",
  citation: "A citation copied from the rule version row",
  inputs: { chemistry: "li_nmc" },
  outcome: "light_category",
};

function decision(
  overrides: Partial<ClassificationDecision> = {},
): ClassificationDecision {
  return {
    id: "cd-1",
    organizationId: "org-1",
    createdAt: "2026-08-11T21:22:00.000Z",
    decisionScope: "battery_record",
    batteryRecordId: "br-1",
    containerId: null,
    shipmentId: null,
    status: "active",
    wasteClassification: "light_category",
    basisCodes: ["federal_default"],
    reasoning:
      "Confirmed Lithium-ion — NMC chemistry falls within the light waste category in this jurisdiction.",
    governingRuleVersionId: "rv-1",
    evaluationTrace: [APPLIED],
    inputsSnapshot: { chemistry: "li_nmc", jurisdiction: "US-WA" },
    decidedAt: "2026-08-11T21:22:00.000Z",
    decidedBy: null,
    supersedesClassificationDecisionId: null,
    overrideReason: null,
    overriddenBy: null,
    ...overrides,
  } as ClassificationDecision;
}

function decided(
  result: "light_category" | "fully_regulated",
): ClassificationResult {
  return {
    kind: "decided",
    status: "active",
    basisCodes:
      result === "fully_regulated"
        ? ["chemistry_out_of_scope"]
        : ["federal_default"],
    outcome: {
      result,
      reasoning: "A reasoning sentence the domain wrote.",
      ruleVersionsApplied: [{ ...APPLIED, outcome: result }],
      inputsSnapshot: { chemistry: "lead_acid_sealed", jurisdiction: "US-WA" },
    },
  };
}

describe("ClassificationOutcome — recorded decisions (unchanged markup)", () => {
  it("renders the badge, basis labels, reasoning, the snapshot and every applied version with its citation, none behind a disclosure", () => {
    const { container } = render(
      <ClassificationOutcome decisions={[decision()]} />,
    );
    expect(screen.getByText("Light waste category")).toBeInTheDocument();
    expect(screen.getByText("Federal default treatment")).toBeInTheDocument();
    expect(
      screen.getByText(/falls within the light waste category/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Inputs the evaluation consumed"),
    ).toBeInTheDocument();
    expect(screen.getByText("li_nmc")).toBeInTheDocument();
    const applied = container.querySelector(
      "[data-applied-rule='classification.waste_stream']",
    );
    expect(applied?.textContent).toContain("test-v1");
    expect(applied?.textContent).toContain(
      "A citation copied from the rule version row",
    );
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("[data-classification-state]")).toBeNull();
    expect(container.querySelector("[data-manifest-gap]")).toBeNull();
  });

  it("states the manifest gap on a fully regulated outcome (E-14)", () => {
    const { container } = render(
      <ClassificationOutcome
        decisions={[
          decision({
            wasteClassification: "fully_regulated",
            basisCodes: ["chemistry_out_of_scope"],
          }),
        ]}
      />,
    );
    const gap = container.querySelector("[data-manifest-gap='true']");
    expect(gap).not.toBeNull();
    expect(gap?.textContent).toContain("hazardous waste manifest obligation");
  });

  it("with no decision, names what is missing and who can supply it (E-13)", () => {
    const { container } = render(<ClassificationOutcome decisions={[]} />);
    const blocked = container.querySelector(
      "[data-classification-state='blocked']",
    );
    expect(blocked).toHaveAttribute("role", "status");
    expect(blocked?.textContent).toContain(
      "No classification has been recorded for this battery.",
    );
    expect(blocked?.textContent).toContain(
      `A ${ROLE_LABELS.facility_manager} or a ${ROLE_LABELS.platform_admin} can supply what is missing.`,
    );
  });
});

describe("ClassificationOutcome — preview", () => {
  it("decided: renders the same trail, the jurisdiction, and says it is a preview", () => {
    const { container } = render(
      <ClassificationOutcome
        preview={decided("light_category")}
        jurisdictionLabel="Washington"
      />,
    );
    expect(
      container.querySelector("[data-classification-outcome='preview']"),
    ).not.toBeNull();
    expect(screen.getByText("Washington")).toBeInTheDocument();
    expect(screen.getByText("Light waste category")).toBeInTheDocument();
    expect(
      screen.getByText("A reasoning sentence the domain wrote."),
    ).toBeInTheDocument();
    expect(screen.getByText("lead_acid_sealed")).toBeInTheDocument();
    expect(
      container.querySelector("[data-applied-rule]")?.textContent,
    ).toContain("A citation copied from the rule version row");
    expect(
      container.querySelector("[data-classification-preview-note]")
        ?.textContent,
    ).toContain("nothing is recorded");
    expect(container.querySelector("[data-classification-state]")).toBeNull();
  });

  it("decided fully regulated: states the manifest gap", () => {
    const { container } = render(
      <ClassificationOutcome
        preview={decided("fully_regulated")}
        jurisdictionLabel="Washington"
      />,
    );
    expect(
      container.querySelector("[data-manifest-gap='true']"),
    ).not.toBeNull();
  });

  it("blocked: names the unconfirmed chemistry and who confirms it, and still shows the applied version", () => {
    const preview: ClassificationResult = {
      kind: "blocked",
      status: "blocked",
      basisCodes: ["chemistry_unconfirmed"],
      outcome: {
        result: "undetermined",
        reasoning:
          "Chemistry has not been human-confirmed, so no waste classification can be derived.",
        ruleVersionsApplied: [{ ...APPLIED, outcome: "blocked" }],
        inputsSnapshot: { chemistry: null, chemistryConfirmed: false },
      },
    };
    const { container } = render(
      <ClassificationOutcome
        preview={preview}
        jurisdictionLabel="Washington"
      />,
    );
    const blocked = container.querySelector(
      "[data-classification-state='blocked']",
    );
    expect(blocked?.getAttribute("data-missing-input")).toBe("chemistry");
    expect(blocked?.textContent).toContain("chemistry has not been confirmed");
    expect(blocked?.textContent).toContain(ROLE_LABELS.compliance_handler);
    expect(blocked?.textContent).toContain(ROLE_LABELS.facility_manager);
    expect(screen.getByText("Not yet determined")).toBeInTheDocument();
    expect(screen.getByText("Chemistry not confirmed")).toBeInTheDocument();
    expect(container.querySelector("[data-applied-rule]")).not.toBeNull();
  });

  it("unresolved: names the jurisdiction profile or the rule version as the missing input, and who can supply it", () => {
    for (const missingInput of [
      "jurisdiction_profile",
      "rule_version",
    ] as const) {
      const preview: ClassificationResult = {
        kind: "unresolved",
        missingInput,
        ruleKey: "classification.waste_stream",
        whoCanSupply: "facility_manager_or_platform_admin",
      };
      const { container, unmount } = render(
        <ClassificationOutcome
          preview={preview}
          jurisdictionLabel="Washington"
        />,
      );
      const blocked = container.querySelector(
        "[data-classification-state='blocked']",
      );
      expect(blocked?.getAttribute("data-missing-input")).toBe(missingInput);
      expect(blocked?.textContent).toContain(
        missingInput === "jurisdiction_profile"
          ? "no jurisdiction profile"
          : "no rule version",
      );
      expect(blocked?.textContent).toContain(
        `A ${ROLE_LABELS.facility_manager} or a ${ROLE_LABELS.platform_admin} can supply what is missing.`,
      );
      expect(container.querySelector("[data-applied-rule]")).toBeNull();
      unmount();
    }
  });

  it("never expresses a probability or a chemistry from a camera", () => {
    const { container } = render(
      <ClassificationOutcome
        preview={decided("fully_regulated")}
        jurisdictionLabel="Washington"
      />,
    );
    expect(container.textContent ?? "").not.toMatch(
      /probabilit|likelihood|risk of|read chemistry|detected chemistry/i,
    );
  });
});
