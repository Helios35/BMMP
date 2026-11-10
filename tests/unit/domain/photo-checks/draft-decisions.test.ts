import { describe, expect, it } from "vitest";

import {
  confirmDraftCondition,
  decideDraftProposal,
  seedDraftFromExtraction,
  setDraftCondition,
} from "@/domain/intake/draft";
import type { DamageProposal } from "@/domain/photo-checks/damage-proposals";

/**
 * The draft's condition and the AI suggestions — Rules 6.25, 7.25. A decision
 * puts an accepted finding in the set, re-opens a confirmed condition, and
 * stays whatever else the person ticks.
 */

const DANA = { userId: "user-dana", at: "2026-11-10T10:00:00.000Z" } as const;
const SWELLING: DamageProposal = {
  photoCheckId: "check-1",
  intakePhotoId: "photo-2",
  findingType: "swelling",
};

function blank() {
  return seedDraftFromExtraction([], [], null, null);
}

describe("decideDraftProposal", () => {
  it("starts a condition from an accepted suggestion, unconfirmed", () => {
    const draft = decideDraftProposal(blank(), SWELLING, "accepted", DANA);
    expect(draft.condition?.findingTypes).toEqual(["swelling"]);
    expect(draft.condition?.confirmedBy).toBeNull();
    expect(draft.condition?.proposalDecisions).toEqual([
      {
        ...SWELLING,
        decision: "accepted",
        decidedBy: "user-dana",
        decidedAt: DANA.at,
      },
    ]);
  });

  it("re-opens a confirmed condition", () => {
    let draft = setDraftCondition(blank(), ["none_observed"], null, false);
    draft = confirmDraftCondition(draft, DANA);
    expect(draft.condition?.confirmedBy).toBe("user-dana");
    draft = decideDraftProposal(draft, SWELLING, "rejected", DANA);
    expect(draft.condition?.confirmedBy).toBeNull();
    expect(draft.condition?.findingTypes).toEqual(["none_observed"]);
  });

  it("keeps the decisions when the person ticks findings afterwards", () => {
    let draft = decideDraftProposal(blank(), SWELLING, "accepted", DANA);
    draft = setDraftCondition(draft, ["swelling", "corrosion"], null, false);
    expect(draft.condition?.proposalDecisions).toHaveLength(1);
    expect(draft.condition?.findingTypes).toEqual(["swelling", "corrosion"]);
  });

  it("refuses a decision with no actor", () => {
    expect(() =>
      decideDraftProposal(blank(), SWELLING, "accepted", {
        userId: "",
        at: DANA.at,
      }),
    ).toThrow();
  });
});
