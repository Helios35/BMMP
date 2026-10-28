import "server-only";

import { data } from "@/data";
import type { Page, RequestContext } from "@/data/contracts";
import type { AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";
import { recordWriteDenial } from "@/lib/auth/record-denial";
import { nowIso, resolveRequestContext } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import type { JsonObject } from "@/types/common";
import type { Organization } from "@/types/tenancy";

import { csvFile } from "./csv";
import { recordExport } from "./record-export";

/**
 * Every CSV export, served one way — the pattern `GET /api/exports/audit`
 * established in `b1a-03`, made the one pattern in `b1a-08` (D-50): `/audit`,
 * `/batteries`, `/shipments` and `/review` each declare what their file holds
 * and nothing else.
 *
 * **A route handler and not a Server Action, for the one reason
 * `TECHNICAL_SPEC.md` §7.1 permits one: the response is not JSON.**
 *
 * ## The four obligations every export carries
 *
 * - **Rule 12.17 — scope is enforced on the export, not on the screen that
 *   requested it.** The URL is decoded by the module the page uses, and the
 *   read goes through the same tenant-scoped, policy-checked adapter method;
 *   a role that may not export the list is refused here as well as by the
 *   missing button, and the refusal is audited (Rules 1.16, 12.6).
 * - **Rule 12.18 — the export is itself an audited act**, written before a
 *   byte is returned. If that write fails, no file is produced.
 * - **Rule 12.19 — a P5 export ends with the grant.** `resolveRequestContext`
 *   re-checks the grant window on every request and resolves a lapsed one as
 *   signed out (Rule 1.28), so an expired grant cannot produce a file, and
 *   tenancy keeps every file inside the one organization the grant is for.
 *   The grant's scope is free text on the membership, so the export records
 *   it beside the filters rather than enforcing it — reported in `b1a-08`'s
 *   build notes.
 * - **Rule 5.27 / E-8a — export is never disabled for the auditor.**
 *
 * Errors are RFC 9457 `application/problem+json`. Never a stack trace, never a
 * provider name, never an internal identifier other than the correlation id —
 * and the correlation id only on a 5xx (`TECHNICAL_SPEC.md` §10.3).
 */

/** The one format every export produces. */
export const EXPORT_FORMAT = "csv";

/**
 * How many rows one export carries, and how many are read at a time.
 *
 * **An engineering bound, not a regulatory one.** No retention period,
 * reporting window or jurisdiction threshold is expressed here (Rule 1.23);
 * these numbers describe this process's memory, and the failure they produce
 * tells the reader to narrow the list rather than silently truncating the
 * file — a truncated export that looks complete is a wrong document.
 */
export const EXPORT_MAX_ROWS = 5000;
export const EXPORT_PAGE_SIZE = 500;

export interface CsvExportFile {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** The filters the file was produced under — Rule 12.18's "in what scope". */
  readonly scope: JsonObject;
}

export type CsvExportRead =
  | { readonly kind: "file"; readonly file: CsvExportFile }
  | { readonly kind: "too_large"; readonly total: number };

export interface CsvExportDefinition {
  /** `audit`, `batteries`, `shipments`, `review` — on the `export.generated` row. */
  readonly exportName: string;
  /** The list the file is a copy of. */
  readonly route: AppRoute;
  /** This handler's own path — a problem's `instance`. */
  readonly path: string;
  readonly filenameStem: string;
  /** What a refused attempt is recorded as. */
  readonly attempted: string;
  readonly mayExport: (role: RoleCode) => boolean;
  readonly deniedDetail: string;
  readonly tooLargeDetail: (total: number) => string;
  readonly read: (
    ctx: RequestContext,
    url: URL,
    organization: Organization,
  ) => Promise<CsvExportRead>;
}

interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly correlationId?: string;
}

function problem(
  instance: string,
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
    instance,
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

function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // An export is never cached by anything between here and the reader.
      "cache-control": "no-store",
    },
  });
}

/**
 * Every page of a list read, or the total that is too large to carry. A list
 * that grows past the bound mid-read stops at the bound's refusal, never at a
 * page boundary.
 */
export async function readEveryPage<T>(
  read: (page: {
    readonly limit: number;
    readonly offset: number;
  }) => Promise<Page<T>>,
): Promise<
  | { readonly kind: "rows"; readonly rows: readonly T[] }
  | { readonly kind: "too_large"; readonly total: number }
> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await read({ limit: EXPORT_PAGE_SIZE, offset });
    if (page.total > EXPORT_MAX_ROWS) {
      return { kind: "too_large", total: page.total };
    }
    rows.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || rows.length >= page.total) break;
  }
  return { kind: "rows", rows };
}

