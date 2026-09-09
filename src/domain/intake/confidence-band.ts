import type { ConfidenceBand } from "@/domain/taxonomy/confidence-band";
import { compareDecimal, decimalFromNumber } from "@/domain/units";
import type { BandCutoffs } from "./thresholds";

/**
 * A provider's raw score to its T-10 band — the **only** place that translation
 * happens (D-22).
 *
 * The band label is the primary signal and the raw number is secondary, so a
 * cutoff change is a configuration change and not a redesign, and so nobody
 * reads two decimal places as precision the extraction does not have. The
 * cutoffs arrive as an argument: they are platform configuration read through
 * `src/data` and stamped onto each `label_extraction.band_cutoffs_applied`
 * row, so the band reproduces after they change (Rule 2.16). **No cutoff value
 * lives in this file.**
 *
 * The score is a `Decimal` string, as the row stores it, and the comparison is
 * exact — `compareDecimal` over digits, never `parseFloat` — so a score that
 * sits precisely on a cutoff lands on the side the configuration says it does.
 * Four bands, not three: a field with no score at all is `not_extracted`, and
 * so is a score below the lowest cutoff, because "we read something but cannot
 * say what" is not a low-confidence read, it is no read (Rule 2.11).
 */
export function bandForScore(
  rawConfidence: string | null,
  cutoffs: BandCutoffs,
): ConfidenceBand {
  if (rawConfidence === null) return "not_extracted";
  // At or above the cutoff is inside the band; the cutoff is a floor.
  if (compareDecimal(rawConfidence, decimalFromNumber(cutoffs.high)) >= 0) {
    return "high";
  }
  if (compareDecimal(rawConfidence, decimalFromNumber(cutoffs.medium)) >= 0) {
    return "medium";
  }
  if (compareDecimal(rawConfidence, decimalFromNumber(cutoffs.low)) >= 0) {
    return "low";
  }
  return "not_extracted";
}
