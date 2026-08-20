/**
 * T-44 · Alert type
 *
 * **Stored on:** `alert.alert_type`
 * **Cardinality:** single-select · **Phase:** per row
 *
 * Names the kinds of thing the product proactively tells a user about, so alerting is consistent and routable by role.
 *
 * **Alerts are records, not notifications.** 'The system warned them' is itself
 * evidence: an alert that exists only as a sent email cannot be produced at an
 * audit, cannot be counted, and cannot be shown to an underwriter (`ERD.md` §6.5).
 * **No screen derives an alert on render** (`SITE_ARCHITECTURE.md` §7.6a).
 *
 * **An alert never expresses a probability of ignition** — not in its type, its
 * severity, its title or its body (Rules 1.25, 10.3).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-44, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const ALERT_TYPES = [
  "storage_clock",
  "review_queue",
  "container_capacity",
  "handler_threshold",
  "ddr_quarantine",
  "storage_volume",
  "obligation_deadline",
  "recall_match",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-44 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const ALERT_TYPE_LABELS: Readonly<Record<AlertType, string>> = {
  storage_clock: "Storage clock",
  review_queue: "Review queue",
  container_capacity: "Container capacity",
  handler_threshold: "Handler threshold",
  ddr_quarantine: "Damaged / defective quarantine",
  storage_volume: "Storage volume",
  obligation_deadline: "Obligation deadline",
  recall_match: "Recall match",
};

/**
 * Default routing for each alert type (T-44), as persona IDs.
 *
 * **Routing, not permission.** What a role can *see* is `BUSINESS_RULES.md` §1
 * and the capability map in `src/domain/access`; this is who the alert is
 * addressed to by default. Rule 4.14 routes storage-clock alerts to P2 always
 * and to P1 for containers at their site.
 *
 * Persona IDs appear here because `TAXONOMY.md` T-44 states the routing in
 * persona IDs and `BUSINESS_RULES.md` §1 does too. They are documentation
 * identifiers and are never stored — resolve them through `ROLE_PERSONA_IDS`.
 */
export const ALERT_TYPE_DEFAULT_AUDIENCE: Readonly<
  Record<AlertType, readonly string[]>
> = {
  storage_clock: ["P1", "P2"],
  review_queue: ["P1"],
  container_capacity: ["P1", "P2"],
  handler_threshold: ["P2"],
  ddr_quarantine: ["P1", "P2"],
  storage_volume: ["P2"],
  obligation_deadline: ["P3"],
  recall_match: ["P1", "P2"],
};
