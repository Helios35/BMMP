import { expect, test, type Page } from "@playwright/test";

import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * **D-71 — a damaged/defective record whose chemistry has no packaging rule
 * on file holds departure**, with that reason (Rule 6.16; brief b1a-08
 * outcome 4).
 *
 * The fixture draft SH-0003 carries BR-0006, a swollen lithium pack the
 * `transport.ddr_packaging` rule covers, and BR-0007, a leaking sealed
 * lead-acid battery it does not. The hold is stated as soon as it is
 * knowable — on the shipment and on step 3, before any paper — and names only
 * the record without a rule. Nothing here writes: SH-0003 is read, never
 * changed, so every spec that reads it reads the same draft.
 *
 * The lithium half departing with its packet is proven in `papers.spec.ts`,
 * the one spec that may make Cascade's 24-hour number verified.
 */

const { SHIPMENT } = fixtureIds;

async function expectHeldOnTheNoRuleRecord(page: Page): Promise<void> {
  const notice = page.locator(
    '[data-hard-block-notice="ddr-packaging-gap"][data-hard-block-state="blocked"]',
  );
  await expect(notice).toBeVisible();
  await expect(
    notice.locator('[data-hard-block-item="BR-0007"]'),
  ).toBeVisible();
  // The lithium record has its rule; only the gap is named.
  await expect(notice.locator("[data-hard-block-item]")).toHaveCount(1);
  // No rule on file means no citation to print — said, never invented.
  await expect(
    notice.locator('[data-hard-block-citation="missing"]'),
  ).toBeVisible();
}

test.describe("P1 — the hold, and the way out of it", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("the draft names BR-0007 as holding departure, and offers changing the contents", async ({
    page,
  }) => {
    await page.goto(`/shipments/${SHIPMENT.mixedDdr}`);
    await expectHeldOnTheNoRuleRecord(page);
    await expect(
      page.locator(
        '[data-hard-block-notice="ddr-packaging-gap"] [data-hard-block-path="change"]',
      ),
    ).toHaveAttribute(
      "href",
      `/shipments/new?shipment=${SHIPMENT.mixedDdr}&step=1`,
    );
  });

  test("step 3 states the same hold before any paper is generated", async ({
    page,
  }) => {
    await page.goto(`/shipments/new?shipment=${SHIPMENT.mixedDdr}&step=3`);
    await expect(page.locator("[data-precondition-checklist]")).toBeVisible();
    await expectHeldOnTheNoRuleRecord(page);
  });
});

test.describe("P2 — reads the hold, with nothing to act on", () => {
  test.use({ storageState: storageStateFor("p2") });

  test("the same notice, without a path P2 cannot take", async ({ page }) => {
    await page.goto(`/shipments/${SHIPMENT.mixedDdr}`);
    await expectHeldOnTheNoRuleRecord(page);
    await expect(
      page.locator(
        '[data-hard-block-notice="ddr-packaging-gap"] [data-hard-block-path]',
      ),
    ).toHaveCount(0);
  });
});
