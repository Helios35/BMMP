import { expect, test, type Page } from "@playwright/test";

import { READ_ONLY_BANNER_MESSAGE } from "@/components/access/read-only-banner";
import { AUDITOR_READ_ONLY_REASON } from "@/domain/access/control-treatment";
import { ACCUMULATION_START_SOURCE_LABELS } from "@/domain/taxonomy/accumulation-start-source";
import { CONTAINER_TYPE_LABELS } from "@/domain/taxonomy/container-type";
import {
  CONTAINER_DETAIL_ROLES_REASON,
  CYCLE_ENDED,
} from "@/features/containers/container-copy";

import {
  confirmCondition,
  confirmRow,
  continueToPlace,
  logCleanBattery,
  openReview,
  primaryAction,
  selectTopCandidate,
  tap,
} from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * `/containers`, `/containers/[id]` and `/documents/[id]` — unit 04's
 * reviewer checklist, driven from the outside (`UX_SPEC.md` §3.9, §3.10,
 * §3.14; `SITE_ARCHITECTURE.md` §5.4, §5.5; Rules 4.9–4.17, 4.28).
 *
 * **The e2e store is shared**, so every container this spec moves batteries
 * between is one it created itself, at a run-unique location, filled with
 * batteries it logged itself. No fixture container gains or loses contents
 * here — the sound drum stays open for every other spec that places into it.
 * The exact dates are proven in `tests/integration/container-writes.test.ts`
 * with a fixed "now"; this spec proves the screens say what the rows say.
 */

const { CONTAINER, DOCUMENT_RENDER } = fixtureIds;

