import type { IsoTimestamp, JsonValue, PostalAddress } from "@/types/common";
import {
  admitToContainer,
  type PlacementAdmission,
} from "@/domain/storage/placement";
import type { AccumulationStartSource } from "@/domain/taxonomy/accumulation-start-source";
import type { ClockStartBasis } from "@/domain/taxonomy/clock-start-basis";
import {
  CONTAINER_STATUS_LABELS,
  type ContainerStatus,
} from "@/domain/taxonomy/container-status";
import type { ContainerType } from "@/domain/taxonomy/container-type";
import type { StorageClockStatus } from "@/domain/taxonomy/storage-clock-status";

/**
 * Accumulation start dates, and how they travel — Rules 4.4, 4.7, 4.9–4.12.
 *
 * **A start date only ever moves earlier.** A battery's start date travels with
 * it (Rule 4.9); a container that receives it takes the earliest start among
 * its contents, immediately (Rule 4.10); consolidation takes the earliest of
 * everything combined (Rule 4.11); a split gives each **new** container the
 * earliest of its own contents (Rule 4.12). No function here can return a date
 * later than the one it was given — {@link planReceipt} throws rather than do
 * it, because moving batteries between containers is the single most likely
 * attempted workaround in this domain and the system defeats it structurally
 * rather than by warning (EC-23).
 *
 * **A container that loses contents keeps its start date.** Its clock closes
 * only when it reaches empty (Rule 4.7), and a container row covers one
 * accumulation cycle (`ERD.md` §6.1), so a clock that has stopped is never
 * restarted on the same row: the container takes nothing more.
 *
 * Pure: every figure arrives as an argument and nothing here reads a clock,
 * a table or the environment.
 */

/** The three ways contents leave one container for another. All three are `repackage` then `place` (T-16). */
export const CONTENTS_MOVE_OPERATIONS = [
  "move",
  "consolidate",
  "split",
] as const;

export type ContentsMoveOperation = (typeof CONTENTS_MOVE_OPERATIONS)[number];

/**
 * The key a `place` storage event's payload carries the battery's own start
 * under. Written by every placement — at intake and on every move — so the
 * date a battery carries is recorded where it moved, not re-derived later.
 */
export const CARRIED_START_PAYLOAD_KEY = "carriedAccumulationStartAt";

/** The T-62 / T-64 value each operation writes when it sets or moves a start. */
const OPERATION_START_SOURCE: Readonly<
  Record<ContentsMoveOperation, AccumulationStartSource & ClockStartBasis>
> = {
  move: "inherited_on_receipt",
  consolidate: "inherited_on_consolidation",
  split: "inherited_on_split",
};

/** Thrown when a computed start would be later than the one it replaces. Unreachable by design. */
export class StartDateWouldMoveLaterError extends Error {
  constructor(
    readonly before: IsoTimestamp,
    readonly after: IsoTimestamp,
  ) {
    super(
      `An accumulation start date may only move earlier: ${after} is later than ${before}. ` +
        "Nothing was changed — Rules 4.6, 4.9–4.12.",
    );
    this.name = "StartDateWouldMoveLaterError";
  }
}

function instant(value: IsoTimestamp): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new RangeError(`Not an instant: ${value}`);
  }
  return parsed;
}

/** The earliest of a set of instants, or null for an empty set. */
export function earliestInstant(
  values: readonly IsoTimestamp[],
): IsoTimestamp | null {
  let earliest: IsoTimestamp | null = null;
  for (const value of values) {
    if (earliest === null || instant(value) < instant(earliest)) {
      earliest = value;
    }
  }
  return earliest;
}

/** Whether `after` is later than `before`. Equal is not later. */
export function isLater(before: IsoTimestamp, after: IsoTimestamp): boolean {
  return instant(after) > instant(before);
}

/** Refuse, loudly, any start that would move later (Rules 4.6, 4.9). */
export function assertNeverLater(
  before: IsoTimestamp | null,
  after: IsoTimestamp,
): void {
  if (before !== null && isLater(before, after)) {
    throw new StartDateWouldMoveLaterError(before, after);
  }
}

// --- the date a battery carries -----------------------------------------------------

/** One storage event of one battery, as much of it as the carried date needs. */
export interface PlacementEvidence {
  readonly activityType: string;
  readonly occurredAt: IsoTimestamp;
  readonly payload: JsonValue | null;
}

