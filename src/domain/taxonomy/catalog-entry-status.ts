/**
 * T-07 · Catalog entry status
 *
 * **Stored on:** `catalog_entry.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Tracks whether a known battery product in the catalog is usable for matching during intake.
 *
 * Only a `published` entry is available for intake matching.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-07, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CATALOG_ENTRY_STATUSES = [
  "proposed",
  "published",
  "deprecated",
  "rejected",
] as const;

export type CatalogEntryStatus = (typeof CATALOG_ENTRY_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-07 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CATALOG_ENTRY_STATUS_LABELS: Readonly<
  Record<CatalogEntryStatus, string>
> = {
  proposed: "Proposed",
  published: "Published",
  deprecated: "Deprecated",
  rejected: "Rejected",
};
