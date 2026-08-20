/**
 * T-23 · Container type
 *
 * **Stored on:** `container.container_type`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records what kind of material a container holds, because content class determines its labelling, its packaging requirements and what may be added to it.
 *
 * **A composite of two dimensions** — classification outcome (T-13) × condition
 * state (T-30, T-46) — per Rule 4.28. Six values, every one naming both.
 * `BUSINESS_RULES.md` calls this concept *segregation class*; the column keeps this
 * name and the two terms denote the same thing.
 *
 * Because every value carries both dimensions, two guarantees follow mechanically:
 * no container can ever hold two different waste classification outcomes, and no
 * container can hold sound material beside DDR material (Rules 6.17, 6.18).
 *
 * No document is issued from a `*_hold` container.
 *
 * Four flat values were retired at TAXONOMY v1.2. A read path that meets one
 * **renders it as-is and never coerces it** — guessing an outcome fabricates a
 * compliance record (TAXONOMY.md §5.8, §6; `ERD.md` §2.15).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-23, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CONTAINER_TYPES = [
  "light_category_sound",
  "light_category_ddr",
  "light_category_hold",
  "fully_regulated_sound",
  "fully_regulated_ddr",
  "fully_regulated_hold",
] as const;

export type ContainerType = (typeof CONTAINER_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-23 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CONTAINER_TYPE_LABELS: Readonly<Record<ContainerType, string>> = {
  light_category_sound: "Light waste — sound",
  light_category_ddr: "Light waste — damaged / defective",
  light_category_hold: "Light waste — determination pending",
  fully_regulated_sound: "Fully regulated — sound",
  fully_regulated_ddr: "Fully regulated — damaged / defective",
  fully_regulated_hold: "Fully regulated — determination pending",
};

/** The condition half of T-23's composite. */
export type ContainerConditionDimension = "sound" | "ddr" | "hold";

/**
 * The two dimensions each T-23 value names, made readable.
 *
 * The placement rule (Rule 4.28) admits a record to a container only when the
 * container's pair matches the record's own classification outcome and condition.
 * Keeping the decomposition here means the placement rule reads it rather than
 * re-parsing the string, and a value whose name changes shape cannot silently
 * change meaning.
 */
export const CONTAINER_TYPE_DIMENSIONS: Readonly<
  Record<
    ContainerType,
    {
      readonly wasteClassification: "light_category" | "fully_regulated";
      readonly condition: ContainerConditionDimension;
    }
  >
> = {
  light_category_sound: {
    wasteClassification: "light_category",
    condition: "sound",
  },
  light_category_ddr: {
    wasteClassification: "light_category",
    condition: "ddr",
  },
  light_category_hold: {
    wasteClassification: "light_category",
    condition: "hold",
  },
  fully_regulated_sound: {
    wasteClassification: "fully_regulated",
    condition: "sound",
  },
  fully_regulated_ddr: {
    wasteClassification: "fully_regulated",
    condition: "ddr",
  },
  fully_regulated_hold: {
    wasteClassification: "fully_regulated",
    condition: "hold",
  },
};
