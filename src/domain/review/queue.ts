import { canReadRoute, canWriteRoute } from "@/domain/access/route-capability";
import type { ConfidenceBand } from "@/domain/taxonomy/confidence-band";
import type { IntakeSessionStatus } from "@/domain/taxonomy/intake-session-status";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { IsoTimestamp, JsonObject, JsonValue } from "@/types/common";

/**
 * What is on the review queue, and who is looking at it — `UX_SPEC.md`
 * §3.8, §3.8a, §3.8b; `SITE_ARCHITECTURE.md` Flow A-a, Flow F, CL-1;
 * Rules 2.14, 2.22, 2.23; T-52.
 *
 * **The queue is derived in one place.** The `/review` route, the nav badge
 * and the dashboard card all read the membership through
 * `features/review/server/queue.ts`, which applies the two predicates here and
 * nothing else; the count each of them shows is {@link reviewQueueCount}
 * over that one membership. A badge and a page that disagree about how many
 * items wait is how a queue stops being trusted.
 *
 * ## Two kinds of item
 *
 * - **An intake session the gate held back** (Rule 2.14) — any session with
 *   `is_review_required` set that has not closed. A session saved to the
 *   queue, one left mid-step (Flow A-a(3)), one whose read failed (EC-14) and
 *   one whose read produced nothing (E-4) are all this kind; the T-52 codes
 *   say which.
 * - **A re-match raised by an approved catalog entry** (Flow F step 4) — a
 *   committed record whose identifying fields match an entry P6 approved.
 *   Nothing about the record changed when it was raised; a person decides.
 *   It is persisted as an open `review_queue` alert (T-44) on that record,
 *   because the queue needs a durable row a person resolves and `alert` is the
 *   entity that is one — see {@link isOpenRematchRaise}.
 *
 * **Nothing here empties the queue.** There is no age, no timeout, no bulk
 * predicate: an item leaves only when a person confirms it or voids it with a
 * stated reason (Rule 2.23, D-33), and the predicates below read state a
 * person wrote.
 */

/** How the reader is addressed — the same count, framed for the reader's own question. */
export const REVIEW_QUEUE_FRAMINGS = ["confirming", "unidentified"] as const;

export type ReviewQueueFraming = (typeof REVIEW_QUEUE_FRAMINGS)[number];

/**
 * `write` on `/review` confirms; `read` without `write` is P2's view; neither
 * is no view at all. Resolved from `ROUTE_ACCESS`, never a role literal, so B3
 * moving a capability moves the framing with it (§5.3(3)).
 */
export function reviewQueueFraming(role: RoleCode): ReviewQueueFraming | null {
  if (canWriteRoute(role, "/review")) return "confirming";
  if (canReadRoute(role, "/review")) return "unidentified";
  return null;
}

// --- intake sessions ------------------------------------------------------------

export interface QueueSessionState {
  readonly status: IntakeSessionStatus;
  readonly isReviewRequired: boolean;
}

/** T-08's two terminal values. A closed session has nothing left for a person to do. */
const CLOSED_SESSION_STATUSES: readonly IntakeSessionStatus[] = [
  "completed",
  "abandoned",
];

/**
 * An intake session on the queue: the gate held it (Rule 2.14) and it has not
 * closed.
 *
 * `is_review_required` alone is not enough — unit 02's void closes the
 * session and leaves the flag as the gate wrote it, so a queue read on the
 * flag alone would keep counting an item a person already voided.
 */
export function isQueuedIntakeSession(session: QueueSessionState): boolean {
  return (
    session.isReviewRequired &&
    !CLOSED_SESSION_STATUSES.includes(session.status)
  );
}

// --- re-match raises (Flow F) -----------------------------------------------------

/**
 * What an approval writes into the raise's `trigger_snapshot` — frozen, so
 * "why is this on the queue" is answerable later (`ERD.md` §6.5).
 */
export interface RematchTrigger {
  /** The approved `catalog_entry` the record's identifying fields match. */
  readonly catalogEntryId: string;
  /** Which identifiers matched, in the order they were compared. */
  readonly matchedOn: readonly string[];
}

/** Names the snapshot as a Flow F raise, so no other alert reads as one. */
const REMATCH_TRIGGER_KIND = "catalog_entry_approved";

export function rematchTriggerSnapshot(trigger: RematchTrigger): JsonObject {
  return {
    raisedBy: REMATCH_TRIGGER_KIND,
    catalogEntryId: trigger.catalogEntryId,
    matchedOn: [...trigger.matchedOn],
  };
}

function isStringArray(value: JsonValue | undefined): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

/** The trigger back out of a stored snapshot, or `null` where it is not a Flow F raise. */
export function readRematchTrigger(
  snapshot: JsonObject,
): RematchTrigger | null {
  const catalogEntryId = snapshot.catalogEntryId;
  const matchedOn = snapshot.matchedOn;
  if (snapshot.raisedBy !== REMATCH_TRIGGER_KIND) return null;
  if (typeof catalogEntryId !== "string" || catalogEntryId === "") return null;
  return {
    catalogEntryId,
    matchedOn: isStringArray(matchedOn) ? matchedOn : [],
  };
}

/**
 * Stable per (record, entry): approving an entry twice, or a retried approval,
 * never raises the same record for the same entry twice (`raiseIfAbsent`).
 */
export function rematchDedupeKey(
  batteryRecordId: string,
  catalogEntryId: string,
): string {
  return `review_queue:rematch:${batteryRecordId}:${catalogEntryId}`;
}

export interface QueueAlertState {
  readonly alertType: string;
  readonly batteryRecordId: string | null;
  readonly resolvedAt: IsoTimestamp | null;
  readonly triggerSnapshot: JsonObject;
}

