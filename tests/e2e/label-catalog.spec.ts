import { expect, test, type Page } from "@playwright/test";

import { openReview } from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * **Rule 2.35 — the label disagrees with its exact catalog match** (T-52
 * `label_catalog_mismatch`; `UX_SPEC.md` §3.8a; brief b1a-08 outcome 5).
 *
 * An exact match settles *which* battery this is; it does not make the
 * label's own figures agree with the catalog's. When they disagree beyond the
 * match configuration's tolerance the read is held for a person, and the card
 * says what disagrees — **Label says / Catalog says**, per field — rather than
 * a score or a flag.
 *
 * The fixture label reader keys its scenario on the file name:
 * `label-mismatch.png` reads exactly as the clean label except its voltage,
 * which reads `400 V`. Every upload is a byte-unique copy (`fixturePayload`).
 */

const { INTAKE_SESSION } = fixtureIds;

function voltageRow(page: Page, within: string) {
  return page.locator(`${within} [data-label-catalog-field="voltage"]`);
}

test.describe("Rule 2.35 — label vs catalog", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("an exact match whose label voltage disagrees is held for review, says what disagrees, and goes to the queue with it", async ({
    page,
  }) => {
    const sessionId = await openReview(page, "label-mismatch.png");

    const banner = page.locator("[data-gate-banner]");
    await expect(
      banner.locator('[data-gate-reason="label_catalog_mismatch"]'),
    ).toBeVisible();
    // One row per disagreeing field — the voltage, and nothing the label and
    // the catalog agree on.
    await expect(
      banner.locator("[data-label-catalog] [data-label-catalog-field]"),
    ).toHaveCount(1);
    const row = voltageRow(page, "[data-gate-banner]");
    await expect(row.locator("[data-label-says]")).toHaveText("400 V");
    const catalogSays = row.locator("[data-catalog-says]");
    await expect(catalogSays).not.toHaveText("");
    await expect(catalogSays).not.toHaveText("400 V");
    // The entry is linked, so the whole of it can be read.
    await expect(banner.locator("[data-label-catalog-entry]")).toBeVisible();

    await banner.locator("[data-save-to-queue]").click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/review" &&
        url.searchParams.get("item") === sessionId,
    );
    const pane = `[data-queue-item-pane="intake"][data-session-id="${sessionId}"]`;
    await expect(page.locator(pane)).toBeVisible();
    await expect(
      voltageRow(page, pane).locator("[data-label-says]"),
    ).toHaveText("400 V");
    await expect(
      page.locator(
        `[data-queue-item="${sessionId}"] [data-queue-reason="label_catalog_mismatch"]`,
      ),
    ).toBeVisible();
  });

  test("the fixture record routed on its label (BR-0008) reads the same on /review", async ({
    page,
  }) => {
    const sessionId = INTAKE_SESSION.labelMismatchInReview;
    await page.goto(`/review?item=${sessionId}`);
    const pane = `[data-queue-item-pane="intake"][data-session-id="${sessionId}"]`;
    await expect(page.locator(pane)).toBeVisible();
    await expect(
      page.locator(`${pane} [data-gate-reason="label_catalog_mismatch"]`),
    ).toBeVisible();
    await expect(
      voltageRow(page, pane).locator("[data-label-says]"),
    ).toHaveText("400 V");
  });
});
