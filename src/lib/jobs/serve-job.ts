import "server-only";

import { authorizeCron } from "@/lib/auth/cron-secret";
import type { JsonObject } from "@/types/common";

/**
 * Every `POST /api/jobs/*` route, served one way — `TECHNICAL_SPEC.md` §7.2;
 * D-63 #6, D-73 #6. The pattern `storage-clock-alerts` established in
 * `b1a-07`, made the one pattern when `recall-sync` joined it in `b2-09`.
 *
 * `CRON_SECRET` bearer, and nothing else: unset → `503`, wrong or missing →
 * `401`, both RFC 9457 `application/problem+json` with no stack and no hint
 * of the secret. A job that throws is a `500` naming the correlation id and
 * what did not happen; the cause goes to the log, never the response.
 *
 * **A route only**: no Vercel Cron entry exists until production runs a real
 * database — Vercel Cron calls production only, and production refuses the
 * mock (D-16).
 */

type JobProblemCode = "NOT_CONFIGURED" | "UNAUTHENTICATED" | "INTEGRATION";

function problem(
  instance: string,
  status: number,
  code: JobProblemCode,
  title: string,
  detail: string,
  correlationId: string,
): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title,
      status,
      code,
      detail,
      instance,
      ...(status >= 500 ? { correlationId } : {}),
    }),
    {
      status,
      headers: {
        "content-type": "application/problem+json; charset=utf-8",
        "cache-control": "no-store",
        ...(status === 401 ? { "www-authenticate": "Bearer" } : {}),
      },
    },
  );
}

export interface JobDefinition {
  /** The route's own path — a problem's `instance`. */
  readonly instance: string;
  /** Logged with the correlation id when the job throws. */
  readonly name: string;
  /** Said to the caller when the job throws: what did not happen, and what to do. */
  readonly failureDetail: string;
  readonly run: (correlationId: string) => Promise<JsonObject>;
}

export async function serveJob(
  request: Request,
  definition: JobDefinition,
): Promise<Response> {
  const correlationId = crypto.randomUUID();
  const authorization = authorizeCron(request.headers.get("authorization"));

  if (authorization === "unconfigured") {
    return problem(
      definition.instance,
      503,
      "NOT_CONFIGURED",
      "The job is not configured",
      "This deployment has no job secret, so the job runs for nobody.",
      correlationId,
    );
  }
  if (authorization === "refused") {
    return problem(
      definition.instance,
      401,
      "UNAUTHENTICATED",
      "Not authorized",
      "The job secret was missing or did not match.",
      correlationId,
    );
  }

  try {
    const body = await definition.run(correlationId);
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error(
      `[jobs] ${definition.name} failed (correlationId=${correlationId})`,
      error,
    );
    return problem(
      definition.instance,
      500,
      "INTEGRATION",
      "The job did not complete",
      definition.failureDetail,
      correlationId,
    );
  }
}
