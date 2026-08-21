/**
 * T-41 · Jurisdiction rule domain
 *
 * **Stored on:** `jurisdiction_rule.domain`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Names what area of the product a jurisdiction rule governs, so rule lookups fetch the right rule set without string-matching on rule names.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-41, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const JURISDICTION_RULE_DOMAINS = [
  "waste_classification",
  "transport",
  "storage_accumulation",
  "fire_code",
  "handler_obligations",
  "format_threshold",
  "producer_obligation",
  "labeling_marking",
  "training",
  "retention",
] as const;

export type JurisdictionRuleDomain = (typeof JURISDICTION_RULE_DOMAINS)[number];

/**
 * Stored value to display label. **The only place a T-41 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const JURISDICTION_RULE_DOMAIN_LABELS: Readonly<
  Record<JurisdictionRuleDomain, string>
> = {
  waste_classification: "Waste classification",
  transport: "Transport",
  storage_accumulation: "Storage and accumulation",
  fire_code: "Fire code",
  handler_obligations: "Handler obligations",
  format_threshold: "Format thresholds",
  producer_obligation: "Producer obligations",
  labeling_marking: "Labeling and marking",
  training: "Training",
  retention: "Retention",
};
