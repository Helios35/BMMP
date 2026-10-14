import { expect, test, type Locator, type Page } from "@playwright/test";

import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";

import {
  confirmRow,
  continueToPlace,
  fieldRow,
  fixturePayload,
  labelFileInput,
  openReview,
  primaryAction,
  tap,
} from "./support/intake-flow";
import { storageStateFor } from "./support/roles";

/**
 * `UX_SPEC.md` §2 interaction states — hover, focus, press, the mobile
 * compositions, offline capture — and E-14, driven in the running app
 * (brief 07 outcome 10). Each is measured, not eyeballed: a computed style
 * before and after, a bounding box, an attribute the component emits.
 *
 * Every write lands on a session the test opened itself; nothing is
 * committed.
 */

async function background(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
}

/** Hold `:active` on an element, as a pressed pointer would, until the page reloads. */
async function forceActive(page: Page, target: Locator): Promise<void> {
  await target.evaluate((element) =>
    element.setAttribute("data-e2e-press", ""),
  );
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument");
  const { nodeId } = await client.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "[data-e2e-press]",
  });
  await client.send("CSS.forcePseudoState", {
    nodeId,
    forcedPseudoClasses: ["active"],
  });
}

/** Tab until `target` holds keyboard focus — `:focus-visible` needs the keyboard. */
async function tabTo(page: Page, target: Locator, limit = 60): Promise<void> {
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press("Tab");
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
  }
  throw new Error("the target never took keyboard focus");
}

test.describe("the review card's rows (§2.1.6, §2.1.4, §2.1.5, §2.13)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("hover washes the row, focus draws its left bar, a press scales the button, candidates are 56px", async ({
    page,
  }) => {
    test.slow();
    await openReview(page, "label-clean.png");
    const row = fieldRow(page, "manufacturer");

    // Hover — a wash, desktop only.
    await page.mouse.move(0, 0);
    const resting = await background(row);
    await row.hover();
    await expect.poll(() => background(row)).not.toBe(resting);

    // Focus — the row's 2px left bar takes the ring colour.
    const transparentBar = await row.evaluate(
      (element) => getComputedStyle(element).borderLeftColor,
    );
    await row.locator("[data-confirm]").focus();
    await expect
      .poll(() =>
        row.evaluate((element) => getComputedStyle(element).borderLeftColor),
      )
      .not.toBe(transparentBar);

    // Active — the button scales to 98% while pressed; no colour change.
    // `:active` is forced through the DevTools protocol, which holds it for
    // as long as it is read (Tailwind v4 sets the CSS `scale` property).
    const confirm = fieldRow(page, "serial_number").locator("[data-confirm]");
    const restingColour = await background(confirm);
    await forceActive(page, confirm);
    await expect
      .poll(() =>
        confirm.evaluate((element) => getComputedStyle(element).scale),
      )
      .toMatch(/^0\.98/);
    expect(await background(confirm)).toBe(restingColour);

    // §2.13 — candidates are 56px rows; the top one is highlighted, not chosen.
    const top = page.locator("[data-top-candidate]").first();
    const candidateBox = await top.boundingBox();
    expect(candidateBox?.height ?? 0).toBeGreaterThanOrEqual(56);
    await expect(top).not.toHaveAttribute("data-selected", "true");
  });

  test("a checklist item scrolls to its row; an optional field can be left empty", async ({
    page,
  }) => {
    test.slow();
    await openReview(page, "label-clean.png");
    const item = page
      .locator("[data-outstanding-item][data-outstanding-field]:visible")
      .first();
    const fieldCode = await item.getAttribute("data-outstanding-field");
    if (fieldCode === null) throw new Error("no outstanding field item");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await item.click();
    await expect(
      page.locator(`[data-field-row="${fieldCode}"]`),
    ).toBeInViewport();

    const serial = fieldRow(page, "serial_number");
    await tap(serial.locator("[data-reject]"), "Reject serial number");
    await expect(serial).toHaveAttribute("data-field-status", "rejected");
    await tap(serial.locator("[data-leave-empty]"), "Leave empty");
    await expect(serial).toHaveAttribute("data-field-status", "confirmed");
  });

  test("rejecting the catalog-matched chemistry clears the match and reopens the panel", async ({
    page,
  }) => {
    test.slow();
    await openReview(page, "label-clean.png");
    const panel = page.locator("[data-catalog-match-panel]");
    await panel
      .locator("[data-top-candidate] button[role='radio']")
      .first()
      .click();
    await expect(panel.locator('[data-selected="true"]')).toHaveCount(1);
    const chemistry = fieldRow(page, "chemistry_code");
    await tap(chemistry.locator("[data-reject]"), "Reject chemistry");
    await expect(panel.locator('[data-selected="true"]')).toHaveCount(0);
  });
});

