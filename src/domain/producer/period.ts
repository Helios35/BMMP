import type { IsoDate } from "@/types/common";

import type { FilingPeriodRule } from "./filings";

/**
 * The period an annual report covers — Rule 8.21.
 *
 * - **the calendar years before the deadline's year**, as many as the filing
 *   rule names, where the law says so
 * - **where the law states no period, the person picks the calendar year**
 *   when making the packet; the packet says who picked it and that the law
 *   doesn't state one
 *
 * **No period is guessed**: a `chosen_year` filing with no year chosen has no
 * period, and says so — it never defaults to last year.
 */

/** Who picked a year where the law names none (Rule 8.21). */
export interface PeriodChoice {
  readonly year: number;
  readonly chosenByUserId: string;
  readonly chosenByName: string;
}

export type ResolvedPeriod =
  | { readonly kind: "none"; readonly years: readonly [] }
  | {
      readonly kind: "calendar_years_before_due";
      readonly count: number;
      readonly dueYear: number;
      /** Oldest first. */
      readonly years: readonly number[];
    }
  | {
      readonly kind: "chosen_year";
      readonly years: readonly [number];
      readonly choice: PeriodChoice;
    };

export type PeriodResolution =
  | { readonly ok: true; readonly period: ResolvedPeriod }
  /** The law states no period and no one has picked a year yet. */
  | { readonly ok: false; readonly reason: "year_not_chosen" };

function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

export function resolvePeriod(
  rule: FilingPeriodRule,
  dueOn: IsoDate,
  choice: PeriodChoice | null,
): PeriodResolution {
  switch (rule.kind) {
    case "none":
      return { ok: true, period: { kind: "none", years: [] } };
    case "calendar_years_before_due": {
      const dueYear = yearOf(dueOn);
      const years = Array.from(
        { length: rule.count },
        (_, index) => dueYear - rule.count + index,
      );
      return {
        ok: true,
        period: {
          kind: "calendar_years_before_due",
          count: rule.count,
          dueYear,
          years,
        },
      };
    }
    case "chosen_year":
      return choice === null
        ? { ok: false, reason: "year_not_chosen" }
        : {
            ok: true,
            period: { kind: "chosen_year", years: [choice.year], choice },
          };
  }
}

/** The latest full calendar year on a day — the Sales tab's default year (UX §3.21). */
export function latestFullCalendarYear(today: IsoDate): number {
  return yearOf(today) - 1;
}

/**
 * The years a person may pick where the law names none: the latest full
 * calendar year and the four before it. An engineering bound on a picker,
 * not a regulatory one (Rule 1.23) — and never a default (Rule 8.21).
 */
export const PICKABLE_YEAR_SPAN = 5;

export function pickableYears(today: IsoDate): readonly number[] {
  const latest = latestFullCalendarYear(today);
  return Array.from(
    { length: PICKABLE_YEAR_SPAN },
    (_, index) => latest - index,
  );
}

function yearList(years: readonly number[]): string {
  if (years.length <= 1) return years.map(String).join("");
  const head = years.slice(0, -1).map(String).join(", ");
  return `${head} and ${String(years[years.length - 1])}`;
}

/** How the period reads on the dialog and the packet. */
export function periodWords(period: ResolvedPeriod): string {
  switch (period.kind) {
    case "none":
      return "No period — this filing covers none.";
    case "calendar_years_before_due":
      return period.count === 1
        ? `Calendar year ${yearList(period.years)}: the calendar year before the deadline's year (${String(period.dueYear)}), as the filing rule names it.`
        : `Calendar years ${yearList(period.years)}: the ${String(period.count)} calendar years before the deadline's year (${String(period.dueYear)}), as the filing rule names them.`;
    case "chosen_year":
      return `Calendar year ${String(period.choice.year)}, picked by ${period.choice.chosenByName} when making this packet. The law doesn't state a period.`;
  }
}

/** What the dialog says before a year is picked (Rule 8.21). */
export const PICK_A_YEAR =
  "The law doesn't state a period. Pick the calendar year this report covers — the packet will say you picked it.";
