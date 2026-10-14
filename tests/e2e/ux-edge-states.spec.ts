import { expect, test, type Locator, type Page } from "@playwright/test";

import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { LABEL_FIELD_CODES } from "@/domain/taxonomy/label-field-code";

import {
  buildShipmentToStepThree,
  createContainer,
  generateLabel,
} from "./support/documents-flow";
import {
  chooseContainer,
  commitIntake,
  confirmCondition,
  confirmRow,
  continueToPlace,
  fieldRow,
  fixturePayload,
  labelFileInput,
  logCleanBattery,
  openReview,
  selectTopCandidate,
  tap,
} from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * The last of `UX_SPEC.md` §2 and §5's reachable states — brief 07 outcome
 * 10: failures at the edges (an upload refused by the network, a photo too
 * small to read, a value this build does not recognise), the empty meters of
 * a new container, a whole-read reject on `/review`, E-2 at intake, and E-14
 * carried from the record to the shipment.
 *
 * Every write lands on a container, session or shipment the test made.
 */

const { CATALOG, CONTAINER, DOCUMENT_RENDER, INTAKE_SESSION } = fixtureIds;

/** A valid 1×1 PNG — far under the legibility floor, readable by every reader. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function background(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
}

/** Hold `:active` on an element through the DevTools protocol. */
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

test.describe("capture at the edges (§2.2, E-3)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("a photo the network refuses retries visibly, then is kept with Retry and Remove", async ({
    page,
  }) => {
    await page.route("**/api/intake/photos", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "about:blank",
          title: "Unavailable",
          status: 503,
          code: "INTEGRATION",
          detail: "The service is unavailable.",
        }),
      }),
    );
    await page.goto("/batteries/new");
    await labelFileInput(page).setInputFiles(
      await fixturePayload("label-clean.png", {}),
    );
    const failures = page.locator("[data-upload-failures]");
    await expect(failures).toBeVisible({ timeout: 15_000 });
    await expect(failures).toHaveAttribute("role", "alert");
    await expect(failures.locator("[data-failed-retry]")).toBeVisible();
    await expect(failures.locator("[data-failed-remove]")).toBeVisible();
    // E-3(5) — no step 2 without a sent label photo.
    await expect(
      page.locator('[data-mobile-action-bar] [data-primary-action="true"]'),
    ).toHaveAttribute("aria-disabled", "true");
    await failures.locator("[data-failed-remove]").click();
    await expect(failures).toHaveCount(0);
  });

  test("a photo too small to read asks before anything is read, and the shutter takes a focus ring", async ({
    page,
  }) => {
    await page.goto("/batteries/new");
    // The shutter is the button beside the hidden file input.
    const shutter = page
      .locator('[data-photo-capture-input][data-photo-type="label"] button')
      .first();
    await tabTo(page, shutter);
    await expect
      .poll(() =>
        shutter.evaluate((element) => getComputedStyle(element).boxShadow),
      )
      .not.toBe("none");

    await labelFileInput(page).setInputFiles({
      name: "label-clean.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    const alert = page.locator("[data-legibility-alert]");
    await expect(alert).toContainText("This may be hard to read");
    await expect(page.locator("[data-legibility-retake]")).toBeVisible();
    await expect(page.locator("[data-legibility-use-anyway]")).toBeVisible();
  });
});

test.describe("the review card (§2.1.4(4), §2.1.5)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("bulk confirm is not offered under three High rows", async ({
    page,
  }) => {
    // The fixture session read with one field in each band.
    await page.goto(
      `/batteries/new?session=${INTAKE_SESSION.spreadInReview}&step=2`,
    );
    await expect(page.locator("[data-review-card]")).toBeVisible();
    expect(
      await page.locator('[data-field-row][data-field-band="high"]').count(),
    ).toBeLessThan(3);
    await expect(page.locator("[data-bulk-confirm]")).toHaveCount(0);
  });

  test("on /review, a whole-read reject keeps the item on the queue, in manual entry", async ({
    page,
  }) => {
    test.slow();
    const sessionId = await openReview(page, "label-low.png");
    await page.locator("[data-gate-banner] [data-save-to-queue]").click();
    await page.waitForURL(/\/review/);
    await tap(page.locator("[data-reject-read]").first(), "Reject this read");
    await page.locator("[data-reject-read-confirm]").click();
    await expect(
      page.locator('[data-field-row][data-field-status="pending"]'),
    ).toHaveCount(LABEL_FIELD_CODES.length);
    // It neither disappeared nor resolved itself (§2.1.5).
    await page.goto("/review");
    await expect(page.locator(`a[href*="${sessionId}"]`).first()).toBeVisible();
  });
});