/** The filters a list was showing, as the `export.generated` row records them. */
export function exportScope(
  filters: Readonly<Record<string, string>>,
  filterIds: readonly string[],
  search: string | null,
): JsonObject {
  const scope: Record<string, string> = {};
  for (const id of filterIds) {
    const value = filters[id];
    if (value !== undefined && value !== "") scope[id] = value;
  }
  if (search !== null) scope.q = search;
  return scope;
}

export async function serveCsvExport(
  request: Request,
  definition: CsvExportDefinition,
): Promise<Response> {
  const fail = (
    status: number,
    title: string,
    detail: string,
    correlationId?: string,
  ) => problem(definition.path, status, title, detail, correlationId);

  const resolution = await resolveRequestContext();
  if (resolution.kind === "anonymous") {
    return fail(
      401,
      "Not signed in",
      "You were signed out. Sign in again and ask for the export once more.",
    );
  }
  if (resolution.kind === "lapsed") {
    // Rule 1.28 — a revoked membership or an expired grant ends access inside
    // an already-open session, and Rule 12.19 ends the ability to produce a
    // new export with it.
    return fail(
      401,
      "Access has ended",
      "Your access to this organization has ended, so this export was not produced. Sign in again to see what you can still reach.",
    );
  }

  const { ctx } = resolution.session;
  if (!definition.mayExport(ctx.role)) {
    // Rules 1.16, 12.6 — attempts are evidence, so the refusal is a row
    // before it is a response.
    await recordWriteDenial(ctx, definition.route, definition.attempted);
    return fail(403, "Not available to your role", definition.deniedDetail);
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? EXPORT_FORMAT;
  if (format !== EXPORT_FORMAT) {
    return fail(
      400,
      "Format not available",
      `This export is produced as ${EXPORT_FORMAT}. Ask for that format and try again.`,
    );
  }

  try {
    const organization = await data.organizations.get(ctx, ctx.organizationId);
    if (organization === null) {
      return fail(
        500,
        "The export could not be produced",
        "We could not read your organization's profile, so the export cannot state the time zone its timestamps are in. Nothing was changed — try again.",
        ctx.correlationId,
      );
    }

    const read = await definition.read(ctx, url, organization);
    if (read.kind === "too_large") {
      // A failed export states the reason and offers a narrower range, rather
      // than returning a file that quietly stops early.
      return fail(
        400,
        "That list is too large to export at once",
        definition.tooLargeDetail(read.total),
      );
    }

    const { requestId, ipAddress, userAgent } = attributionFrom(request);
    // Rule 12.18, before the bytes: an export nobody can see a record of is
    // the failure this rule exists to prevent, so a failed write fails the
    // request.
    await recordExport(ctx, {
      exportName: definition.exportName,
      route: definition.route,
      rowCount: read.file.rows.length,
      format,
      scope: {
        ...read.file.scope,
        // Rule 12.19 — the grant the export was produced under, as recorded.
        ...(typeof resolution.session.membership.grantScope === "string"
          ? { grant: resolution.session.membership.grantScope }
          : {}),
      },
      requestId,
      ipAddress,
      userAgent,
    });

    const stamp = nowIso().slice(0, 19).replaceAll(":", "").replace("T", "-");
    return csvResponse(
      csvFile(read.file.headers, read.file.rows),
      `${definition.filenameStem}-${organization.slug}-${stamp}.csv`,
    );
  } catch (error) {
    return await problemFor(error, ctx, definition, fail);
  }
}

/**
 * One failure, translated once. **Nothing is swallowed** (§10.1): every arm
 * logs, and a refusal that reached the data layer is recorded as a denial,
 * because the guard and the policy matrix disagreeing is exactly the kind of
 * attempt an audit log has to hold (Rules 1.16, 12.6).
 */
async function problemFor(
  error: unknown,
  ctx: RequestContext,
  definition: CsvExportDefinition,
  fail: (
    status: number,
    title: string,
    detail: string,
    correlationId?: string,
  ) => Response,
): Promise<Response> {
  console.error(
    `[${definition.exportName}-export] the export could not be produced`,
    error,
  );
  if (!isAppError(error)) {
    return fail(
      500,
      "The export could not be produced",
      "Something went wrong on our side and no file was produced. Nothing was changed — try again.",
      ctx.correlationId,
    );
  }
  if (error.code === "FORBIDDEN") {
    await recordWriteDenial(ctx, definition.route, definition.attempted);
  }
  return fail(
    error.httpStatus,
    error.httpStatus >= 500
      ? "The export could not be produced"
      : "The export was refused",
    error.userMessage,
    ctx.correlationId,
  );
}
