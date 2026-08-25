import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ACTION_BUTTON_CLASS, PageHeader, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import {
  AlertsRegion,
  AlertsRegionSkeleton,
  dashboardPrimaryAction,
  hasOpenStorageClockAlert,
  QuickActionsRegion,
  RecentActivityRegion,
  RecentActivityRegionSkeleton,
  ReviewQueueRegion,
  ReviewQueueRegionSkeleton,
  reviewQueueFraming,
  StorageSummaryRegion,
  StorageSummaryRegionSkeleton,
  ZeroBatteriesCard,
  zeroBatteriesState,
} from "@/features/dashboard";
import { IntakeBlockedNotice } from "@/features/consent/components/intake-blocked-notice";
import { readIntakeGate } from "@/features/consent/read-intake-gate";
import { requireRoute } from "@/lib/auth/guard";
import { nowIso } from "@/lib/auth/session";

/**
 * `/` — the dashboard. **The first screen every role sees**
 * (`UX_SPEC.md` §3.4, `SITE_ARCHITECTURE.md` §3.4).
 *
 * Every role holds `read` here; **what is on it differs by role, and it is
 * composed for that role's question rather than filtered down from P1's.** The
 * composition is resolved from `ROUTE_ACCESS` in each piece, never from a role
 * literal, so there is still exactly one route-access structure (§7.2).
 *
 * ## Four regions, four failures
 *
 * Alerts, storage, the review queue and recent activity each stream inside their
 * own `<Suspense>` boundary and each catch their own failure: §3.4 requires that
 * **a failed alerts fetch never blanks the whole page.** The segment-level
 * `error.tsx` stays for a failure that is genuinely the page's.
 *
 * ## What is read before the first paint, and why
 *
 * Three things decide the *shape* of the page rather than the contents of a
 * region, so they are awaited rather than streamed:
 *
 * - **The Terms of Service gate.** It decides whether any create affordance
 *   renders at all (E-12), and rendering one while the answer is unknown is
 *   worse than an honest failure — so this read is deliberately allowed to reach
 *   the error boundary. **It blocks intake, not the app**: every read-only
 *   region below stays exactly as it is (Rules 7.1, 7.2).
 * - **Whether any battery has been logged** (E-1). A failure here answers
 *   "unknown" rather than "none": telling an organisation with records that it
 *   has none would be a lie, and the regions state their own failures anyway.
 * - **Whether an open storage-clock alert is routed to this role**, which is
 *   P2's primary action (§3.4).
 *
 * ## What is deliberately not here
 *
 * No `ReadOnlyBanner`: §2.9 scopes it to a route with mutating controls, and
 * every create action on this page is already **absent** for the auditor. A
 * banner saying *"you can't change it"* on a page with nothing to change is
 * noise, and noise is how a real restriction stops being read.
 *
 * No hazard surface, and nothing expressing one as a number. **None. In any
 * phase** (`_ANCHORS.md` §7.1, Rule 1.25).
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/"],
};

/** The dashboard's own URL. Retrying a region re-renders the page. */
const RETRY_HREF = "/";

export default async function DashboardPage() {
  const { ctx } = await requireRoute("/");

  // Server-supplied, so two regions never disagree by a few milliseconds and a
  // test can pin it.
  const asOf = nowIso();

  const gate = await readIntakeGate(ctx);
  const isIntakeBlocked = gate.status === "blocked";

  const [batteryCount, hasStorageClockAlert] = await Promise.all([
    readBatteryCount(ctx),
    hasOpenStorageClockAlert(ctx),
  ]);

  const primaryAction = dashboardPrimaryAction({
    role: ctx.role,
    hasStorageClockAlert,
    isIntakeBlocked,
  });

  const showsReviewQueue = reviewQueueFraming(ctx.role) !== null;

  return (
    <PageShell>
      <PageHeader
        title={APP_ROUTE_NAMES["/"]}
        action={
          primaryAction === null ? undefined : (
            <Button asChild size="lg" className={ACTION_BUTTON_CLASS}>
              <Link href={primaryAction.href} data-primary-action="true">
                {primaryAction.label}
              </Link>
            </Button>
          )
        }
        // §2.9's slot. E-12 qualifies what this whole page can offer, so it is
        // pinned to the header rather than floating between two regions.
        notice={
          isIntakeBlocked ? (
            <IntakeBlockedNotice
              gate={gate}
              // Never a link the role will be redirected away from: P1, P3, P4
              // and P5 cannot reach organization settings, so they are given the
              // names and no link (E-11 generalised, §5.3(7)).
              canReachOrganizationSettings={canReadRoute(
                ctx.role,
                "/settings/organization",
              )}
            />
          ) : undefined
        }
      />

      {batteryCount === 0 ? (
        <ZeroBatteriesCard
          state={zeroBatteriesState(ctx.role, { isIntakeBlocked })}
        />
      ) : null}

      <Suspense fallback={<AlertsRegionSkeleton />}>
        <AlertsRegion ctx={ctx} retryHref={RETRY_HREF} />
      </Suspense>

      <Suspense fallback={<StorageSummaryRegionSkeleton />}>
        <StorageSummaryRegion ctx={ctx} asOf={asOf} retryHref={RETRY_HREF} />
      </Suspense>

      {/* The framing is a pure function of the capability map, so a role that
          never sees this card never sees its skeleton either. */}
      {showsReviewQueue ? (
        <Suspense fallback={<ReviewQueueRegionSkeleton />}>
          <ReviewQueueRegion ctx={ctx} retryHref={RETRY_HREF} />
        </Suspense>
      ) : null}

      <Suspense fallback={<RecentActivityRegionSkeleton />}>
        <RecentActivityRegion ctx={ctx} asOf={asOf} retryHref={RETRY_HREF} />
      </Suspense>

      <QuickActionsRegion role={ctx.role} isIntakeBlocked={isIntakeBlocked} />
    </PageShell>
  );
}

/**
 * How many battery records this organisation holds, or `null` where the read
 * failed — **E-1 is "none", and it must not be reached by not knowing.**
 *
 * One row is enough: `Page.total` is the count.
 */
async function readBatteryCount(ctx: RequestContext): Promise<number | null> {
  try {
    const page = await data.batteryRecords.list(ctx, { limit: 1 });
    return page.total;
  } catch (cause) {
    // Nothing is swallowed. The regions below still state their own failures;
    // this one only decides whether the onboarding state is honest to show.
    console.error(
      `[dashboard] battery count could not be read (correlationId=${ctx.correlationId})`,
      cause,
    );
    return null;
  }
}
