/**
 * T-59 · Damage assessment method
 *
 * **Stored on:** `damage_assessment.assessment_method`
 * **Cardinality:** single-select · **Phase:** per row
 *
 * Records how a damage assessment was produced, so a model-proposed indicator and an instrument reading are never mistaken for the human judgment that decided.
 *
 * **No method produces an assessment without human confirmation, at any
 * confidence** (Rule 6.6). **A model proposes indicators; a model never sets
 * them** (Rule 6.2). `model_assisted_visual` describes how the proposal arrived,
 * not who decided.
 *
 * **An instrument reading is measured data.** It is stored, labelled and
 * exported **separately** from assessed condition, and never merges into it or
 * silently replaces it (Rules 2.27, 11.5; Roadmap Principle 7). The vendor is
 * open until Gate 3.
 *
 * **`model_assisted_visual` is written when at least one model proposal was
 * shown to the person who confirmed** (Rule 6.25, from `b2-10`); otherwise
 * `visual_inspection`. `instrument_reading` stays unbuilt until unit 16. A
 * stored value outside this set reads as stored and is **never** taken for
 * model-assisted (STATE §7 #1 — the fixtures carry `human_visual_inspection`).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-59, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DAMAGE_ASSESSMENT_METHODS = [
  "visual_inspection",
  "model_assisted_visual",
  "instrument_reading",
] as const;

export type DamageAssessmentMethod = (typeof DAMAGE_ASSESSMENT_METHODS)[number];

/**
 * Stored value to display label. **The only place a T-59 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const DAMAGE_ASSESSMENT_METHOD_LABELS: Readonly<
  Record<DamageAssessmentMethod, string>
> = {
  visual_inspection: "Visual inspection",
  model_assisted_visual: "AI suggested, confirmed by a person",
  instrument_reading: "Instrument reading",
};
