import { expect, test } from "@playwright/test";

import {
  confirmRow,
  fieldRow,
  openReview,
  primaryAction,
  tap,
} from "./support/intake-flow";
import { storageStateFor } from "./support/roles";

/**
 * Sprint plan row 21, folded into brief 07 (D-63 #9): **a re-read replaces the
 * draft**, so the flow asks first. "Reading the label again replaces what's on
 * this screen, including your changes." → **Read again** / **Keep this
 * reading**.
 */

const WARNING =
  "Reading the label again replaces what's on this screen, including your changes.";

test.describe("reading the label again (plan row 21)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("asks first; Keep this reading keeps the changes, Read again replaces them", async ({
    page,
  }) => {
    test.slow();
    const sessionId = await openReview(page, "label-clean.png");
    await confirmRow(page, "model");

    // Back to capture, with a reading in hand.
    await page.goto(`/batteries/new?session=${sessionId}&step=1`);
    await tap(primaryAction(page), "Read label");
    const dialog = page.locator("[data-reread-dialog]");
    await expect(dialog).toContainText(WARNING);

    await dialog.locator("[data-reread-keep]").click();
    await page.waitForURL((url) => url.searchParams.get("step") === "2");
    await expect(fieldRow(page, "model")).toHaveAttribute(
      "data-field-status",
      "confirmed",
    );

    await page.goto(`/batteries/new?session=${sessionId}&step=1`);
    await tap(primaryAction(page), "Read label");
    await page.locator("[data-reread-confirm]").click();
    await page.waitForURL((url) => url.searchParams.get("step") === "2");
    await expect(fieldRow(page, "model")).toHaveAttribute(
      "data-field-status",
      "pending",
    );
  });
});
