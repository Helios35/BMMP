/**
 * T-54 · Chemistry source
 *
 * **Stored on:** `battery_record.chemistry_source`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records how a battery's chemistry was established, so that every screen and export can state the basis rather than presenting chemistry as a bare fact.
 *
 * **These are the only two sources, and there will never be a third**
 * (Rule 2.10). **`ERD.md` §5.1 states it as an absence:** no value in this set
 * means "read from a photograph," because chemistry cannot be seen in an image.
 *
 * **Rule 2.9 is in all capitals for this reason.** Chemistry is printed on the
 * label; the label is read; the reading resolves to a catalog entry; the catalog
 * entry carries the chemistry; a person confirms it. **Any value, screen, label,
 * API field or document implying visual chemistry detection is wrong and must be
 * removed** (D-7, `_ANCHORS.md` §7.2).
 *
 * **The resolved lithium-ion sub-chemistry lives on the record**, defaulted from
 * the matched catalog entry, not left on the catalog entry alone (D-23).
 *
 * **Never inferred from form factor.** Form-factor detection contributes nothing
 * to chemistry (Rule 2.25).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-54, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CHEMISTRY_SOURCES = ["catalog_match", "human_entry"] as const;

export type ChemistrySource = (typeof CHEMISTRY_SOURCES)[number];

/**
 * Stored value to display label. **The only place a T-54 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CHEMISTRY_SOURCE_LABELS: Readonly<
  Record<ChemistrySource, string>
> = {
  catalog_match: "Matched from the catalog",
  human_entry: "Entered by hand",
};