function isJsonObject(
  value: JsonValue | null,
): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function carriedStartIn(payload: JsonValue | null): IsoTimestamp | null {
  if (!isJsonObject(payload)) return null;
  const value = payload[CARRIED_START_PAYLOAD_KEY];
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
}

/**
 * The accumulation start date a battery carries (Rule 4.9).
 *
 * **Its own evidence first:** the earliest start its `place` events recorded —
 * the payload's carried start where there is one, the placement instant where
 * there is not. A battery placed in March into a drum running since January
 * carries March: it became waste in March, and that is what lets a split
 * relieve the container holding only new stock (EC-25).
 *
 * **Without evidence, its container's start** — the earliest it could possibly
 * be, since a container's start is the earliest among its contents. A record
 * placed before T-16 had `place` (unit 02 filed placements as `repackage`)
 * therefore carries its drum's date: never later than the truth.
 *
 * Null only for a record that was never placed.
 */
export function carriedAccumulationStart(input: {
  readonly events: readonly PlacementEvidence[];
  readonly containerAccumulationStartedAt: IsoTimestamp | null;
}): IsoTimestamp | null {
  const own = input.events
    .filter((event) => event.activityType === "place")
    .map((event) => carriedStartIn(event.payload) ?? event.occurredAt);
  return earliestInstant(own) ?? input.containerAccumulationStartedAt;
}

// --- the receiving container ----------------------------------------------------------

export interface ReceiptPlanInput {
  readonly operation: ContentsMoveOperation;
  readonly target: {
    readonly accumulationStartedAt: IsoTimestamp | null;
    readonly accumulationStartSource: AccumulationStartSource | null;
  };
  /** The start each arriving battery carries. At least one. */
  readonly carriedStarts: readonly IsoTimestamp[];
}

export interface ReceiptPlan {
  /** The receiving container's start after the move. Never later than before. */
  readonly accumulationStartedAt: IsoTimestamp;
  /** T-62 after the move. Changes only when the start changes. */
  readonly accumulationStartSource: AccumulationStartSource | null;
  /** T-64 for the receiving clock, when the start was set or moved; null when it held. */
  readonly clockStartBasis: ClockStartBasis | null;
  /** The start before the move — null when the container had never held a battery. */
  readonly previousAccumulationStartedAt: IsoTimestamp | null;
  /** True when the start was set for the first time or moved earlier. */
  readonly startChanged: boolean;
}

/**
 * What a receiving container's start becomes (Rules 4.10–4.12).
 *
 * The earliest of its own start and every arriving battery's. When that is
 * earlier — or the container had none — the start moves and T-62 names the
 * operation that moved it; otherwise nothing about the start changes, and
 * neither does its source (T-62: *a value changes only when the start date
 * changes*). A container that was empty takes an **inherited** value, never
 * `first_placement`: its start is the battery's carried date, not the date of
 * this move.
 */
export function planReceipt(input: ReceiptPlanInput): ReceiptPlan {
  const earliestArriving = earliestInstant(input.carriedStarts);
  if (earliestArriving === null) {
    throw new RangeError("A receipt moves at least one battery.");
  }
  const before = input.target.accumulationStartedAt;
  const moves = before === null || isLater(earliestArriving, before);

  const after = moves ? earliestArriving : before;
  assertNeverLater(before, after);

  const inherited = OPERATION_START_SOURCE[input.operation];
  return {
    accumulationStartedAt: after,
    accumulationStartSource: moves
      ? inherited
      : input.target.accumulationStartSource,
    clockStartBasis: moves ? inherited : null,
    previousAccumulationStartedAt: before,
    startChanged: moves,
  };
}

// --- admission -------------------------------------------------------------------------

/** A container, as much of it as a move's admission reads. */
export interface MoveContainerFacts {
  readonly id: string;
  readonly status: ContainerStatus;
  readonly containerType: ContainerType;
  readonly siteTimeZone: string;
  readonly siteAddress: PostalAddress | null;
  readonly accumulationStartedAt: IsoTimestamp | null;
  /** The container's clock, where it has one. */
  readonly clockStatus: StorageClockStatus | null;
  /** Battery records currently in the container. */
  readonly contentCount: number;
}

