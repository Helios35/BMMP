import { expect, test, type Page } from "@playwright/test";

import { createContainer } from "./support/documents-flow";
import { E2E_CRON_SECRET } from "./support/cron";
import { logCleanBattery, tap } from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * Recall matching on the record — Rules 10.10–10.18, 6.23, 6.24; `UX_SPEC.md`
 * §3.7; brief b2-09.
 *
 * The fixture recall source names the Ridgeline RM-24V50 scooter pack
 * (consumer recall 26-041), so a battery logged from `label-scooter.png` is a
 * possible match the moment it is committed. Every record a spec decides on
 * is its own — logged into a container the spec creates, never the sound
 * drum — and every upload is byte-unique. Fixture records are only read.
 *
 * Rule 6.14, which voids an issued air paper, needs the 24-hour number
 * verified to issue that paper, so it lives in serial `papers.spec.ts`.
 */

const { BATTERY } = fixtureIds;

const section = (page: Page) => page.locator("[data-recalls-section]");

async function logScooter(page: Page, tag: string): Promise<string> {
  const containerId = await createContainer(page, tag);
  const logged = await logCleanBattery(page, {
    containerId,
    image: "label-scooter.png",
  });
  return logged.recordId;
}

test.describe("P1 — a check on commit, and a confirmation", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("the check on commit finds a possible match, in words, with no number", async ({
    page,
  }) => {
    const recordId = await logScooter(page, "recall-commit");
    await page.goto(`/batteries/${recordId}`);
    await expect(section(page)).toHaveAttribute(
      "data-recall-standing",
      "possible_match",
    );
    const row = section(page).locator('[data-recall-status="possible_match"]');
    await expect(row).toHaveCount(1);
    await expect(row.locator("[data-recall-matched-on]")).toContainText(
      "match recall 26-041.",
    );
    await expect(row.locator("[data-recall-number]")).toHaveText("26-041");
    await expect(section(page)).not.toContainText(/%|score|strength/iu);

    // The alert the check raised is on the dashboard, routed to the record.
    await page.goto("/");
    await expect(
      page.locator('[data-alert-type="recall_match"]').first(),
    ).toBeVisible();
  });

  test("confirming puts the recall notice up, air unavailable, quarantine required", async ({
    page,
  }) => {
    const recordId = await logScooter(page, "recall-confirm");
    await page.goto(`/batteries/${recordId}`);
    const confirm = section(page).locator("[data-recall-confirm]");
    await tap(confirm, "Confirm recall");
    await expect(section(page)).toHaveAttribute(
      "data-recall-standing",
      "confirmed_match",
    );
    const notice = page.locator('[data-hard-block-notice="ddr"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("barred from air transport");
    await expect(notice).toContainText("26-041");
    await expect(notice).toContainText("quarantine");
    await expect(
      notice.locator('[data-hard-block-path="recalls"]'),
    ).toBeVisible();
  });
});

test.describe("P6 — dismissing, with a reason that stays", () => {
  test("P1 logs the match; P6 dismisses it; the row stays, marked, with the reason", async ({
    browser,
  }) => {
    const handler = await browser.newContext({
      storageState: storageStateFor("p1"),
    });
    const admin = await browser.newContext({
      storageState: storageStateFor("p6"),
    });
    try {
      const p1 = await handler.newPage();
      const recordId = await logScooter(p1, "recall-dismiss");

      const p6 = await admin.newPage();
      await p6.goto(`/batteries/${recordId}`);
      const row = section(p6).locator('[data-recall-status="possible_match"]');
      const matchId = await row.getAttribute("data-recall-match");
      await tap(row.locator("[data-recall-dismiss]"), "Dismiss");
      const dialog = p6.locator(`[data-recall-dismiss-dialog="${matchId}"]`);
      await dialog
        .locator(`[data-recall-dismiss-reason="${matchId}"]`)
        .fill("e2e: the serial range on the pack is outside the recall.");
      await dialog
        .locator(`[data-recall-dismiss-confirm="${matchId}"]`)
        .click();

      const dismissed = section(p6).locator(`[data-recall-match="${matchId}"]`);
      await expect(dismissed).toHaveAttribute(
        "data-recall-status",
        "dismissed",
      );
      await expect(dismissed.locator("[data-recall-reason]")).toContainText(
        "outside the recall",
      );
      await expect(section(p6)).not.toHaveAttribute(
        "data-recall-standing",
        "possible_match",
      );
    } finally {
      await Promise.all([handler.close(), admin.close()]);
    }
  });
});

