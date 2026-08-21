import type { StatusIntent } from "./status-intent";

/**
 * The Tailwind classes each status intent renders as — `UX_SPEC.md` §1.2 Rule 1
 * and Rule 2.
 *
 * Every literal colour lives once in `src/styles/globals.css`; every mapping
 * from an intent to those tokens lives once here. A component never picks a
 * colour for a status — it resolves an intent through `statusIntent()` or
 * `ALERT_SEVERITY_INTENTS` and then reads a class out of one of these records.
 *
 * These three records were previously copy-pasted into `status-badge.tsx`,
 * `confidence-band-display.tsx` and `alert-card.tsx`. **The strings here are
 * byte-identical to the four they replace** — this is a deduplication, not a
 * fork and not a second intent map. A fourth private copy is a review rejection.
 */

/**
 * The full badge/alert surface — background, foreground and border together.
 *
 * `StatusBadge` and `ConfidenceBandDisplay` render this. The foreground/background
 * pairs clear 7:1 because a badge's text is frequently the only carrier of the
 * status (§1.2 Rule 3).
 */
export const INTENT_SURFACE_CLASSES: Readonly<Record<StatusIntent, string>> = {
  neutral:
    "bg-intent-neutral-background text-intent-neutral-foreground border-intent-neutral-border",
  ok: "bg-intent-ok-background text-intent-ok-foreground border-intent-ok-border",
  attention:
    "bg-intent-attention-background text-intent-attention-foreground border-intent-attention-border",
  critical:
    "bg-intent-critical-background text-intent-critical-foreground border-intent-critical-border",
  pending:
    "bg-intent-pending-background text-intent-pending-foreground border-intent-pending-border",
};

/** Foreground only — an icon tint, a heading beside a surface that carries the wash. */
export const INTENT_TEXT_CLASSES: Readonly<Record<StatusIntent, string>> = {
  neutral: "text-intent-neutral-foreground",
  ok: "text-intent-ok-foreground",
  attention: "text-intent-attention-foreground",
  critical: "text-intent-critical-foreground",
  pending: "text-intent-pending-foreground",
};

/**
 * The intent's border colour, painted as a fill — a 4px left bar, a meter fill,
 * a rule.
 *
 * The utilities are `bg-*` rather than `border-*` on purpose: the surfaces that
 * want this are solid shapes carrying the border colour, not boxes with an edge.
 * `AlertCard`'s left bar is the precedent.
 */
export const INTENT_BORDER_CLASSES: Readonly<Record<StatusIntent, string>> = {
  neutral: "bg-intent-neutral-border",
  ok: "bg-intent-ok-border",
  attention: "bg-intent-attention-border",
  critical: "bg-intent-critical-border",
  pending: "bg-intent-pending-border",
};
