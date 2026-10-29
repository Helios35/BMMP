import "server-only";

import {
  decodeListQuery,
  type ListQuery,
  type ListQuerySpec,
  type RawSearchParams,
} from "@/components/record-table/list-url";
import { data } from "@/data";
import type { BatteryRecordQuery, RequestContext } from "@/data/contracts";
import type { Uuid } from "@/types/common";
import type { Container, StorageClock } from "@/types/storage";

import {
  batteryListSelection,
  batteryListSpec,
  type BatteryListSelection,
} from "../list-query";

/**
 * `/batteries`' read, shared by the page and its CSV export — so the file is
 * exactly the list the screen was showing (Rule 12.17), decoded by one module
 * and asked of the adapter in one shape.
 */

const DECORATION_LIMIT = 100;

/**
 * Bounds the clock read the tier filter uses — an engineering limit, not a
 * regulatory one (Rule 1.23).
 */
const TIER_CLOCK_LIMIT = 200;

export interface BatteryListRequest {
  readonly spec: ListQuerySpec;
  readonly listQuery: ListQuery;
  readonly selection: BatteryListSelection;
  /** The container filter's options, keyed on the code (`?container=C-0001`). */
  readonly containerCodes: readonly string[];
  readonly containersById: ReadonlyMap<Uuid, Container>;
  readonly clocksByContainerId: ReadonlyMap<Uuid, StorageClock>;
  /** What the adapter is asked, without the page. */
  readonly query: Omit<BatteryRecordQuery, "limit" | "offset">;
}

/**
 * The clock-tier filter is two steps, because a battery's tier belongs to its
 * container's clock.
 *
 * The band is the stored tier and is never re-derived from a date: the alert
 * job is what moves it, and a screen that recomputed it would disagree with
 * the alert record printed beside it (`SITE_ARCHITECTURE.md` §7.6a).
 */
async function containersAtTier(
  ctx: RequestContext,
  tier: BatteryListSelection["tier"],
): Promise<readonly Uuid[] | undefined> {
  if (tier === undefined) return undefined;
  const clocks = await data.storageClocks.list(ctx, {
    alertBand: tier,
    isRunning: true,
    limit: TIER_CLOCK_LIMIT,
  });
  return clocks.items
    .map((clock) => clock.containerId)
    .filter((id): id is Uuid => id !== null);
}

export async function readBatteryListRequest(
  ctx: RequestContext,
  params: RawSearchParams,
): Promise<BatteryListRequest> {
  const [containerPage, clockPage] = await Promise.all([
    data.containers.list(ctx, { limit: DECORATION_LIMIT }),
    data.storageClocks.list(ctx, { limit: DECORATION_LIMIT }),
  ]);

  const containersById = new Map<Uuid, Container>(
    containerPage.items.map((container) => [container.id, container]),
  );
  const clocksByContainerId = new Map<Uuid, StorageClock>(
    clockPage.items
      .filter((clock): clock is StorageClock => clock.containerId !== null)
      .map((clock) => [clock.containerId as Uuid, clock]),
  );
  const containerCodes = containerPage.items
    .map((container) => container.containerCode)
    .sort((a, b) => a.localeCompare(b));

  const spec = batteryListSpec(containerCodes);
  const listQuery = decodeListQuery(params, spec);
  const selection = batteryListSelection(listQuery);
  const containerId = containerPage.items.find(
    (container) => container.containerCode === selection.containerCode,
  )?.id;
  const containerIds = await containersAtTier(ctx, selection.tier);

  return {
    spec,
    listQuery,
    selection,
    containerCodes,
    containersById,
    clocksByContainerId,
    query: {
      search: selection.search,
      // Voided records are retained and stay readable, and they sit outside
      // every operational count (Rule 12.12) — so the list they are outside of
      // is this one.
      excludeVoided: true,
      // A draft exists from the moment an intake session starts and is
      // visible only inside that session (T-22). It reaches this list when a
      // person confirms it, and not before.
      excludeDrafts: true,
      assessedCondition: selection.assessedCondition,
      chemistry: selection.chemistry,
      containerId,
      containerIds,
      isCatalogMatched: selection.isCatalogMatched,
      recallStatus: selection.recallStatus,
      loggedAfter: selection.loggedAfter,
      loggedBefore: selection.loggedBefore,
      sortBy: selection.sortBy,
      sortDirection: selection.sortDirection,
    },
  };
}
