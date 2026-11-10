import { describe, expect, it } from "vitest";

import {
  LABEL_LOOK_MODEL_OUTCOMES,
  labelLookRoutesToReview,
  labelLookSubject,
} from "@/domain/photo-checks/label-look";
import {
  PHOTO_CHECK_OUTCOMES,
  PHOTO_CHECK_OUTCOMES_BY_KIND,
} from "@/domain/taxonomy/photo-check-outcome";

/** Rule 2.36; D-75 #7 — only "looks different" routes; nothing else flags. */

describe("the label look check", () => {
  it("routes on looks different and on nothing else — not could not compare, no reference or a failure", () => {
    expect(
      PHOTO_CHECK_OUTCOMES.filter((outcome) =>
        labelLookRoutesToReview(outcome),
      ),
    ).toEqual(["looks_different"]);
  });

  it("lets the model answer three closed values; no reference and failed are the caller's", () => {
    expect([...LABEL_LOOK_MODEL_OUTCOMES]).toEqual([
      "looks_consistent",
      "looks_different",
      "cannot_compare",
    ]);
    expect(PHOTO_CHECK_OUTCOMES_BY_KIND.label_look).toEqual([
      ...LABEL_LOOK_MODEL_OUTCOMES,
      "no_reference",
      "failed",
    ]);
  });

  it("compares the crop, or the label photo when there is no crop", () => {
    const label = { id: "label", photoType: "label" };
    const crop = { id: "crop", photoType: "label_crop" };
    expect(labelLookSubject(label, crop)).toBe(crop);
    expect(labelLookSubject(label, null)).toBe(label);
    expect(labelLookSubject(null, null)).toBeNull();
  });
});

describe("T-66 belongs to its kinds", () => {
  it("gives every outcome to exactly the kinds T-66 defines it for, failed to all three", () => {
    const owners = (outcome: string) =>
      Object.entries(PHOTO_CHECK_OUTCOMES_BY_KIND)
        .filter(([, outcomes]) =>
          (outcomes as readonly string[]).includes(outcome),
        )
        .map(([kind]) => kind);
    expect(owners("failed")).toEqual([
      "damage_proposal",
      "label_look",
      "look_alike",
    ]);
    expect(owners("nothing_proposed")).toEqual(["damage_proposal"]);
    expect(owners("copy_found")).toEqual(["look_alike"]);
    for (const outcome of PHOTO_CHECK_OUTCOMES) {
      expect(owners(outcome).length).toBeGreaterThan(0);
    }
  });
});
