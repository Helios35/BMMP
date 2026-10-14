import { expect, test } from "@playwright/test";

import {
  DUPLICATE_PHOTO_AFTER,
  DUPLICATE_PHOTO_BEFORE,
} from "@/components/extraction-review/review-copy";
import { REVIEW_REASON_CODE_LABELS } from "@/domain/taxonomy/review-reason-code";

import { logCleanBattery, openReview } from "./support/intake-flow";
import { storageStateFor } from "./support/roles";

/**
 * The duplicate-photo check, from the outside — D-56 level 1, D-63 #5;
 * reviewer item "same photo on two batteries → second lands in review saying
 * why, no score".
 *
 * **The only spec that sends a fixture's exact bytes** (`exactBytes`). Every
 * other upload sends a byte-unique copy, so nothing else in the shared store
 * shares these bytes — and this test does not depend on whether it, or a
 * retry of it, ran before: the first record is logged and the second is
 * asserted against **that** record.
 */

test.describe("a photo already on another battery (D-56 level 1)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("the second record lands in review, names the first, and shows no score", async ({
    page,
  }) => {
    test.slow();
    const first = await logCleanBattery(page, { exactBytes: true });

    await openReview(page, "label-clean.png", { exactBytes: true });
    const banner = page.locator("[data-gate-banner]");
    await expect(banner).toBeVisible();
    await expect(
      banner.locator('[data-gate-reason="duplicate_photo"]'),
    ).toHaveText(REVIEW_REASON_CODE_LABELS.duplicate_photo);
    const named = banner.locator(`[data-duplicate-record="${first.recordId}"]`);
    await expect(named).toHaveText(
      `${DUPLICATE_PHOTO_BEFORE}${first.recordNumber}${DUPLICATE_PHOTO_AFTER}`,
    );
    await expect(named.locator("a")).toHaveAttribute(
      "href",
      `/batteries/${first.recordId}`,
    );
    // A reason to look, never a verdict (Rule 1.25).
    await expect(page.locator("[data-review-card]")).not.toContainText(/%/);
    await expect(page.locator("main")).not.toContainText(
      /probability|likelihood|chance of/i,
    );

    // The record is in review as a whole (Rule 2.14), and says why there.
    await banner.locator("[data-save-to-queue]").click();
    await page.waitForURL(/\/review/);
    await expect(
      page.locator('[data-gate-reason="duplicate_photo"]').first(),
    ).toBeVisible();
  });
});
