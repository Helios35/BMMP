import { runProducerObligationsJob } from "@/features/obligations/server/run";
import { serveJob } from "@/lib/jobs/serve-job";

/**
 * `POST /api/jobs/producer-obligations` — `TECHNICAL_SPEC.md` §7.2; Rules
 * 8.11, 8.13; D-78 #10, #11.
 *
 * Re-evaluates every organization with a declared product as T-60
 * `scheduled_job`, then raises and resolves its deadline alerts. **A route
 * only** until go-live, as the other jobs are (D-63 #6; the Vercel Cron entry
 * is unit 20's). `CRON_SECRET` bearer, and nothing else (`serveJob`).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return serveJob(request, {
    instance: "/api/jobs/producer-obligations",
    name: "producer-obligations",
    failureDetail:
      "The organizations checked before the failure keep their new results; the rest keep their last ones. Run the job again.",
    run: async (correlationId) => {
      const run = await runProducerObligationsJob(
        { job: "producer-obligations", correlationId },
        new Date().toISOString(),
      );
      return { evaluated: run.evaluated, raised: run.raised };
    },
  });
}
