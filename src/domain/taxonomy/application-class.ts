/**
 * T-02 · Battery application class
 *
 * **Stored on:** `battery_record.application_class`, `catalog_entry.application_class`
 * **Cardinality:** single-select · **Phase:** B1a — `small_mobility` included from the first migration
 *
 * Records what kind of equipment the battery came out of, because producer-responsibility statutes, storage rules and customer workflows all key off application rather than chemistry.
 *
 * `small_mobility` is present from day one and is **not** added at B3. B3 onboards
 * the customers who bring it volume (`_ANCHORS.md` §0, `PROJECT_SETUP_BMMP.md` §8.2).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-02, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const APPLICATION_CLASSES = [
  "vehicle",
  "consumer_electronics",
  "industrial",
  "small_mobility",
  "unknown",
] as const;

export type ApplicationClass = (typeof APPLICATION_CLASSES)[number];

/**
 * Stored value to display label. **The only place a T-02 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const APPLICATION_CLASS_LABELS: Readonly<
  Record<ApplicationClass, string>
> = {
  vehicle: "Vehicle",
  consumer_electronics: "Consumer electronics",
  industrial: "Industrial",
  small_mobility: "Small mobility device",
  unknown: "Application not confirmed",
};
