import { data } from "@/data";
import { authorizeCron } from "@/lib/auth/cron-secret";

/**
 * `POST /api/jobs/storage-clock-alerts` — `TECHNICAL_SPEC.md` §7.2, §11.2;
 * Rules 4.6, 4.13–4.15; D-63 #6.
 *
 * Fires each due storage-clock alert. **A route only**: no Vercel Cron entry
 * exists until production runs a real database (D-63 #6) — Vercel Cron calls
 * production only, and production refuses the mock (D-16).
 *
 * `CRON_SECRET` bearer, and nothing else: unset → `503`, wrong or missing →
 * `401`, both RFC 9457 `application/problem+json` with no stack and no hint
 * of the secret. The job itself is the adapter's one operation
 * (`data.jobs.runStorageClockAlerts`), written as T-60 `scheduled_job`. A
 * second run over the same instant fires nothing.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INSTANCE = "/api/jobs/storage-clock-alerts";

type JobProblemCode = "NOT_CONFIGURED" | "UNAUTHENTICATED" | "INTEGRATION";

function problem(
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
      instance: INSTANCE,
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

export async function POST(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  const authorization = authorizeCron(request.headers.get("authorization"));

  if (authorization === "unconfigured") {
    return problem(
      503,
      "NOT_CONFIGURED",
      "The job is not configured",
      "This deployment has no job secret, so the job runs for nobody.",
      correlationId,
    );
  }
  if (authorization === "refused") {
    return problem(
      401,
      "UNAUTHENTICATED",
      "Not authorized",
      "The job secret was missing or did not match.",
      correlationId,
    );
  }

  try {
    const run = await data.jobs.runStorageClockAlerts(
      { job: "storage-clock-alerts", correlationId },
      new Date().toISOString(),
    );
    return Response.json(
      { evaluated: run.evaluated, fired: run.fired },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error(
      `[jobs] storage-clock-alerts failed (correlationId=${correlationId})`,
      error,
    );
    return problem(
      500,
      "INTEGRATION",
      "The job did not complete",
      "No alert from the failed clock was recorded. Run the job again.",
      correlationId,
    );
  }
}
