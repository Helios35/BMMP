import type { IsoTimestamp } from "@/types/common";
import {
  CONTAINER_STATUS_LABELS,
  type ContainerStatus,
} from "@/domain/taxonomy/container-status";
import {
  LOT_STATUS_LABELS,
  type LotStatus,
} from "@/domain/taxonomy/lot-status";

/**
 * Lots — `BUSINESS_RULES.md` Rules 4.23, 4.24, 5.1; T-25; `ERD.md` §6.2.
 *
 * **A lot is a grouping, not a place.** It holds containers — never batteries
 * directly — and a battery joins one by being placed in one of its containers
 * (owner's call in `b1a-08`, keeping `ERD.md` §6.2's one containment path). A
 * lot has no fill level and no storage clock of its own (Rule 4.23): it
 * reports the earliest accumulation start among its contents, and it reads
 * overdue where any of them is overdue (Rule 4.24). Nothing here starts,
 * stops or moves a date.
 *
 * Every refusal is stated (Rule 1.26), and none takes a role into account —
 * who may act on a lot is `mayTakeContainerAction`'s, not this module's.
 */

/**
 * T-25's transitions, as `BUSINESS_RULES.md` § Status Definitions states them.
 * `shipped` and `dissolved` are terminal.
 */
export const LOT_TRANSITIONS: Readonly<
  Record<LotStatus, readonly LotStatus[]>
> = {
  open: ["closed", "dissolved"],
  closed: ["allocated", "open", "dissolved"],
  allocated: ["shipped", "closed"],
  shipped: [],
  dissolved: [],
};

/** The three moves a person makes on a lot. The other two follow a shipment. */
export type LotPersonMove = Extract<LotStatus, "closed" | "open" | "dissolved">;

export type LotAdmission =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

function refuse(message: string): LotAdmission {
  return { ok: false, message };
}

/** The lot as these rules read it. */
export interface LotFacts {
  readonly lotCode: string;
  readonly status: LotStatus;
  /** The containers whose `lot_id` names it. */
  readonly memberCount: number;
}

/**
 * Whether a lot may move to `to`. Closing an empty lot is refused — a
 * grouping of nothing has nothing to fix — and the T-25 table refuses the
 * rest by name.
 */
export function admitLotStatusChange(
  lot: LotFacts,
  to: LotStatus,
): LotAdmission {
  if (!LOT_TRANSITIONS[lot.status].includes(to)) {
    return refuse(
      lot.status === "shipped" || lot.status === "dissolved"
        ? `${lot.lotCode} is ${LOT_STATUS_LABELS[lot.status]}, which is final. A new grouping needs a new lot.`
        : `${lot.lotCode} is ${LOT_STATUS_LABELS[lot.status]} and cannot become ${LOT_STATUS_LABELS[to]} from there.`,
    );
  }
  if (to === "closed" && lot.status === "open" && lot.memberCount === 0) {
    return refuse(
      `${lot.lotCode} holds no containers, so there is nothing to close. Add a container first.`,
    );
  }
  return { ok: true };
}

/** The container as membership reads it. */
export interface LotMemberFacts {
  readonly containerCode: string;
  readonly status: ContainerStatus;
  /** The lot the container is in now, if any. */
  readonly lot: { readonly id: string; readonly lotCode: string } | null;
  /** The open shipment it is on, where it is on one. */
  readonly onOpenShipment: { readonly shipmentNumber: string } | null;
}

/** Statuses whose cycle has ended: nothing joins or leaves a lot from here. */
const ENDED: readonly ContainerStatus[] = ["shipped", "retired"];

/**
 * Whether a container may join `lot`. Members are added and removed only
 * while the lot is open (T-25), a container is in one lot at a time, and a
 * container already on a shipment does not change its grouping underneath it.
 */
export function admitContainerToLot(
  lot: LotFacts & { readonly id: string },
  container: LotMemberFacts,
): LotAdmission {
  if (lot.status !== "open") {
    return refuse(
      `${lot.lotCode} is ${LOT_STATUS_LABELS[lot.status]}. Containers join a lot only while it is open.`,
    );
  }
  if (ENDED.includes(container.status)) {
    return refuse(
      `${container.containerCode} is ${CONTAINER_STATUS_LABELS[container.status]} and its cycle has ended, so it joins no lot.`,
    );
  }
  if (container.lot !== null && container.lot.id !== lot.id) {
    return refuse(
      `${container.containerCode} is already in ${container.lot.lotCode}. A container is in one lot at a time.`,
    );
  }
  if (container.onOpenShipment !== null) {
    return refuse(
      `${container.containerCode} is on ${container.onOpenShipment.shipmentNumber}. Remove it from that shipment before it joins a lot.`,
    );
  }
  return { ok: true };
}

/** Whether a container may leave its lot. Only while the lot is open (T-25). */
export function admitContainerLeavingLot(
  lot: LotFacts,
  container: Pick<LotMemberFacts, "containerCode" | "status">,
): LotAdmission {
  if (lot.status !== "open") {
    return refuse(
      `${lot.lotCode} is ${LOT_STATUS_LABELS[lot.status]}, so its membership is fixed. Reopen it to remove ${container.containerCode}.`,
    );
  }
  if (ENDED.includes(container.status)) {
    return refuse(
      `${container.containerCode} is ${CONTAINER_STATUS_LABELS[container.status]}; it stays on the lot's record.`,
    );
  }
  return { ok: true };
}

/** One member container, as the standing reads it. */
export interface LotStandingMember {
  readonly status: ContainerStatus;
  readonly accumulationStartedAt: IsoTimestamp | null;
}

export interface LotStanding {
  /** The earliest accumulation start among the lot's contents (Rule 4.24). Null when none has started. */
  readonly earliestAccumulationStart: IsoTimestamp | null;
  /** Any content container is overdue (Rule 4.24). */
  readonly isOverdue: boolean;
  /** Members still on site — what the earliest start and the overdue reading are over. */
  readonly contentCount: number;
}

/**
 * Rule 4.24 — the lot's reading of its contents. **Not a clock**: the lot
 * reports its members' dates and states, and owns none of its own (Rule
 * 4.23). A member that has shipped or been retired has left the contents.
 */
export function lotStanding(
  members: readonly LotStandingMember[],
): LotStanding {
  const contents = members.filter((member) => !ENDED.includes(member.status));
  const starts = contents
    .map((member) => member.accumulationStartedAt)
    .filter((start): start is IsoTimestamp => start !== null)
    .sort();
  return {
    earliestAccumulationStart: starts[0] ?? null,
    isOverdue: contents.some((member) => member.status === "overdue"),
    contentCount: contents.length,
  };
}
