import { basisCivilDate } from "@/domain/hazard/words";
import type { ObligationDeadlineStatus } from "@/domain/taxonomy/obligation-deadline-status";
import type { ProducerObligationStatus } from "@/domain/taxonomy/producer-obligation-status";
import type { IsoDate, Uuid } from "@/types/common";

import type { Truth } from "./conditions";
import {
  deadlineStanding,
  DEADLINE_STANDING_LABELS,
  type DeadlineStanding,
} from "./deadlines";
import type { Due } from "./payloads";
import { dueWords, NO_DATE_YET } from "./words";

/**
 * A product's plan — Rule 8.23; the marking planner in Rule 8.1.
 *
 * For one product: every obligation that applies to it across the states it
 * is sold in, **earliest date first** — the duty in the law's words, the
 * state, the date or "No date yet", and the deadline's status. Marking duties
 * appear with the rest. **It needs no rule data of its own**: every row is
 * read from what the runs stored, and nothing here decides whether an
 * obligation applies.
 *
 * An obligation whose application to this product can't be told is listed
 * apart, by name — never dropped, because a gap is never "doesn't apply"
 * (Rule 8.9).
 */

export interface PlanObligation {
  readonly obligationId: Uuid;
  readonly stateName: string;
  readonly stateCode: string;
  readonly duty: string;
  readonly citation: string;
  readonly status: ProducerObligationStatus;
  /** This product's own truth on the obligation, as the run stored it. */
  readonly productTruth: Truth | null;
  /** The due rule the run stored, or `null` if it cannot be read. */
  readonly due: Due | null;
}

export interface PlanDeadline {
  readonly deadlineId: Uuid;
  readonly obligationId: Uuid;
  readonly dueOn: IsoDate;
  readonly status: ObligationDeadlineStatus;
}

export interface PlanEntry {
  readonly obligationId: Uuid;
  /** `null` for "No date yet". */
  readonly deadlineId: Uuid | null;
  readonly stateName: string;
  readonly stateCode: string;
  readonly duty: string;
  readonly citation: string;
  readonly dueOn: IsoDate | null;
  /** "1 Jul 2027", or "No date yet — <the event, in the law's words>". */
  readonly dateWords: string;
  readonly standing: DeadlineStanding | null;
  readonly standingLabel: string | null;
}

export interface ProductPlan {
  readonly entries: readonly PlanEntry[];
  /** Obligations it can't yet be told whether this product meets — by name. */
  readonly cantTell: readonly PlanEntry[];
}

function undatedEntry(obligation: PlanObligation): PlanEntry {
  return {
    obligationId: obligation.obligationId,
    deadlineId: null,
    stateName: obligation.stateName,
    stateCode: obligation.stateCode,
    duty: obligation.duty,
    citation: obligation.citation,
    dueOn: null,
    dateWords:
      obligation.due?.kind === "no_date"
        ? `${NO_DATE_YET} — ${obligation.due.event}`
        : NO_DATE_YET,
    standing: null,
    standingLabel: null,
  };
}

function entriesFor(
  obligation: PlanObligation,
  deadlines: readonly PlanDeadline[],
  today: IsoDate,
): readonly PlanEntry[] {
  const own = deadlines.filter(
    (deadline) =>
      deadline.obligationId === obligation.obligationId &&
      deadline.status !== "withdrawn",
  );
  if (own.length === 0) return [undatedEntry(obligation)];
  return own.map((deadline) => {
    const standing = deadlineStanding(deadline, today);
    return {
      obligationId: obligation.obligationId,
      deadlineId: deadline.deadlineId,
      stateName: obligation.stateName,
      stateCode: obligation.stateCode,
      duty: obligation.duty,
      citation: obligation.citation,
      dueOn: deadline.dueOn,
      dateWords: basisCivilDate(deadline.dueOn),
      standing,
      standingLabel: DEADLINE_STANDING_LABELS[standing],
    };
  });
}

/** Earliest date first; "No date yet" after every date; then by state and duty. */
function byDate(a: PlanEntry, b: PlanEntry): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn.localeCompare(b.dueOn);
  }
  return a.stateName.localeCompare(b.stateName) || a.duty.localeCompare(b.duty);
}

export function productPlan(input: {
  readonly obligations: readonly PlanObligation[];
  readonly deadlines: readonly PlanDeadline[];
  readonly today: IsoDate;
}): ProductPlan {
  const applies = input.obligations.filter(
    (row) => row.status === "applies" && row.productTruth === "true",
  );
  const cantTell = input.obligations.filter(
    (row) =>
      row.status !== "not_applicable" && row.productTruth === "cant_tell",
  );
  return {
    entries: applies
      .flatMap((row) => entriesFor(row, input.deadlines, input.today))
      .sort(byDate),
    cantTell: cantTell
      .map((row) => ({
        ...undatedEntry(row),
        // The due rule as the law states it — a date the product may owe.
        dateWords: row.due === null ? NO_DATE_YET : dueWords(row.due),
      }))
      .sort(byDate),
  };
}
