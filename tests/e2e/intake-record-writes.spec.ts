import { expect, test } from "@playwright/test";

import { ASSESSED_CONDITION_LABELS } from "@/domain/taxonomy/assessed-condition";
import { BATTERY_RECORD_STATUS_LABELS } from "@/domain/taxonomy/battery-record-status";

import { logCleanBattery } from "./support/intake-flow";
import { personaFor, storageStateFor } from "./support/roles";

/**
 * **The write paths on `/batteries/[id]`, for the role that holds them** —
 * `UX_SPEC.md` §3.7, §2.6; Rules 3.25, 6.11, 6.12, 12.12; design §10.
 *
 * Two of the four: edit the assessed condition, and void. Both are driven on
 * **a record this test logs itself**, through the same intake the happy path
 * proves, rather than on a fixture row — `BR-0001` is asserted on by the
 * auditor, ergonomics and harness specs, a superseding assessment cannot be
 * undone, and a voided fixture row would vanish from every list another spec
 * reads. A record nobody else knows about is the only honest subject.
 *
 * What has to be true:
 *
 * - **The dialog states, before the save, that the gate re-opens** (§3.7:
 *   *"The edit Dialog says so before the change is saved, not after"*). The
 *   sentence is asserted while the save control is still inert.
 * - **A prior assessment makes the reason required**, and the save stays
 *   `aria-disabled` with the outstanding list beneath it until one is typed.
 * - **The superseded assessment stays beside the new one** (Rule 6.12) — two
 *   items on the History tab, one marked superseded, none behind a disclosure.
 * - **Void requires a typed reason, is refused without one, and retains the
 *   record** (Rules 3.25, 12.12): the list no longer shows it, and a role that
 *   may read the route can still open its URL directly.
 *
 * `guard-auditor-controls.spec.ts` holds the auditor's branch of the same
 * component unchanged; nothing here touches it. Nothing here touches
 * `src/data` (D-15, D-16).
 */

test.describe("the record's write paths, on a record this spec logged", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("edit assessed condition warns before saving, supersedes visibly; void needs a reason and retains the record", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    expect(personaFor("p1").role).toBe("compliance_handler");

    const logged = await logCleanBattery(page);
    const recordPath = `/batteries/${logged.recordId}`;
    await expect(page).toHaveURL(new RegExp(`^[^?]*${recordPath}`));

    /* ------------------------------------------- the enabled branch */

    // The four controls render as real controls for a role holding `write`:
    // the positive count for every attribute assertion that follows.
    const actions = page.locator("[data-record-actions]");
    await expect(actions).toBeVisible();
    await expect(actions.locator('[data-mutating="true"]')).toHaveCount(4);
    await expect(actions.locator('[data-destructive="true"]')).toHaveCount(1);
    await expect(actions.locator('[data-gated-control="true"]')).toHaveCount(0);

    /* ------------------------------------------ edit assessed condition */

    await actions.locator('[data-control="edit-assessed-condition"]').click();
    const dialog = page.locator(
      '[data-record-dialog="edit-assessed-condition"]',
    );
    await expect(dialog).toBeVisible();

    // §3.7 — stated before the save, while the save is still inert.
    const save = dialog.locator('[data-primary-action="save-condition"]');
    await expect(
      dialog.locator('[data-gate-notice="condition"]'),
    ).toContainText("re-opens the confidence gate");
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await expect(
      dialog.locator('[data-outstanding="condition"]'),
    ).toBeVisible();

    // A cosmetic finding (T-29) replaces *None observed* — exclusive, so the
    // one tick clears the other (Rule 6.3) — and the derivation renders live.
    const cosmetic = dialog.locator('[data-finding="surface_marking"]');
    await dialog
      .locator("label", {
        has: page.locator('[data-finding="surface_marking"]'),
      })
      .click();
    await expect(cosmetic).toHaveAttribute("data-state", "checked");
    await expect(
      dialog.locator('[data-finding="none_observed"]'),
    ).toHaveAttribute("data-state", "unchecked");
    await expect(dialog).toContainText(
      ASSESSED_CONDITION_LABELS.cosmetic_wear_only,
    );

    // Still inert: a prior assessment exists, so the reason is required.
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await dialog
      .locator("[data-condition-reason]")
      .fill("Scuffing on the casing, seen on the bench after unpacking.");
    await expect(save).not.toHaveAttribute("aria-disabled", "true");

    await save.click();
    await expect(dialog).toHaveCount(0);

    // Rule 6.12 — both assessments, side by side, one marked superseded.
    await page.goto(`${recordPath}?tab=history`);
    await expect(page.locator("#page-title")).toBeVisible();
    await expect(page.locator("[data-assessment-status]")).toHaveCount(2);
    await expect(
      page.locator('[data-assessment-status="superseded"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-assessment-superseded="true"]'),
    ).toHaveCount(1);
    await expect(page.locator("[data-page-header]").first()).toContainText(
      ASSESSED_CONDITION_LABELS.cosmetic_wear_only,
    );

    /* ------------------------------------------------------- void */

    await page.goto(recordPath);
    await expect(page.locator("#page-title")).toHaveText(logged.recordNumber);
    await page
      .locator('[data-record-actions] [data-control="void-this-record"]')
      .click();
    const voidDialog = page.locator('[data-record-dialog="void-this-record"]');
    await expect(voidDialog).toBeVisible();
    // The control that opened it and the dialog's own confirm both carry the
    // mark while the dialog is open.
    await expect(page.locator('[data-destructive="true"]')).toHaveCount(2);

    // Refused without a reason: the dialog stays, with the reason stated.
    const confirmVoid = voidDialog.locator(
      '[data-primary-action="void-record"]',
    );
    await confirmVoid.click();
    await expect(voidDialog).toBeVisible();
    await expect(voidDialog.getByRole("alert")).toContainText(
      "Enter the reason this record is voided.",
    );
    await expect(page).toHaveURL(new RegExp(`^[^?]*${recordPath}`));

    await voidDialog
      .locator("[data-void-reason]")
      .fill("Logged twice — the same pack was entered from the pallet list.");
    await confirmVoid.click();
    await page.waitForURL((url) => url.pathname === "/batteries");
    await expect(page.locator("#page-title")).toBeVisible();

    // Gone from the list — the search state, not the zero-records one, so the
    // absence is the record's and not the list's.
    await page.goto(`/batteries?q=${encodeURIComponent(logged.recordNumber)}`);
    await expect(page.locator("#page-title")).toBeVisible();
    await expect(page.locator('[data-table-empty="search"]')).toBeVisible();
    await expect(page.locator('a[data-row-anchor="true"]')).toHaveCount(0);

    // Retained (Rule 12.12): a role that may read the route opens it directly.
    const readerContext = await browser.newContext({
      storageState: storageStateFor("p2"),
      baseURL,
    });
    try {
      const reader = await readerContext.newPage();
      const response = await reader.goto(recordPath);
      expect(response?.status()).toBe(200);
      await expect(reader).toHaveURL(recordPath);
      await expect(reader.locator("#page-title")).toHaveText(
        logged.recordNumber,
      );
      await expect(reader.locator("[data-page-header]").first()).toContainText(
        BATTERY_RECORD_STATUS_LABELS.voided,
      );
    } finally {
      await readerContext.close();
    }
  });
});
