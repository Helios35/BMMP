/**
 * T-42 · Rule version status
 *
 * **Stored on:** `rule_version.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Tracks which version of a jurisdiction's rule set is in force, so a document can always be read back against the rules that produced it.
 *
 * **Only a published status is resolvable by a decision.** `draft` is never used to
 * resolve a rule or produce a document.
 *
 * A rule version is **never edited in place** — a change is a new version, because
 * decisions reference the version that governed them (Rule 12.22). `superseded` is
 * retained permanently.
 *
 * **This is not T-47.** T-47 is `tos_acceptance.status`; its `draft` value does not
 * exist and the two systems are not interchangeable (`ERD.md` §3.4).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-42, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const RULE_VERSION_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "superseded",
  "withdrawn",
] as const;

export type RuleVersionStatus = (typeof RULE_VERSION_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-42 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const RULE_VERSION_STATUS_LABELS: Readonly<
  Record<RuleVersionStatus, string>
> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  superseded: "Superseded",
  withdrawn: "Withdrawn",
};
