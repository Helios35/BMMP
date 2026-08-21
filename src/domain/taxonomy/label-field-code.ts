/**
 * T-09 · Label extraction field code
 *
 * **Stored on:** `label_extraction.field_code`
 * **Cardinality:** one row per field per extraction · **Phase:** B1a
 *
 * Names every field the vision model extracts from a battery label, so per-field values and per-field confidence are recorded against a stable vocabulary rather than free-text keys.
 *
 * One row per field per extraction. **A single blended confidence for a whole read
 * is forbidden** — per-field confidence is what makes the gate meaningful
 * (Rule 2.7).
 *
 * `chemistry_code` is the chemistry designation **printed on the label**, read as
 * characters. It feeds catalog resolution and by itself sets nothing. It is not a
 * chemistry determination (Rules 2.9, 2.10).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-09, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const LABEL_FIELD_CODES = [
  "manufacturer",
  "model",
  "chemistry_code",
  "voltage",
  "capacity_ah",
  "energy_wh",
  "date_code",
  "serial_number",
  "certification_marks",
  "transport_test_marking",
  "assessed_condition",
] as const;

export type LabelFieldCode = (typeof LABEL_FIELD_CODES)[number];

/**
 * Stored value to display label. **The only place a T-09 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const LABEL_FIELD_CODE_LABELS: Readonly<Record<LabelFieldCode, string>> =
  {
    manufacturer: "Manufacturer",
    model: "Model / part number",
    chemistry_code: "Chemistry code",
    voltage: "Voltage",
    capacity_ah: "Capacity (Ah)",
    energy_wh: "Energy (Wh)",
    date_code: "Date code",
    serial_number: "Serial number",
    certification_marks: "Certification marks",
    transport_test_marking: "Transport test marking",
    assessed_condition: "Assessed condition",
  };

/**
 * T-09's hard-gated fields.
 *
 * **No confidence band auto-commits these, at any score.** Human confirmation of
 * chemistry, model and condition is required on both the pass and the fail path
 * — the gate decides which queue, not whether a human is involved
 * (Rule 2.15; `TECHNICAL_SPEC.md` §11.1 step 5).
 *
 * This lives beside its system rather than in the gate, because the gate reads
 * it and the review screen reads it, and two copies would drift.
 */
export const HARD_GATED_LABEL_FIELD_CODES = [
  "model",
  "chemistry_code",
  "assessed_condition",
] as const satisfies readonly LabelFieldCode[];

export type HardGatedLabelFieldCode =
  (typeof HARD_GATED_LABEL_FIELD_CODES)[number];
