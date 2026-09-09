import { describe, expect, it } from "vitest";

import { assessDamage, validateFindings } from "@/domain/condition";
import {
  COSMETIC_FINDING_TYPES,
  DAMAGED_OR_DEFECTIVE_FINDING_TYPES,
} from "@/domain/taxonomy/damage-finding-type";

/**
 * Damage assessment — Rules 6.2–6.6; T-29, T-30, T-46, T-49.
 *
 * The determination is mechanical set membership, so the test iterates the
 * taxonomy's own sets rather than naming findings one by one: if a finding is
 * ever moved between the sets in `TAXONOMY.md`, the module follows without a
 * code change and this file keeps passing without one either.
 */

describe("validateFindings", () => {
  it("Rule 6.3 — refuses an empty set; none_observed is a real finding, not an empty array", () => {
    expect(validateFindings([])).toEqual({ ok: false, reason: "empty" });
  });

  it("accepts none_observed on its own", () => {
    expect(validateFindings(["none_observed"])).toEqual({ ok: true });
  });

  it("refuses none_observed beside any other finding", () => {
    expect(validateFindings(["none_observed", "swelling"])).toEqual({
      ok: false,
      reason: "none_observed_not_exclusive",
    });
    expect(validateFindings(["corrosion", "none_observed"])).toEqual({
      ok: false,
      reason: "none_observed_not_exclusive",
    });
  });

  it("refuses a value T-29 does not name — never invent a finding", () => {
    expect(validateFindings(["swelling", "scorched"])).toEqual({
      ok: false,
      reason: "unknown_finding",
    });
  });

  it("accepts any mix of named findings", () => {
    expect(validateFindings(["swelling", "corrosion", "dent"])).toEqual({
      ok: true,
    });
  });
});

describe("Rule 6.4 — damaged or defective is set membership, not judgement", () => {
  it.each(DAMAGED_OR_DEFECTIVE_FINDING_TYPES)(
    "a confirmed %s finding alone makes the record damaged_or_defective",
    (finding) => {
      const determination = assessDamage([finding], { isDefective: false });
      expect(determination).toEqual({
        assessedCondition: "damaged_or_defective",
        ddrFlags: ["damaged"],
        isAirTransportProhibited: true,
        assessmentStatus: "assessed_damaged",
        findingTypes: [finding],
      });
    },
  );

  it.each(COSMETIC_FINDING_TYPES)(
    "a confirmed %s finding alone is cosmetic wear and sets no flag",
    (finding) => {
      const determination = assessDamage([finding], { isDefective: false });
      expect(determination).toEqual({
        assessedCondition: "cosmetic_wear_only",
        ddrFlags: [],
        isAirTransportProhibited: false,
        assessmentStatus: "assessed_sound",
        findingTypes: [finding],
      });
    },
  );

  it("none_observed is sound", () => {
    expect(assessDamage(["none_observed"], { isDefective: false })).toEqual({
      assessedCondition: "sound",
      ddrFlags: [],
      isAirTransportProhibited: false,
      assessmentStatus: "assessed_sound",
      findingTypes: ["none_observed"],
    });
  });

  it("one damaged-set finding among cosmetic ones is enough", () => {
    const determination = assessDamage(
      ["corrosion", "surface_marking", "dent"],
      {
        isDefective: false,
      },
    );
    expect(determination.assessedCondition).toBe("damaged_or_defective");
    expect(determination.ddrFlags).toEqual(["damaged"]);
  });
});

describe("T-30 — the defective flag comes from the functional finding, not the visual set", () => {
  it("sets defective alone on a functionally defective record with nothing observed", () => {
    const determination = assessDamage(["none_observed"], {
      isDefective: true,
    });
    expect(determination).toMatchObject({
      assessedCondition: "damaged_or_defective",
      ddrFlags: ["defective"],
      isAirTransportProhibited: true,
      assessmentStatus: "assessed_damaged",
    });
  });

  it("sets both flags, damaged first, when a damaged finding and the defect coincide", () => {
    const determination = assessDamage(["puncture"], { isDefective: true });
    expect(determination.ddrFlags).toEqual(["damaged", "defective"]);
  });

  it("never sets recalled — a recall association is entered separately (Rule 6.5)", () => {
    const determination = assessDamage(["thermal_evidence"], {
      isDefective: true,
    });
    expect(determination.ddrFlags).not.toContain("recalled");
  });

  it("sets no flag on cosmetic wear that is not defective", () => {
    expect(
      assessDamage(["corrosion"], { isDefective: false }).ddrFlags,
    ).toEqual([]);
  });
});

describe("the finding list is normalised", () => {
  it("de-duplicates and orders findings as T-29 lists them", () => {
    const determination = assessDamage(
      ["dent", "swelling", "dent", "corrosion"],
      {
        isDefective: false,
      },
    );
    expect(determination.findingTypes).toEqual([
      "swelling",
      "dent",
      "corrosion",
    ]);
  });
});

describe("an impossible set throws rather than guesses", () => {
  it("throws on an empty set", () => {
    expect(() => assessDamage([], { isDefective: false })).toThrow(RangeError);
  });

  it("throws on none_observed beside another finding", () => {
    expect(() =>
      assessDamage(["none_observed", "leakage"], { isDefective: false }),
    ).toThrow(RangeError);
  });
});