test.describe("a new container's meters, a value this build does not know, and the toolbar (§2.4, §2.5, §2.3, §2.7, §2.8; E-15)", () => {
  test.use({ storageState: storageStateFor("p2") });

  test("an empty container says no clock is running and shows its fill against capacity", async ({
    page,
  }) => {
    const containerId = await createContainer(page, "meters");
    await page.goto(`/containers/${containerId}`);
    await expect(
      page.locator('[data-meter-state="empty"]').first(),
    ).toContainText("No clock running — this container is empty");
    // §2.5 Empty — nothing in it and no capacity to fill against.
    await expect(page.locator("[data-fill-meter-state]").first()).toContainText(
      /^Empty/,
    );
    // §2.5 Default — `<current> of <capacity> <unit>`, on a drum with both.
    await page.goto(`/containers/${CONTAINER.soundDrum}`);
    await expect(page.locator("[data-fill-meter-state]").first()).toContainText(
      / of /,
    );
  });

  test("an unrecognised stored value renders as stored, in mono — never blank", async ({
    page,
  }) => {
    await page.goto(`/catalog/${CATALOG.vehicleTractionNmc}`);
    const value = page.locator('[data-taxonomy-state="unrecognised"]').first();
    await expect(value).toBeVisible();
    await expect(value).not.toHaveText("");
    expect(
      await value.evaluate((element) => getComputedStyle(element).fontFamily),
    ).toMatch(/mono/i);
  });

  test("a row darkens while pressed; the document toolbar takes a focus ring", async ({
    page,
  }) => {
    await page.goto("/batteries");
    const row = page
      .locator("tbody tr")
      .filter({ has: page.locator('a[data-row-anchor="true"]') })
      .first();
    await page.mouse.move(0, 0);
    const resting = await background(row);
    await forceActive(page, row);
    await expect.poll(() => background(row)).not.toBe(resting);

    await page.goto(`/documents/${DOCUMENT_RENDER.soundDrumLabel}`);
    const print = page.locator("[data-document-print]");
    await tabTo(page, print);
    await expect
      .poll(() =>
        print.evaluate((element) => getComputedStyle(element).boxShadow),
      )
      .not.toBe("none");
  });
});

