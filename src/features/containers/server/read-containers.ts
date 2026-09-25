import "server-only";

import { data } from "@/data";
import type {
  ContainerQuery,
  PageRequest,
  RequestContext,
} from "@/data/contracts";
import { isAppError } from "@/lib/errors";
import type { Uuid } from "@/types/common";
import type { Container, StorageClock } from "@/types/storage";

/**
 * The `/containers` read — `UX_SPEC.md` §3.9.
 *
 * **A few reads for the page, never one per row.** The page of containers,
 * their clocks and their contents are read once each and joined here, so a
 * row's clock meter, fill meter and record count cost nothing more than the
 * row. The bounds degrade a very large tenant into a missing figure rather
 * than an unbounded read.
 *
 * **Nothing here derives an alert.** A row's clock renders the stored status
 * the alert job wrote; `?filter=alerting` narrows by the `alert` rows
 * themselves (`UX_SPEC.md` §7 item 7b).
 */

/** One container's clock: the running one, else the one that stopped last. */
export function currentClock(
  clocks: readonly StorageClock[],
): StorageClock | null {
  return (
    clocks.find((clock) => clock.stoppedAt === null) ??
    [...clocks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
    null
  );
}

export function clocksByContainer(
  clocks: readonly StorageClock[],
): ReadonlyMap<Uuid, StorageClock> {
  const grouped = new Map<Uuid, StorageClock[]>();
  for (const clock of clocks) {
    if (clock.containerId === null) continue;
    grouped.set(clock.containerId, [
      ...(grouped.get(clock.containerId) ?? []),
      clock,
    ]);
  }
  const current = new Map<Uuid, StorageClock>();
  for (const [containerId, rows] of grouped) {
    const clock = currentClock(rows);
    if (clock !== null) current.set(containerId, clock);
  }
  return current;
}

export interface ContainerListRow {
  readonly container: Container;
  readonly clock: StorageClock | null;
  readonly recordCount: number;
}

export interface ContainerListResult {
  readonly rows: readonly ContainerListRow[];
  readonly total: number;
  readonly error?: {
    readonly message: string;
    readonly correlationId?: string;
  };
}

/** Clocks for the page's containers — one read, bounded. */
const CLOCK_LIMIT = 500;
/** Contents for the page's containers — one read, bounded. */
const CONTENTS_LIMIT = 1000;

export async function readContainerList(
  ctx: RequestContext,
  query: ContainerQuery & PageRequest,
): Promise<ContainerListResult> {
  try {
    const page = await data.containers.list(ctx, query);
    const ids = page.items.map((container) => container.id);
    if (ids.length === 0) return { rows: [], total: page.total };

    const [clocks, records] = await Promise.all([
      data.storageClocks.list(ctx, { limit: CLOCK_LIMIT }),
      data.batteryRecords.list(ctx, {
        containerIds: ids,
        excludeVoided: true,
        excludeDrafts: true,
        limit: CONTENTS_LIMIT,
      }),
    ]);
    const clockOf = clocksByContainer(clocks.items);
    const counts = new Map<Uuid, number>();
    for (const record of records.items) {
      if (record.containerId === null) continue;
      counts.set(record.containerId, (counts.get(record.containerId) ?? 0) + 1);
    }

    return {
      rows: page.items.map((container) => ({
        container,
        clock: clockOf.get(container.id) ?? null,
        recordCount: counts.get(container.id) ?? 0,
      })),
      total: page.total,
    };
  } catch (cause) {
    // Nothing is swallowed: a records-service failure renders the table's
    // error state with Retry; anything else is loud (`TECHNICAL_SPEC.md` §10.1).
    if (!isAppError(cause) || cause.code !== "INTEGRATION") throw cause;
    console.error("[containers] the container list could not be read", cause);
    return {
      rows: [],
      total: 0,
      error: { message: cause.userMessage, correlationId: cause.correlationId },
    };
  }
}

/** The tier filter — the running clocks at a band, as the containers they run on. */
export async function containersAtTier(
  ctx: RequestContext,
  band: StorageClock["alertBand"] | undefined,
): Promise<readonly Uuid[] | undefined> {
  if (band === undefined) return undefined;
  const clocks = await data.storageClocks.list(ctx, {
    alertBand: band,
    isRunning: true,
    limit: CLOCK_LIMIT,
  });
  return clocks.items
    .map((clock) => clock.containerId)
    .filter((id): id is Uuid => id !== null);
}
