import { expect, test } from "@playwright/test";

import {
  createContainer,
  expectDrawnPdf,
  generateLabel,
} from "./support/documents-flow";
import { logCleanBattery } from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * Real, locked PDFs — `b1a-06-documents`' reviewer checklist, driven from the
 * outside (`TECHNICAL_SPEC.md` §8; `UX_SPEC.md` §2.8, §3.10, §3.14).
 *
 * **The e2e store is shared**, so every container labelled here is one this
 * spec created, at a run-unique location, holding a battery it logged
 * itself. No fixture container is labelled: the quarantine drum's missing
 * label is another spec's assertion. Issuing, voiding and departing a paper,
 * and printing a draft, are in `papers.spec.ts` (b1a-07), the one spec that
 * changes the 24-hour number's state.
 */

const { CONTAINER, DOCUMENT_RENDER } = fixtureIds;

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

// "A draft is never a document" (reviewer item 6; D-58 item 9) moved to
// `papers.spec.ts` in b1a-07: it reads the 24-hour number's state, which that
// spec changes, in order.

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
