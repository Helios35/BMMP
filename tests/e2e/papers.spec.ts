import { expect, test, type Browser, type Page } from "@playwright/test";

import { LOT_STATUS_LABELS } from "@/domain/taxonomy/lot-status";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import {
  EMERGENCY_ATTESTATION,
  EMERGENCY_UNVERIFIED_HEADLINE,
} from "@/features/settings/copy";
import { E11_ASK_WHO, E11_TITLE } from "@/features/shipments/shipment-copy";

import {
  buildShipmentToStepThree,
  continueByGroundToStepThree,
  createContainer,
  expectDrawnPdf,
  generateLabel,
} from "./support/documents-flow";
import {
  chooseContainer,
  commitIntake,
  confirmCondition,
  confirmRow,
  continueToPlace,
  logCleanBattery,
  openReview,
  selectTopCandidate,
  tap,
} from "./support/intake-flow";
import { storageStateFor, type PersonaKey } from "./support/roles";

/**
 * The 24-hour emergency contact number and the shipping papers it unlocks —
 * brief 07 outcomes 1 and 3, E-11, Rules 5.3, 5.6, 5.7, D-32, D-63.
 *
 * ## Why this is one test, in order
 *
 * **This is the only spec that changes Cascade's 24-hour number**, and the
 * e2e store is shared by a fully parallel suite. Every other spec was made
 * independent of the number's state (b1a-07 moved E-11 here from
 * `shipments.spec.ts` and the draft print from `documents.spec.ts`), and this
 * one sets the state it needs at each step rather than assuming one: it opens
 * by **changing** the number, which clears any verification an earlier
 * attempt left, so a retry starts from the same place.
 *
 * Every write lands on a container and a shipment this test creates. No
 * fixture container is labelled, emptied or departed.
 *
 * ## Why the file runs in order
 *
 * A shipment departs only with an issued paper, and a paper issues only
 * while the number is verified — so every departure in the suite lives here,
 * after the first test has left the number verified. `b1a-08`'s second test
 * ships a lot and departs a damaged/defective lithium shipment with its
 * packet; it re-verifies first if a retry left the number unverified, and
 * never changes it. `b2-09`'s third issues an air paper and records a recall
 * on its record, which voids the paper (Rule 6.14).
 */
test.describe.configure({ mode: "serial" });

/** A run-unique, well-formed number — changing it clears the verification. */
function runNumber(): string {
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `+1-800-555-${digits}`;
}

/** Today at Cascade's site, as `/settings/organization` prints a date. */
function todayAtCascade(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());
}

async function as(
  browser: Browser,
  persona: PersonaKey,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    storageState: storageStateFor(persona),
  });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

/** Change the number on `/settings/organization` — any change clears the verification. */
async function changeNumber(page: Page): Promise<string> {
  const number = runNumber();
  await page.goto("/settings/organization");
  await page.locator('[data-emergency-field="phone"]').fill(number);
  await tap(page.locator("[data-emergency-save]"), "Save changes");
  await expect(
    page.locator('[data-emergency-verification="not-in-force"]'),
  ).toBeVisible();
  await expect(page.locator("[data-verification-state]")).toHaveAttribute(
    "data-verification-state",
    "not-in-force",
  );
  await expect(page.locator('[data-emergency-field="phone"]')).toHaveValue(
    number,
  );
  return number;
}

/** Verify from the dialog; the attestation sentence is the one D-63 authors. */
async function verify(page: Page): Promise<void> {
  await tap(page.locator("[data-emergency-verify]"), "Verify this number");
  const dialog = page.locator("[data-emergency-verify-dialog]");
  await expect(dialog.locator("[data-emergency-attestation]")).toHaveText(
    EMERGENCY_ATTESTATION,
  );
  await dialog.locator("[data-emergency-verify-confirm]").click();
}

/** Verify the number as it stands, only if it is not verified already. */
async function ensureVerified(page: Page): Promise<void> {
  await page.goto("/settings/organization");
  const state = page.locator("[data-verification-state]");
  await expect(state).toHaveAttribute("data-verification-state", /.+/);
  if ((await state.getAttribute("data-verification-state")) === "in-force") {
    return;
  }
  await verify(page);
  await expect(state).toHaveAttribute("data-verification-state", "in-force");
}