test.describe("E-2 — intake step 3 with no container", () => {
  test.use({ storageState: storageStateFor("p1Rainier") });

  test("names the requirement and offers Create a container in place; the draft is kept", async ({
    page,
  }) => {
    test.slow();
    const sessionId = await openReview(page, "label-clean.png");
    await confirmRow(page, "model");
    await selectTopCandidate(page);
    await confirmRow(page, "chemistry_code");
    await continueToPlace(page);
    const empty = page.locator("[data-zero-containers]");
    await expect(empty).toHaveAttribute("role", "alert");
    await expect(empty).toContainText(
      "needs a container before you can log it",
    );
    await expect(
      page.getByRole("button", { name: /create a container/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`session=${sessionId}`));
  });
});

test.describe("E-14 and E-9 carried to the shipment", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("a fully regulated line: the record, step 3 and the shipment all state the manifest gap, never fully documented", async ({
    page,
  }) => {
    test.slow();
    const containerId = await createContainer(
      page,
      "regulated",
      "fully_regulated_sound",
    );
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
    await confirmCondition(page, "none_observed", "sound");
    await chooseContainer(page, containerId);
    await commitIntake(page);
    await expect(page.locator("[data-manifest-gap]")).toBeVisible();

    await generateLabel(page, containerId);
    const shipmentId = await buildShipmentToStepThree(page, containerId);
    await expect(page.locator("[data-manifest-obligation]")).toBeVisible();
    await page.goto(`/shipments/${shipmentId}`);
    await expect(page.locator("[data-manifest-obligation]")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/fully documented\./i);
  });

  test("a damaged record added after air was chosen is refused at step 1, named, and nothing moves", async ({
    page,
  }) => {
    test.slow();
    // A sound container and a quarantine container, both this test's own.
    const sound = await createContainer(page, "air-sound");
    await logCleanBattery(page, { containerId: sound });
    await generateLabel(page, sound);
    const ddr = await createContainer(page, "air-ddr", "light_category_ddr");
    await openReview(page, "label-clean.png");
    await confirmRow(page, "model");
    await selectTopCandidate(page);
    await confirmRow(page, "chemistry_code");
    await continueToPlace(page);
    await confirmCondition(page, "swelling", "damaged_or_defective");
    await chooseContainer(page, ddr);
    const damaged = await commitIntake(page);
    const damagedNumber =
      (await page.locator("#page-title").textContent())?.trim() ?? "";
    await generateLabel(page, ddr);

    // Air, chosen while only the sound container is aboard.
    await page.goto(`/shipments/new?containers=${sound}`);
    await page.locator("[data-contents-continue]").click();
    await page.waitForURL(/step=2/);
    await page.locator('[data-mode-option="air"]').getByRole("radio").click();
    const fields: Readonly<Record<string, string>> = {
      destinationFacilityName: `e2e air ${Date.now().toString(36)}`,
      line1: "1 Airport Way",
      city: "Spokane",
      region: "WA",
      postalCode: "99224",
      carrierName: "Coleridge Air",
    };
    for (const [name, value] of Object.entries(fields)) {
      await page.locator(`[data-transport-field="${name}"]`).fill(value);
    }
    await page.locator("[data-transport-save]").click();
    await page.waitForURL(/shipment=.*step=3/);
    const shipmentId = new URL(page.url()).searchParams.get("shipment") ?? "";

    // Now the damaged record tries to come aboard. It never enters the
    // selection: step 1 refuses its row with the reason, and the damaged pack
    // is named by its record (E-9; Rules 6.7, 6.9).
    await page.goto(`/shipments/new?shipment=${shipmentId}&step=1`);
    await expect(page.locator("[data-contents-step]")).toBeVisible();
    const row = page.locator(`[data-candidate="${ddr}"]`);
    await expect(row).toHaveAttribute("data-admission", "damaged_onto_air");
    await expect(row.locator("[data-admission-reason]")).not.toHaveText("");
    await row.click();
    await expect(row).toHaveAttribute("data-selected", "false");
    // Nothing moved: the shipment still holds only the sound container.
    await page.goto(`/shipments/${shipmentId}?tab=contents`);
    await expect(page.locator("main")).not.toContainText(damagedNumber);
    expect(damaged).not.toBe("");
  });
});

test.describe("§2.6 — the blocked control repeats its reason", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("the unavailable Air option explains itself on hover, and the notice is not the only place it says so", async ({
    page,
  }) => {
    test.slow();
    const ddr = await createContainer(page, "tooltip", "light_category_ddr");
    await openReview(page, "label-clean.png");
    await confirmRow(page, "model");
    await selectTopCandidate(page);
    await confirmRow(page, "chemistry_code");
    await continueToPlace(page);
    await confirmCondition(page, "swelling", "damaged_or_defective");
    await chooseContainer(page, ddr);
    await commitIntake(page);
    await generateLabel(page, ddr);
    await page.goto(`/shipments/new?step=2&containers=${ddr}`);
    const air = page.locator('[data-mode-option="air"]');
    await air.hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expect(page.locator('[data-hard-block-notice="air"]')).toBeVisible();
    await expect(air).toHaveAttribute("data-mode-available", "false");
    // Not the overdue fixture drum, not the sound drum — this test's own.
    expect(ddr).not.toBe(CONTAINER.quarantineDrum);
  });
});
