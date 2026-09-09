import type { ConfidenceBand } from "@/domain/taxonomy/confidence-band";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";
import {
  REVIEW_REASON_CODES,
  type ReviewReasonCode,
} from "@/domain/taxonomy/review-reason-code";
import {
  compareDecimal,
  decimalFromNumber,
  subtractDecimal,
} from "@/domain/units";
import type { GateThresholds } from "./thresholds";

/**
 * The confidence gate — Rules 2.13–2.17, T-10, T-52; `TECHNICAL_SPEC.md` §11.1
 * step 5.
 *
 * **The gate decides the queue, not whether a human is involved.** Every record
 * is confirmed by a person; what this function decides is whether the record
 * goes to `/review` first and why. The three hard-gated fields — model,
 * chemistry code, assessed condition — never pass at any band, and the verdict
 * lists them every time so no caller can read a clean verdict as permission to
 * auto-commit (Rule 2.15).
 *
 * **Every applicable reason is recorded** (T-52 is multi-select). A record that
 * is both weakly matched and low-confidence says both, because a queue that
 * backs up is read for its cause and not its size. Reason codes are diagnostic,
 * never permissive: no combination of them relaxes anything.
 *
 * **The gate is not configurable; only the threshold values are** (Rule 2.17).
 * Those arrive as an argument, read from platform configuration through
 * `src/data`, and are echoed back in `thresholdsApplied` so the session can
 * stamp them onto `gate_thresholds_applied` and the decision reproduces after
 * they change (Rule 2.16). Nothing in this file holds a value.
 *
 * Match scores are `number` on the candidate; the arithmetic on them goes
 * through `src/domain/units` as digits so that two scores a hair apart are
 * compared exactly and a separation check never turns on a float artefact.
 */

export interface GateFieldInput {
  readonly fieldCode: LabelFieldCode;
  readonly confidenceBand: ConfidenceBand;
  readonly isHardGated: boolean;
  /** Rule 2.12 — the read failed shape validation and stands as unread. */
  readonly validationFailed: boolean;
  readonly value: string | null;
}

/** Ranked best-first, as `rankCatalogCandidates` returns them. */
export interface GateMatchInput {
  readonly candidates: readonly {
    readonly catalogEntryId: string;
    readonly matchScore: number;
  }[];
}

export interface GateInput {
  readonly fields: readonly GateFieldInput[];
  readonly match: GateMatchInput;
  /** The provider call did not complete. A failure queues; it never relaxes (D-25). */
  readonly extractionFailed: boolean;
}

export interface GateVerdict {
  readonly isReviewRequired: boolean;
  /** In T-52 order. Empty only when nothing at all needs a reviewer's eye. */
  readonly reasonCodes: readonly ReviewReasonCode[];
  /** Every field whose band is anything other than `high`, in the order given. */
  readonly fieldsBelowThreshold: readonly LabelFieldCode[];
  readonly thresholdsApplied: GateThresholds;
  /**
   * Always `HARD_GATED_LABEL_FIELD_CODES`. Present on the pass path as well as
   * the fail path, because the verdict is what the review screen reads and the
   * three fields need a person either way (Rule 2.15).
   */
  readonly hardGatedFields: readonly LabelFieldCode[];
}

/** The band that clears the field threshold. Everything else is below it. */
const PASSING_BAND: ConfidenceBand = "high";

/**
 * Evaluate the gate for one extraction run and its catalog ranking.
 *
 * Conditions, each recorded independently:
 *
 * - any field whose band is not `high` → `field_confidence_below_threshold`
 *   (a `not_extracted` field is below every threshold — Rule 2.11's honest null
 *   is still a field a person has to look at);
 * - no field carrying a value at all → additionally `no_fields_extracted`;
 * - any field that failed shape validation → `field_validation_failed`;
 * - no catalog candidate → `no_catalog_match`; the top candidate under
 *   `minMatchScore` → `catalog_match_score_below_threshold`; the top two closer
 *   than `minMatchSeparation` → `catalog_match_ambiguous` (Rule 2.19);
 * - a provider failure → `extraction_failed`.
 *
 * `isReviewRequired` is exactly "at least one reason". Rule 2.14 — one field
 * below threshold routes the whole record, never the field alone.
 */
export function evaluateConfidenceGate(
  input: GateInput,
  thresholds: GateThresholds,
): GateVerdict {
  const reasons = new Set<ReviewReasonCode>();

  const fieldsBelowThreshold = input.fields
    .filter((field) => field.confidenceBand !== PASSING_BAND)
    .map((field) => field.fieldCode);
  if (fieldsBelowThreshold.length > 0) {
    reasons.add("field_confidence_below_threshold");
  }

  const anyValueRead = input.fields.some((field) => field.value !== null);
  if (!anyValueRead) {
    reasons.add("no_fields_extracted");
    // Nothing read means nothing at any band: every field is below threshold.
    reasons.add("field_confidence_below_threshold");
  }

  if (input.fields.some((field) => field.validationFailed)) {
    reasons.add("field_validation_failed");
  }

  const [top, second] = input.match.candidates;
  if (top === undefined) {
    reasons.add("no_catalog_match");
  } else {
    const topScore = decimalFromNumber(top.matchScore);
    if (
      compareDecimal(topScore, decimalFromNumber(thresholds.minMatchScore)) < 0
    ) {
      reasons.add("catalog_match_score_below_threshold");
    }
    if (second !== undefined) {
      const separation = subtractDecimal(
        topScore,
        decimalFromNumber(second.matchScore),
      );
      if (
        compareDecimal(
          separation,
          decimalFromNumber(thresholds.minMatchSeparation),
        ) < 0
      ) {
        reasons.add("catalog_match_ambiguous");
      }
    }
  }

  if (input.extractionFailed) reasons.add("extraction_failed");

  // Stored in T-52's order so two runs with the same reasons write the same
  // array, whatever order the checks above ran in.
  const reasonCodes = REVIEW_REASON_CODES.filter((code) => reasons.has(code));

  return {
    isReviewRequired: reasonCodes.length > 0,
    reasonCodes,
    fieldsBelowThreshold: anyValueRead
      ? fieldsBelowThreshold
      : input.fields.map((field) => field.fieldCode),
    thresholdsApplied: {
      minFieldConfidence: thresholds.minFieldConfidence,
      minMatchScore: thresholds.minMatchScore,
      minMatchSeparation: thresholds.minMatchSeparation,
    },
    hardGatedFields: HARD_GATED_LABEL_FIELD_CODES,
  };
}
