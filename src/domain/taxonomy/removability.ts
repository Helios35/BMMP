/**
 * T-05 · Battery removability
 *
 * **Stored on:** `catalog_entry.removability`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records how the battery separates from the product it powers, because several producer-responsibility statutes key their covered-product definitions to removability.
 *
 * A product attribute, so it lives on the catalog entry — a statutory input the
 * B1b format engine reads (Rule 8.2).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-05, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const REMOVABILITIES = [
  "user_removable",
  "tool_removable",
  "non_removable",
  "unknown",
] as const;

export type Removability = (typeof REMOVABILITIES)[number];

/**
 * Stored value to display label. **The only place a T-05 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const REMOVABILITY_LABELS: Readonly<Record<Removability, string>> = {
  user_removable: "User removable",
  tool_removable: "Removable with tools",
  non_removable: "Not removable",
  unknown: "Removability not confirmed",
};
