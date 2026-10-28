import { expect, type Page } from "@playwright/test";

import {
  CONTAINER_TYPE_LABELS,
  type ContainerType,
} from "@/domain/taxonomy/container-type";

import { tap } from "./intake-flow";

/**
 * Containers, labels and shipments driven from the outside — shared by
 * `documents.spec.ts` and `papers.spec.ts`.
 *
 * **The e2e store is shared**, so every container made here sits at a
 * run-unique location and every shipment goes to a run-unique facility.
 * Nothing here labels, empties or departs a fixture container.
 */

function runTag(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function runLocation(tag: string): string {
  return `e2e documents ${tag} ${runTag()}`;
}

export function runFacility(): string {
  return `e2e facility ${runTag()}`;
}

/** **New container** on `/containers`; resolves to the new container's id. */
export async function createContainer(
  page: Page,
  tag: string,
  type: ContainerType = "light_category_sound",
): Promise<string> {
  await page.goto("/containers");
  await tap(page.locator("[data-create-container]").first(), "New container");
  const dialog = page.locator("[data-create-container-dialog]");
  await dialog.locator("[data-create-container-type]").click();
  await page.getByRole("option", { name: CONTAINER_TYPE_LABELS[type] }).click();
  await dialog.getByLabel("Storage location").fill(runLocation(tag));
  await dialog.locator("[data-create-container-submit]").click();
  await page.waitForURL((url) => /^\/containers\/[^/]+$/.test(url.pathname));
  return new URL(page.url()).pathname.replace("/containers/", "");
}

/** Generate the label from the Label tab; resolves to the new render's id. */
export async function generateLabel(
  page: Page,
  containerId: string,
): Promise<string> {
  await page.goto(`/containers/${containerId}?tab=label`);
  await tap(page.locator("[data-generate-label]"), "Generate label");
  await page.locator("[data-generate-label-confirm]").click();
  await page.waitForURL(/\/documents\/[^/]+$/);
  return new URL(page.url()).pathname.replace("/documents/", "");
}

/** The stored PDF drawn on the page, from its bytes. */
export async function expectDrawnPdf(page: Page): Promise<void> {
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

/**
 * Steps 1 and 2 of `/shipments/new` for one labelled container, by ground to
 * a run-unique facility; resolves on step 3 with the shipment's id.
 */
export async function buildShipmentToStepThree(
  page: Page,
  containerId: string,
): Promise<string> {
  await page.goto(`/shipments/new?containers=${containerId}`);
  await expect(
    page.locator(`[data-candidate="${containerId}"]`),
  ).toHaveAttribute("data-admission", "ok");
  return continueByGroundToStepThree(page);
}

/**
 * From step 1 with the contents already selected: **Continue**, then step 2
 * by ground to a run-unique facility; resolves on step 3 with the shipment's
 * id. A spec that ships a lot selects it on step 1 and starts here.
 */
export async function continueByGroundToStepThree(page: Page): Promise<string> {
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
  const shipmentId = new URL(page.url()).searchParams.get("shipment");
  if (shipmentId === null) throw new Error("step 3 named no shipment");
  return shipmentId;
}
