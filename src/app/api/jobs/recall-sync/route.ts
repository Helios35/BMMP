import { runRecallSync } from "@/features/recalls/server/sync";
import { serveJob } from "@/lib/jobs/serve-job";

/**
 * `POST /api/jobs/recall-sync` — `TECHNICAL_SPEC.md` §7.2, §12.3; Rules
 * 10.10, 10.17; D-73 #6.
 *
 * The nightly recall check: every record in the statuses Rule 10.10 names,
 * asked of its sources and written as T-60 `scheduled_job`. **A route only**
 * until go-live, as the clock job is (D-63 #6). `CRON_SECRET` bearer, and
 * nothing else (`serveJob`). A source that does not answer is a failed run on
 * the record, never a failed job; the job fails only when it cannot write.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return serveJob(request, {
    instance: "/api/jobs/recall-sync",
    name: "recall-sync",
    failureDetail:
      "The records checked before the failure keep their results. Run the job again; a recall found again makes no second match.",
    run: async (correlationId) => {
      const run = await runRecallSync(
        { job: "recall-sync", correlationId },
        new Date().toISOString(),
      );
      return { checked: run.checked, matched: run.matched };
    },
  });
}
