/**
 * T-61 · Catalog entry source type
 *
 * **Stored on:** `catalog_entry.source_type`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * States where a catalog entry's specification came from, so a handler confirming a match can weigh the entry they are matching against.
 *
 * **`handler_proposed` is not a lesser entry once approved** — approval is P6
 * reviewing the proposal against the linked intake photo and label crop. The
 * value records provenance, not quality.
 *
 * **Approving an entry never silently re-matches a committed record.** Every
 * record committed unmatched against the same identifying fields is **raised on
 * `/review` for a person to confirm** (Flow F, step 4).
 *
 * **Source type never substitutes for confirmation.** However authoritative the
 * entry, chemistry, model and condition still require human confirmation
 * (Rule 2.15).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-61, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CATALOG_ENTRY_SOURCE_TYPES = [
  "manufacturer_published",
  "platform_curated",
  "handler_proposed",
  "regulatory_source",
] as const;

export type CatalogEntrySourceType =
  (typeof CATALOG_ENTRY_SOURCE_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-61 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CATALOG_ENTRY_SOURCE_TYPE_LABELS: Readonly<
  Record<CatalogEntrySourceType, string>
> = {
  manufacturer_published: "Manufacturer specification",
  platform_curated: "Platform curated",
  handler_proposed: "Proposed by a handler",
  regulatory_source: "Regulatory source",
};
