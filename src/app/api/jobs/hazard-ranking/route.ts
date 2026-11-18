import { runHazardRankingJob } from "@/features/hazard-ranking/server/run";
import { serveJob } from "@/lib/jobs/serve-job";

/**
 * `POST /api/jobs/hazard-ranking` — `TECHNICAL_SPEC.md` §7.2; Rules 10.24,
 * 10.26; D-77 #6.
 *
 * A ranking run for every organization: its held batteries, containers and
 * lots, ranked at once and written as T-60 `scheduled_job`. **A route only**
 * until go-live, as the other jobs are (D-63 #6; the Vercel Cron entry is
 * unit 20's). `CRON_SECRET` bearer, and nothing else (`serveJob`).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return serveJob(request, {
    instance: "/api/jobs/hazard-ranking",
    name: "hazard-ranking",
    failureDetail:
      "The organizations ranked before the failure keep their new rankings; the rest keep their last ones. Run the job again.",
    run: async (correlationId) => {
      const run = await runHazardRankingJob(
        { job: "hazard-ranking", correlationId },
        new Date().toISOString(),
      );
      return { ranked: run.ranked };
    },
  });
}
