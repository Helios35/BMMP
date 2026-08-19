/**
 * T-19 · Packing group
 *
 * **Stored on:** `shipping_paper.packing_group`, `catalog_entry.packing_group`
 * **Cardinality:** single-select per line · **Phase:** B1a
 *
 * Records the packing group that governs outer packaging performance for a shipping paper line.
 *
 * Which conditions force which group is `jurisdiction_rule` data.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-19, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const PACKING_GROUPS = ["i", "ii", "iii", "not_applicable"] as const;

export type PackingGroup = (typeof PACKING_GROUPS)[number];

/**
 * Stored value to display label. **The only place a T-19 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const PACKING_GROUP_LABELS: Readonly<Record<PackingGroup, string>> = {
  i: "Packing Group I",
  ii: "Packing Group II",
  iii: "Packing Group III",
  not_applicable: "Not applicable",
};
