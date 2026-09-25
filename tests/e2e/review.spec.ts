import { expect, test, type Page } from "@playwright/test";

import { READ_ONLY_BANNER_MESSAGE } from "@/components/access/read-only-banner";
import { BATTERY_RECORD_STATUS_LABELS } from "@/domain/taxonomy/battery-record-status";
import {
  CONFIRM_AND_COMMIT,
  UNIDENTIFIED_WHY,
} from "@/features/review/review-copy";

import {
  confirmCondition,
  confirmRow,
  openReview,
  selectTopCandidate,
  tap,
} from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * **`/review` — one route, two screens** (`UX_SPEC.md` §3.8a, §3.8b, E-8b,
 * E-15; `SITE_ARCHITECTURE.md` Flow A-a, CL-1; Rules 2.22, 2.23).
 *
 * Driven from the outside: every item worked here is one this spec put on the
 * queue itself — a low-confidence read saved from `/batteries/new` — so no
 * fixture row another spec asserts on is touched, and nothing reaches into
 * `src/data` (D-15, D-16).
 *
 * - **P1 resolves an item through unit 02's commit**, and it leaves the
 *   queue; a void leaves it too, with a reason. Nothing else empties it.
 * - **P2 sees a different screen**: no card, no Confirm, no Void, no
 *   disabled copy of either, no read-only banner — and what she can do is
 *   there. The server's own refusal of her writes is proven in
 *   `tests/integration/review-actions.test.ts`.
 * - **The badge and the page agree**, read in the same render.
 *
 * P2's filter case uses Cascade's overdue drum: an overdue container accepts
 * no new items (Rule 4.16), so no queued intake can name it and the filter is
 * guaranteed to exclude everything whatever else runs in parallel.
 */

const { CONTAINER } = fixtureIds;

/** A low read, saved to the queue from step 2 — lands on `/review` with the item open. */
async function queueLowRead(page: Page): Promise<string> {
  const sessionId = await openReview(page, "label-low.png");
  await page.locator("[data-gate-banner] [data-save-to-queue]").click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/review" && url.searchParams.get("item") === sessionId,
  );
  await expect(
    page.locator(
      `[data-queue-item-pane="intake"][data-session-id="${sessionId}"]`,
    ),
  ).toBeVisible();
  return sessionId;
}

function pane(page: Page) {
  return page.locator('[data-queue-item-pane="intake"]');
}

test.describe("P1's work queue (§3.8a)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("an item saved to the queue is resolved through the one commit, and leaves the queue", async ({
    page,
  }) => {
    const sessionId = await queueLowRead(page);

    // The item is on the list, oldest-first order aside, saying why it is here.
    const listed = page.locator(`[data-queue-item="${sessionId}"]`);
    await expect(listed).toHaveAttribute("aria-current", "page");
    await expect(listed.locator("[data-queue-reason]").first()).toBeVisible();
    const recordNumber = await listed.getAttribute("data-record-number");
    expect(recordNumber).toMatch(/^BR-\d+/);

    // The same card as step 2, in review mode: Resolve now, never Save to queue.
    await expect(pane(page).locator("[data-review-card]")).toHaveAttribute(
      "data-review-mode",
      "review",
    );
    await expect(pane(page).locator("[data-resolve-now]")).toBeVisible();
    await expect(pane(page).locator("[data-save-to-queue]")).toHaveCount(0);

    await confirmRow(page, "model");
    await selectTopCandidate(page);
    await confirmRow(page, "chemistry_code");
    await confirmRow(page, "serial_number");
    await confirmCondition(page, "none_observed", "sound");

    const primary = pane(page).locator(
      "[data-review-action-bar] [data-primary-action]",
    );
    await expect(primary).toContainText(CONFIRM_AND_COMMIT);
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await tap(primary, "Confirm and commit");

    await page.waitForURL(
      (url) =>
        url.pathname === "/review" &&
        url.searchParams.get("outcome") === "logged",
    );
    const notice = page.locator('[data-review-resolved="logged"]');
    await expect(notice).toContainText(recordNumber ?? "");
    await expect(page.locator(`[data-queue-item="${sessionId}"]`)).toHaveCount(
      0,
    );

    await notice.locator("[data-resolved-record]").click();
    await page.waitForURL((url) => /^\/batteries\/[^/]+$/.test(url.pathname));
    await expect(page.locator("[data-page-header]").first()).toContainText(
      BATTERY_RECORD_STATUS_LABELS.classified,
    );
  });

  test("an item voided with a stated reason leaves the queue, and the record is kept as voided", async ({
    page,
  }) => {
    const sessionId = await queueLowRead(page);
    const recordNumber = await page
      .locator(`[data-queue-item="${sessionId}"]`)
      .getAttribute("data-record-number");

    await pane(page).locator("[data-void-item]").click();
    const dialog = page.locator("[data-void-dialog]");
    await expect(dialog.locator("[data-void-confirm]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await dialog
      .locator("[data-void-reason]")
      .fill("Logged twice by mistake — the same pack as the one before");
    await dialog.locator("[data-void-confirm]").click();

    await page.waitForURL(
      (url) => url.searchParams.get("outcome") === "voided",
    );
    await expect(page.locator('[data-review-resolved="voided"]')).toContainText(
      recordNumber ?? "",
    );
    await expect(page.locator(`[data-queue-item="${sessionId}"]`)).toHaveCount(
      0,
    );
    await page.locator("[data-resolved-record]").click();
    await expect(page.locator("[data-page-header]").first()).toContainText(
      BATTERY_RECORD_STATUS_LABELS.voided,
    );
  });

  test("the nav badge and the page count the same queue, in the same render", async ({
    page,
  }) => {
    await page.goto("/review");
    const listed = await page.locator("[data-queue-item]").count();
    expect(listed).toBeGreaterThan(0);
    const badge = page.locator('a[href="/review"] [data-nav-badge]').first();
    await expect(badge).toHaveText(new RegExp(`^${listed}`));
  });

  test("on a phone the list opens an item full-screen, with Back to the queue", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/review");
    const list = page.locator("[data-queue-list]");
    await expect(list).toBeVisible();
    await expect(page.locator("[data-queue-item-pane]")).toBeHidden();

    await list.locator("[data-queue-item]").first().click();
    await page.waitForURL((url) => url.searchParams.get("item") !== null);
    await expect(page.locator("[data-queue-item-pane]")).toBeVisible();
    await expect(list).toBeHidden();

    await tap(
      page.locator("[data-queue-item-nav] [data-back-to-queue]"),
      "Back to the queue",
    );
    await page.waitForURL((url) => url.searchParams.get("item") === null);
    await expect(list).toBeVisible();
  });
});

