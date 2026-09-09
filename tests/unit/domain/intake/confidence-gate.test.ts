import { describe, expect, it } from "vitest";

import {
  evaluateConfidenceGate,
  type GateFieldInput,
  type GateInput,
} from "@/domain/intake/confidence-gate";
import type { GateThresholds } from "@/domain/intake/thresholds";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  LABEL_FIELD_CODES,
} from "@/domain/taxonomy/label-field-code";

/**
 * The confidence gate — Rules 2.13–2.17, T-52; `TECHNICAL_SPEC.md` §11.1
 * step 5.
 *
 * **The thresholds here are this test's own.** No assertion says what the
 * platform's values are; the module holds none and the tests prove it behaves
 * the same whatever set it is handed.
 */

const THRESHOLDS: GateThresholds = {
  minFieldConfidence: 0.75,
  minMatchScore: 0.6,
  minMatchSeparation: 0.15,
};

function field(patch: Partial<GateFieldInput> = {}): GateFieldInput {
  return {
    fieldCode: "manufacturer",
    confidenceBand: "high",
    isHardGated: false,
    validationFailed: false,
    value: "Northvale Cell Systems",
    ...patch,
  };
}

/** Every T-09 field read at high confidence. */
function allHigh(): readonly GateFieldInput[] {
  return LABEL_FIELD_CODES.map((code) =>
    field({
      fieldCode: code,
      isHardGated: (HARD_GATED_LABEL_FIELD_CODES as readonly string[]).includes(
        code,
      ),
      value: `value for ${code}`,
    }),
  );
}

function input(patch: Partial<GateInput> = {}): GateInput {
  return {
    fields: allHigh(),
    match: {
      candidates: [
        { catalogEntryId: "entry-a", matchScore: 0.9 },
        { catalogEntryId: "entry-b", matchScore: 0.4 },
      ],
    },
    extractionFailed: false,
    ...patch,
  };
}

