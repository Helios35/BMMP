/**
 * T-04 · Cell form factor
 *
 * **Stored on:** `battery_record.cell_form_factor`, `catalog_entry.cell_form_factor`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records the physical shape of the cells, which is the one identification attribute that is genuinely visible in a photograph.
 *
 * Form factor may be proposed from a photograph and still passes the gate like any
 * other field. It **never** implies, suggests or contributes to a chemistry
 * determination (Rule 2.25).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-04, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CELL_FORM_FACTORS = [
  "cylindrical",
  "prismatic",
  "pouch",
  "button_coin",
  "not_applicable",
  "unknown",
] as const;

export type CellFormFactor = (typeof CELL_FORM_FACTORS)[number];

/**
 * Stored value to display label. **The only place a T-04 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CELL_FORM_FACTOR_LABELS: Readonly<Record<CellFormFactor, string>> =
  {
    cylindrical: "Cylindrical",
    prismatic: "Prismatic",
    pouch: "Pouch",
    button_coin: "Button / coin",
    not_applicable: "Not applicable",
    unknown: "Form factor not confirmed",
  };
