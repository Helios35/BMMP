import { expect, test } from "@playwright/test";

import { E2E_CRON_SECRET } from "./support/cron";

/**
 * `POST /api/jobs/storage-clock-alerts` on the built server — brief 07
 * outcome 6; reviewer item "call the job twice → second returns `fired: 0`".
 *
 * The suite's server is started with a test `CRON_SECRET`
 * (`playwright.config.ts`). The unset case (`503`) and the firing itself, at
 * a pinned instant, are proven in
 * `tests/integration/storage-clock-alerts.test.ts`.
 */

const JOB = "/api/jobs/storage-clock-alerts";

test.describe("the storage-clock alert job", () => {
  test("refuses a missing or wrong bearer with 401 problem+json", async ({
    request,
  }) => {
    const attempts: readonly Record<string, string>[] = [
      {},
      { authorization: "Bearer not-the-secret" },
      { authorization: E2E_CRON_SECRET },
    ];
    for (const headers of attempts) {
      const response = await request.post(JOB, { headers });
      expect(response.status()).toBe(401);
      expect(response.headers()["content-type"]).toContain(
        "application/problem+json",
      );
      const body = (await response.text()).toLowerCase();
      expect(body).not.toContain(E2E_CRON_SECRET);
      expect(body).not.toContain("stack");
    }
  });

  test("runs with the secret, and a second call fires nothing", async ({
    request,
  }) => {
    const headers = { authorization: `Bearer ${E2E_CRON_SECRET}` };
    const first = await request.post(JOB, { headers });
    expect(first.status()).toBe(200);
    const once = (await first.json()) as { evaluated: number; fired: number };
    expect(typeof once.evaluated).toBe("number");
    expect(typeof once.fired).toBe("number");

    const second = await request.post(JOB, { headers });
    expect(second.status()).toBe(200);
    expect(((await second.json()) as { fired: number }).fired).toBe(0);
  });

  test("answers GET with 405 — a job is never triggered by a read", async ({
    request,
  }) => {
    expect((await request.get(JOB)).status()).toBe(405);
  });
});
