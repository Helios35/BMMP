/**
 * T-40 · Jurisdiction level
 *
 * **Stored on:** `jurisdiction.level`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Gives every jurisdiction a level, so rules can be attached to the right authority and resolved in the right order.
 *
 * **The set of jurisdiction rows is data, not taxonomy.** This module fixes the
 * level vocabulary and nothing else. Which jurisdictions exist, and every
 * threshold, deadline and citation, are rows in `jurisdiction` and
 * `jurisdiction_rule` maintained by P6.
 *
 * **Resolution order is `local` → `state` → `federal`**, most specific first, and
 * the resolved answer records which level supplied it.
 *
 * **A jurisdiction code is never parsed for meaning in code.** Do not infer a state
 * from a substring and do not branch on a specific code — branching on `US-CA` is a
 * hard-coded jurisdiction rule wearing a disguise, and it is a review rejection
 * under Rule 1.23. Codes use upper-case country and subdivision segments because
 * they are external standard identifiers; that is the one casing exception in the
 * whole taxonomy (TAXONOMY.md §4.1).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-40, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const JURISDICTION_LEVELS = ["federal", "state", "local"] as const;

export type JurisdictionLevel = (typeof JURISDICTION_LEVELS)[number];

/**
 * Stored value to display label. **The only place a T-40 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const JURISDICTION_LEVEL_LABELS: Readonly<
  Record<JurisdictionLevel, string>
> = {
  federal: "Federal",
  state: "State / territory",
  local: "Local",
};

/**
 * Resolution order, most specific first (T-40).
 *
 * The jurisdiction chain is walked in this order and the resolved answer records
 * which level supplied it. There is **no default**: a site with no jurisdiction
 * profile blocks classification rather than defaulting it (Rule 3.10; EC-16).
 */
export const JURISDICTION_RESOLUTION_ORDER = [
  "local",
  "state",
  "federal",
] as const satisfies readonly JurisdictionLevel[];
