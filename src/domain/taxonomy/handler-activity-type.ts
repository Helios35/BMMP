/**
 * T-16 · Handler activity type
 *
 * **Stored on:** `storage_event.activity_type`
 * **Cardinality:** single-select per event · **Phase:** B1a
 *
 * Names the handling activities that can be performed on stored material, so the workflow can make prohibited activities unreachable rather than merely warning about them.
 *
 * Which activities are permitted and which prohibited is `jurisdiction_rule` data,
 * per jurisdiction. A prohibited activity is **not** a disabled control to argue
 * with — there is no screen, action, status or field through which it can be
 * recorded (Rules 3.21, 3.22).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-16, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const HANDLER_ACTIVITY_TYPES = [
  "sort",
  "discharge",
  "disassemble",
  "remove_electrolyte",
  "repackage",
  "inspect",
  "shred",
  "self_recycle",
] as const;

export type HandlerActivityType = (typeof HANDLER_ACTIVITY_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-16 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const HANDLER_ACTIVITY_TYPE_LABELS: Readonly<
  Record<HandlerActivityType, string>
> = {
  sort: "Sort",
  discharge: "Discharge",
  disassemble: "Disassemble",
  remove_electrolyte: "Remove electrolyte",
  repackage: "Repackage",
  inspect: "Inspect",
  shred: "Shred",
  self_recycle: "Recycle on site",
};
