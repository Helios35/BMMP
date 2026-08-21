import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { decodeListQuery } from "@/components/record-table/list-url";
import { canRead } from "@/domain/access/capability";
import { capabilityFor } from "@/domain/access/route-capability";
import { auditCsv } from "@/features/audit/audit-csv";
import { readAuditActorDirectory } from "@/features/audit/audit-actors";
import { recordAuditExport } from "@/features/audit/audit-export-event";
import {
  AUDIT_EXPORT_FORMAT,
  AUDIT_EXPORT_PATH,
  AUDIT_FILTER_IDS,
  AUDIT_LIST_SPEC,
  auditExportSearchParams,
  toAuditEventQuery,
} from "@/features/audit/audit-query";
import { toAuditRowView, type AuditRowView } from "@/features/audit/audit-row";
import { recordWriteDenial } from "@/lib/auth/record-denial";
import { resolveRequestContext, nowIso } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import type { JsonObject } from "@/types/common";

/**
 * `GET /api/exports/audit` — the audit log as CSV.
 *
 * **A route handler and not a Server Action, for the one reason §7.1 permits
 * one: the response is not JSON.** `TECHNICAL_SPEC.md` §7.2 lists this endpoint;
 * everything else this unit reads is a Server Component reading through
 * `src/data`, and there is no REST layer duplicating the data layer for our own
 * UI.
 *
 * ## The four obligations this handler carries
 *
 * - **Rule 12.17 — scope is enforced on the export, not on the screen that
 *   requested it.** The URL is decoded by the same module the page uses, and the
 *   read goes through the same tenant-scoped, policy-checked adapter method. A
 *   caller who hand-writes a filter still gets only their own organization's
 *   rows, and P1 is refused underneath the guard as well as by it (Rule 12.8).
 * - **Rule 12.18 — the export is itself an audited act**, written before a byte
 *   is returned. If that write fails, no file is produced: an unauditable export
 *   does not happen.
 * - **Rule 12.19 — a P5 export ends with the grant.** `resolveRequestContext`
 *   re-checks the grant window on every request and resolves a lapsed one as
 *   signed out (Rule 1.28), so an expired grant cannot produce a file. The
 *   grant's *scope* has no column yet and is reported in this unit's build notes.
 * - **Rule 5.27 / E-8a — export is never disabled for the auditor.** P5 holds
 *   `read` on `/audit`, so P5 reaches this endpoint exactly as P2 and P6 do.
 *
 * Errors are RFC 9457 `application/problem+json`. Never a stack trace, never a
 * provider name, never an internal identifier other than the correlation id —
 * and the correlation id only on a 5xx (`TECHNICAL_SPEC.md` §10.3).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * How many rows one export carries, and how many are read at a time.
 *
 * **An engineering bound, not a regulatory one.** No retention period, reporting
 * window or jurisdiction threshold is expressed here (Rule 1.23); these numbers
 * describe this process's memory, and the failure they produce tells the reader
 * to narrow the range rather than silently truncating the file — a truncated
 * audit export that looks complete is a wrong document.
 */
const EXPORT_MAX_ROWS = 5000;
const EXPORT_PAGE_SIZE = 500;

interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly correlationId?: string;
}

