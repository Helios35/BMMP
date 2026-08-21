import {
  CircleAlert,
  CircleCheck,
  Clock,
  Info,
  Minus,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { StatusIntent } from "@/components/status/status-intent";

/**
 * The icon half of an intent's presentation — `UX_SPEC.md` §1.2 Rule 4, *colour
 * is never the only signal.*
 *
 * Nothing here chooses an intent. The intent is resolved through `statusIntent()`
 * or `ALERT_SEVERITY_INTENTS` first, and these records only say what it looks
 * like — the same relationship `intent-classes.ts` has to the same intent.
 * **This is not a second status-intent map and must never become one.**
 *
 * There are two sets because `neutral` genuinely reads differently in the two
 * places it appears, and collapsing them would be a regression rather than a
 * deduplication. Every other intent is the same icon in both.
 */

/**
 * For a notice — an alert card, the alert bell, a banner.
 *
 * `neutral` is `Info`, because a neutral notice is still something the reader is
 * being told.
 */
export const INTENT_ICON: Readonly<Record<StatusIntent, LucideIcon>> = {
  neutral: Info,
  ok: CircleCheck,
  attention: TriangleAlert,
  critical: CircleAlert,
  pending: Clock,
};

/**
 * For a status chip — `StatusBadge` and anything else labelling a value.
 *
 * `neutral` is `Minus`, because a neutral *status* is the absence of a
 * condition rather than a message, and an `Info` glyph on every unremarkable row
 * reads as a page full of notices.
 */
export const INTENT_BADGE_ICON: Readonly<Record<StatusIntent, LucideIcon>> = {
  ...INTENT_ICON,
  neutral: Minus,
};