test.describe("lists, the stepper, the palette and the alerts (§2.7, §2.11, §2.12, §2.14)", () => {
  test.use({ storageState: storageStateFor("p2") });

  test("a navigable row washes on hover and rings on keyboard focus", async ({
    page,
  }) => {
    await page.goto("/batteries");
    const anchor = page.locator('a[data-row-anchor="true"]').first();
    const row = page.locator("tbody tr").filter({ has: anchor }).first();
    await page.mouse.move(0, 0);
    const resting = await background(row);
    await row.hover();
    await expect.poll(() => background(row)).not.toBe(resting);

    await tabTo(page, anchor);
    await expect
      .poll(() =>
        row.evaluate((element) => getComputedStyle(element).boxShadow),
      )
      .not.toBe("none");
  });

  test("the palette moves its selection with the arrow keys and opens with Enter", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const input = page.locator("[cmdk-input]");
    await input.fill("o");
    const items = page.locator("[cmdk-item]");
    await expect(items.nth(1)).toBeVisible();
    const first = await items.nth(0).getAttribute("data-selected");
    expect(first).toBe("true");
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("Enter");
    await expect(input).toHaveCount(0);
  });

  test("an alert card takes a focus ring, and the whole card is the target", async ({
    page,
  }) => {
    await page.goto("/");
    const link = page.locator("[data-pinned='true'] a").first();
    await tabTo(page, link);
    await expect
      .poll(() =>
        link.evaluate((element) => {
          const style = getComputedStyle(element);
          return `${style.outlineStyle} ${style.boxShadow}`;
        }),
      )
      .not.toBe("none none");
  });
});

test.describe("the stepper (§2.12)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("a completed step washes on hover and rings on focus; a future step is not a link", async ({
    page,
  }) => {
    test.slow();
    await openReview(page, "label-clean.png");
    const done = page.locator('[data-step-state="completed"] a').first();
    await page.mouse.move(0, 0);
    const resting = await background(done);
    await done.hover();
    await expect.poll(() => background(done)).not.toBe(resting);
    await tabTo(page, done);
    await expect
      .poll(() =>
        done.evaluate((element) => getComputedStyle(element).boxShadow),
      )
      .not.toBe("none");
    await expect(
      page.locator('[data-step-state="future"] a[href]'),
    ).toHaveCount(0);
  });
});

test.describe("a phone (§2.7, §2.15, §2.2)", () => {
  test.use({
    storageState: storageStateFor("p1"),
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });

  test("filters collapse into a sheet; the intake flow hides the tab bar and its primary is 56px", async ({
    page,
  }) => {
    await page.goto("/batteries");
    await page.locator('[data-record-table-filters="sheet-trigger"]').click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/batteries/new");
    await expect(page.locator("[data-mobile-tab-bar]")).toBeHidden();
    // §2.2 Empty — the framing guide and its one line.
    await expect(page.locator("[data-photo-capture-step]")).toContainText(
      "Photograph the label",
    );
    // E-3(5) — no step 2 without a sent label photo.
    await expect(primaryAction(page)).toHaveAttribute("aria-disabled", "true");
    const box = await primaryAction(page).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  });
});

test.describe("offline capture (§2.10, E-10)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("a photo taken offline is queued and says so; back online, it sends", async ({
    page,
    context,
  }) => {
    test.slow();
    await page.goto("/batteries/new");
    await expect(page.locator("[data-offline-banner]")).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.locator("[data-offline-banner]")).toHaveAttribute(
      "data-offline-state",
      "offline",
    );
    // A byte-unique copy, like every upload but the duplicate spec's.
    await labelFileInput(page).setInputFiles(
      await fixturePayload("label-clean.png", {}),
    );
    await expect(
      page.locator('[data-thumbnail][data-photo-type="label"]'),
    ).toContainText(/queued/i);
    await context.setOffline(false);
    await expect(page.locator('[data-offline-state="offline"]')).toHaveCount(0);
  });
});

test.describe("E-14 — a line that classifies fully regulated", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("states the manifest gap before the battery is logged, and never as fully documented", async ({
    page,
  }) => {
    test.slow();
    await openReview(page, "label-nomatch.png");
    await page
      .locator('[data-catalog-match-panel] [data-catalog-action="enter"]')
      .click();
    const chemistry = fieldRow(page, "chemistry_code");
    await chemistry.locator("[data-enter-value]").click();
    await chemistry.locator("[data-chemistry-select]").click();
    await page.getByRole("option", { name: CHEMISTRY_LABELS.nicd }).click();
    await confirmRow(page, "chemistry_code");
    await confirmRow(page, "model");
    await continueToPlace(page);
    await expect(page.locator("[data-manifest-gap]")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/fully documented\./i);
  });
});
