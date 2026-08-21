import type { Metadata } from "next";

import {
  decodeListQuery,
  toPageRequest,
} from "@/components/record-table/list-url";
import {
  RecordTable,
  type RecordTableErrorState,
} from "@/components/record-table/record-table";
import { ReadOnlyBanner } from "@/components/access/read-only-banner";
import { data } from "@/data";
import type { Page } from "@/data/contracts";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import type { AuditEvent } from "@/types/audit";
import { readAuditActorDirectory } from "@/features/audit/audit-actors";
import { auditFilters } from "@/features/audit/audit-filters";
import {
  AUDIT_LIST_SPEC,
  auditExportHref,
  toAuditEventQuery,
} from "@/features/audit/audit-query";
import { toAuditRowView } from "@/features/audit/audit-row";
import { formatAuditTimestamp } from "@/features/audit/audit-timestamp";
import {
  AUDIT_ROW_NOT_LINKED_REASON,
  auditColumns,
} from "@/features/audit/components/audit-columns";
import { AuditEmptyState } from "@/features/audit/components/audit-empty-state";
import { AuditExportControl } from "@/features/audit/components/audit-export-control";
import { AuditRangeFilter } from "@/features/audit/components/audit-range-filter";
import { requireRoute } from "@/lib/auth/guard";
import { nowIso } from "@/lib/auth/session";
import { DataIntegrityError, isAppError } from "@/lib/errors";

/**
 * `/audit` — the audit log. `UX_SPEC.md` §3.20, `BUSINESS_RULES.md` §12.
 *
 * ## What this page assumes, and why it contains no role check
 *
 * `requireRoute("/audit")` is the first statement, and it does not return on a
 * denial. **By the time this body runs the caller holds `read`** — Rule 12.8
 * is the guard's job, decided against the one `ROUTE_ACCESS` the navigation, the
 * command palette and every cross-route link also read. A second check here would
 * be a second route-access structure, which is precisely what
 * `SITE_ARCHITECTURE.md` §7.2 forbids, so there is no "P1 cannot see this" state
 * on this page and there must not be one.
 *
 * A `PermissionError` from `auditEvents.list` is therefore **let through to
 * `error.tsx`**: the mock's policy matrix refuses P1 underneath the guard, and if
 * that refusal ever reaches this page the guard has drifted from the map. That
 * has to be loud (`TECHNICAL_SPEC.md` §10.1 — nothing is swallowed). Only a
 * transient `INTEGRATION` failure is caught, and only to render the table's own
 * error state with its **Retry**, which keeps the header, the filters and the
 * count on screen.
 *
 * ## What is deliberately absent
 *
 * **No edit path, for anyone, including P6** (Rules 1.21, 12.4). No delete
 * control, no bulk clear, no retention override, no row menu — and no *disabled*
 * one either. The contract carries no update method, the policy matrix grants no
 * insert or update to any tenant role, and this screen offers no affordance. The
 * absence is the enforcement.
 *
 * **Nothing filters denials out.** A refused route, a refused write and a refused
 * air-transport selection are ordinary rows here (`denial.recorded`, T-43),
 * present in the default view and filterable like any other event type — attempts
 * are evidence (Rules 1.16, 12.6; §5.3(8)).
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/audit"],
};

export default async function AuditPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ctx, capability } = await requireRoute("/audit");
  const query = decodeListQuery(await searchParams, AUDIT_LIST_SPEC);

  const organization = await data.organizations.get(ctx, ctx.organizationId);
  if (organization === null) {
    // The guard resolved this organization on this request, so a null here is an
    // integrity failure rather than a record that is simply not there. It is
    // raised rather than defaulted: a timestamp rendered in a guessed zone is a
    // wrong timestamp, and every date-based decision is evaluated in the
    // governing local zone (Rule 12.20).
    throw new DataIntegrityError({
      userMessage:
        "We could not read your organization's profile, so the audit log cannot state the time zone its timestamps are in. Nothing was changed — try again.",
      correlationId: ctx.correlationId,
    });
  }

  const timeZone = organization.timeZone;
  const directory = await readAuditActorDirectory(ctx);

  let result: Page<AuditEvent> | null = null;
  let tableError: RecordTableErrorState | undefined;

  try {
    result = await data.auditEvents.list(ctx, {
      ...toAuditEventQuery(query, timeZone),
      ...toPageRequest(query),
    });
  } catch (error) {
    // A refusal means the guard and the policy matrix disagree; that is a
    // defect and it is not swallowed here.
    if (!isAppError(error) || error.code !== "INTEGRATION") throw error;
    console.error("[audit] the audit log could not be read", error);
    tableError = {
      message: error.userMessage,
      correlationId: error.correlationId,
    };
  }

  const rows = (result?.items ?? []).map((event) =>
    toAuditRowView(event, directory, ctx.role, timeZone),
  );

  // UX_SPEC.md §3.20 fixes the banner on this route explicitly, and it is the
  // one route where it is not a function of mutating controls: nobody may change
  // an audit event, so `showsReadOnlyBanner` cannot decide it. See the build
  // notes.
  const showsBanner = ctx.role === "auditor";

  return (
    <div className="flex flex-col gap-6">
      <h1 id="page-title" tabIndex={-1} className="text-h1 lg:text-display">
        {APP_ROUTE_NAMES["/audit"]}
      </h1>

      {showsBanner ? <ReadOnlyBanner /> : null}

      <p className="max-w-[72ch] text-body text-muted-foreground">
        Every action this organization and this system took, newest first. The
        log is append-only: no one can edit or remove a row, and refused actions
        are recorded here alongside the ones that went through.
      </p>

      <RecordTable
        caption="Audit log, newest first"
        columns={auditColumns()}
        rows={rows}
        rowKey={(row) => row.id}
        rowLink={() => ({
          kind: "not-linked",
          reason: AUDIT_ROW_NOT_LINKED_REASON,
        })}
        total={result?.total ?? 0}
        query={query}
        querySpec={AUDIT_LIST_SPEC}
        basePath="/audit"
        searchPlaceholder="Search events"
        filters={auditFilters(directory.options)}
        emptyState={<AuditEmptyState />}
        filteredEmpty={{
          noun: "results",
          searchSuggestion: "Try an event type or an actor.",
        }}
        error={tableError}
        toolbar={
          <>
            <AuditRangeFilter
              basePath="/audit"
              query={query}
              spec={AUDIT_LIST_SPEC}
              zoneLabel={formatAuditTimestamp(nowIso(), timeZone).zone}
            />
            <AuditExportControl
              href={auditExportHref(query)}
              role={ctx.role}
              capability={capability}
            />
          </>
        }
      />
    </div>
  );
}