export type ContentsMoveRefusal =
  | "same_container"
  | "nothing_selected"
  | "not_in_source"
  | "source_locked"
  | "different_site"
  | "split_needs_fresh_container"
  | "split_must_leave_contents"
  | "consolidate_needs_contents"
  | "consolidate_takes_everything"
  | Exclude<PlacementAdmission, { ok: true }>["reason"];

export type ContentsMoveAdmission =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: ContentsMoveRefusal;
      readonly message: string;
    };

/** A container a move may take contents out of. Overdue blocks additions, not departures (EC-27). */
const DEPARTABLE_STATUSES: readonly ContainerStatus[] = [
  "open",
  "full",
  "overdue",
];

function refuse(
  reason: ContentsMoveRefusal,
  message: string,
): ContentsMoveAdmission {
  return { ok: false, reason, message };
}

function sameSite(a: MoveContainerFacts, b: MoveContainerFacts): boolean {
  return (
    a.siteTimeZone === b.siteTimeZone &&
    JSON.stringify(a.siteAddress) === JSON.stringify(b.siteAddress)
  );
}

/**
 * Whether one container's contents may move into another, and if not, why.
 *
 * Every refusal is stated (Rules 4.16, 4.28, 1.26). The receiving side is
 * {@link admitToContainer}'s: overdue takes nothing, a container that is not
 * open takes nothing, and a different segregation class is blocked rather than
 * advised — every battery in the source already carries the source's class, so
 * the class it needs is the source's. Then the facts a move adds:
 *
 * - **A stopped clock takes nothing** — also {@link admitToContainer}'s (Rule
 *   4.7; `ERD.md` §6.1).
 * - **A container never spans sites** (Rule 4.1) — batteries leave a site on a
 *   shipment, not on a move.
 * - **Each operation keeps its meaning.** A split produces a *new* container
 *   and leaves the source holding something (Rule 4.12); a consolidation takes
 *   everything into a container that already holds contents (Rule 4.11).
 */
export function admitContentsMove(input: {
  readonly operation: ContentsMoveOperation;
  readonly source: MoveContainerFacts;
  readonly target: MoveContainerFacts;
  /** How many of the source's batteries are moving. */
  readonly movingCount: number;
}): ContentsMoveAdmission {
  const { operation, source, target, movingCount } = input;

  if (source.id === target.id) {
    return refuse(
      "same_container",
      "Choose a different container. Batteries cannot be moved into the container they are already in.",
    );
  }
  if (movingCount === 0) {
    return refuse("nothing_selected", "Choose at least one battery to move.");
  }
  if (movingCount > source.contentCount) {
    return refuse(
      "not_in_source",
      "One of those batteries is not in this container. Nothing was moved.",
    );
  }
  if (!DEPARTABLE_STATUSES.includes(source.status)) {
    return refuse(
      "source_locked",
      `This container is ${CONTAINER_STATUS_LABELS[source.status]} and its contents are locked.`,
    );
  }

  const receiving = admitToContainer(
    target,
    source.containerType,
    target.clockStatus === null ? null : { status: target.clockStatus },
  );
  if (!receiving.ok) return receiving;
  if (!sameSite(source, target)) {
    return refuse(
      "different_site",
      "These containers are at different sites. Batteries leave a site on a shipment.",
    );
  }

  if (operation === "split") {
    if (target.contentCount > 0 || target.accumulationStartedAt !== null) {
      return refuse(
        "split_needs_fresh_container",
        "A split moves batteries into a new, empty container. Choose one that has never held a battery.",
      );
    }
    if (movingCount >= source.contentCount) {
      return refuse(
        "split_must_leave_contents",
        "A split leaves some batteries behind. To move them all, use Move.",
      );
    }
  }
  if (operation === "consolidate") {
    if (movingCount !== source.contentCount) {
      return refuse(
        "consolidate_takes_everything",
        "Consolidating moves everything in this container. Nothing was moved.",
      );
    }
    if (target.contentCount === 0) {
      return refuse(
        "consolidate_needs_contents",
        "Consolidate into a container that already holds batteries. To fill an empty one, use Move.",
      );
    }
  }
  return { ok: true };
}

/** Whether the source reaches empty — the one event that stops its clock (Rule 4.7). */
export function emptiesSource(input: {
  readonly contentCount: number;
  readonly movingCount: number;
}): boolean {
  return input.movingCount >= input.contentCount;
}