/** Generate the paper from step 3; resolves on the shipment's page. */
async function generatePaper(page: Page, shipmentId: string): Promise<void> {
  await page.goto(`/shipments/new?shipment=${shipmentId}&step=3`);
  await expect(page.locator("[data-precondition-checklist]")).toHaveAttribute(
    "data-precondition-checklist",
    "complete",
  );
  await tap(page.locator("[data-generate-paper]"), "Generate shipping paper");
  await page.locator("[data-generate-confirm]").click();
  await page.waitForURL((url) => url.pathname === `/shipments/${shipmentId}`);
  await expect(page.locator("[data-paper-tab]")).toBeVisible();
}

/** **Record departure** on the shipment's page, and see it recorded. */
async function depart(page: Page): Promise<void> {
  await tap(page.locator("[data-depart]"), "Record departure");
  await page.locator("[data-depart-confirm]").click();
  await expect(page.locator("[data-shipment-departed]")).not.toHaveText(
    "Not departed",
  );
}

test("the 24-hour number: changed, blocked, set from the draft, verified — then a paper issues, is voided and departs", async ({
  browser,
}) => {
  test.setTimeout(300_000);

  const manager = await as(browser, "p2");
  const handler = await as(browser, "p1");
  const admin = await as(browser, "p6");

  try {
    let containerId = "";
    let shipmentId = "";

    await test.step("P2 changes the number: the verification clears, one unverified state", async () => {
      await changeNumber(manager.page);
      await expect(
        manager.page.getByText(EMERGENCY_UNVERIFIED_HEADLINE),
      ).toBeVisible();
      // No field anywhere takes a date or a person.
      await expect(
        manager.page.locator("[data-emergency-form] input"),
      ).toHaveCount(2);
    });

    await test.step("P1 sees no settings link anywhere", async () => {
      await handler.page.goto("/");
      await expect(
        handler.page.locator('a[href^="/settings/organization"]'),
      ).toHaveCount(0);
    });

    await test.step("P1 labels a new container and builds a shipment; step 3 blocks on E-11 and names who can fix it", async () => {
      containerId = await createContainer(handler.page, "papers");
      await logCleanBattery(handler.page, { containerId });
      await generateLabel(handler.page, containerId);
      shipmentId = await buildShipmentToStepThree(handler.page, containerId);

      const checklist = handler.page.locator("[data-precondition-checklist]");
      await expect(checklist).toHaveAttribute(
        "data-precondition-checklist",
        "incomplete",
      );
      // The number is the only thing between this shipment and its paper.
      await expect(checklist).toHaveAttribute(
        "data-unmet",
        "emergency_contact",
      );
      const notice = handler.page.locator("[data-e11-notice]");
      await expect(notice).toHaveAttribute("data-e11-notice", "ask");
      await expect(notice).toContainText(E11_TITLE);
      await expect(notice.locator("[data-e11-ask]")).toHaveText(E11_ASK_WHO);
      // E-11 — never a link the role would be redirected away from.
      await expect(handler.page.locator("[data-e11-set-it-now]")).toHaveCount(
        0,
      );
      await expect(
        handler.page.locator('a[href^="/settings/organization"]'),
      ).toHaveCount(0);
      await expect(
        handler.page.locator("[data-generate-paper]"),
      ).toHaveAttribute("aria-disabled", "true");
    });

    await test.step("a draft prints, watermarked, and closes nothing (Rule 5.28)", async () => {
      const step3 = handler.page.url();
      await tap(
        handler.page.locator("[data-print-draft]"),
        "Open the draft to print",
      );
      await handler.page.waitForURL(/\/documents\/[^/]+$/);
      await expect(
        handler.page.locator('[data-document-marking="draft"]'),
      ).toBeVisible();
      await expectDrawnPdf(handler.page);
      await handler.page.goto(step3);
      await expect(
        handler.page.locator("[data-precondition-checklist]"),
      ).toHaveAttribute("data-unmet", "emergency_contact");
      await expect(
        handler.page.locator("[data-generate-paper]"),
      ).toHaveAttribute("aria-disabled", "true");
    });

    await test.step("P2 follows Set it now from the draft, verifies, and lands back on it", async () => {
      await manager.page.goto(`/shipments/${shipmentId}`);
      // P2 reads the draft and cannot reach step 3 (SITE §5.2); E-11 starts here.
      await expect(manager.page.locator("[data-e11-notice]")).toHaveAttribute(
        "data-e11-notice",
        "set-it-now",
      );
      await tap(manager.page.locator("[data-e11-set-it-now]"), "Set it now");
      await manager.page.waitForURL(/\/settings\/organization\?returnTo=/);
      await expect(
        manager.page.locator("[data-return-to-shipment]"),
      ).toHaveAttribute("href", `/shipments/${shipmentId}`);
      await verify(manager.page);
      await manager.page.waitForURL(
        (url) => url.pathname === `/shipments/${shipmentId}`,
      );
      await expect(manager.page.locator("[data-e11-notice]")).toHaveCount(0);
    });

    await test.step("the verification carries P2's name and today's date, from the server", async () => {
      await manager.page.goto("/settings/organization");
      await expect(
        manager.page.locator("[data-verification-state]"),
      ).toHaveAttribute("data-verification-state", "in-force");
      await expect(
        manager.page.locator('[data-emergency-verification="not-in-force"]'),
      ).toHaveCount(0);
      const section = manager.page.locator("#emergency-contact");
      await expect(section).toContainText("Marta Bellini");
      await expect(section).toContainText(todayAtCascade());
    });

    await test.step("P6 changes it again, follows Set it now from step 3, verifies, and lands back on step 3", async () => {
      await changeNumber(admin.page);
      await admin.page.goto(`/shipments/new?shipment=${shipmentId}&step=3`);
      await expect(admin.page.locator("[data-e11-notice]")).toHaveAttribute(
        "data-e11-notice",
        "set-it-now",
      );
      await tap(admin.page.locator("[data-e11-set-it-now]"), "Set it now");
      await admin.page.waitForURL(/\/settings\/organization\?returnTo=/);
      await verify(admin.page);
      await admin.page.waitForURL(
        (url) =>
          url.pathname === "/shipments/new" &&
          url.searchParams.get("shipment") === shipmentId &&
          url.searchParams.get("step") === "3",
      );
      await expect(admin.page.locator("[data-e11-notice]")).toHaveCount(0);
      await expect(
        admin.page.locator("[data-precondition-checklist]"),
      ).toHaveAttribute("data-precondition-checklist", "complete");
      await admin.page.goto("/settings/organization");
      await expect(admin.page.locator("#emergency-contact")).toContainText(
        ROLE_LABELS.platform_admin,
      );
    });

    await test.step("P1 generates the paper; it is issued, readable and printable", async () => {
      await handler.page.goto(`/shipments/new?shipment=${shipmentId}&step=3`);
      await expect(
        handler.page.locator("[data-precondition-checklist]"),
      ).toHaveAttribute("data-precondition-checklist", "complete");
      await tap(
        handler.page.locator("[data-generate-paper]"),
        "Generate shipping paper",
      );
      await handler.page.locator("[data-generate-confirm]").click();
      await handler.page.waitForURL(
        (url) => url.pathname === `/shipments/${shipmentId}`,
      );
      await expect(handler.page.locator("[data-paper-tab]")).toBeVisible();
      await expect(
        handler.page.locator('[data-document-marking="draft"]'),
      ).toHaveCount(0);
    });

    await test.step("P1 voids the paper with a reason: kept, marked, and the shipment needs a new one", async () => {
      await tap(handler.page.locator("[data-void-paper]"), "Void paper");
      const dialog = handler.page.locator("[data-void-paper-dialog]");
      await dialog
        .locator("[data-void-paper-reason]")
        .fill("e2e: the carrier changed after the paper was generated");
      await dialog.locator("[data-void-paper-confirm]").click();
      await expect(handler.page.locator("[data-paper-voided]")).toBeVisible();
      await expect(handler.page.locator("[data-depart]")).toHaveCount(0);
      await expect(handler.page.locator("[data-void-paper]")).toHaveCount(0);
    });

    await test.step("P1 generates a new paper and departs the shipment", async () => {
      await handler.page.goto(`/shipments/new?shipment=${shipmentId}&step=3`);
      await tap(
        handler.page.locator("[data-generate-paper]"),
        "Generate shipping paper",
      );
      await handler.page.locator("[data-generate-confirm]").click();
      await handler.page.waitForURL(
        (url) => url.pathname === `/shipments/${shipmentId}`,
      );
      await expect(handler.page.locator("[data-prior-papers]")).toBeVisible();
      await tap(handler.page.locator("[data-depart]"), "Record departure");
      await handler.page.locator("[data-depart-confirm]").click();
      await expect(
        handler.page.locator("[data-shipment-departed]"),
      ).not.toHaveText("Not departed");
      // Rules 4.7, 5.17 — the contents left, so the container's clock stopped.
      await handler.page.goto(`/containers/${containerId}`);
      await expect(handler.page.locator("main")).not.toContainText(
        "days remaining",
      );
    });
  } finally {
    await Promise.all([manager.close(), handler.close(), admin.close()]);
  }
});

