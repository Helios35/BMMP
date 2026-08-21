/**
 * T-30 · DDR flag
 *
 * **Stored on:** `battery_record.ddr_flags`
 * **Cardinality:** multi-select; empty set is valid · **Phase:** B1a
 *
 * Records that a battery is damaged, defective or recalled, because that determination changes the packaging, the required marking, and — decisively — removes air transport as an option.
 *
 * **An empty array is the normal state, not a null.** This is the one place in the
 * product where absence is modelled as absence; a `none` value here would be
 * actively harmful (TAXONOMY.md §5.6).
 *
 * `damaged` is set automatically from the confirmed assessment. `defective` is
 * recorded by a human — there is no visible indicator that sets it. `recalled`
 * follows an active recall association (T-35).
 *
 * Any non-empty value blocks air transport, with **no override for any role,
 * including P6** (Rules 6.7, 6.8).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-30, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DDR_FLAGS = ["damaged", "defective", "recalled"] as const;

export type DdrFlag = (typeof DDR_FLAGS)[number];

/**
 * Stored value to display label. **The only place a T-30 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const DDR_FLAG_LABELS: Readonly<Record<DdrFlag, string>> = {
  damaged: "Damaged",
  defective: "Defective",
  recalled: "Recalled",
};
