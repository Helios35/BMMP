import { expect, test, type Page } from "@playwright/test";

import { OBLIGATION_CSV_HEADERS } from "@/features/obligations/obligations-csv";

import { E2E_CRON_SECRET } from "./support/cron";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * `/obligations` from the outside — `UX_SPEC.md` §3.21; Rules 8.6–8.16; brief
 * b1b-12.
 *
 * **Dates move.** These assert the shape — a status, a citation, "No date
 * yet", a band in the law's words — never which deadline is overdue today;
 * the unit suite pins "today". **e2e shares one store, fully parallel**: the
 * one product a spec adds it removes again, and the one deadline a spec marks
 * done it reopens. The job is only ever refused here, so Olympic's audit log
 * stays empty.
 */

const { CATALOG } = fixtureIds;

const deadlineRow = (page: Page, standing: RegExp) =>
  page.locator("tbody tr", {
    has: page.locator("[data-deadline-standing]", { hasText: standing }),
  });

test.describe("P3 — Priya runs Cascade's obligations", () => {
  test.use({ storageState: storageStateFor("p3") });

  test("the page shows what is owed, by when, and which law says so", async ({
    page,
  }) => {
    await page.goto("/obligations");
    await expect(page.locator("#page-title")).toHaveText(
      "Producer obligations",
    );
    await expect(
      page.getByText(/^From your products and the states you sell in/u),
    ).toBeVisible();
    await expect(page.locator('[data-check-now="true"]').first()).toBeVisible();
    // Every deadline row carries a status and a citation.
    const standings = page.locator("[data-deadline-standing]");
    await expect(standings.first()).toBeVisible();
    for (const value of await standings.evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute("data-deadline-standing")),
    )) {
      expect(["open", "overdue", "completed", "withdrawn"]).toContain(value);
    }

    // California's panel: a deadline, "No date yet" with the event, and the
    // coverage version that takes effect later (Rule 8.14).
    await page.goto("/obligations?tab=states&state=US-CA");
    const panel = page.locator('[data-obligation-state-panel="US-CA"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator("[data-state-law]")).toContainText("PRC");
    await expect(
      panel.locator("[data-obligation-no-date]").first(),
    ).toContainText(/^No date yet — /u);
    await expect(panel.locator("[data-state-later-versions]")).toContainText(
      "takes effect",
    );
    await expect(
      panel.locator("[data-obligation-citation]").first(),
    ).not.toBeEmpty();
  });

  test('a state with no rules reads "No producer rules on file"', async ({
    page,
  }) => {
    await page.goto("/obligations?tab=states");
    await expect(page.locator('[data-no-rules="US-FL"]')).toHaveText(
      "No producer rules on file for Florida. This doesn't mean none apply.",
    );
  });

  test("a product with no weight on file says Can't tell, never Doesn't apply", async ({
    page,
  }) => {
    await page.goto("/obligations?tab=products");
    // The table, not the phone card that repeats a row's second line.
    const table = page.getByRole("table");
    const harbor = table.locator(
      `[data-product-bands="${fixtureIds.PRODUCER_PRODUCT.harborTrollingLfp}"]`,
    );
    await expect(harbor).toContainText("Can't tell in WA: weight not recorded");
    await expect(harbor).not.toContainText("Not covered");
    await expect(
      table.locator(
        `[data-product-missing="${fixtureIds.PRODUCER_PRODUCT.harborTrollingLfp}"]`,
      ),
    ).toContainText("An Admin can add");
  });

  test("P3 adds a product and sees its states and bands, then removes it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/obligations?tab=products");
    // A retry finds it already declared: remove it first, so the add is real.
    const leftover = page.locator(
      `[data-product-entry="${CATALOG.mobilityScooterSla}"]`,
    );
    if ((await leftover.count()) > 0) {
      await removeRidgeline(page);
    }

    await page.locator('[data-add-product="true"]').first().click();
    const dialog = page.locator('[data-add-product-dialog="true"]');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-add-product-entry="true"]').click();
    await page.getByRole("option", { name: /Ridgeline RM-24V50/u }).click();
    await dialog.locator('[data-state-option="US-WA"]').click();
    await dialog.locator('[data-state-option="US-DC"]').click();
    await dialog.locator('[data-add-product-submit="true"]').click();
    await expect(dialog).toHaveCount(0);

    // Washington and DC put the same pack in different classes (Rule 8.2).
    const row = page.locator("tbody tr", {
      has: page.locator(`[data-product-entry="${CATALOG.mobilityScooterSla}"]`),
    });
    await expect(row.locator('[data-product-band="US-WA"]')).toHaveText(
      "Large format battery in WA",
    );
    await expect(row.locator('[data-product-band="US-DC"]')).toHaveText(
      "Not covered in DC",
    );

    await removeRidgeline(page);
  });

  test("P3 marks a deadline done with a note, then reopens it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Illinois' participation deadline is this spec's own: nothing else marks it.
    await page.goto("/obligations?state=US-IL");
    const open = deadlineRow(page, /Open|Overdue/u).filter({
      hasText: "Join an approved battery stewardship plan.",
    });
    await expect(open).toHaveCount(1);
    await open.locator("[data-mark-done]").click();
    const dialog = page.locator("[data-mark-done-dialog]");
    await expect(dialog).toBeVisible();
    await dialog
      .locator('[data-mark-done-note="true"]')
      .fill("Joined The Battery Network for Illinois — e2e.");
    await dialog.locator('[data-mark-done-reference="true"]').fill("BN-IL-E2E");
    await dialog.locator('[data-mark-done-submit="true"]').click();
    await expect(dialog).toHaveCount(0);

    const done = deadlineRow(page, /Done/u).filter({
      hasText: "Join an approved battery stewardship plan.",
    });
    await expect(done).toHaveCount(1);
    await expect(done.locator("[data-deadline-completion]")).toContainText(
      "Joined The Battery Network for Illinois — e2e.",
    );

    // Check now never undoes it (Rule 8.12).
    await page.locator('[data-check-now="true"]').first().click();
    await expect(page.locator("[data-check-now-error]")).toHaveCount(0);
    await expect(done).toHaveCount(1);

    await done.locator("[data-reopen]").click();
    const reopen = page.locator("[data-reopen-dialog]");
    await reopen
      .locator('[data-reopen-reason="true"]')
      .fill("Reopened by the e2e suite.");
    await reopen.locator('[data-reopen-confirm="true"]').click();
    await expect(reopen).toHaveCount(0);
    await expect(
      deadlineRow(page, /Open|Overdue/u).filter({
        hasText: "Join an approved battery stewardship plan.",
      }),
    ).toHaveCount(1);
  });

  test("the CSV carries the Rule 8.16 columns", async ({ page }) => {
    const response = await page.request.get("/api/exports/obligations");
    expect(response.status()).toBe(200);
    const body = (await response.text()).replace(/^﻿/u, "");
    const [headerLine] = body.split("\r\n");
    expect(headerLine).toBe(OBLIGATION_CSV_HEADERS.join(","));
    expect(body).toContain("No producer rules on file for Florida");
  });

  test("the dashboard opens obligations", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Open obligations" }).first(),
    ).toBeVisible();
  });
});