test("with the number verified: a lot started at step A4 ships whole, and a damaged lithium shipment departs with its packet", async ({
  browser,
}) => {
  test.setTimeout(300_000);

  const manager = await as(browser, "p2");
  const handler = await as(browser, "p1");

  try {
    let lotContainerId = "";
    let lotCode = "";
    let lotId = "";
    let ddrContainerId = "";
    let ddrShipmentId = "";

    await test.step("P2 finds the number verified, or verifies it as it stands", async () => {
      await ensureVerified(manager.page);
    });

    await test.step("P1 logs a battery into a new container and starts a lot with it at step A4", async () => {
      const page = handler.page;
      lotContainerId = await createContainer(page, "lot");
      await openReview(page, "label-clean.png");
      await confirmRow(page, "model");
      await selectTopCandidate(page);
      await confirmRow(page, "chemistry_code");
      await continueToPlace(page);
      await confirmCondition(page, "none_observed", "sound");
      await chooseContainer(page, lotContainerId);
      // T-25 — a lot holds containers, so the battery joins one through the
      // container it goes into; nothing is written until the commit.
      await page.locator("[data-lot-trigger]").click();
      await page.locator('[data-lot-option="open"]').click();
      await expect(page.locator("[data-lot-choice-form]")).toHaveAttribute(
        "data-lot-choice",
        "open",
      );
      await commitIntake(page);

      await page.goto(`/containers/${lotContainerId}`);
      const section = page.locator("[data-container-lot]");
      await expect(section).not.toHaveAttribute("data-container-lot", "none");
      lotCode = (await section.getAttribute("data-container-lot")) ?? "";
      expect(lotCode).toMatch(/^L-\d{4}$/);
    });

    await test.step("P1 labels the container and closes the lot on the Lots view", async () => {
      const page = handler.page;
      await generateLabel(page, lotContainerId);
      await page.goto("/containers?tab=lots");
      await expect(
        page.locator(`[data-lot-members="${lotCode}"]`),
      ).toBeVisible();
      await tap(page.locator(`[data-lot-close="${lotCode}"]`), "Close lot");
      await expect(
        page.locator(`[data-lot-reopen="${lotCode}"]`),
      ).toBeVisible();

      // A closed lot ships whole, so the container's Ship link carries it.
      await page.goto(`/containers/${lotContainerId}`);
      const href =
        (await page
          .locator("[data-ship-this-container]")
          .getAttribute("href")) ?? "";
      lotId = new URL(href, "http://localhost").searchParams.get("lots") ?? "";
      expect(lotId).not.toBe("");
    });

    await test.step("step 1 refuses the container alone, and offers the lot whole (Rule 5.1)", async () => {
      const page = handler.page;
      await page.goto(`/shipments/new?containers=${lotContainerId}`);
      await expect(
        page.locator(`[data-candidate="${lotContainerId}"]`),
      ).toHaveAttribute("data-admission", "ships_with_lot");

      await page.goto(`/shipments/new?lots=${lotId}`);
      const lot = page.locator(`[data-lot-candidate="${lotId}"]`);
      await expect(lot).toHaveAttribute("data-admission", "ok");
      await expect(lot).toHaveAttribute("data-selected", "true");
    });

    await test.step("P1 generates the paper for the lot's shipment and departs it; the lot reads shipped", async () => {
      const page = handler.page;
      const shipmentId = await continueByGroundToStepThree(page);
      await generatePaper(page, shipmentId);
      await depart(page);

      await page.goto(`/shipments/${shipmentId}?tab=contents`);
      await expect(
        page.locator(`[data-shipment-container-lot="${lotCode}"]`),
      ).toBeVisible();
      await page.goto("/containers?tab=lots");
      const row = page.locator("tr", {
        has: page.locator(`[data-lot-members="${lotCode}"]`),
      });
      await expect(row).toContainText(LOT_STATUS_LABELS.shipped);
      // A shipped lot is final: nothing left to close, reopen or dissolve.
      await expect(page.locator(`[data-lot-actions="${lotCode}"]`)).toHaveCount(
        0,
      );
    });

    await test.step("P1 logs a swollen lithium pack into a new quarantine container and builds a ground shipment", async () => {
      const page = handler.page;
      ddrContainerId = await createContainer(
        page,
        "ddr-packet",
        "light_category_ddr",
      );
      await openReview(page, "label-clean.png");
      await confirmRow(page, "model");
      await selectTopCandidate(page);
      await confirmRow(page, "chemistry_code");
      await continueToPlace(page);
      await confirmCondition(page, "swelling", "damaged_or_defective");
      await chooseContainer(page, ddrContainerId);
      await commitIntake(page);
      await generateLabel(page, ddrContainerId);
      ddrShipmentId = await buildShipmentToStepThree(page, ddrContainerId);
      // D-71 — lithium has its packaging rule on file, so nothing holds.
      await expect(
        page.locator('[data-hard-block-notice="ddr-packaging-gap"]'),
      ).toHaveCount(0);
    });

    await test.step("the paper issues with its damaged/defective packet (Rule 6.16), and the shipment departs", async () => {
      const page = handler.page;
      await generatePaper(page, ddrShipmentId);
      const packet = page.locator('[data-open-ddr-packet="issued"]');
      await expect(packet).toBeVisible();
      await expect(
        page.locator(
          '[data-hard-block-notice="ddr-packet-missing"], [data-hard-block-notice="ddr-packaging-gap"]',
        ),
      ).toHaveCount(0);

      await packet.click();
      await page.waitForURL(/\/documents\/[^/]+$/);
      await expect(page.locator('[data-document-marking="draft"]')).toHaveCount(
        0,
      );
      await expect(page.locator('[data-pdf-pages="ready"]')).toBeVisible();

      await page.goto(`/shipments/${ddrShipmentId}`);
      await depart(page);
    });
  } finally {
    await Promise.all([manager.close(), handler.close()]);
  }
});

