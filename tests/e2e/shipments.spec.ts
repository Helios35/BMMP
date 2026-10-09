import { expect, test, type Page } from "@playwright/test";

import { READ_ONLY_BANNER_MESSAGE } from "@/components/access/read-only-banner";
import { AUDITOR_READ_ONLY_REASON } from "@/domain/access/control-treatment";
import {
  IDENTITY_REASON,
  IDENTITY_SAVED,
} from "@/features/catalog-admin/catalog-admin-copy";
import {
  PRECONDITION_TITLES,
  whoCanFix,
} from "@/features/shipments/shipment-copy";

import { tap } from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * `/shipments`, `/shipments/new`, `/shipments/[id]` and D-50 on
 * `/settings/catalog` — `b1a-05-shipments`' reviewer checklist, driven from
 * the outside (`UX_SPEC.md` §3.11–§3.13, §3.19).
 *
 * **What the running app can prove, it proves here; the rest is proven in
 * `tests/integration/shipment-writes.test.ts`.** No fixture organization holds
 * a verified 24-hour number, no shipper certification rule is on file, and
 * the only labelled container holds a pack with no shipping identifiers — so
 * in the app every paper stops at a checklist that names each gap, and that
 * is what this spec asserts. Generating, voiding, departing and the
 * server-side air refusal run against in-memory test data in the integration
 * suite (the owner's call, recorded in the build-notes).
 *
 * **The store is shared.** The one write here — a draft shipment holding the
 * sound drum — is released before the test ends, and released first if a
 * previous attempt left it attached, so a retry and every other spec see the
 * drum free.
 */

const { CONTAINER, SHIPMENT, CATALOG } = fixtureIds;

function runFacility(): string {
  return `e2e facility ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const SOUND_DRUM = `[data-candidate="${CONTAINER.soundDrum}"]`;

/** Take the sound drum off any open shipment an earlier attempt left it on. */
async function releaseSoundDrum(page: Page): Promise<void> {
  await page.goto(`/shipments/new?containers=${CONTAINER.soundDrum}`);
  const candidate = page.locator(SOUND_DRUM);
  await expect(candidate).toBeVisible();
  if (
    (await candidate.getAttribute("data-admission")) !== "on_other_shipment"
  ) {
    return;
  }
  const reason = await candidate.locator("[data-admission-reason]").innerText();
  const number = /SH-\d+/.exec(reason)?.[0];
  if (number === undefined) throw new Error(`no shipment named in "${reason}"`);
  await page.goto(`/shipments?q=${number}`);
  await page
    .locator("tr", { hasText: number })
    .locator('a[data-row-anchor="true"]')
    .first()
    .click();
  await page.waitForURL(/\/shipments\/[^/]+$/);
  await removeEverything(page);
}

/** Step 1 of an existing shipment: uncheck every container and save. */
async function removeEverything(page: Page): Promise<void> {
  await page.locator("[data-change-contents]").click();
  await page.waitForURL(/step=1/);
  // The route has a loading boundary: the URL changes while the skeleton is
  // up, so the list is read only once it has rendered.
  await expect(page.locator("[data-contents-step]")).toBeVisible();
  // Each row once, waiting for it to settle: a count re-read before React
  // re-renders would click a row twice and leave it selected.
  const ids = await page
    .locator('[data-candidate][data-selected="true"]')
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-candidate") ?? ""),
    );
  for (const id of ids) {
    const row = page.locator(`[data-candidate="${id}"]`);
    await row.locator("button[role='checkbox']").click();
    await expect(row).toHaveAttribute("data-selected", "false");
  }
  await page.locator("[data-contents-continue]").click();
  await page.waitForURL(/step=2/);
  await expect(page.locator("[data-contents-changed]")).toBeVisible();
}

test.describe("the ledger (§3.11)", () => {
  test.describe("p1", () => {
    test.use({ storageState: storageStateFor("p1") });

    test("lists every shipment and offers Build a shipment", async ({
      page,
    }) => {
      await page.goto("/shipments");
      await expect(page.locator("tr", { hasText: "SH-0001" })).toBeVisible();
      await expect(page.locator("tr", { hasText: "SH-0002" })).toBeVisible();
      await tap(
        page.locator("[data-build-shipment]").first(),
        "Build a shipment",
      );
      await page.waitForURL("**/shipments/new");
    });
  });

  test.describe("p5 (E-8a)", () => {
    test.use({ storageState: storageStateFor("p5") });

    test("Build a shipment renders disabled with its reason, under the read-only banner", async ({
      page,
    }) => {
      await page.goto("/shipments");
      await expect(page.getByText(READ_ONLY_BANNER_MESSAGE)).toBeVisible();
      const control = page.locator("[data-build-shipment]");
      await expect(control).toHaveAttribute("aria-disabled", "true");
      await expect(control).not.toHaveAttribute("disabled", /.*/);
      await expect(
        page
          .locator("[data-gated-control]")
          .getByText(AUDITOR_READ_ONLY_REASON),
      ).toHaveCount(1);
    });

    test("on a shipment, departure is disabled with its reason too", async ({
      page,
    }) => {
      await page.goto(`/shipments/${SHIPMENT.augustDraft}`);
      await expect(
        page.locator('[data-shipment-actions="read-only"] [data-depart]'),
      ).toHaveAttribute("aria-disabled", "true");
    });
  });

  test.describe("p2", () => {
    test.use({ storageState: storageStateFor("p2") });

    test("reads the ledger and a shipment, and holds none of its writes", async ({
      page,
    }) => {
      await page.goto("/shipments");
      await expect(page.locator("[data-build-shipment]")).toHaveCount(0);
      await page.goto(`/shipments/${SHIPMENT.julyDelivered}`);
      await expect(page.locator("[data-shipment-actions]")).toHaveCount(0);
    });
  });
});

test.describe("a delivered shipment (§3.13)", () => {
  test.use({ storageState: storageStateFor("p2") });

  test("shows its issued paper, its retention date and its history", async ({
    page,
  }) => {
    await page.goto(`/shipments/${SHIPMENT.julyDelivered}`);
    const paper = page.locator("[data-shipping-paper-document]");
    await expect(paper).toBeVisible();
    await expect(paper.locator("[data-paper-basic-description]")).toHaveText(
      "UN3480, Lithium ion batteries, 9",
    );
    await expect(
      paper.locator('[data-paper-value="emergency-phone"]'),
    ).not.toHaveText("");
    await expect(page.locator("[data-retention]")).toHaveText("2029-07-30");
    await page.goto(`/shipments/${SHIPMENT.julyDelivered}?tab=history`);
    await expect(
      page.locator('[data-shipment-render="issued"]').first(),
    ).toBeVisible();
  });
});

test.describe("build a shipment from a container (Flow B; reviewer items 1, 3, 6)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("Ship this container pre-selects it, step 1 names each refusal, and step 3 names every unmet precondition", async ({
    page,
  }) => {
    test.slow();
    await releaseSoundDrum(page);

    // Reviewer item 1 — it arrives pre-selected.
    await page.goto(`/containers/${CONTAINER.soundDrum}`);
    await tap(
      page.locator("[data-ship-this-container]"),
      "Ship this container",
    );
    await page.waitForURL(/\/shipments\/new\?containers=/);
    const drum = page.locator(SOUND_DRUM);
    await expect(drum).toHaveAttribute("data-selected", "true");
    await expect(drum).toHaveAttribute("data-admission", "ok");

    // Each refusal is stated, never a hidden row (D-57; Rules 4.22).
    const quarantine = page.locator(
      `[data-candidate="${CONTAINER.quarantineDrum}"]`,
    );
    await expect(quarantine).toHaveAttribute(
      "data-admission",
      "no_current_label",
    );
    await expect(quarantine.locator("[data-admission-reason]")).toContainText(
      "Rule 4.22",
    );
    await expect(
      page.locator(`[data-candidate="${CONTAINER.overdueDrum}"]`),
    ).toHaveAttribute("data-admission", "empty");

    // The live summary counts what the rows carry.
    await expect(page.locator("[data-summary-records]")).not.toHaveText("0");

    // Step 2 — transport. Reviewer item 6: nowhere to type a UN number.
    await page.locator("[data-contents-continue]").click();
    await page.waitForURL(/step=2/);
    await expect(
      page.locator('[data-mode-option="air"][data-mode-available="true"]'),
    ).toBeVisible();
    await expect(page.getByLabel(/identification number/i)).toHaveCount(0);
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

    // Step 3 — every unmet precondition named (Rule 5.3), with who can fix it.
    const checklist = page.locator("[data-precondition-checklist]");
    await expect(checklist).toHaveAttribute(
      "data-precondition-checklist",
      "incomplete",
    );
    const unmet = (await checklist.getAttribute("data-unmet")) ?? "";
    for (const id of ["emergency_contact", "shipping_identifiers"]) {
      expect(unmet.split(",")).toContain(id);
    }
    const emergency = page.locator('[data-precondition="emergency_contact"]');
    await expect(emergency).toContainText(
      PRECONDITION_TITLES.emergency_contact,
    );
    await expect(emergency).toContainText(
      whoCanFix(["facility_manager", "platform_admin"]),
    );
    // E-11 — P1 cannot reach the settings route, so no dead link is offered.
    await expect(
      emergency.locator('[data-precondition-fix="emergency_contact"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-precondition="shipping_identifiers"]'),
    ).toContainText("BR-0002");
    // The certification wording is on file since b1a-06 (D-58 item 2).
    await expect(
      page.locator('[data-precondition="rule_data"]'),
    ).toHaveAttribute("data-precondition-met", "true");
    // A draft is never a document (Rule 5.28) — and generation is gated.
    await expect(page.locator('[data-document-marking="draft"]')).toBeVisible();
    await expect(page.locator("[data-generate-paper]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByLabel(/identification number/i)).toHaveCount(0);

    // Release the drum for every other spec.
    const shipmentId = new URL(page.url()).searchParams.get("shipment");
    await page.goto(`/shipments/${shipmentId}`);
    await removeEverything(page);
    await page.goto(`/shipments/new?containers=${CONTAINER.soundDrum}`);
    await expect(page.locator(SOUND_DRUM)).toHaveAttribute(
      "data-admission",
      "ok",
    );
  });
});

test.describe("P1 cannot set a shipping identifier (Rule 5.9; reviewer item 6)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("catalog administration is not theirs, and the catalog entry offers no edit", async ({
    page,
  }) => {
    await page.goto("/settings/catalog");
    await page.waitForURL((url) => url.pathname === "/");
    await page.goto(`/catalog/${CATALOG.mobilityScooterSla}`);
    await expect(page.locator("[data-edit-identity]")).toHaveCount(0);
    await expect(page.getByLabel(/identification number/i)).toHaveCount(0);
  });
});

test.describe("P6 edits a catalog entry's shipping identity, with a reason (D-50)", () => {
  test.use({ storageState: storageStateFor("p6") });

  test("the edit needs a reason, saves, and is audited", async ({ page }) => {
    await page.goto("/settings/catalog");
    const identity = page.locator(
      `[data-entry-identity="${CATALOG.laptopCellLco}"]`,
    );
    const before = await identity.innerText();
    const target = before.includes("Packing Group II")
      ? "Packing Group III"
      : "Packing Group II";

    await page
      .locator(`[data-edit-identity="${CATALOG.laptopCellLco}"]`)
      .click();
    const dialog = page.locator(
      `[data-identity-dialog="${CATALOG.laptopCellLco}"]`,
    );
    await expect(dialog.locator("[data-identity-save]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await dialog.locator("[data-identity-pg]").click();
    await page.getByRole("option", { name: target, exact: true }).click();
    await dialog
      .getByLabel(IDENTITY_REASON)
      .fill("Packing group corrected against the datasheet (e2e).");
    await dialog.locator("[data-identity-save]").click();
    await expect(page.getByText(IDENTITY_SAVED)).toBeVisible();
    await expect(identity).toContainText(target);

    await page.goto("/audit");
    await expect(page.getByText("Catalog entry edited").first()).toBeVisible();
  });
});
