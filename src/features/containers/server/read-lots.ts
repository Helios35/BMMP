import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { lotStanding, type LotStanding } from "@/domain/storage/lot";
import type { LotStatus } from "@/domain/taxonomy/lot-status";
import { isAppError } from "@/lib/errors";
import type { Container, Lot } from "@/types/storage";

/**
 * `/containers?tab=lots` — every lot, with its containers and what they report
 * (Rules 4.23, 4.24; T-25).
 *
 * **A lot has no clock and no fill of its own.** Its standing is
 * `lotStanding` over its containers: the earliest accumulation start among
 * them, and overdue where any one is. Nothing here computes a date.
 */

/** Engineering bounds on one page's reads, not regulatory figures. */
const LOT_LIMIT = 200;
const MEMBER_LIMIT = 200;

export interface LotListRow {
  readonly lot: Lot;
  readonly members: readonly Container[];
  readonly standing: LotStanding;
}

export interface LotListResult {
  readonly rows: readonly LotListRow[];
  readonly total: number;
  readonly error?: {
    readonly message: string;
    readonly correlationId?: string;
  };
}

export async function readLotList(
  ctx: RequestContext,
  query: { readonly search: string | null; readonly status: LotStatus | null },
): Promise<LotListResult> {
  try {
    const page = await data.lots.list(ctx, {
      limit: LOT_LIMIT,
      ...(query.search === null ? {} : { search: query.search }),
      ...(query.status === null ? {} : { status: query.status }),
    });
    const rows: LotListRow[] = [];
    for (const lot of page.items) {
      const members = await data.containers.list(ctx, {
        lotId: lot.id,
        limit: MEMBER_LIMIT,
      });
      const sorted = [...members.items].sort((a, b) =>
        a.containerCode.localeCompare(b.containerCode),
      );
      rows.push({
        lot,
        members: sorted,
        standing: lotStanding(
          sorted.map((container) => ({
            status: container.status,
            accumulationStartedAt: container.accumulationStartedAt,
          })),
        ),
      });
    }
    rows.sort((a, b) => b.lot.lotCode.localeCompare(a.lot.lotCode));
    return { rows, total: page.total };
  } catch (cause) {
    // Nothing is swallowed: a records-service failure renders the table's
    // error state with Retry; anything else is loud (`TECHNICAL_SPEC.md` §10.1).
    if (!isAppError(cause) || cause.code !== "INTEGRATION") throw cause;
    console.error("[containers] the lot list could not be read", cause);
    return {
      rows: [],
      total: 0,
      error: { message: cause.userMessage, correlationId: cause.correlationId },
    };
  }
}