test.describe("P2's view — a different screen, not a disabled copy (§3.8b, E-8b)", () => {
  test.use({ storageState: storageStateFor("p2") });

  test("says what the screen is for, groups by container, and carries no card, no Confirm, no Void and no banner", async ({
    page,
  }) => {
    await page.goto("/review");
    const view = page.locator("[data-unidentified-inventory]");
    await expect(view).toBeVisible();

    const purpose = page.locator("[data-inventory-purpose]");
    await expect(purpose).toHaveAttribute("data-intent", "neutral");
    await expect(purpose).toContainText(UNIDENTIFIED_WHY);
    expect(
      await page.locator("[data-inventory-group]").count(),
    ).toBeGreaterThan(0);

    // Absent, not disabled.
    await expect(page.locator("[data-review-card]")).toHaveCount(0);
    await expect(page.locator("[data-void-item]")).toHaveCount(0);
    await expect(page.locator("[data-queue-item-pane]")).toHaveCount(0);
    await expect(page.locator("[data-primary-action]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /confirm|void|reject|commit/i }),
    ).toHaveCount(0);
    await expect(page.getByText(READ_ONLY_BANNER_MESSAGE)).toHaveCount(0);

    // Her count, and her badge, from the same render.
    const headline =
      (await purpose.locator("[data-slot=alert-title]").textContent()) ?? "";
    const count = Number(headline.match(/^(\d+)/)?.[1] ?? "NaN");
    await expect(
      page.locator('a[href="/review"] [data-nav-badge]').first(),
    ).toHaveText(new RegExp(`^${count}`));
  });

  test("opens a read-only summary with the record and nothing to act on", async ({
    page,
  }) => {
    await page.goto("/review");
    await page.locator("[data-open-summary]").first().click();
    await page.waitForURL((url) => url.searchParams.get("item") !== null);
    const summary = page.locator("[data-inventory-summary]");
    await expect(summary).toBeVisible();
    await expect(summary.locator("[data-summary-field]").first()).toBeVisible();
    await expect(summary.locator("[data-summary-open-record]")).toBeVisible();
    await expect(
      summary.getByRole("button", { name: /confirm|void|reject|change/i }),
    ).toHaveCount(0);
  });

  test("E-15 — filters that exclude everything say so, with Clear filters, never the all-identified copy", async ({
    page,
  }) => {
    await page.goto(`/review?container=${CONTAINER.overdueDrum}`);
    const empty = page.locator("[data-table-empty='filtered']");
    await expect(empty).toBeVisible();
    await expect(page.locator("[data-review-empty]")).toHaveCount(0);
    await empty.locator("[data-clear-narrowing]").click();
    await page.waitForURL((url) => url.search === "");
    await expect(page.locator("[data-inventory-group]").first()).toBeVisible();
  });
});

test.describe("the roles that hold nothing on /review", () => {
  test.use({ storageState: storageStateFor("p3") });

  test("are redirected with the restriction named, and see no nav item", async ({
    page,
  }) => {
    await page.goto("/review");
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.locator('a[href="/review"]')).toHaveCount(0);
  });
});
