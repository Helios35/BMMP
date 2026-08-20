/**
 * T-06 · Size / format category
 *
 * **Stored on:** `format_classification.format_category`
 * **Cardinality:** single-select **per jurisdiction and rule version** · **Phase:** B1a — `medium_format` included from the first migration; activated B3
 *
 * Places a battery in the size band that a producer-responsibility statute uses to decide which obligations apply to it.
 *
 * **Never a column on `battery_record`.** The same physical battery falls into a
 * different statutory band in one state than in another; a single column can hold
 * only one state's answer, which makes every other state's answer wrong
 * (`ERD.md` §4.4 — stated there as a review rejection).
 *
 * The value set is fixed here; **which weight or watt-hour figure puts a battery
 * in a band is `jurisdiction_rule` data**, never a literal (TAXONOMY.md §1.2).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-06, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const FORMAT_CATEGORIES = [
  "portable",
  "medium_format",
  "large_format",
  "not_covered",
  "undetermined",
] as const;

export type FormatCategory = (typeof FORMAT_CATEGORIES)[number];

/**
 * Stored value to display label. **The only place a T-06 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const FORMAT_CATEGORY_LABELS: Readonly<Record<FormatCategory, string>> =
  {
    portable: "Portable",
    medium_format: "Medium format",
    large_format: "Large format",
    not_covered: "Not covered in this jurisdiction",
    undetermined: "Not yet determined",
  };