describe("evaluateConfidenceGate", () => {
  it("Rule 2.13 — a clean read with a clear match needs no review, and says why not", () => {
    const verdict = evaluateConfidenceGate(input(), THRESHOLDS);
    expect(verdict.isReviewRequired).toBe(false);
    expect(verdict.reasonCodes).toEqual([]);
    expect(verdict.fieldsBelowThreshold).toEqual([]);
  });

  it("Rule 2.15 — hard-gated fields are listed on the pass path as well as the fail path", () => {
    const pass = evaluateConfidenceGate(input(), THRESHOLDS);
    const fail = evaluateConfidenceGate(
      input({ extractionFailed: true }),
      THRESHOLDS,
    );
    expect(pass.hardGatedFields).toEqual(HARD_GATED_LABEL_FIELD_CODES);
    expect(fail.hardGatedFields).toEqual(HARD_GATED_LABEL_FIELD_CODES);
  });

  it("Rule 2.16 — the thresholds applied are echoed back for the session to stamp", () => {
    const verdict = evaluateConfidenceGate(input(), THRESHOLDS);
    expect(verdict.thresholdsApplied).toEqual(THRESHOLDS);
    expect(verdict.thresholdsApplied).not.toBe(THRESHOLDS);
  });

  it("Rule 2.14 — one field below threshold routes the whole record", () => {
    const fields = allHigh().map((entry) =>
      entry.fieldCode === "serial_number"
        ? { ...entry, confidenceBand: "medium" as const }
        : entry,
    );
    const verdict = evaluateConfidenceGate(input({ fields }), THRESHOLDS);
    expect(verdict.isReviewRequired).toBe(true);
    expect(verdict.reasonCodes).toEqual(["field_confidence_below_threshold"]);
    expect(verdict.fieldsBelowThreshold).toEqual(["serial_number"]);
  });

  it("Rule 2.14 — a not_extracted field is below threshold too", () => {
    const fields = allHigh().map((entry) =>
      entry.fieldCode === "date_code"
        ? { ...entry, confidenceBand: "not_extracted" as const, value: null }
        : entry,
    );
    const verdict = evaluateConfidenceGate(input({ fields }), THRESHOLDS);
    expect(verdict.reasonCodes).toContain("field_confidence_below_threshold");
    expect(verdict.fieldsBelowThreshold).toEqual(["date_code"]);
    expect(verdict.reasonCodes).not.toContain("no_fields_extracted");
  });

  it("T-52 — nothing read at all is no_fields_extracted and every field is below threshold", () => {
    const fields = LABEL_FIELD_CODES.map((code) =>
      field({ fieldCode: code, confidenceBand: "not_extracted", value: null }),
    );
    const verdict = evaluateConfidenceGate(
      input({ fields, match: { candidates: [] } }),
      THRESHOLDS,
    );
    expect(verdict.reasonCodes).toContain("no_fields_extracted");
    expect(verdict.reasonCodes).toContain("field_confidence_below_threshold");
    expect(verdict.fieldsBelowThreshold).toEqual(LABEL_FIELD_CODES);
  });

  it("T-52 — an empty field list is treated as nothing read, never as a clean read", () => {
    const verdict = evaluateConfidenceGate(input({ fields: [] }), THRESHOLDS);
    expect(verdict.isReviewRequired).toBe(true);
    expect(verdict.reasonCodes).toContain("no_fields_extracted");
  });

  it("Rule 2.12 — a field that failed validation is recorded as such, on top of its band", () => {
    const fields = allHigh().map((entry) =>
      entry.fieldCode === "voltage"
        ? { ...entry, validationFailed: true, confidenceBand: "low" as const }
        : entry,
    );
    const verdict = evaluateConfidenceGate(input({ fields }), THRESHOLDS);
    expect(verdict.reasonCodes).toEqual([
      "field_confidence_below_threshold",
      "field_validation_failed",
    ]);
  });

  it("Rule 2.18 — no catalog candidate is no_catalog_match", () => {
    const verdict = evaluateConfidenceGate(
      input({ match: { candidates: [] } }),
      THRESHOLDS,
    );
    expect(verdict.reasonCodes).toEqual(["no_catalog_match"]);
  });

  it("§11.1 step 5 — a top score under the configured minimum is a weak match", () => {
    const verdict = evaluateConfidenceGate(
      input({
        match: {
          candidates: [{ catalogEntryId: "entry-a", matchScore: 0.59 }],
        },
      }),
      THRESHOLDS,
    );
    expect(verdict.reasonCodes).toEqual([
      "catalog_match_score_below_threshold",
    ]);
  });

  it("§11.1 step 5 — a top score exactly at the minimum passes", () => {
    const verdict = evaluateConfidenceGate(
      input({
        match: { candidates: [{ catalogEntryId: "entry-a", matchScore: 0.6 }] },
      }),
      THRESHOLDS,
    );
    expect(verdict.reasonCodes).toEqual([]);
  });

  it("Rule 2.19 — two candidates closer than the separation are ambiguous, even when both score well", () => {
    const verdict = evaluateConfidenceGate(
      input({
        match: {
          candidates: [
            { catalogEntryId: "entry-a", matchScore: 0.9 },
            { catalogEntryId: "entry-b", matchScore: 0.8 },
          ],
        },
      }),
      THRESHOLDS,
    );
    expect(verdict.reasonCodes).toEqual(["catalog_match_ambiguous"]);
  });

  it("Rule 2.19 — a separation exactly at the minimum is not ambiguous, and no float artefact says otherwise", () => {
    // 0.82 − 0.67 in doubles is 0.15000000000000002; in digits it is 0.15.
    const verdict = evaluateConfidenceGate(
      input({
        match: {
          candidates: [
            { catalogEntryId: "entry-a", matchScore: 0.82 },
            { catalogEntryId: "entry-b", matchScore: 0.67 },
          ],
        },
      }),
      THRESHOLDS,
    );
    expect(verdict.reasonCodes).toEqual([]);
  });

  it("Rule 2.19 — weak and ambiguous are both recorded when both apply", () => {
    const verdict = evaluateConfidenceGate(
      input({
        match: {
          candidates: [
            { catalogEntryId: "entry-a", matchScore: 0.5 },
            { catalogEntryId: "entry-b", matchScore: 0.45 },
          ],
        },
      }),
      THRESHOLDS,
    );
    expect(verdict.reasonCodes).toEqual([
      "catalog_match_score_below_threshold",
      "catalog_match_ambiguous",
    ]);
  });

  it("D-25 — a provider failure queues the record; it never relaxes the gate", () => {
    const verdict = evaluateConfidenceGate(
      input({ extractionFailed: true }),
      THRESHOLDS,
    );
    expect(verdict.isReviewRequired).toBe(true);
    expect(verdict.reasonCodes).toEqual(["extraction_failed"]);
  });

  it("T-52 — every applicable reason is recorded, in T-52 order", () => {
    const fields = LABEL_FIELD_CODES.map((code) =>
      field({
        fieldCode: code,
        confidenceBand: "not_extracted",
        value: null,
        validationFailed: code === "voltage",
      }),
    );
    const verdict = evaluateConfidenceGate(
      input({ fields, match: { candidates: [] }, extractionFailed: true }),
      THRESHOLDS,
    );
    expect(verdict.reasonCodes).toEqual([
      "field_confidence_below_threshold",
      "no_catalog_match",
      "no_fields_extracted",
      "field_validation_failed",
      "extraction_failed",
    ]);
  });

  it("Rule 2.17 — moving the thresholds moves the verdict; nothing is fixed in the module", () => {
    const candidates = [
      { catalogEntryId: "entry-a", matchScore: 0.7 },
      { catalogEntryId: "entry-b", matchScore: 0.5 },
    ];
    const lenient = evaluateConfidenceGate(input({ match: { candidates } }), {
      minFieldConfidence: 0.5,
      minMatchScore: 0.5,
      minMatchSeparation: 0.1,
    });
    const strict = evaluateConfidenceGate(input({ match: { candidates } }), {
      minFieldConfidence: 0.9,
      minMatchScore: 0.8,
      minMatchSeparation: 0.3,
    });
    expect(lenient.reasonCodes).toEqual([]);
    expect(strict.reasonCodes).toEqual([
      "catalog_match_score_below_threshold",
      "catalog_match_ambiguous",
    ]);
  });
});
