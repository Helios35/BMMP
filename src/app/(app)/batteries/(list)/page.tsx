import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { ExportControl } from "@/components/record-table/export-control";
import { exportHref, toPageRequest } from "@/components/record-table/list-url";
import { ACTION_BUTTON_CLASS, PageHeader, PageShell } from "@/components/page";
import { RecordTable } from "@/components/record-table/record-table";
import { Button } from "@/components/ui/button";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { mayExportList } from "@/domain/access/export";
import { canWriteRoute, capabilityFor } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { batteryColumns } from "@/features/battery-record/battery-columns";
import { BatteryEmptyState } from "@/features/battery-record/battery-empty-state";
import { readIntakeGate } from "@/features/consent/read-intake-gate";
import {
  BATTERY_EXPORT_PATH,
  BATTERY_LIST_PATH,
  batteryFilters,
} from "@/features/battery-record/list-query";
import { readBatteryListRequest } from "@/features/battery-record/server/list-read";
import { requireRoute } from "@/lib/auth/guard";
import { nowIso } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";

/**
 * `/batteries` — `UX_SPEC.md` §3.5.
 *
 * A Server Component reading through `src/data` and nothing else: no route
 * handler, no fetch to our own API, no client-side read (`TECHNICAL_SPEC.md`
 * §7.1). **Filter, sort, page and search state lives in the URL**
 * (`SITE_ARCHITECTURE.md` §7.4), decoded once here and handed to both the
 * adapter and the table, so the table never re-reads the query string.
 *
 * **This is the screen where the wide record shows.** `BR-0001` — a 480 kg
 * vehicle traction pack — and `BR-0002` — a 24.5 kg mobility-scooter pack —
 * render as adjacent rows through one set of cells, with no branch on
 * `applicationClass` anywhere in this route (`SITE_ARCHITECTURE.md` §7.8).
 *
 * **The row decoration is three reads for the page, never one per row.**
 * Containers and clocks are read once and looked up by id.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/batteries"],
};

export default async function BatteriesPage({
  searchParams,
}: PageProps<"/batteries">) {
  const { ctx } = await requireRoute("/batteries");
  const params = await searchParams;
  const asOf = nowIso();

  const [request, intakeGate] = await Promise.all([
    readBatteryListRequest(ctx, params),
    readIntakeGate(ctx),
  ]);
  const {
    spec,
    listQuery,
    containerCodes,
    containersById,
    clocksByContainerId,
  } = request;

  // E-12 — where no acceptance is in force, intake is blocked organisation-wide
  // (Rules 7.1, 7.2) and every intake affordance is absent rather than disabled.
  // The dashboard makes the same call; the two screens must not disagree.
  const isIntakeBlocked = intakeGate.status === "blocked";

  const result = await readBatteryRecords(ctx, {
    ...toPageRequest(listQuery),
    ...request.query,
  });

  return (
    <PageShell>
      {/* No action in the header. §2.7's anatomy puts *"the route's primary
          action"* in the table's own header row, beside the search and the
          filters, and that is also what keeps this route's skeleton honest: the
          row's height is set by the search box, so a role without the action
          leaves no gap where P1 and P6 have a button. In the page header it
          would be 60px of layout shift on a phone for four of the six roles. */}
      <PageHeader title={APP_ROUTE_NAMES["/batteries"]} />

      <RecordTable
        caption="Battery records"
        columns={batteryColumns({
          role: ctx.role,
          containersById,
          clocksByContainerId,
          asOf,
        })}
        rows={result.rows}
        rowKey={(row) => row.id}
        // Every role holds at least `read` on /batteries/[id], so this list has
        // no non-navigable variant. The asymmetry that does exist belongs to
        // /containers (SITE_ARCHITECTURE.md §5.4), and `RecordTable` already
        // carries it.
        rowLink={(row) => ({ kind: "link", href: `/batteries/${row.id}` })}
        total={result.total}
        query={listQuery}
        querySpec={spec}
        basePath={BATTERY_LIST_PATH}
        searchPlaceholder="Search by record ID, serial number or model"
        filters={batteryFilters(containerCodes)}
        emptyState={
          <BatteryEmptyState
            role={ctx.role}
            isIntakeBlocked={isIntakeBlocked}
          />
        }
        filteredEmpty={{
          noun: "batteries",
          searchSuggestion: "Try a record ID, a serial number or a model.",
        }}
        error={result.error}
        toolbar={batteryToolbar(
          ctx.role,
          isIntakeBlocked,
          exportHref(BATTERY_EXPORT_PATH, listQuery, spec),
        )}
      />
    </PageShell>
  );
}