/** Unique per run and per call, so parallel workers never share a container. */
function runLocation(tag: string): string {
  return `e2e ${tag} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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

test.describe("a handler moves batteries (Rules 4.9, 4.10; EC-23)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("the receiving container takes the older date, and the emptied one ends its cycle", async ({
    page,
  }) => {
    test.slow();
    const older = await createContainer(page, "older");
    const first = await logCleanBattery(page, { containerId: older });
    const newer = await createContainer(page, "newer");
    await logCleanBattery(page, { containerId: newer });

    // The newer container's start is its own first placement.
    await page.goto(`/containers/${newer}`);
    await expect(page.locator("[data-start-source]")).toContainText(
      ACCUMULATION_START_SOURCE_LABELS.first_placement,
    );

    // Move the older battery into it.
    await page.goto(`/containers/${older}`);
    await page.locator(`[data-contents-select="${first.recordId}"]`).click();
    await tap(page.locator('[data-move-open="move"]'), "Move");
    const dialog = page.locator('[data-move-dialog="move"]');
    const target = dialog.locator(`[data-container-row="${newer}"]`);
    await expect(target).toHaveAttribute("data-admission", "ok");
    await target.click();
    await dialog.locator("[data-move-submit]").click();
    await expect(dialog).toHaveCount(0);

    // The source reached empty: its clock stopped, and it takes nothing more.
    await expect(page.locator("[data-contents-empty]")).toBeVisible();
    await expect(page.locator("[data-container-clock]")).toContainText(
      CYCLE_ENDED,
    );

    // The receiving container now carries the earlier date — never today's.
    await page.goto(`/containers/${newer}`);
    await expect(page.locator("[data-start-source]")).toContainText(
      ACCUMULATION_START_SOURCE_LABELS.inherited_on_receipt,
    );
    await expect(
      page.locator(`[data-contents-row="${first.recordId}"]`),
    ).toBeVisible();

    // …and its history says where the battery came from.
    await page.goto(`/containers/${newer}?tab=history`);
    await expect(
      page.locator('[data-storage-event="place"]').first(),
    ).toBeVisible();
  });

  test("the overdue drum refuses a battery with the stated reason (Rule 4.16)", async ({
    page,
  }) => {
    // Opening the dialog writes nothing: the sound drum's contents stay put.
    await page.goto(`/containers/${CONTAINER.soundDrum}`);
    await page.locator("[data-contents-select]").first().click();
    await tap(page.locator('[data-move-open="move"]'), "Move");
    const overdue = page
      .locator('[data-move-dialog="move"]')
      .locator(`[data-container-row="${CONTAINER.overdueDrum}"]`);
    await expect(overdue).toHaveAttribute(
      "data-admission",
      "container_overdue",
    );
    await expect(overdue).toHaveAttribute("aria-disabled", "true");
    await expect(overdue.locator("[data-admission-reason]")).toContainText(
      "accepts no new items",
    );
    await expect(overdue.locator("[data-admission-reason]")).toContainText(
      "remediation",
    );
  });

  test("a classified battery cannot be logged without a container (D-41)", async ({
    page,
  }) => {
    await openReview(page, "label-clean.png");
    await confirmRow(page, "model");
    await selectTopCandidate(page);
    await confirmRow(page, "chemistry_code");
    await continueToPlace(page);
    await confirmCondition(page, "none_observed", "sound");

    await expect(primaryAction(page)).toHaveAttribute("aria-disabled", "true");
    await expect(
      page.locator('[data-outstanding-item="choose_container"]').first(),
    ).toBeVisible();
  });

  test("a handler has no remediation control, and nobody has a re-date control", async ({
    page,
  }) => {
    await page.goto(`/containers/${CONTAINER.overdueDrum}`);
    await expect(page.locator("#page-title")).toContainText("C-0003");
    await expect(page.locator("[data-record-storage-event]")).toBeVisible();
    await expect(page.locator("[data-record-remediation]")).toHaveCount(0);
    // Rules 4.6, 4.9 — the controls do not exist, so there is nothing to disable.
    await expect(
      page.getByRole("button", {
        name: /re-?date|pause|hold|extend|snooze|reset/i,
      }),
    ).toHaveCount(0);
  });
});

test.describe("a facility manager on an overdue container (Rule 4.17)", () => {
  test.use({ storageState: storageStateFor("p2") });

  test("records a remediation with a statement; the start date is unchanged", async ({
    page,
  }) => {
    await page.goto(`/containers/${CONTAINER.overdueDrum}`);
    const clock = page.locator("[data-container-clock]");
    const startLine = await clock
      .getByText(/Accumulation started/)
      .textContent();

    // P2 does not add or remove records (§5.5): no move controls at all.
    await expect(page.locator("[data-move-open]")).toHaveCount(0);

    const statement = `Contents collected by the county contractor, ${runLocation("manifest")}.`;
    await tap(
      page.locator("[data-record-remediation]"),
      "Record a remediation",
    );
    const dialog = page.locator("[data-remediation-dialog]");
    await dialog.locator("[data-remediation-statement]").fill(statement);
    // Inside a dialog, a click: `tap` measures, and the dialog's open
    // animation scales the target for a frame (flow-f.spec.ts does the same).
    await dialog.locator("[data-remediation-confirm]").click();
    await expect(dialog).toHaveCount(0);

    await expect(clock.getByText(/Accumulation started/)).toHaveText(
      startLine ?? "",
    );
    await page.goto(`/containers/${CONTAINER.overdueDrum}?tab=history`);
    await expect(
      page.locator("[data-remediation-statement-text]").filter({
        hasText: statement,
      }),
    ).toBeVisible();
  });

  test("her links from /review land on real container pages", async ({
    page,
  }) => {
    await page.goto("/review");
    const alerts = page.locator("[data-see-clock-alerts]");
    if ((await alerts.count()) > 0) {
      await alerts.click();
    } else {
      await page.goto("/containers?filter=alerting");
    }
    await page.waitForURL(
      (url) =>
        url.pathname === "/containers" &&
        url.searchParams.get("filter") === "alerting",
    );
    const row = page.locator(`a[href="/containers/${CONTAINER.overdueDrum}"]`);
    await expect(row.first()).toBeVisible();
    await row.first().click();
    await page.waitForURL(`**/containers/${CONTAINER.overdueDrum}`);
    await expect(page.locator("#page-title")).toContainText("C-0003");
  });
});

test.describe("the list is broader than its detail (§5.4)", () => {
  for (const persona of ["p3", "p5"] as const) {
    test.describe(persona, () => {
      test.use({ storageState: storageStateFor(persona) });

      test("rows are not links, and each names who can open the container", async ({
        page,
      }) => {
        await page.goto("/containers");
        await expect(page.locator("[data-table-state]")).toHaveAttribute(
          "data-table-state",
          "default",
        );
        await expect(page.locator('a[href^="/containers/"]')).toHaveCount(0);
        const triggers = page.locator('[data-row-reason-trigger="true"]');
        expect(await triggers.count()).toBeGreaterThan(0);
        await triggers.first().focus();
        await expect(
          page.getByRole("tooltip").filter({
            hasText: CONTAINER_DETAIL_ROLES_REASON,
          }),
        ).toBeVisible();
      });
    });
  }

  test.describe("p5 (E-8a)", () => {
    test.use({ storageState: storageStateFor("p5") });

    test("New container renders disabled with its reason, under the read-only banner", async ({
      page,
    }) => {
      await page.goto("/containers");
      await expect(page.getByText(READ_ONLY_BANNER_MESSAGE)).toBeVisible();
      const control = page.locator("[data-create-container]");
      await expect(control).toHaveAttribute("aria-disabled", "true");
      await expect(control).not.toHaveAttribute("disabled", /.*/);
      await expect(
        page
          .locator("[data-gated-control]")
          .getByText(AUDITOR_READ_ONLY_REASON),
      ).toHaveCount(1);
    });

    test("prints and downloads a document — never disabled (Rule 5.27)", async ({
      page,
    }) => {
      // The browser's own print dialog is not what is under test; the audit
      // write that must precede it is.
      await page.addInitScript(() => {
        window.print = () => {
          document.body.dataset.printed = "true";
        };
      });
      await page.goto(`/documents/${DOCUMENT_RENDER.soundDrumLabel}`);
      await expect(page.locator("[data-label-phrase]")).toBeVisible();
      await expect(page.locator("[data-label-start-date]")).not.toHaveText("");

      const print = page.locator("[data-document-print]");
      const download = page.locator("[data-document-download]");
      await expect(print).not.toHaveAttribute("aria-disabled", "true");
      await expect(download).not.toHaveAttribute("aria-disabled", "true");

      await print.click();
      await expect(page.locator("body")).toHaveAttribute(
        "data-printed",
        "true",
      );

      // A fixture render has no stored file, and says so rather than
      // producing one (document generation is unit 06).
      await download.click();
      await expect(page.locator("[data-document-action-error]")).toContainText(
        "stored file",
      );
    });
  });
});
