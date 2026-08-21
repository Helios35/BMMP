/**
 * T-10 · Extraction confidence band
 *
 * **Stored on:** `label_extraction.confidence_band`
 * **Cardinality:** single-select per field · **Phase:** B1a
 *
 * Expresses how far a single extracted field can be trusted, so the review gate can be applied consistently without exposing raw model scores to users.
 *
 * **Four states, not three** (D-22). The band label is the primary signal and the
 * numeric value is secondary, so a threshold change is a configuration change and
 * not a redesign, and so nobody reads two decimal places as precision the
 * extraction does not have.
 *
 * **The raw score is never displayed as a percentage** in UI or export. It is
 * stored for audit only.
 *
 * **The threshold value itself is platform configuration data owned by P6 and never
 * a constant in code** (D-22). A tenant may raise it and can never lower it. The
 * *existence* of the gate is not configurable (Rules 2.13, 2.17).
 *
 * Confidence is a property of a *text extraction from an image*. It is never placed
 * near, combined with, or styled like a condition, damage or hazard signal
 * (`UX_SPEC.md` §0).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-10, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CONFIDENCE_BANDS = [
  "high",
  "medium",
  "low",
  "not_extracted",
] as const;

export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

/**
 * Stored value to display label. **The only place a T-10 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CONFIDENCE_BAND_LABELS: Readonly<Record<ConfidenceBand, string>> =
  {
    high: "High",
    medium: "Medium",
    low: "Low",
    not_extracted: "None",
  };
