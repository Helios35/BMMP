import Link from "next/link";
import type { ReactElement } from "react";

import {
  StatusBadge,
  StorageClockMeter,
  StorageClockMeterSkeleton,
} from "@/components";
import { SectionCard } from "@/components/page";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import {
  STORAGE_CLOCK_ALERT_BANDS,
  type StorageClockAlertBand,
} from "@/domain/taxonomy/storage-clock-alert-band";
import type { IsoTimestamp } from "@/types/common";
import type { Container, StorageClock } from "@/types/storage";

import { CONTAINERS, containerLink } from "./cross-route-links";
import {
  DashboardRegion,
  DashboardRegionEmpty,
  DashboardRegionError,
  DashboardRegionSkeleton,
  describeRegionFailure,
} from "./dashboard-regions";

/**
 * The storage summary — `UX_SPEC.md` §3.4: container count by clock tier, and a
 * `StorageClockMeter` per attention-or-worse container.
 *
 * **No threshold, period, deadline or unit is a literal in this file**
 * (Rule 1.23). The tier is the stored band (T-27) and never a number this screen
 * computed; the accumulation period is whatever the rule version stamped on the
 * clock when it started, and the meter renders it. *"The one-year clock"* is
 * colloquial and the system never assumes one year (Rules 4.5, 4.13).
 *
 * **The site's time zone is not read here and is not defaulted here.**
 * `storage_clock.time_zone` is the copy taken from the container when the clock
 * started, so a later edit to the site cannot move a running clock (Rule 4.29),
 * and `StorageClockMeter` reads it off the clock it is given. Passing the
 * browser's zone, the organisation's, or the server's would each be a different
 * wrong answer.
 *
 * **No pause, snooze, freeze, extension or re-date control exists on this
 * region, for any role including P6** (Rules 4.6, 4.9, 4.15). They are not
 * disabled — they do not exist.
 */

const CONTAINER_LIMIT = 100;
const CLOCK_LIMIT = 100;

const REGION_ID = "storage";
const REGION_TITLE = "Storage";
const REGION_FAILURE =
  "We could not load your storage clocks. Nothing has changed — try again.";

export interface StorageTierCount {
  readonly band: StorageClockAlertBand;
  readonly count: number;
}

/**
 * Containers per clock tier, **in T-27's declared order, every tier rendered.**
 *
 * A tier with zero containers still returns its row: `TAXONOMY.md` §5.7 makes the
 * value order the display order, and a tier dropped because it is empty is a
 * count a reader cannot trust. Only container clocks are counted — a clock can
 * attach to a battery instead, and counting one of those as a container would
 * inflate the figure.
 */
export function containerClockTierCounts(
  clocks: readonly StorageClock[],
): readonly StorageTierCount[] {
  const containerClocks = clocks.filter((clock) => clock.containerId !== null);
  return STORAGE_CLOCK_ALERT_BANDS.map((band) => ({
    band,
    count: containerClocks.filter((clock) => clock.alertBand === band).length,
  }));
}

/**
 * The clocks that get a meter — **attention-or-worse, read off the stored band.**
 *
 * `alertBand !== "none"` and never a numeric comparison: the band is the tier the
 * alert job recorded, and a screen that re-derived it would disagree with the
 * alert record printed beside it (`SITE_ARCHITECTURE.md` §7.6a).
 */
export function clocksNeedingAMeter(
  clocks: readonly StorageClock[],
): readonly StorageClock[] {
  return clocks.filter(
    (clock) => clock.containerId !== null && clock.alertBand !== "none",
  );
}

export async function StorageSummaryRegion({
  ctx,
  asOf,
  retryHref,
}: {
  readonly ctx: RequestContext;
  readonly asOf: IsoTimestamp;
  readonly retryHref: string;
}): Promise<ReactElement> {
  let containers: readonly Container[];
  let clocks: readonly StorageClock[];
  try {
    const containerPage = await data.containers.list(ctx, {
      limit: CONTAINER_LIMIT,
    });
    const clockPage = await data.storageClocks.list(ctx, {
      isRunning: true,
      limit: CLOCK_LIMIT,
    });
    containers = containerPage.items;
    clocks = clockPage.items;
  } catch (cause) {
    console.error(
      `[dashboard] storage summary could not be loaded (correlationId=${ctx.correlationId})`,
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

  const tiers = containerClockTierCounts(clocks);
  const metered = clocksNeedingAMeter(clocks);
  const canOpenContainers = canReadRoute(ctx.role, CONTAINERS.route);
  const canOpenOneContainer = canReadRoute(ctx.role, "/containers/[id]");

  if (clocks.every((clock) => clock.containerId === null)) {
    return (
      <DashboardRegion id={REGION_ID} title={REGION_TITLE} state="empty">
        <DashboardRegionEmpty
          title="No storage clock is running."
          description="A clock starts when the first battery is placed in a container."
          action={
            canOpenContainers
              ? { label: CONTAINERS.label, href: CONTAINERS.href }
              : undefined
          }
          whoCanAct={canOpenContainers ? undefined : CONTAINERS.remedy}
        />
      </DashboardRegion>
    );
  }

  const codeById = new Map(
    containers.map((container) => [container.id, container.containerCode]),
  );

  return (
    <DashboardRegion
      id={REGION_ID}
      title={REGION_TITLE}
      headingAction={
        canOpenContainers ? (
          <Link
            href={CONTAINERS.href}
            className="inline-flex min-h-11 items-center rounded-md px-3 text-label underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            {CONTAINERS.label}
          </Link>
        ) : undefined
      }
    >
      <SectionCard>
        {/* Capped rather than run to the content width: a tier and its count a
            thousand pixels apart is a pair a reader has to track across an empty
            page. §1.3 caps prose at a measure for the same reason. */}
        <ul
          data-storage-tiers="true"
          className="flex max-w-md list-none flex-col gap-2"
        >
          {tiers.map((tier) => (
            <li
              key={tier.band}
              data-storage-tier={tier.band}
              className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1"
            >
              <StatusBadge
                system="storage_clock_alert_band"
                value={tier.band}
                size="sm"
              />
              <span className="tabular text-body-strong">{tier.count}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {metered.map((clock) => {
        const containerCode =
          clock.containerId === null
            ? null
            : (codeById.get(clock.containerId) ?? null);
        const link =
          clock.containerId !== null && canOpenOneContainer
            ? containerLink(clock.containerId)
            : null;

        return (
          <SectionCard key={clock.id}>
            {containerCode === null ? null : (
              <p className="text-label">
                {link === null ? (
                  // P3, P4 and P5 do not hold `/containers/[id]`, so the code
                  // renders as text: no link, no hover, no pointer
                  // (`SITE_ARCHITECTURE.md` §5.4).
                  <span className="text-mono">{containerCode}</span>
                ) : (
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 min-w-11 items-center rounded-md text-mono underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                  >
                    {containerCode}
                  </Link>
                )}
              </p>
            )}
            <StorageClockMeter
              clock={clock}
              asOf={asOf}
              label={
                containerCode === null
                  ? "Storage clock"
                  : `Storage clock for container ${containerCode}`
              }
            />
          </SectionCard>
        );
      })}
    </DashboardRegion>
  );
}

export function StorageSummaryRegionSkeleton(): ReactElement {
  return (
    <DashboardRegion id={REGION_ID} title={REGION_TITLE} state="loading">
      <DashboardRegionSkeleton rows={1} rowClassName="h-56" />
      <SectionCard>
        <StorageClockMeterSkeleton />
      </SectionCard>
    </DashboardRegion>
  );
}
