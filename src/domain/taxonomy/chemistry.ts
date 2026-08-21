/**
 * T-01 · Battery chemistry
 *
 * **Stored on:** `battery_record.chemistry`, `catalog_entry.chemistry`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Identifies the electrochemical family and, where known, the sub-chemistry of a battery, because chemistry drives waste classification, transport identifier assignment, storage rules and end-of-life economics.
 *
 * Chemistry is **matched from the catalog and confirmed by a human**. It is never
 * written from an extraction and never inferred from an image — chemistry is not
 * visually inferable (`_ANCHORS.md` §7.2, Rules 2.9, 2.10).
 *
 * D-23: the resolved lithium-ion sub-chemistry lives on `battery_record`,
 * defaulted from the matched catalog entry — not left on the catalog entry alone.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-01, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CHEMISTRIES = [
  "li_nmc",
  "li_nca",
  "li_lfp",
  "li_lco",
  "li_lmo",
  "li_lto",
  "li_ion_unspecified",
  "lithium_metal",
  "lead_acid_sealed",
  "lead_acid_flooded",
  "nimh",
  "nicd",
  "sodium_ion",
  "alkaline",
  "other",
  "unknown",
] as const;

export type Chemistry = (typeof CHEMISTRIES)[number];

/**
 * Stored value to display label. **The only place a T-01 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CHEMISTRY_LABELS: Readonly<Record<Chemistry, string>> = {
  li_nmc: "Lithium-ion — NMC",
  li_nca: "Lithium-ion — NCA",
  li_lfp: "Lithium-ion — LFP",
  li_lco: "Lithium-ion — LCO",
  li_lmo: "Lithium-ion — LMO",
  li_lto: "Lithium-ion — LTO",
  li_ion_unspecified: "Lithium-ion — sub-chemistry not stated",
  lithium_metal: "Lithium metal (primary)",
  lead_acid_sealed: "Lead-acid — sealed",
  lead_acid_flooded: "Lead-acid — flooded",
  nimh: "Nickel-metal hydride",
  nicd: "Nickel-cadmium",
  sodium_ion: "Sodium-ion",
  alkaline: "Alkaline (primary)",
  other: "Other chemistry",
  unknown: "Chemistry not confirmed",
};