/**
 * A Flow F raise still waiting on a person: an unresolved T-44 `review_queue`
 * alert on one record, whose snapshot names the approved entry.
 *
 * The organisation-wide `review_queue` alert — *"2 records are waiting"* —
 * names no record and is a notification about the queue, not an item on it,
 * so it is never counted twice.
 */
export function isOpenRematchRaise(alert: QueueAlertState): boolean {
  return (
    alert.alertType === "review_queue" &&
    alert.batteryRecordId !== null &&
    alert.resolvedAt === null &&
    readRematchTrigger(alert.triggerSnapshot) !== null
  );
}

// --- the count ---------------------------------------------------------------------

export interface ReviewQueueMembership {
  readonly sessionCount: number;
  readonly rematchCount: number;
}

/**
 * How many items this reader is told are waiting.
 *
 * P1 and P6 work every item. P2's question is which batteries in her
 * containers are **still unidentified** (§3.8b, CL-1): a re-match is raised
 * on a record whose identity a person already confirmed — it is classified
 * and clocked — so it is not hers to count.
 */
export function reviewQueueCount(
  membership: ReviewQueueMembership,
  framing: ReviewQueueFraming,
): number {
  return framing === "confirming"
    ? membership.sessionCount + membership.rematchCount
    : membership.sessionCount;
}

// --- what the list says about each item ---------------------------------------------

export interface FlaggableField {
  readonly fieldCode: string;
  readonly status: "pending" | "confirmed" | "rejected";
  readonly confidenceBand: ConfidenceBand | null;
}

/**
 * How many fields still need a person's eye — read below the passing band and
 * not yet confirmed or rejected (§3.8a: *"a count of flagged fields"*).
 *
 * Assessed condition is never read from a label (Rule 6.2), so it is never
 * flagged by a read; the three hard-gated fields need a person at every band
 * (Rule 2.15) and the card says so on each row — this count is the read's
 * quality, not the confirmation checklist.
 */
export function flaggedFieldCount(fields: readonly FlaggableField[]): number {
  return fields.filter(
    (field) =>
      field.fieldCode !== "assessed_condition" &&
      field.status === "pending" &&
      field.confidenceBand !== null &&
      field.confidenceBand !== "high",
  ).length;
}

// --- order and movement ---------------------------------------------------------------

export interface QueuedSince {
  readonly id: string;
  /** When the item joined the queue — the session's start, or the raise. */
  readonly queuedSince: IsoTimestamp;
}

/**
 * Oldest first (§3.8a) — the queue is worked, not browsed, and the item that
 * has waited longest is the one a person reaches first. Ties break on the id
 * so two renders of the same queue list it the same way.
 */
export function oldestFirst<T extends QueuedSince>(
  items: readonly T[],
): readonly T[] {
  return [...items].sort(
    (a, b) =>
      a.queuedSince.localeCompare(b.queuedSince) || a.id.localeCompare(b.id),
  );
}

export interface QueuePosition {
  readonly index: number;
  readonly total: number;
  readonly previousId: string | null;
  readonly nextId: string | null;
}

/** Where an item sits, for **Previous** / **Next** (§3.8a mobile). `null` when it is not on the queue. */
export function queuePosition(
  orderedIds: readonly string[],
  id: string,
): QueuePosition | null {
  const index = orderedIds.indexOf(id);
  if (index === -1) return null;
  return {
    index,
    total: orderedIds.length,
    previousId: index > 0 ? (orderedIds[index - 1] ?? null) : null,
    nextId:
      index < orderedIds.length - 1 ? (orderedIds[index + 1] ?? null) : null,
  };
}

/**
 * What to open once an item has left the queue — the one after it, or the one
 * before it where it was last, or nothing. **Offered, never acted on**: the
 * next item opens for a person to work, and nothing is confirmed by moving.
 */
export function nextAfterResolving(
  orderedIds: readonly string[],
  resolvedId: string,
): string | null {
  const position = queuePosition(orderedIds, resolvedId);
  if (position === null) return orderedIds[0] ?? null;
  return position.nextId ?? position.previousId;
}

// --- P2's composition (§3.8b) ---------------------------------------------------------

export interface InventoryItem extends QueuedSince {
  /**
   * The container the item is keyed on, or `null`. An unconfirmed record has
   * no `container_id` — placement is written only by the commit — so this is
   * the container the intake names on its draft: the drum the handler was
   * standing at, or chose on step 3.
   */
  readonly containerId: string | null;
}

export interface InventoryGroup<T extends InventoryItem> {
  readonly containerId: string | null;
  /** Oldest first within the group — age is the secondary sort (§3.8b). */
  readonly items: readonly T[];
}

/**
 * Grouped by container, not sorted oldest-first — P2 audits a physical space,
 * P1 works a chronological queue (§3.8b). Groups are ordered by `order`
 * (the caller's container order, which carries site then code); the items no
 * container names come last, together, never dropped.
 */
export function groupByContainer<T extends InventoryItem>(
  items: readonly T[],
  order: readonly string[],
): readonly InventoryGroup<T>[] {
  const byContainer = new Map<string | null, T[]>();
  for (const item of oldestFirst(items)) {
    const bucket = byContainer.get(item.containerId);
    if (bucket === undefined) byContainer.set(item.containerId, [item]);
    else bucket.push(item);
  }
  const rank = (id: string | null): number => {
    if (id === null) return Number.POSITIVE_INFINITY;
    const index = order.indexOf(id);
    return index === -1 ? order.length : index;
  };
  return [...byContainer.entries()]
    .sort(
      ([a], [b]) =>
        rank(a) - rank(b) || String(a ?? "").localeCompare(String(b ?? "")),
    )
    .map(([containerId, grouped]) => ({ containerId, items: grouped }));
}
