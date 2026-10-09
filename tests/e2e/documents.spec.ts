import { expect, test, type Page } from "@playwright/test";

import { CONTAINER_TYPE_LABELS } from "@/domain/taxonomy/container-type";

import { logCleanBattery, tap } from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * Real, locked PDFs — `b1a-06-documents`' reviewer checklist, driven from the
 * outside (`TECHNICAL_SPEC.md` §8; `UX_SPEC.md` §2.8, §3.10, §3.14).
 *
 * **The e2e store is shared**, so every container labelled here is one this
 * spec created, at a run-unique location, holding a battery it logged
 * itself. No fixture container is labelled: the quarantine drum's missing
 * label is another spec's assertion. **No paper is reachable on fixtures**
 * (no verified 24-hour number, D-58 item 1), so issue, void and departure
 * are proven in `tests/integration/document-engine.test.ts`; here the draft
 * is the paper the screens can reach.
 */

const { CONTAINER, DOCUMENT_RENDER } = fixtureIds;

function runLocation(tag: string): string {
  return `e2e documents ${tag} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function runFacility(): string {
  return `e2e facility ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** **New container** on `/containers`; resolves to the new container's id. */
async function createContainer(page: Page, tag: string): Promise<string> {
  await page.goto("/containers");
  await tap(page.locator("[data-create-container]").first(), "New container");
  const dialog = page.locator("[data-create-container-dialog]");
  await dialog.locator("[data-create-container-type]").click();
  await page
    .getByRole("option", { name: CONTAINER_TYPE_LABELS.light_category_sound })
    .click();
  await dialog.getByLabel("Storage location").fill(runLocation(tag));
  await dialog.locator("[data-create-container-submit]").click();
  await page.waitForURL((url) => /^\/containers\/[^/]+$/.test(url.pathname));
  return new URL(page.url()).pathname.replace("/containers/", "");
}

/** Generate the label from the Label tab; resolves to the new render's id. */
async function generateLabel(page: Page, containerId: string): Promise<string> {
  await page.goto(`/containers/${containerId}?tab=label`);
  await tap(page.locator("[data-generate-label]"), "Generate label");
  await page.locator("[data-generate-label-confirm]").click();
  await page.waitForURL(/\/documents\/[^/]+$/);
  return new URL(page.url()).pathname.replace("/documents/", "");
}

/** The issued PDF drawn on the page, from its stored bytes. */
async function expectDrawnPdf(page: Page): Promise<void> {
  const pages = page.locator('[data-pdf-pages="ready"]');
  await expect(pages).toBeVisible();
  await expect(pages).toHaveAttribute("data-page-count", "1");
  await expect
    .poll(() =>
      page
        .locator("[data-pdf-page] canvas")
        .first()
        .evaluate((canvas: HTMLCanvasElement) => canvas.width),
    )
    .toBeGreaterThan(0);
}

test.describe("a new container is labelled, and then it ships (reviewer items 1–3)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("label, check the code, download twice, and step 1 admits it", async ({
    page,
  }) => {
    test.slow();
    const containerId = await createContainer(page, "label");
    await logCleanBattery(page, { containerId });

    // Before the label: step 1 refuses it, with its reason.
    await page.goto(`/shipments/new?containers=${containerId}`);
    await expect(
      page.locator(`[data-candidate="${containerId}"]`),
    ).toHaveAttribute("data-admission", "no_current_label");

    const renderId = await generateLabel(page, containerId);
    await expectDrawnPdf(page);
    const code = (
      await page.locator("[data-document-verification-code]").innerText()
    ).trim();
    expect(code).toMatch(/^[0-9a-f]{12}$/);

    // Reviewer item 3 — the footer code matches; one changed character does not.
    await page.locator("[data-verify-input]").fill(code.toUpperCase());
    await page.locator("[data-verify-submit]").click();
    await expect(page.locator("[data-verify-result]")).toHaveAttribute(
      "data-verify-result",
      "match",
    );
    const changed = `${code.slice(0, -1)}${code.endsWith("0") ? "1" : "0"}`;
    await page.locator("[data-verify-input]").fill(changed);
    await page.locator("[data-verify-submit]").click();
    await expect(page.locator("[data-verify-result]")).toHaveAttribute(
      "data-verify-result",
      "no_match",
    );

    // Reviewer item 2 — two downloads, the same bytes and the same ETag.
    const first = await page.request.get(
      `/api/documents/${renderId}/pdf?download=1`,
    );
    const second = await page.request.get(
      `/api/documents/${renderId}/pdf?download=1`,
    );
    expect(first.status()).toBe(200);
    expect(first.headers()["content-type"]).toBe("application/pdf");
    expect(first.headers().etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(second.headers().etag).toBe(first.headers().etag);
    expect(Buffer.compare(await first.body(), await second.body())).toBe(0);

    // Download from the viewer streams the same file.
    const downloading = page.waitForEvent("download");
    await page.locator("[data-document-download]").click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`container_label-${code}.pdf`);

    // Reviewer item 1 — step 1 now admits the labelled container.
    await page.goto(`/shipments/new?containers=${containerId}`);
    await expect(
      page.locator(`[data-candidate="${containerId}"]`),
    ).toHaveAttribute("data-admission", "ok");
  });

  test("a new label supersedes the one in force, which stays readable and marked", async ({
    page,
  }) => {
    test.slow();
    const containerId = await createContainer(page, "relabel");
    await logCleanBattery(page, { containerId });
    const first = await generateLabel(page, containerId);
    const second = await generateLabel(page, containerId);
    expect(second).not.toBe(first);

    await page.goto(`/documents/${first}`);
    await expect(
      page.locator('[data-document-marking="superseded"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-document-stamp="superseded"]').first(),
    ).toBeVisible();
    await expectDrawnPdf(page);
    await page
      .locator('[data-document-marking="superseded"] a', {
        hasText: "Open the render that replaced it",
      })
      .click();
    await page.waitForURL(new RegExp(`/documents/${second}$`));
  });
});

