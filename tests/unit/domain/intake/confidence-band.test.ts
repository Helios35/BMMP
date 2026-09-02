import { describe, expect, it } from "vitest";

import { bandForScore } from "@/domain/intake/confidence-band";

/**
 * Score to band — T-10, D-22.
 *
 * The cutoffs below belong to this test. The module holds none, and no test
 * here says what the platform's are.
 */

const CUTOFFS = { high: 0.8, medium: 0.5, low: 0.2 };

describe("bandForScore", () => {
  it("T-10 — a null score is not_extracted", () => {
    expect(bandForScore(null, CUTOFFS)).toBe("not_extracted");
  });

  it("T-10 — a score at or above the high cutoff is high", () => {
    expect(bandForScore("0.8", CUTOFFS)).toBe("high");
    expect(bandForScore("0.80000", CUTOFFS)).toBe("high");
    expect(bandForScore("1", CUTOFFS)).toBe("high");
  });

  it("T-10 — a score just under the high cutoff is medium, exactly", () => {
    // A double comparison would put 0.79999999999999999 on the wrong side.
    expect(bandForScore("0.79999999999999999", CUTOFFS)).toBe("medium");
    expect(bandForScore("0.5", CUTOFFS)).toBe("medium");
  });

  it("T-10 — a score at or above the low cutoff is low", () => {
    expect(bandForScore("0.49", CUTOFFS)).toBe("low");
    expect(bandForScore("0.2", CUTOFFS)).toBe("low");
  });

  it("T-10 — a score below the low cutoff is not_extracted, not low", () => {
    expect(bandForScore("0.19", CUTOFFS)).toBe("not_extracted");
    expect(bandForScore("0", CUTOFFS)).toBe("not_extracted");
  });

  it("D-22 — the band moves when the cutoffs move; nothing is fixed in the module", () => {
    expect(bandForScore("0.6", CUTOFFS)).toBe("medium");
    expect(bandForScore("0.6", { high: 0.6, medium: 0.4, low: 0.1 })).toBe(
      "high",
    );
  });

  it("refuses a score that is not a decimal string", () => {
    expect(() => bandForScore("high", CUTOFFS)).toThrow(RangeError);
    expect(() => bandForScore("0.9e0", CUTOFFS)).toThrow(RangeError);
  });
});
