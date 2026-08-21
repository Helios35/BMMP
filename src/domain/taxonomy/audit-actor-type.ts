/**
 * T-60 · Audit actor type
 *
 * **Stored on:** `audit_event.actor_type`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * States what kind of actor caused an audited event, so a platform admin's action inside a tenant is never mistaken for a member's.
 *
 * **Single-select**, set by the audit trigger from the request context, never by
 * application code choosing a value.
 *
 * **`actor_user_id` is non-null for `user` and `platform_admin`** and may be
 * null for the other three.
 *
 * **`platform_admin` is visually distinct on `/audit` and in every export**
 * (Rules 1.18, 12.7). A support grant that is invisible in the log is not a
 * recorded support grant.
 *
 * **`system` is not a way to avoid attribution.** A state change a person caused
 * is attributed to that person even when a trigger performed the write
 * (Rule 2.21 — "confirmed by the system" is not a valid value).
 *
 * **No role edits or deletes an audit event, including P6** (Rules 12.3, 12.4).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-60, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const AUDIT_ACTOR_TYPES = [
  "user",
  "platform_admin",
  "system",
  "scheduled_job",
  "integration",
] as const;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-60 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const AUDIT_ACTOR_TYPE_LABELS: Readonly<Record<AuditActorType, string>> =
  {
    user: "Member",
    platform_admin: "Platform admin",
    system: "System",
    scheduled_job: "Scheduled job",
    integration: "Integration",
  };
