import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import { recordNotFound } from "@/lib/auth/record-denial";
import { resolveRequestContext } from "@/lib/auth/session";
import { isAppError, type AppErrorCode } from "@/lib/errors";
import type { DocumentRender } from "@/types/documents";

import type { DocumentRequestAttribution } from "./document-events";

/**
 * What the two document route handlers share — `TECHNICAL_SPEC.md` §7.2.
 *
 * **Access is the document page's**: any member of the owning organization,
 * P5 included (Rule 5.27). A render in another tenant is indistinguishable
 * from none, and the attempt is recorded (Rules 1.2, 1.16). Errors are RFC
 * 9457 `application/problem+json` with the code a client branches on — never
 * a stack trace, never a storage path, and the correlation id only on a 5xx.
 */

const DOCUMENT_ROUTE = "/documents/[id]";

interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: AppErrorCode;
  readonly detail: string;
  readonly instance: string;
  readonly correlationId?: string;
}

const TITLE_BY_CODE: Readonly<Record<AppErrorCode, string>> = {
  VALIDATION: "The request was not accepted",
  UNAUTHENTICATED: "Not signed in",
  FORBIDDEN: "Not available to your role",
  NOT_FOUND: "Not found",
  CONFLICT: "The document changed",
  TENANT_SCOPE: "Not available",
  RULE_UNRESOLVED: "A rule is missing",
  INTEGRATION: "A service did not respond",
  DOCUMENT_RENDER: "The document could not be generated",
  DOCUMENT_INTEGRITY: "The document failed its integrity check",
  DATA_INTEGRITY: "The document could not be read",
  NOT_IMPLEMENTED: "Not available",
};

export function documentProblem(
  code: AppErrorCode,
  status: number,
  detail: string,
  instance: string,
  correlationId?: string,
): Response {
  const body: ProblemBody = {
    type: "about:blank",
    title: TITLE_BY_CODE[code],
    status,
    code,
    detail,
    instance,
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

export function attributionFrom(request: Request): DocumentRequestAttribution {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstAddress = forwarded?.split(",")[0]?.trim();
  return {
    requestId: request.headers.get("x-request-id"),
    ipAddress:
      firstAddress === undefined || firstAddress === "" ? null : firstAddress,
    userAgent: request.headers.get("user-agent"),
  };
}

export type OpenedDocument =
  | {
      readonly ok: true;
      readonly ctx: RequestContext;
      readonly render: DocumentRender;
    }
  | { readonly ok: false; readonly response: Response };

/** The session, the access check and the render — or the problem that stops the request. */
export async function openDocument(
  id: string,
  instance: string,
): Promise<OpenedDocument> {
  const resolution = await resolveRequestContext();
  if (resolution.kind !== "resolved") {
    return {
      ok: false,
      response: documentProblem(
        "UNAUTHENTICATED",
        401,
        resolution.kind === "lapsed"
          ? "Your access to this organization has ended. Sign in again to see what you can still reach."
          : "You were signed out. Sign in again and open the document once more.",
        instance,
      ),
    };
  }
  const { ctx } = resolution.session;
  // Every role reads documents (Rule 5.27); the map says so, and is asked.
  if (!canReadRoute(ctx.role, DOCUMENT_ROUTE)) {
    return {
      ok: false,
      response: documentProblem(
        "FORBIDDEN",
        403,
        "Your role cannot open documents.",
        instance,
      ),
    };
  }
  const render = await data.documentRenders.get(ctx, id);
  if (render === null) {
    await recordNotFound(ctx, "document_render", id);
    return {
      ok: false,
      response: documentProblem(
        "NOT_FOUND",
        404,
        "That document could not be found.",
        instance,
      ),
    };
  }
  return { ok: true, ctx, render };
}

/** One failure, translated once. Nothing is swallowed: every arm logs. */
export function documentProblemFor(
  error: unknown,
  ctx: RequestContext,
  instance: string,
): Response {
  console.error(`[documents] ${instance} could not be served`, error);
  if (!isAppError(error)) {
    return documentProblem(
      "DATA_INTEGRITY",
      500,
      "Something went wrong on our side and nothing was served. Try again.",
      instance,
      ctx.correlationId,
    );
  }
  return documentProblem(
    error.code,
    error.httpStatus,
    error.userMessage,
    instance,
    ctx.correlationId,
  );
}