async function removeRidgeline(page: Page): Promise<void> {
  const row = page.locator("tbody tr", {
    has: page.locator(`[data-product-entry="${CATALOG.mobilityScooterSla}"]`),
  });
  await row.locator("[data-remove-product]").click();
  const dialog = page.locator("[data-remove-product-dialog]");
  await dialog
    .locator('[data-remove-product-reason="true"]')
    .fill("Added by the e2e suite.");
  await dialog.locator('[data-remove-product-confirm="true"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toHaveCount(0);
}

test.describe("P2 reads with no controls (Rule 8.15)", () => {
  test.use({ storageState: storageStateFor("p2") });

  test("the page, and nothing to change it with", async ({ page }) => {
    await page.goto("/obligations");
    await expect(page.locator("#page-title")).toHaveText(
      "Producer obligations",
    );
    await expect(
      page.locator("[data-deadline-standing]").first(),
    ).toBeVisible();
    await expect(page.locator("[data-check-now]")).toHaveCount(0);
    await expect(page.locator("[data-mark-done]")).toHaveCount(0);
    await expect(page.locator("[data-reopen]")).toHaveCount(0);
    await page.goto("/obligations?tab=products");
    await expect(page.locator("[data-add-product]")).toHaveCount(0);
    await expect(page.locator("[data-remove-product]")).toHaveCount(0);
  });
});

test.describe("P5 reads with no live controls (Rule 8.15, E-8a)", () => {
  test.use({ storageState: storageStateFor("p5") });

  test("controls shown disabled with the reason, and export enabled", async ({
    page,
  }) => {
    await page.goto("/obligations");
    await expect(
      page.locator("[data-deadline-standing]").first(),
    ).toBeVisible();
    for (const selector of ["[data-check-now]", "[data-mark-done]"]) {
      const controls = page.locator(selector);
      expect(await controls.count()).toBeGreaterThan(0);
      for (const disabled of await controls.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-disabled")),
      )) {
        expect(disabled).toBe("true");
      }
    }
    // Destructive controls are absent, not greyed out.
    await expect(page.locator("[data-reopen]")).toHaveCount(0);
    await expect(
      page.locator('[data-obligations-export="true"]'),
    ).toBeVisible();
  });
});

test.describe("P1 has no obligations page (Rule 8.15)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("is turned back to the dashboard, and sees no nav item", async ({
    page,
  }) => {
    await page.goto("/obligations");
    await expect(page.locator("#page-title")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("link", { name: "Obligations" })).toHaveCount(
      0,
    );
  });
});

test.describe("the producer-obligations job", () => {
  const JOB = "/api/jobs/producer-obligations";

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
      expect((await response.text()).toLowerCase()).not.toContain(
        E2E_CRON_SECRET,
      );
    }
  });

  test("answers GET with 405 — a job is never triggered by a read", async ({
    request,
  }) => {
    expect((await request.get(JOB)).status()).toBe(405);
  });
});