interface BatteryListResult {
  readonly rows: readonly BatteryRecord[];
  readonly total: number;
  readonly error?: {
    readonly message: string;
    readonly correlationId?: string;
  };
}

/**
 * The read, with the list's own error state as the failure mode.
 *
 * **Nothing is swallowed** (`TECHNICAL_SPEC.md` §10.1): a reachable failure is
 * logged and rendered as the table's `critical` alert with **Retry**, keeping
 * the header, the filters and the count so the reader loses no context (§2.7).
 * Anything that is not an `AppError` — and any `AppError` that means the guard
 * drifted rather than the records service blinked — is rethrown to `error.tsx`,
 * because a denial reaching the data layer must be loud.
 */
async function readBatteryRecords(
  ctx: RequestContext,
  query: Parameters<typeof data.batteryRecords.list>[1],
): Promise<BatteryListResult> {
  try {
    const page = await data.batteryRecords.list(ctx, query);
    return { rows: page.items, total: page.total };
  } catch (cause) {
    if (!isAppError(cause) || cause.code !== "INTEGRATION") throw cause;
    console.error("[batteries] the record list could not be read", cause);
    return {
      rows: [],
      total: 0,
      error: {
        message: cause.userMessage,
        // A 5xx carries the correlation id so support can find the trace; a 4xx
        // never does (`TECHNICAL_SPEC.md` §10.3).
        correlationId: cause.correlationId,
      },
    };
  }
}

/**
 * The table's actions: **Log a battery** for the roles that log, **Export**
 * for P2, P5 and P6 (`SITE_ARCHITECTURE.md` §5.2). `undefined` when neither
 * applies, so the toolbar leaves no empty action group behind.
 */
function batteryToolbar(
  role: Parameters<typeof canWriteRoute>[0],
  isIntakeBlocked: boolean,
  href: string,
): ReactNode {
  const log = logABatteryAction(role, isIntakeBlocked);
  const canExport = mayExportList(role, "/batteries");
  if (log === undefined && !canExport) return undefined;
  return (
    <>
      {log}
      {canExport ? (
        <ExportControl
          href={href}
          exportName="batteries"
          description=" the battery records, with the filters on this page, as a CSV file"
          role={role}
          capability={capabilityFor(role, "/batteries")}
        />
      ) : null}
    </>
  );
}

/**
 * **Log a battery**, for the roles that may perform it.
 *
 * Gated on `canWriteRoute` against `ROUTE_ACCESS` and never on a role literal —
 * P4 gains this capability at B3 as a value change in the map, and this control
 * follows without being touched.
 */
function logABatteryAction(
  role: Parameters<typeof canWriteRoute>[0],
  /** E-12 — blocked organisation-wide means the action is absent, not disabled. */
  isIntakeBlocked: boolean,
): ReactNode {
  // `undefined` rather than a component rendering `null`, so `PageToolbar` omits
  // its action group entirely rather than leaving an empty flex box in it.
  if (isIntakeBlocked) return undefined;
  if (!canWriteRoute(role, "/batteries/new")) return undefined;
  return (
    <Button asChild size="lg" className={ACTION_BUTTON_CLASS}>
      <Link href="/batteries/new" data-primary-action="true">
        {APP_ROUTE_NAMES["/batteries/new"]}
      </Link>
    </Button>
  );
}
