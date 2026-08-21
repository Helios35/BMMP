import "server-only";

import {
  decodeListQuery,
  toPageRequest,
  type ListQuery,
  type ListQuerySpec,
  type RecordTableErrorState,
  type RecordTableFilter,
} from "@/components";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { isAppError } from "@/lib/errors";
import type { CatalogEntry } from "@/types/catalog";
import { distinctManufacturers } from "@/features/catalog/catalog-entry-display";
import {
  catalogFilters,
  catalogQueryFrom,
  catalogQuerySpec,
} from "@/features/catalog/list-query";

/**
 * The whole of `/catalog`'s read, in one place — `UX_SPEC.md` §3.15.
 *
 * Three reads, in this order and for this reason:
 *
 * 1. **The manufacturer filter's options**, which have to exist before the URL
 *    can be decoded: the codec drops a filter value that is not permitted, and
 *    the permitted manufacturers are data rather than a list written in code.
 * 2. **The page itself**, narrowed by the decoded query.
 * 3. **A matched-record count per entry**, because `Records matched` is a count
 *    over `battery_record` and not a column on `catalog_entry`.
 *
 * The mock narrows every one of them to `organization_id is null or the caller's
 * organization` — the global platform catalog plus this tenant's own proposals,
 * never another tenant's — and the record counts are tenant-scoped by the same
 * seam. **No page repeats that check** (Rule 1.2).
 *
 * **A read that fails becomes the table's error state, not a blank page**
 * (§2.7): the header, the filters and the count stay rendered and the reader
 * keeps their bearings. A refusal is the exception and is rethrown — a
 * `PermissionError` reaching the data layer means the guard drifted, and that
 * has to be loud (`TECHNICAL_SPEC.md` §10.1).
 */

/**
 * How many manufacturer names the filter can offer.
 *
 * A `Select` is a bounded control and this is where its bound is stated rather
 * than discovered. Beyond it the filter stops being complete — see this unit's
 * build-notes; a type-ahead manufacturer filter is the answer and it is not this
 * unit's.
 */
const MANUFACTURER_OPTION_LIMIT = 200;

export interface CatalogListView {
  readonly query: ListQuery;
  readonly querySpec: ListQuerySpec;
  readonly filters: readonly RecordTableFilter[];
  readonly entries: readonly CatalogEntry[];
  readonly total: number;
  /** Entry id → this tenant's matched `battery_record` count. */
  readonly matchedCounts: ReadonlyMap<string, number>;
  /** Present only when a read failed. */
  readonly error?: RecordTableErrorState;
}

type RawSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export async function readCatalogList(
  ctx: RequestContext,
  searchParams: RawSearchParams,
): Promise<CatalogListView> {
  let manufacturers: readonly string[] = [];
  let entries: readonly CatalogEntry[] = [];
  let total = 0;
  const matchedCounts = new Map<string, number>();
  let error: RecordTableErrorState | undefined;

  try {
    const known = await data.catalogEntries.list(ctx, {
      // T-07 — only a published entry is available for matching, so only a
      // published entry's manufacturer belongs in the filter.
      status: "published",
      limit: MANUFACTURER_OPTION_LIMIT,
    });
    manufacturers = distinctManufacturers(known.items);
  } catch (cause) {
    error = toTableError(cause, "The catalog could not be loaded.");
  }

  const querySpec = catalogQuerySpec(manufacturers);
  const query = decodeListQuery(searchParams, querySpec);
  const filters = catalogFilters(manufacturers);

  if (error === undefined) {
    try {
      const page = await data.catalogEntries.list(ctx, {
        ...catalogQueryFrom(query),
        ...toPageRequest(query),
      });
      entries = page.items;
      total = page.total;

      for (const entry of entries) {
        const matched = await data.batteryRecords.list(ctx, {
          catalogEntryId: entry.id,
          limit: 1,
        });
        matchedCounts.set(entry.id, matched.total);
      }
    } catch (cause) {
      error = toTableError(cause, "The catalog could not be loaded.");
      entries = [];
      total = 0;
    }
  }

  return { query, querySpec, filters, entries, total, matchedCounts, error };
}

/**
 * A failed read as something a reader can act on.
 *
 * The correlation id shows on a 5xx only — support needs it to find the trace,
 * and putting one on a 4xx trains people to read it back for problems it will
 * not help with (`TECHNICAL_SPEC.md` §10.3). Nothing is swallowed: the console
 * keeps the detail the sentence deliberately does not carry.
 */
function toTableError(
  cause: unknown,
  fallbackMessage: string,
): RecordTableErrorState {
  if (isAppError(cause)) {
    // A refusal here means the route guard and the policy matrix disagree. That
    // is not a state to render politely.
    if (cause.code === "FORBIDDEN" || cause.code === "TENANT_SCOPE")
      throw cause;
    console.error("[catalog] read failed", cause);
    return {
      message: cause.userMessage,
      correlationId: cause.httpStatus >= 500 ? cause.correlationId : undefined,
    };
  }
  console.error("[catalog] read failed", cause);
  return { message: fallbackMessage };
}