test("Rule 6.14: a recall recorded on a record on an air shipment voids its issued paper and holds departure", async ({
  browser,
}) => {
  test.setTimeout(300_000);

  const manager = await as(browser, "p2");
  const handler = await as(browser, "p1");

  try {
    let containerId = "";
    let recordId = "";
    let shipmentId = "";

    await test.step("P2 finds the number verified, or verifies it as it stands", async () => {
      await ensureVerified(manager.page);
    });

    await test.step("P1 logs a sound lithium pack into a new container, labels it and builds an air shipment", async () => {
      const page = handler.page;
      containerId = await createContainer(page, "air-6-14");
      ({ recordId } = await logCleanBattery(page, { containerId }));
      await generateLabel(page, containerId);

      await page.goto(`/shipments/new?containers=${containerId}`);
      await expect(
        page.locator(`[data-candidate="${containerId}"]`),
      ).toHaveAttribute("data-admission", "ok");
      await page.locator("[data-contents-continue]").click();
      await page.waitForURL(/step=2/);
      await page.locator('[data-mode-option="air"]').getByRole("radio").click();
      const fields: Readonly<Record<string, string>> = {
        destinationFacilityName: `e2e air 6.14 ${Date.now().toString(36)}`,
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
      shipmentId = new URL(page.url()).searchParams.get("shipment") ?? "";
      expect(shipmentId).not.toBe("");
    });

    await test.step("the air paper issues", async () => {
      await generatePaper(handler.page, shipmentId);
      await expect(handler.page.locator("[data-paper-voided]")).toHaveCount(0);
      await expect(handler.page.locator("[data-depart]")).toBeVisible();
    });

    await test.step("P2 records a manufacturer's recall on the record", async () => {
      const page = manager.page;
      await page.goto(`/batteries/${recordId}`);
      await page.locator("[data-record-recall-trigger]").click();
      const dialog = page.locator("[data-record-recall-dialog]");
      await dialog
        .locator("[data-record-recall-reference]")
        .fill(`NV-AIR-E2E-${Date.now().toString(36)}`);
      // Inside the dialog, as every spec clicks a dialog confirm: the open
      // animation is still scaling it when the 44px check would measure.
      await dialog.locator("[data-record-recall-submit]").click();
      await expect(page.locator("[data-recalls-section]")).toHaveAttribute(
        "data-recall-standing",
        "confirmed_match",
      );
    });

    await test.step("the paper is void, the shipment needs a new one, departure is gone, and P2 is told", async () => {
      const page = handler.page;
      await page.goto(`/shipments/${shipmentId}`);
      await expect(page.locator("[data-paper-voided]")).toBeVisible();
      await expect(page.locator("[data-depart]")).toHaveCount(0);

      await manager.page.goto("/");
      await expect(
        manager.page.locator('[data-alert-type="ddr_quarantine"]').first(),
      ).toBeVisible();
    });
  } finally {
    await Promise.all([manager.close(), handler.close()]);
  }
});
