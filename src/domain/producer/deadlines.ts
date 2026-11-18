import type { DeadlineDueBasis } from "@/domain/taxonomy/deadline-due-basis";
import {
  OBLIGATION_DEADLINE_STATUS_LABELS,
  type ObligationDeadlineStatus,
} from "@/domain/taxonomy/obligation-deadline-status";
import type { IsoDate } from "@/types/common";

import type { Due } from "./payloads";

/**
 * Deadlines — Rule 8.10; T-70.
 *
 * A deadline's date comes from the rule and nowhere else:
 *
 * - a date in law (`statutory_date`) is one deadline
 * - a yearly date (`annual`) is one deadline a year, **from the first date
 *   through the next one on or after today** — the past years stay on the
 *   record, and the next one is always there to plan against
 *
 * A date that waits on an event that hasn't happened is **not a deadline**:
 * no row, and the obligation reads "No date yet" with the event in the law's
 * words. **No date is ever estimated.**
 */

export interface DeadlineDraft {
  /** Stable within its obligation: the obligation key and the date. */
  readonly deadlineKey: string;
  readonly dueOn: IsoDate;
  readonly dueBasis: DeadlineDueBasis;
}

function annualOn(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function deadlineKeyFor(obligationKey: string, dueOn: IsoDate): string {
  return `${obligationKey}:${dueOn}`;
}

export function deadlinesFor(
  obligationKey: string,
  due: Due,
  today: IsoDate,
): readonly DeadlineDraft[] {
  switch (due.kind) {
    case "no_date":
      return [];
    case "statutory_date":
      return [
        {
          deadlineKey: deadlineKeyFor(obligationKey, due.on),
          dueOn: due.on,
          dueBasis: "statutory_date",
        },
      ];
    case "annual": {
      const drafts: DeadlineDraft[] = [];
      let year = Number(due.firstOn.slice(0, 4));
      for (;;) {
        const dueOn = annualOn(year, due.month, due.day);
        drafts.push({
          deadlineKey: deadlineKeyFor(obligationKey, dueOn),
          dueOn,
          dueBasis: "annual",
        });
        // ISO dates compare in calendar order as strings.
        if (dueOn >= today) return drafts;
        year += 1;
      }
    }
  }
}

/** Overdue is shown from the date; it is never stored (T-69). */
export function isOverdue(
  deadline: {
    readonly status: ObligationDeadlineStatus;
    readonly dueOn: IsoDate;
  },
  today: IsoDate,
): boolean {
  return deadline.status === "open" && deadline.dueOn < today;
}

/** What a person reads in the status column: Open, Overdue, Done, Withdrawn. */
export const DEADLINE_STANDINGS = [
  "open",
  "overdue",
  "completed",
  "withdrawn",
] as const;
export type DeadlineStanding = (typeof DEADLINE_STANDINGS)[number];

/** "Overdue" is the one word here; the rest are T-69's own labels. */
export const OVERDUE = "Overdue";

export const DEADLINE_STANDING_LABELS: Readonly<
  Record<DeadlineStanding, string>
> = {
  ...OBLIGATION_DEADLINE_STATUS_LABELS,
  overdue: OVERDUE,
};

export function deadlineStanding(
  deadline: {
    readonly status: ObligationDeadlineStatus;
    readonly dueOn: IsoDate;
  },
  today: IsoDate,
): DeadlineStanding {
  if (isOverdue(deadline, today)) return "overdue";
  return deadline.status;
}
