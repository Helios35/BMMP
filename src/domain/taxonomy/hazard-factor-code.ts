/**
 * T-34 · Hazard factor code
 *
 * **Stored on:** `hazard_ranking.factor_codes`
 * **Cardinality:** multi-select, minimum one · **Phase:** B2
 *
 * Names each factor that contributed to a hazard ranking, so every band can be read back to the evidence that produced it.
 *
 * Every factor carries its value, its weight and **its stated basis** (Rule 10.4).
 * A factor with no stated basis is not a factor.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-34, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const HAZARD_FACTOR_CODES = [
  "state_of_charge_at_intake",
  "chemistry",
  "damage_indicators",
  "age_from_date_code",
  "recall_status",
  "certification_marks",
  "storage_aggregation",
] as const;

export type HazardFactorCode = (typeof HAZARD_FACTOR_CODES)[number];

/**
 * Stored value to display label. **The only place a T-34 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const HAZARD_FACTOR_CODE_LABELS: Readonly<
  Record<HazardFactorCode, string>
> = {
  state_of_charge_at_intake: "Charge level at intake",
  chemistry: "Chemistry",
  damage_indicators: "Damage indicators",
  age_from_date_code: "Age from date code",
  recall_status: "Recall status",
  certification_marks: "Certification marks",
  storage_aggregation: "Storage aggregation",
};
