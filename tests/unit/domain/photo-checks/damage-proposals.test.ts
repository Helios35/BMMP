import { describe, expect, it } from "vitest";

import {
  assessmentMethodFor,
  decideProposal,
  decisionFor,
  decisionsOnShownProposals,
  isProposableFindingType,
  PROPOSABLE_FINDING_TYPES,
  proposalDecisionJson,
  proposalsFrom,
  undecidedProposals,
  type DamageProposal,
} from "@/domain/photo-checks/damage-proposals";
import { DAMAGE_FINDING_TYPES } from "@/domain/taxonomy/damage-finding-type";

/**
 * Rules 6.2, 6.6, 6.25, 7.25; D-75 #3, #4 — a model proposes, a person
 * decides each proposal, and every decision is kept.
 */

const DANA = { userId: "user-dana", at: "2026-11-10T10:00:00.000Z" } as const;

const SWELLING: DamageProposal = {
  photoCheckId: "check-1",
  intakePhotoId: "photo-2",
  findingType: "swelling",
};
const MARKING: DamageProposal = {
  photoCheckId: "check-1",
  intakePhotoId: "photo-2",
  findingType: "surface_marking",
};

describe("what a model may propose (D-75 #4)", () => {
  it("is T-29 minus none_observed, read from the taxonomy", () => {
    expect(PROPOSABLE_FINDING_TYPES).toEqual(
      DAMAGE_FINDING_TYPES.filter((finding) => finding !== "none_observed"),
    );
    expect(isProposableFindingType("none_observed")).toBe(false);
    expect(isProposableFindingType("swelling")).toBe(true);
    // Not T-29 at all: a flag, a grade, the functional defect.
    expect(isProposableFindingType("defective")).toBe(false);
    expect(isProposableFindingType("damaged")).toBe(false);
  });

  it("turns each run's findings into one proposal per finding, in T-29 order, de-duplicated", () => {
    expect(
      proposalsFrom([
        {
          photoCheckId: "check-1",
          intakePhotoId: "photo-2",
          proposedFindings: ["surface_marking", "swelling", "swelling"],
        },
      ]),
    ).toEqual([SWELLING, MARKING]);
  });
});

describe("deciding (Rule 6.25 — nothing is pre-ticked)", () => {
  it("leaves every proposal undecided, and the findings empty, until a person decides", () => {
    expect(undecidedProposals([SWELLING, MARKING], [])).toEqual([
      SWELLING,
      MARKING,
    ]);
    expect(decisionFor(SWELLING, [])).toBeNull();
  });

  it("accepting puts the finding in the set and clears none_observed", () => {
    const decided = decideProposal(
      { findings: ["none_observed"], decisions: [] },
      SWELLING,
      "accepted",
      DANA,
    );
    expect(decided.findings).toEqual(["swelling"]);
    expect(decided.decisions).toEqual([
      {
        ...SWELLING,
        decision: "accepted",
        decidedBy: "user-dana",
        decidedAt: DANA.at,
      },
    ]);
    expect(undecidedProposals([SWELLING, MARKING], decided.decisions)).toEqual([
      MARKING,
    ]);
  });

  it("rejecting leaves the person's own observation alone", () => {
    const decided = decideProposal(
      { findings: ["swelling"], decisions: [] },
      SWELLING,
      "rejected",
      DANA,
    );
    expect(decided.findings).toEqual(["swelling"]);
    expect(decided.decisions[0]?.decision).toBe("rejected");
  });

  it("rejecting a suggestion accepted earlier takes back what the acceptance added, and keeps one decision per proposal", () => {
    const accepted = decideProposal(
      { findings: [], decisions: [] },
      SWELLING,
      "accepted",
      DANA,
    );
    const rejected = decideProposal(accepted, SWELLING, "rejected", DANA);
    expect(rejected.findings).toEqual([]);
    expect(rejected.decisions).toHaveLength(1);
    expect(rejected.decisions[0]?.decision).toBe("rejected");
  });

  it("keeps a finding another accepted proposal still stands for", () => {
    const other: DamageProposal = { ...SWELLING, photoCheckId: "check-2" };
    let decided = decideProposal(
      { findings: [], decisions: [] },
      SWELLING,
      "accepted",
      DANA,
    );
    decided = decideProposal(decided, other, "accepted", DANA);
    decided = decideProposal(decided, SWELLING, "rejected", DANA);
    expect(decided.findings).toEqual(["swelling"]);
  });
});

describe("the method and the record (Rules 6.25, 7.25; T-59)", () => {
  it("is model_assisted_visual when a proposal was shown, visual_inspection otherwise", () => {
    expect(assessmentMethodFor([SWELLING])).toBe("model_assisted_visual");
    expect(assessmentMethodFor([])).toBe("visual_inspection");
  });

  it("keeps only decisions on proposals that were shown", () => {
    const stray = {
      ...MARKING,
      photoCheckId: "check-elsewhere",
      decision: "accepted" as const,
      decidedBy: "user-dana",
      decidedAt: DANA.at,
    };
    const real = {
      ...SWELLING,
      decision: "rejected" as const,
      decidedBy: "user-dana",
      decidedAt: DANA.at,
    };
    expect(decisionsOnShownProposals([SWELLING], [stray, real])).toEqual([
      real,
    ]);
  });

  it("writes a decision onto an audit row with no number in it", () => {
    const json = proposalDecisionJson({
      ...SWELLING,
      decision: "accepted",
      decidedBy: "user-dana",
      decidedAt: DANA.at,
    });
    expect(json).toEqual({
      photoCheckId: "check-1",
      intakePhotoId: "photo-2",
      findingType: "swelling",
      decision: "accepted",
      decidedBy: "user-dana",
      decidedAt: DANA.at,
    });
    expect(Object.values(json).some((value) => typeof value === "number")).toBe(
      false,
    );
  });
});
