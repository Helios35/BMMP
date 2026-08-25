import Link from "next/link";
import type { ReactElement } from "react";

import { INTENT_ICON, INTENT_TEXT_CLASSES } from "@/components";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/page";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute, canWriteRoute } from "@/domain/access/route-capability";
import type { RoleCode } from "@/domain/taxonomy/role";
import { LeadingIcon } from "@/components/page/leading-icon";

import { REVIEW_QUEUE } from "./cross-route-links";
import {
  DashboardRegion,
  DashboardRegionError,
  DashboardRegionSkeleton,
  describeRegionFailure,
} from "./dashboard-regions";

/**
 * The review queue card — `UX_SPEC.md` §3.4.
 *
 * **The same count, framed for the reader's own question.** P1 and P6 see work
 * to do; P2 sees a problem in her containers, and her link lands on §3.8b rather
 * than on P1's queue (`SITE_ARCHITECTURE.md` CL-1). Unit 03 owns that
 * composition — this card carries the right frame and the right link and
 * nothing more.
 *
 * **P3, P4 and P5 do not see the card at all.** They hold nothing on `/review`,
 * so the control is absent, not disabled: §2.9's table makes disabled the
 * *auditor* pattern for a permission difference between colleagues, and this is
 * not that — the review queue is simply not their job (E-8a's second row).
 *
 * The framing is resolved from `ROUTE_ACCESS`, never from a role literal: `write`
 * on `/review` is exactly P1 and P6, `read` without `write` is exactly P2, and
 * B3 moving a capability moves this card with it.
 */

const REGION_ID = "review-queue";
const REGION_TITLE = "Review queue";
const REGION_FAILURE =
  "We could not load the review queue. Nothing has changed — try again.";

/** The good state, and it is styled as one (E-15). */
const NOTHING_TO_REVIEW =
  "Nothing to review. Every reading has been confirmed.";

export const REVIEW_QUEUE_FRAMINGS = ["confirming", "unidentified"] as const;

export type ReviewQueueFraming = (typeof REVIEW_QUEUE_FRAMINGS)[number];

export function reviewQueueFraming(role: RoleCode): ReviewQueueFraming | null {
  if (canWriteRoute(role, REVIEW_QUEUE.route)) return "confirming";
  if (canReadRoute(role, REVIEW_QUEUE.route)) return "unidentified";
  return null;
}

/**
 * The card's sentence.
 *
 * Singular and plural are both written out. A count is not a place to be clever:
 * *"1 readings"* in a compliance product reads as a system that is not looked
 * after.
 */
export function reviewQueueMessage(
  framing: ReviewQueueFraming,
  count: number,
): string {
  if (count === 0) return NOTHING_TO_REVIEW;
  if (framing === "confirming") {
    return count === 1
      ? "1 reading needs confirming."
      : `${count} readings need confirming.`;
  }
  return count === 1
    ? "1 battery in your containers isn't identified yet."
    : `${count} batteries in your containers aren't identified yet.`;
}

export async function ReviewQueueRegion({
  ctx,
  retryHref,
}: {
  readonly ctx: RequestContext;
  readonly retryHref: string;
}): Promise<ReactElement | null> {
  const framing = reviewQueueFraming(ctx.role);
  if (framing === null) return null;

  let count: number;
  try {
    // `Page.total` is the count; one row is enough to read it.
    const page = await data.intakeSessions.list(ctx, {
      isReviewRequired: true,
      limit: 1,
    });
    count = page.total;
  } catch (cause) {
    console.error(
      `[dashboard] review queue could not be loaded (correlationId=${ctx.correlationId})`,
      cause,
    );
    const failure = describeRegionFailure(cause, REGION_FAILURE);
    return (
      <DashboardRegion id={REGION_ID} title={REGION_TITLE} state="error">
        <DashboardRegionError
          message={failure.message}
          correlationId={failure.correlationId}
          retryHref={retryHref}
        />
      </DashboardRegion>
    );
  }

  const isClear = count === 0;
  const Icon = isClear ? INTENT_ICON.ok : INTENT_ICON.attention;
  const intent = isClear ? "ok" : "attention";

  return (
    <DashboardRegion
      id={REGION_ID}
      title={REGION_TITLE}
      state={isClear ? "empty" : "default"}
    >
      <SectionCard dataAttributes={{ "data-intent": intent }}>
        <div className="flex items-start gap-3">
          <LeadingIcon icon={Icon} className={INTENT_TEXT_CLASSES[intent]} />
          <p
            data-review-count={count}
            className="max-w-[72ch] text-body-strong text-balance"
          >
            {reviewQueueMessage(framing, count)}
          </p>
        </div>
        {isClear ? null : (
          <div className="pl-8">
            <Button asChild variant="outline" size="lg" className="min-h-11">
              <Link href={REVIEW_QUEUE.href}>{REVIEW_QUEUE.label}</Link>
            </Button>
          </div>
        )}
      </SectionCard>
    </DashboardRegion>
  );
}

export function ReviewQueueRegionSkeleton(): ReactElement {
  return (
    <DashboardRegion id={REGION_ID} title={REGION_TITLE} state="loading">
      <DashboardRegionSkeleton rows={1} rowClassName="h-28" />
    </DashboardRegion>
  );
}
