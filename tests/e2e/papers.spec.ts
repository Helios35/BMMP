import { expect, test, type Browser, type Page } from "@playwright/test";

import { ROLE_LABELS } from "@/domain/taxonomy/role";
import {
  EMERGENCY_ATTESTATION,
  EMERGENCY_UNVERIFIED_HEADLINE,
} from "@/features/settings/copy";
import { E11_ASK_WHO, E11_TITLE } from "@/features/shipments/shipment-copy";

import {
  buildShipmentToStepThree,
  createContainer,
  expectDrawnPdf,
  generateLabel,
} from "./support/documents-flow";
import { logCleanBattery, tap } from "./support/intake-flow";
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
 */

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