test.describe("a draft is never a document (reviewer item 6; D-58 item 9)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("printing a draft stores it watermarked, and the checklist is unchanged", async ({
    page,
  }) => {
    test.slow();
    const containerId = await createContainer(page, "draft");
    await logCleanBattery(page, { containerId });
    await generateLabel(page, containerId);

    await page.goto(`/shipments/new?containers=${containerId}`);
    await page.locator("[data-contents-continue]").click();
    await page.waitForURL(/step=2/);
    const fields: Readonly<Record<string, string>> = {
      destinationFacilityName: runFacility(),
      line1: "77 Terminal Road",
      city: "Moses Lake",
      region: "WA",
      postalCode: "98837",
      carrierName: "Coleridge Hauling",
    };
    for (const [name, value] of Object.entries(fields)) {
      await page.locator(`[data-transport-field="${name}"]`).fill(value);
    }
    await page.locator("[data-transport-save]").click();
    await page.waitForURL(/shipment=.*step=3/);
    const step3 = page.url();

    const checklist = page.locator("[data-precondition-checklist]");
    const before = await checklist.getAttribute("data-unmet");
    // No verified 24-hour number on fixtures: the paper is blocked.
    expect(before?.split(",")).toContain("emergency_contact");

    await tap(page.locator("[data-print-draft]"), "Open the draft to print");
    await page.waitForURL(/\/documents\/[^/]+$/);
    await expect(page.locator('[data-document-marking="draft"]')).toBeVisible();
    await expectDrawnPdf(page);
    // Draft or not, Print streams the stored bytes and records the print.
    await page.addInitScript(() => {
      window.print = () => {
        document.body.dataset.printed = "true";
      };
    });
    await page.reload();
    await expectDrawnPdf(page);
    await page.locator("[data-document-print]").click();
    await expect(page.locator("body")).toHaveAttribute("data-printed", "true");

    await page.goto(step3);
    await expect(checklist).toHaveAttribute("data-unmet", before ?? "");
    await expect(page.locator("[data-generate-paper]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

test.describe("who generates a label (§5.5)", () => {
  test.describe("p2", () => {
    test.use({ storageState: storageStateFor("p2") });

    test("a Facility Manager is offered Generate label", async ({ page }) => {
      // Looked at, never pressed: the quarantine drum's missing label is
      // another spec's assertion.
      await page.goto(`/containers/${CONTAINER.quarantineDrum}?tab=label`);
      await expect(page.locator("[data-generate-label]")).toBeVisible();
      await expect(page.locator("[data-label-none]")).toBeVisible();
    });
  });

  test.describe("p5", () => {
    test.use({ storageState: storageStateFor("p5") });

    test("the auditor reads a label with no stored file as its rows, and says so", async ({
      page,
    }) => {
      await page.goto(`/documents/${DOCUMENT_RENDER.soundDrumLabel}`);
      await expect(
        page.locator("[data-document-no-stored-file]"),
      ).toBeVisible();
      await expect(page.locator("[data-label-phrase]")).toBeVisible();
      await expect(page.locator("[data-verify-code]")).toHaveCount(0);
    });
  });
});
