/**
 * T-13 · Waste classification
 *
 * **Stored on:** `classification_decision.waste_classification`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records which waste stream a battery record is managed under, because that single decision determines which documents the movement legally requires.
 *
 * `undetermined` is **blocking**: no shipping paper and no container label is
 * issued in this state (Rules 3.10, 3.12).
 *
 * Which stream a chemistry falls into **per jurisdiction** is `jurisdiction_rule`
 * data. This document fixes the outcomes, never the thresholds (TAXONOMY.md §1.2).
 *
 * Note the two systems: `fully_regulated` is a live T-13 value; T-23's
 * identically-spelled flat value was retired at v1.2 and is a different system
 * (`ERD.md` §2.15).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-13, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const WASTE_CLASSIFICATIONS = [
  "light_category",
  "fully_regulated",
  "undetermined",
] as const;

export type WasteClassification = (typeof WASTE_CLASSIFICATIONS)[number];

/**
 * Stored value to display label. **The only place a T-13 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const WASTE_CLASSIFICATION_LABELS: Readonly<
  Record<WasteClassification, string>
> = {
  light_category: "Light waste category",
  fully_regulated: "Fully regulated hazardous",
  undetermined: "Not yet determined",
};
