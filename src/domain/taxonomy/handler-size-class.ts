/**
 * T-15 · Handler size class
 *
 * **Stored on:** `organization.handler_size_class`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records which handler size band an organisation's site falls into, because the size band changes which records the organisation must keep and for how long.
 *
 * Determined by quantity on site against the applicable threshold, evaluated
 * continuously with the calendar-year latch carried in the rule version — **never
 * typed by a user** (Rules 3.18–3.20). The threshold and the latch behaviour are
 * `jurisdiction_rule` data.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-15, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const HANDLER_SIZE_CLASSES = [
  "small_handler",
  "large_handler",
  "undetermined",
] as const;

export type HandlerSizeClass = (typeof HANDLER_SIZE_CLASSES)[number];

/**
 * Stored value to display label. **The only place a T-15 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const HANDLER_SIZE_CLASS_LABELS: Readonly<
  Record<HandlerSizeClass, string>
> = {
  small_handler: "Small handler",
  large_handler: "Large handler",
  undetermined: "Not yet determined",
};
