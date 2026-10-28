import { data } from "@/data";
import { serveJob } from "@/lib/jobs/serve-job";

/**
 * `POST /api/jobs/storage-clock-alerts` — `TECHNICAL_SPEC.md` §7.2, §11.2;
 * Rules 4.6, 4.13–4.15; D-63 #6.
 *
 * Fires each due storage-clock alert. **A route only**: no Vercel Cron entry
 * exists until production runs a real database (D-63 #6) — Vercel Cron calls
 * production only, and production refuses the mock (D-16).
 *
 * `CRON_SECRET` bearer, and nothing else (`serveJob`). The job itself is the
 * adapter's one operation (`data.jobs.runStorageClockAlerts`), written as
 * T-60 `scheduled_job`. A second run over the same instant fires nothing.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return serveJob(request, {
    instance: "/api/jobs/storage-clock-alerts",
    name: "storage-clock-alerts",
    failureDetail:
      "No alert from the failed clock was recorded. Run the job again.",
    run: async (correlationId) => {
      const run = await data.jobs.runStorageClockAlerts(
        { job: "storage-clock-alerts", correlationId },
        new Date().toISOString(),
      );
      return { evaluated: run.evaluated, fired: run.fired };
    },
  });
}