test.describe("P2 — recording a manufacturer's notice", () => {
  test("P2 records a recall by hand on a read-only record; it is confirmed at once", async ({
    browser,
  }) => {
    const handler = await browser.newContext({
      storageState: storageStateFor("p1"),
    });
    const manager = await browser.newContext({
      storageState: storageStateFor("p2"),
    });
    try {
      const p1 = await handler.newPage();
      const containerId = await createContainer(p1, "recall-record");
      const { recordId } = await logCleanBattery(p1, { containerId });

      const p2 = await manager.newPage();
      await p2.goto(`/batteries/${recordId}`);
      // P2 reads this route; the recall controls are still P2's (Rule 6.23).
      await expect(
        section(p2).locator("[data-recall-check-now]"),
      ).toBeVisible();
      await p2.locator("[data-record-recall-trigger]").click();
      const dialog = p2.locator("[data-record-recall-dialog]");
      await expect(dialog.locator("[data-record-recall-source]")).toContainText(
        "Manufacturer notice",
      );
      await dialog
        .locator("[data-record-recall-reference]")
        .fill(`NV-SN-E2E-${Date.now().toString(36)}`);
      await dialog
        .locator("[data-record-recall-title]")
        .fill("Northvale module service notice");
      // Inside the dialog, as every spec clicks a dialog confirm: the open
      // animation is still scaling it when the 44px check would measure.
      await dialog.locator("[data-record-recall-submit]").click();

      await expect(section(p2)).toHaveAttribute(
        "data-recall-standing",
        "confirmed_match",
      );
      await expect(
        section(p2).locator('[data-recall-status="confirmed_match"]'),
      ).toContainText("Northvale module service notice");
      await expect(p2.locator('[data-hard-block-notice="ddr"]')).toBeVisible();
    } finally {
      await Promise.all([handler.close(), manager.close()]);
    }
  });
});

test.describe("P5 — reads the recalls, acts on none", () => {
  test.use({ storageState: storageStateFor("p5") });

  test("the possible match is listed, and there is no control to act on it", async ({
    page,
  }) => {
    await page.goto(`/batteries/${BATTERY.recallBrandModel}`);
    await expect(section(page).locator("[data-recall-match]")).not.toHaveCount(
      0,
    );
    await expect(
      page.locator(
        "[data-recall-check-now], [data-record-recall-trigger], [data-recall-confirm], [data-recall-dismiss], [data-recall-withdraw]",
      ),
    ).toHaveCount(0);
  });
});

test.describe("Rule 10.17 — a failed check is never no match", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("the record whose source did not answer reads Not checked — source unavailable", async ({
    page,
  }) => {
    await page.goto(`/batteries/${BATTERY.recallCheckFails}`);
    await expect(section(page)).toHaveAttribute(
      "data-recall-standing-reason",
      "source_unavailable",
    );
    await expect(
      section(page).locator("[data-recall-standing-text]"),
    ).toHaveText("Not checked — source unavailable");
    await expect(section(page)).not.toContainText("No match");
  });
});

test.describe("POST /api/jobs/recall-sync — a route, behind the job secret", () => {
  test("refuses a caller without CRON_SECRET, and runs for one with it", async ({
    request,
  }) => {
    const refused = await request.post("/api/jobs/recall-sync");
    expect(refused.status()).toBe(401);
    expect(refused.headers()["content-type"]).toContain(
      "application/problem+json",
    );
    const wrong = await request.post("/api/jobs/recall-sync", {
      headers: { authorization: "Bearer not-the-secret" },
    });
    expect(wrong.status()).toBe(401);

    const ran = await request.post("/api/jobs/recall-sync", {
      headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
    });
    expect(ran.status()).toBe(200);
    const body = (await ran.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["checked", "matched"]);
  });
});
