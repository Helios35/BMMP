import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  isOpenRematchRaise,
  isQueuedIntakeSession,
  oldestFirst,
  reviewQueueCount,
  reviewQueueFraming,
} from "@/domain/review/queue";
import { DataIntegrityError } from "@/lib/errors";
import type { IntakeSession } from "@/types/intake";
import type { Alert } from "@/types/storage";

/**
 * **The review queue, read once** — `UX_SPEC.md` §3.8, §4.2 (the nav badge),
 * §3.4 (the dashboard card); Rules 2.14, 2.23.
 *
 * This is the only place the queue's membership is read. `/review`, the
 * `reviewOpenItems` nav badge and the dashboard's review card all call
 * {@link readReviewQueue} or {@link readReviewQueueCount}, and the count each
 * shows is `reviewQueueCount` over the same membership — so a badge, a card
 * and a page cannot disagree about how many items wait. `grep` for
 * `readReviewQueue` finds the three consumers and this file; no other module
 * lists the queue. (`isOpenRematchRaise` is also asked of one alert elsewhere
 * — to validate a raise before acting on it, and to link an alert to its item
 * — which reads one row and counts nothing.)
 *
 * The adapter narrows with the query; the domain predicates are applied to
 * every row as well, so what counts as queued is decided by the rule and not
 * by an adapter's reading of a query field.
 */

/**
 * Bounded reads, far beyond one organisation's queue in B1a. **A truncated
 * read is refused, never counted**: a queue that shows 500 when 612 wait is a
 * number nobody computed.
 */
const QUEUE_READ_LIMIT = 500;

export interface ReviewQueueMembership {
  /** Oldest first. */
  readonly sessions: readonly IntakeSession[];
  /** Oldest first. Flow F raises, one per (record, approved entry). */
  readonly rematches: readonly Alert[];
}

export async function readReviewQueue(
  ctx: RequestContext,
): Promise<ReviewQueueMembership> {
  const [sessionPage, alertPage] = await Promise.all([
    data.intakeSessions.list(ctx, {
      isReviewRequired: true,
      isOpen: true,
      limit: QUEUE_READ_LIMIT,
    }),
    data.alerts.list(ctx, {
      alertType: "review_queue",
      isOpen: true,
      limit: QUEUE_READ_LIMIT,
    }),
  ]);
  if (sessionPage.cursor !== null || alertPage.cursor !== null) {
    throw new DataIntegrityError({
      userMessage:
        "The review queue is larger than this screen can read at once. Nothing was changed.",
      correlationId: ctx.correlationId,
      context: {
        sessions: sessionPage.total,
        alerts: alertPage.total,
        limit: QUEUE_READ_LIMIT,
      },
    });
  }

  const sessions = oldestFirst(
    sessionPage.items
      .filter(isQueuedIntakeSession)
      .map((session) => ({ ...session, queuedSince: session.startedAt })),
  );
  const rematches = oldestFirst(
    alertPage.items
      .filter(isOpenRematchRaise)
      .map((alert) => ({ ...alert, queuedSince: alert.raisedAt })),
  );
  return { sessions, rematches };
}

/**
 * The number this reader is told is waiting, or `null` where the role holds
 * nothing on `/review` and is told nothing at all.
 */
export async function readReviewQueueCount(
  ctx: RequestContext,
): Promise<number | null> {
  const framing = reviewQueueFraming(ctx.role);
  if (framing === null) return null;
  const membership = await readReviewQueue(ctx);
  return reviewQueueCount(
    {
      sessionCount: membership.sessions.length,
      rematchCount: membership.rematches.length,
    },
    framing,
  );
}
