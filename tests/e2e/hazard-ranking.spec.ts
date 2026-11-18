import { expect, test, type Page } from "@playwright/test";

import { BATTERY_CSV_HEADERS } from "@/features/battery-record/battery-csv";

import { createContainer } from "./support/documents-flow";
import { E2E_CRON_SECRET } from "./support/cron";
import { logCleanBattery, tap } from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * The hazard ranking on screen — Rules 10.19–10.26; `UX_SPEC.md` §3.5, §3.7,
 * §3.9, §3.10; brief b2-11.
 *
 * **e2e shares one store, fully parallel**, and Rank now re-ranks Cascade for
 * every spec at once: these assert the shape — "of N", the band label, the
 * factors, the "why" — and never an exact position. Exact orders are the unit
 * suite's. Rankings only ever run for Cascade here: the job is only refused,
 * so Olympic's audit log stays empty. Fixture records are only read; the one
 * record a spec changes is its own, in a container it creates.
 */

const { BATTERY } = fixtureIds;

/** When Cascade's seeded run ran (`src/data/mock/fixtures/b2-11.ts`). */
const SEEDED_RUN_AT = "2026-11-12T15:00:00.000Z";

/** A ranking cell or panel: never a number that reads as a chance. */
const NO_CHANCE = /%|probab|likel|chance|risk|score/iu;

const panel = (page: Page) => page.locator("[data-hazard-ranking-panel]");

async function pressRankNow(page: Page, route: "/batteries" | "/containers") {
  await page.goto(route);
  const button = page.locator('button[data-rank-now="true"]');
  await expect(button).toBeVisible();
  await tap(button, "Rank now");
  await expect(page.locator("[data-rank-now-error]")).toHaveCount(0);
  // The list re-renders from the run: every ranked cell says "N of M".
  await expect(page.locator("[data-hazard-short-position]").first()).toHaveText(
    /^\d+ of \d+$/u,
  );
}

test.describe("P2 — Rank now and reading a ranking", () => {
  test.use({ storageState: storageStateFor("p2") });

  test('Rank now on Batteries shows a band and "of N" in every ranked row, with no chance in sight', async ({
    page,
  }) => {
    await pressRankNow(page, "/batteries");
    const cells = page.locator('[data-hazard-ranking-cell="ranked"]');
    await expect(cells.first()).toBeVisible();
    await expect(cells.first()).toContainText(/Band [1-4]|Not ranked/u);
    await expect(page.locator("table")).not.toContainText(NO_CHANCE);

    // The record's panel carries the set, its size and the as-of time (T-33).
    await page.goto(`/batteries/${BATTERY.swollenLaptop}`);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator("[data-hazard-position]")).toHaveText(
      /^\d+(st|nd|rd|th) of \d+/u,
    );
    await expect(panel(page).locator("[data-hazard-set]")).toContainText(
      "held batteries at",
    );
    await expect(panel(page).locator("[data-hazard-as-of]")).not.toBeEmpty();
    // A fresh run, not the seeded one: its as-of time is later than the seed's.
    const asOf = await panel(page)
      .locator("[data-hazard-as-of]")
      .getAttribute("data-hazard-as-of");
    expect((asOf ?? "") > SEEDED_RUN_AT).toBe(true);
  });

  test("a record shows each factor, where it came from, and why it sits where it does", async ({
    page,
  }) => {
    await page.goto(`/batteries/${BATTERY.swollenLaptop}`);
    const factors = panel(page).locator("[data-hazard-factor]");
    await expect(factors).toHaveCount(6);
    await expect(
      panel(page).locator('[data-hazard-factor="damage_indicators"]'),
    ).toHaveText("Damaged or defective");
    await expect(panel(page)).toContainText("From: assessment");
    const why = panel(page).locator("[data-hazard-why] li");
    await expect(why.first()).toHaveText(
      /^(Ranked (above|below) |Nothing ranks |Level with |Nothing sets )/u,
    );
    await expect(panel(page).locator("[data-hazard-basis]")).toContainText(
      "nothing is added up",
    );
    await expect(panel(page)).not.toContainText(NO_CHANCE);
  });

  test('a battery with no charge reading says "Not recorded" for charge, and is not ranked low for it', async ({
    page,
  }) => {
    // BR-0002 — no charge reading was taken at intake (T-21 `not_captured`).
    await page.goto(`/batteries/${BATTERY.mobilityScooter}`);
    const charge = panel(page).locator(
      '[data-hazard-factor="state_of_charge_at_intake"]',
    );
    await expect(charge).toHaveText("Not recorded");
    await expect(charge).toHaveAttribute(
      "data-hazard-factor-not-recorded",
      "true",
    );
    // Rule 10.20 — a gap ranks level with the factor's highest level.
    await expect(panel(page).locator("[data-hazard-basis]")).toContainText(
      "A factor with no recorded evidence ranks level with its highest level.",
    );
  });

  test("the list sorts a damaged record above a sound one, and the band filter narrows it", async ({
    page,
  }) => {
    await page.goto("/batteries?sort=hazardRanking&dir=asc&perPage=100");
    const ids = await page
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows.map((row) => row.querySelector("td")?.textContent?.trim() ?? ""),
      );
    const damaged = ids.findIndex((id) => id.includes("BR-0003"));
    const sound = ids.findIndex((id) => id.includes("BR-0001"));
    expect(damaged).toBeGreaterThanOrEqual(0);
    expect(sound).toBeGreaterThanOrEqual(0);
    expect(damaged).toBeLessThan(sound);

    await page.goto("/batteries?band=band_1&perPage=100");
    const bands = page.locator("[data-hazard-ranking-cell][data-hazard-band]");
    await expect(bands.first()).toBeVisible();
    for (const band of await bands.evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute("data-hazard-band")),
    )) {
      expect(band).toBe("band_1");
    }
  });

  test("the container and the lot carry the same panel", async ({ page }) => {
    await page.goto(`/containers/${fixtureIds.CONTAINER.soundDrum}`);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator("[data-hazard-set]")).toContainText(
      "held containers holding batteries",
    );
    await expect(
      panel(page).locator('[data-hazard-factor="storage_aggregation"]'),
    ).toBeVisible();

    await page.goto("/containers?tab=lots");
    const trigger = page.locator("[data-hazard-details-trigger]").first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.locator("[data-hazard-details-dialog]");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-hazard-set]")).toContainText(
      "held lots holding batteries",
    );
    await expect(dialog).not.toContainText(NO_CHANCE);
  });

  test("the /batteries CSV carries the four ranking columns", async ({
    page,
  }) => {
    const response = await page.request.get("/api/exports/batteries");
    expect(response.status()).toBe(200);
    const body = (await response.text()).slice(1);
    const [headerLine, ...rows] = body.split("\r\n");
    for (const heading of [
      "Hazard ranking",
      "Ranking set",
      "Ranked as of",
      "Ranking factors",
    ]) {
      expect(headerLine).toContain(heading);
    }
    expect(BATTERY_CSV_HEADERS.slice(-4)).toEqual([
      "Hazard ranking",
      "Ranking set",
      "Ranked as of",
      "Ranking factors",
    ]);
    const swollen = rows.find((row) => row.startsWith("BR-0003,"));
    expect(swollen).toMatch(/\d+ of \d+ · Band [1-4]/u);
    expect(swollen).toContain("held batteries at");
    expect(swollen).toContain("Damage indicators: Damaged or defective");
    expect(body).not.toMatch(/probab|likel|score/iu);
  });
});

