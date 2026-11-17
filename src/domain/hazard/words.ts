import type { TimeZone } from "@/types/common";

/**
 * The words a hazard ranking is written in — Rules 1.25, 10.3, 10.4, 10.25;
 * T-33; `_ANCHORS.md` §7.1.
 *
 * **Comparative only**: ranked above, ranked below, level with. A ranking
 * never carries a probability, a percentage, a likelihood, a chance, a score,
 * a total, a weight or the word "risk" — on screen, in an export or in a
 * stored row. {@link PROHIBITED_RANKING_PATTERNS} is that list as a test can
 * read it: the scheme is refused when a label matches one, and the unit suite
 * holds every label, basis statement, "why" and CSV cell to it.
 */

/** No ranking surface, export cell or stored row may match any of these. */
export const PROHIBITED_RANKING_PATTERNS: readonly RegExp[] = [
  /%/,
  /probab/i,
  /likel/i,
  /chance/i,
  /\bodds\b/i,
  /risk/i,
  /score/i,
  /\btotal/i,
  /\bweight/i,
  /\b(high|moderate|medium|low)\s+hazard/i,
];

export function containsProhibitedRankingWord(text: string): boolean {
  return PROHIBITED_RANKING_PATTERNS.some((pattern) => pattern.test(text));
}

/** Rule 10.24 — an item added since the last run. */
export const NOT_RANKED_YET = "Not ranked yet";

/** Rule 10.24 — an input the ranking read has changed since its as-of time. */
export const CHANGED_SINCE = "Changed since — rank again to update";

/** Rule 10.22 — an empty container or lot is not compared. */
export const NOT_RANKED_EMPTY = "Not ranked — it holds no batteries";

/** Rule 10.19 — only held inventory is ranked. */
export const NOT_RANKED_NOT_HELD = "Not ranked — only held inventory is ranked";

/** `1st`, `2nd`, `3rd`, `4th` … `11th`, `12th`, `13th`, `21st`. */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Rule 10.23 — "3rd of 41", or "3rd of 41, level with 5 others". */
export function positionText(input: {
  readonly position: number;
  readonly setSize: number;
  readonly levelWithCount: number;
}): string {
  const base = `${ordinal(input.position)} of ${input.setSize}`;
  if (input.levelWithCount === 0) return base;
  const others = input.levelWithCount === 1 ? "other" : "others";
  return `${base}, level with ${input.levelWithCount} ${others}`;
}

/** The list column's short form — `UX_SPEC.md` §3.5: "3 of 41". */
export function shortPositionText(input: {
  readonly position: number;
  readonly setSize: number;
}): string {
  return `${input.position} of ${input.setSize}`;
}

/** A day, as a basis statement names it: "4 Nov 2026". */
export function basisDay(instant: string, timeZone: TimeZone): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(instant));
}

/** A civil date (`YYYY-MM-DD`), as a basis statement names it: "1 Nov 2021". */
export function basisCivilDate(civilDate: string): string {
  return basisDay(`${civilDate}T12:00:00.000Z`, "UTC");
}

/** The as-of instant, with its zone: "12 Nov 2026, 07:00 PST". */
export function basisInstant(instant: string, timeZone: TimeZone): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${basisDay(instant, timeZone)}, ${part("hour")}:${part("minute")} ${part("timeZoneName")}`;
}

/** Watt-hours, grouped: "157,400 Wh". */
export function wattHours(value: string): string {
  const amount = Number(value);
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount)} Wh`;
}
