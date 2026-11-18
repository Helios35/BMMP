import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  currentItemStates,
  itemKey,
  type CurrentItemState,
  type HazardRankingInputs,
} from "@/domain/hazard/run";
import {
  hazardRankingView,
  rankedItemIdOf,
  unavailableRankingView,
  type HazardRankingView,
} from "@/domain/hazard/view";
import type { HazardRankingScope } from "@/domain/taxonomy/hazard-ranking-scope";
import { isAppError } from "@/lib/errors";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { HazardRanking } from "@/types/condition";

/**
 * The rankings a screen shows — Rules 10.24, 10.25.
 *
 * **Three reads for the page, never one per row**: the scheme, the
 * organization's ranking inputs and the current rows of one kind. Each item's
 * view reads its current row against the item as it stands now, so a changed
 * input reads "Changed since — rank again to update" and a new item "Not
 * ranked yet". Nothing here ranks anything; a ranking comes from a run.
 *
 * A failure to read the rankings never takes the page down and never reads
 * as "Not ranked": every item says the ranking could not be read.
 */

/** Bounds one read of current rows — an engineering limit, not a rule (Rule 1.23). */
const CURRENT_ROW_LIMIT = 2000;

export interface RankingLookup {
  viewFor(id: Uuid): HazardRankingView;
}

const UNAVAILABLE: RankingLookup = { viewFor: () => unavailableRankingView() };

interface RankingContext {
  readonly schemeVersion: string;
  readonly inputs: HazardRankingInputs;
  readonly states: ReadonlyMap<string, CurrentItemState>;
}

async function readContext(
  ctx: RequestContext,
  asOf: IsoTimestamp,
): Promise<RankingContext> {
  const [scheme, inputs] = await Promise.all([
    data.platformConfiguration.readHazardRankingScheme(ctx),
    data.hazardRankings.inputs(ctx),
  ]);
  return {
    schemeVersion: scheme.schemeVersion,
    inputs,
    states: currentItemStates(inputs, scheme, asOf),
  };
}

function lookupFrom(
  context: RankingContext,
  scope: HazardRankingScope,
  rows: readonly HazardRanking[],
): RankingLookup {
  const byItem = new Map(rows.map((row) => [rankedItemIdOf(row), row]));
  return {
    viewFor: (id) =>
      hazardRankingView({
        row: byItem.get(id) ?? null,
        current: context.states.get(itemKey(scope, id)),
        schemeVersion: context.schemeVersion,
        organizationName: context.inputs.organizationName,
        timeZone: context.inputs.timeZone,
      }),
  };
}

function isReadFailure(cause: unknown): boolean {
  return (
    isAppError(cause) &&
    (cause.code === "INTEGRATION" || cause.code === "DATA_INTEGRITY")
  );
}

/** Every current ranking of one kind — the list column, its sort and the CSV. */
export async function readRankingLookup(
  ctx: RequestContext,
  scope: HazardRankingScope,
  asOf: IsoTimestamp,
): Promise<RankingLookup> {
  try {
    const [context, page] = await Promise.all([
      readContext(ctx, asOf),
      data.hazardRankings.list(ctx, {
        scopeType: scope,
        isCurrent: true,
        limit: CURRENT_ROW_LIMIT,
      }),
    ]);
    return lookupFrom(context, scope, page.items);
  } catch (cause) {
    if (!isReadFailure(cause)) throw cause;
    console.error("[hazard-ranking] the rankings could not be read", cause);
    return UNAVAILABLE;
  }
}

/** One item's ranking — the panel on a record, a container or a lot. */
export async function readRankingView(
  ctx: RequestContext,
  scope: HazardRankingScope,
  id: Uuid,
  asOf: IsoTimestamp,
): Promise<HazardRankingView> {
  try {
    const [context, page] = await Promise.all([
      readContext(ctx, asOf),
      data.hazardRankings.list(ctx, {
        scopeType: scope,
        isCurrent: true,
        ...(scope === "battery_record"
          ? { batteryRecordId: id }
          : scope === "container"
            ? { containerId: id }
            : { lotId: id }),
        limit: 1,
      }),
    ]);
    return lookupFrom(context, scope, page.items).viewFor(id);
  } catch (cause) {
    if (!isReadFailure(cause)) throw cause;
    console.error("[hazard-ranking] the ranking could not be read", cause);
    return unavailableRankingView();
  }
}