function problem(
  status: number,
  title: string,
  detail: string,
  correlationId?: string,
): Response {
  const body: ProblemBody = {
    type: "about:blank",
    title,
    status,
    detail,
    instance: AUDIT_EXPORT_PATH,
    // §10.3 rule 2 — the reference appears on a 5xx so support can find the
    // trace, and never on a 4xx, where there is nothing to look up.
    ...(status >= 500 && correlationId !== undefined ? { correlationId } : {}),
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/problem+json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** The filters this file was produced under, for the `export.generated` row. */
function scopeOf(
  filters: Readonly<Record<string, string>>,
  search: string | null,
): JsonObject {
  const scope: Record<string, string> = {};
  for (const id of AUDIT_FILTER_IDS) {
    const value = filters[id];
    if (value !== undefined && value !== "") scope[id] = value;
  }
  if (search !== null) scope.q = search;
  return scope;
}

function attributionFrom(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstAddress = forwarded?.split(",")[0]?.trim();
  return {
    requestId: request.headers.get("x-request-id"),
    ipAddress:
      firstAddress === undefined || firstAddress === "" ? null : firstAddress,
    userAgent: request.headers.get("user-agent"),
  };
}

export async function GET(request: Request): Promise<Response> {
  const resolution = await resolveRequestContext();

  if (resolution.kind === "anonymous") {
    return problem(
      401,
      "Not signed in",
      "You were signed out. Sign in again and ask for the export once more.",
    );
  }
  if (resolution.kind === "lapsed") {
    // Rule 1.28 — a revoked membership or an expired grant ends access inside an
    // already-open session, and Rule 12.19 ends the ability to produce a new
    // export with it.
    return problem(
      401,
      "Access has ended",
      "Your access to this organization has ended, so this export was not produced. Sign in again to see what you can still reach.",
    );
  }

  const { ctx } = resolution.session;
  const capability = capabilityFor(ctx.role, "/audit");

  if (!canRead(capability)) {
    // Rules 1.16, 12.6 — attempts are evidence, so the refusal is a row before
    // it is a response.
    await recordWriteDenial(ctx, "/audit", "export.audit");
    return problem(
      403,
      "Not available to your role",
      "Your role cannot read the audit log, so it cannot export it. Ask a Facility Manager or an Admin if you need this.",
    );
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? AUDIT_EXPORT_FORMAT;
  if (format !== AUDIT_EXPORT_FORMAT) {
    return problem(
      400,
      "Format not available",
      `This export is produced as ${AUDIT_EXPORT_FORMAT}. Ask for that format and try again.`,
    );
  }

  const query = decodeListQuery(auditExportSearchParams(url), AUDIT_LIST_SPEC);
  const attribution = attributionFrom(request);

  try {
    const organization = await data.organizations.get(ctx, ctx.organizationId);
    if (organization === null) {
      return problem(
        500,
        "The export could not be produced",
        "We could not read your organization's profile, so the export cannot state the time zone its timestamps are in. Nothing was changed — try again.",
        ctx.correlationId,
      );
    }

    const timeZone = organization.timeZone;
    const directory = await readAuditActorDirectory(ctx);
    const eventQuery = toAuditEventQuery(query, timeZone);

    const rows: AuditRowView[] = [];
    let offset = 0;

    for (;;) {
      const page = await data.auditEvents.list(ctx, {
        ...eventQuery,
        limit: EXPORT_PAGE_SIZE,
        offset,
      });

      if (page.total > EXPORT_MAX_ROWS) {
        // §3.20 — a failed export states the reason and **offers a narrower
        // range**, rather than returning a file that quietly stops early.
        return problem(
          400,
          "That range is too large to export at once",
          `This range holds ${page.total} events, which is more than one file carries. Narrow the date range — or the actor or event type — and export again.`,
        );
      }

      for (const event of page.items) {
        rows.push(toAuditRowView(event, directory, ctx.role, timeZone));
      }

      offset += page.items.length;
      if (page.items.length === 0 || rows.length >= page.total) break;
    }

    // Rule 12.18, before the bytes: an export nobody can see a record of is the
    // failure this rule exists to prevent, so a failed write fails the request.
    await recordAuditExport(ctx, {
      rowCount: rows.length,
      format,
      scope: scopeOf(query.filters, query.q),
      ...attribution,
    });

    return csvResponse(auditCsv(rows), organization.slug);
  } catch (error) {
    return await problemFor(error, ctx);
  }
}

function csvResponse(body: string, organizationSlug: string): Response {
  const stamp = nowIso().slice(0, 19).replaceAll(":", "").replace("T", "-");
  const filename = `audit-log-${organizationSlug}-${stamp}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // An audit export is never cached by anything between here and the reader.
      "cache-control": "no-store",
    },
  });
}

/**
 * One failure, translated once.
 *
 * **Nothing is swallowed** (§10.1): every arm logs, and a refusal that reached
 * the data layer is recorded as a denial because the guard and the policy matrix
 * disagreeing is exactly the kind of attempt an audit log has to hold
 * (Rules 1.16, 12.6).
 */
async function problemFor(
  error: unknown,
  ctx: RequestContext,
): Promise<Response> {
  console.error("[audit-export] the export could not be produced", error);

  if (!isAppError(error)) {
    return problem(
      500,
      "The export could not be produced",
      "Something went wrong on our side and no file was produced. Nothing was changed — try again.",
      ctx.correlationId,
    );
  }

  if (error.code === "FORBIDDEN") {
    await recordWriteDenial(ctx, "/audit", "export.audit");
  }

  return problem(
    error.httpStatus,
    error.httpStatus >= 500
      ? "The export could not be produced"
      : "The export was refused",
    error.userMessage,
    ctx.correlationId,
  );
}