test.describe('assessing damage reads "Changed since" (Rule 10.24)', () => {
  test.use({ storageState: storageStateFor("p1") });

  test('a record ranked sound reads "Changed since" once damage is confirmed on it', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const containerId = await createContainer(page, "ranking-changed");
    const logged = await logCleanBattery(page, { containerId });
    const recordPath = `/batteries/${logged.recordId}`;

    // Added since the last run.
    await page.goto(recordPath);
    await expect(panel(page)).toHaveAttribute(
      "data-hazard-ranking-state",
      "not_ranked_yet",
    );

    // The facility manager ranks; the record now has a ranking.
    const manager = await browser.newContext({
      storageState: storageStateFor("p2"),
    });
    const managerPage = await manager.newPage();
    await pressRankNow(managerPage, "/batteries");
    await manager.close();

    await page.goto(recordPath);
    await expect(panel(page)).toHaveAttribute(
      "data-hazard-ranking-state",
      "ranked",
    );

    // Confirm damage on it.
    await page
      .locator("[data-record-actions]")
      .locator('[data-control="edit-assessed-condition"]')
      .click();
    const dialog = page.locator(
      '[data-record-dialog="edit-assessed-condition"]',
    );
    await expect(dialog).toBeVisible();
    await dialog
      .locator("label", {
        has: page.locator('[data-finding="surface_marking"]'),
      })
      .click();
    await dialog
      .locator("[data-condition-reason]")
      .fill("Scuffing on the casing, seen on the weekly walk.");
    await dialog.locator('[data-primary-action="save-condition"]').click();
    await expect(dialog).toHaveCount(0);

    await page.goto(recordPath);
    await expect(panel(page)).toHaveAttribute(
      "data-hazard-ranking-state",
      "changed_since",
    );
    await expect(panel(page).locator("[data-hazard-changed-since]")).toHaveText(
      "Changed since — rank again to update",
    );
  });

  test("P1 sees rankings and no Rank now", async ({ page }) => {
    for (const route of ["/batteries", "/containers", "/containers?tab=lots"]) {
      await page.goto(route);
      await expect(page.locator("#page-title")).toBeVisible();
      await expect(
        page.locator("[data-hazard-ranking-cell]").first(),
      ).toBeVisible();
      await expect(page.locator("[data-rank-now]")).toHaveCount(0);
    }
  });
});

test.describe("P5 reads rankings", () => {
  test.use({ storageState: storageStateFor("p5") });

  test("the column, the panel, and Rank now shown disabled with its reason", async ({
    page,
  }) => {
    await page.goto("/batteries");
    await expect(
      page.locator("[data-hazard-ranking-cell]").first(),
    ).toBeVisible();
    const rank = page.locator("[data-rank-now]");
    await expect(rank).toHaveCount(1);
    await expect(rank).toHaveAttribute("aria-disabled", "true");

    await page.goto(`/batteries/${BATTERY.swollenLaptop}`);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator("[data-hazard-factor]")).toHaveCount(6);
    await expect(panel(page)).not.toContainText(NO_CHANCE);
  });
});

test.describe("the ranking job", () => {
  const JOB = "/api/jobs/hazard-ranking";

  test("refuses without the job secret, as problem+json", async ({
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
    }
  });

  test("answers GET with 405 — a job is never triggered by a read", async ({
    request,
  }) => {
    expect((await request.get(JOB)).status()).toBe(405);
  });
});
