/**
 * T-17 · UN transport identifier
 *
 * **Stored on:** `shipping_paper.un_identifier`, `catalog_entry.un_identifier`
 * **Cardinality:** single-select per shipping paper line · **Phase:** B1a
 *
 * Records the transport identifier that appears in the basic description on a shipping paper line, because the identifier determines the required description sequence, packaging and emergency response information.
 *
 * **`UN3480` is the display label. `un3480` is the stored value.** Both are correct
 * in their own place; neither is ever used in the other's (TAXONOMY.md §5.2). This
 * is the system where the two differ most visibly and it is the worked round trip
 * in §5.5.
 *
 * `not_assigned` is blocking — a shipping paper cannot be issued with an unassigned
 * line. Identifiers are derived from the matched catalog entry plus the active
 * classification decision, never free-typed (Rule 5.9).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-17, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const UN_TRANSPORT_IDENTIFIERS = [
  "un3480",
  "un3481",
  "un3090",
  "un3091",
  "un3536",
  "not_assigned",
] as const;

export type UnTransportIdentifier = (typeof UN_TRANSPORT_IDENTIFIERS)[number];

/**
 * Stored value to display label. **The only place a T-17 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const UN_TRANSPORT_IDENTIFIER_LABELS: Readonly<
  Record<UnTransportIdentifier, string>
> = {
  un3480: "UN3480",
  un3481: "UN3481",
  un3090: "UN3090",
  un3091: "UN3091",
  un3536: "UN3536",
  not_assigned: "Not assigned",
};
