/**
 * T-47 · Terms of Service acceptance status
 *
 * **Stored on:** `tos_acceptance.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records the state of an organisation's consent to the Terms of Service granting data-training rights — which must be in force **before** the first battery is logged.
 *
 * **This is not T-42.** T-42 is `rule_version.status` and its `draft` value has no
 * meaning here. The two systems are not interchangeable and the mistake is
 * expensive on this table: eligibility is stamped at the instant of capture and is
 * irreversible (`ERD.md` §3.4; Rules 7.6, 7.7, 7.17).
 *
 * **This system records organisational consent. It never governs whether an
 * already-captured record may be used for training** — that is T-12 on
 * `intake_photo`, stamped once and immutable. `lapsed` and `revoked` change what
 * happens next; they never change what already happened (Rules 7.6, 7.18).
 *
 * `not_accepted` is a real value, not an absent row — null cannot be filtered,
 * counted or explained to an auditor (TAXONOMY.md §5.6).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-47, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const TOS_ACCEPTANCE_STATUSES = [
  "not_accepted",
  "in_force",
  "grace",
  "lapsed",
  "superseded",
  "revoked",
] as const;

export type TosAcceptanceStatus = (typeof TOS_ACCEPTANCE_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-47 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const TOS_ACCEPTANCE_STATUS_LABELS: Readonly<
  Record<TosAcceptanceStatus, string>
> = {
  not_accepted: "Not accepted",
  in_force: "In force",
  grace: "Grace period",
  lapsed: "Lapsed",
  superseded: "Superseded",
  revoked: "Revoked",
};
