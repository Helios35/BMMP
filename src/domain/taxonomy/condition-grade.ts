/**
 * T-31 · Condition grade
 *
 * **Stored on:** `grade.grade_value`
 * **Cardinality:** single-select per grade row · **Phase:** B2
 *
 * Expresses BMMP's published judgment of what a battery's assessed condition makes it suitable for, on a scheme BMMP defines and publishes.
 *
 * **There is no external letter-grade standard to conform to.** BMMP publishes its
 * own transparent scheme and says so; a claim of conformance to an external
 * standard would be false (Rule 10.6).
 *
 * The single letter is the published scheme's own external identifier — the one
 * deliberate exception to TAXONOMY.md §4.4 rule 7.
 *
 * B2. The type exists from B1a so a later phase adds behaviour rather than
 * migrating values (D-24: typed now, no contract method until its phase).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-31, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CONDITION_GRADES = ["a", "b", "c", "reject", "ungraded"] as const;

export type ConditionGrade = (typeof CONDITION_GRADES)[number];

/**
 * Stored value to display label. **The only place a T-31 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CONDITION_GRADE_LABELS: Readonly<Record<ConditionGrade, string>> =
  {
    a: "Grade A",
    b: "Grade B",
    c: "Grade C",
    reject: "Reject",
    ungraded: "Not graded",
  };
