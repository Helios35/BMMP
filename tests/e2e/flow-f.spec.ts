import { expect, test, type Page } from "@playwright/test";

import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";

import {
  commitIntake,
  confirmCondition,
  confirmRow,
  continueToPlace,
  fieldRow,
  openReview,
} from "./support/intake-flow";
import { storageStateFor } from "./support/roles";

/**
 * **Flow F — a catalog miss, closed** (`SITE_ARCHITECTURE.md` Flow F,
 * Branch A-b; `UX_SPEC.md` E-5, §3.19, §3.8a; EC-13; T-61).
 *
 * Three people, three signed-in browsers, the way it happens:
 *
 * 1. **P1** reads a label no entry describes, enters the chemistry by hand,
 *    proposes a catalog entry — *"Sent to your admin. You can carry on."* —
 *    and logs the battery unmatched.
 * 2. **P6** reviews the proposal at `/settings/catalog` beside the intake
 *    photo and label crop it came from, and approves it with a reason.
 * 3. **The record has not changed.** Its hand-confirmed chemistry still says
 *    *Entered by*. It is raised on `/review` for **P1**, who confirms the
 *    match; only then does the chemistry say it came from the catalog.
 *
 * **Why the manufacturer is corrected to a name of this run's own.** The
 * mock store is one per server and the suite runs in parallel: a published
 * *Kestrel Power* entry would be found by every later read of the no-match
 * label, and the E-5 spec in `intake-branches.spec.ts` would stop being a
 * catalog miss. A person correcting a read value before proposing is the
 * ordinary path (§2.1.4(2)); the name keeps this entry to this spec.
 */

const MANUFACTURER = `Flow F Cells ${Date.now().toString(36)}`;

async function correctRow(
  page: Page,
  fieldCode: "manufacturer",
  value: string,
): Promise<void> {
  const row = fieldRow(page, fieldCode);
  await row.locator("[data-correct]").click();
  await row.getByRole("textbox").fill(value);
  await row.locator("[data-confirm-corrected]").click();
  await expect(row).toHaveAttribute("data-field-status", "confirmed");
}

test("a proposal approved by P6 raises the record for P1, and changes nothing until P1 confirms the match", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  // --- 1 · P1: the miss, the proposal, the unmatched record ------------------
  const handler = await browser.newContext({
    storageState: storageStateFor("p1"),
  });
  const p1 = await handler.newPage();
  await openReview(p1, "label-nomatch.png");

  const panel = p1.locator("[data-catalog-match-panel]");
  await expect(panel).toHaveAttribute("data-catalog-match-state", "empty");
  await panel.locator('[data-catalog-action="enter"]').click();

  const chemistry = fieldRow(p1, "chemistry_code");
  await chemistry.locator("[data-enter-value]").click();
  await chemistry.locator("[data-chemistry-select]").click();
  await p1.getByRole("option", { name: CHEMISTRY_LABELS.li_lfp }).click();
  await confirmRow(p1, "chemistry_code");
  await correctRow(p1, "manufacturer", MANUFACTURER);
  await confirmRow(p1, "model");

  await panel.locator('[data-catalog-action="propose"]').click();
  await expect(panel.locator("[data-proposal-sent]")).toHaveText(
    "Sent to your admin. You can carry on.",
  );

  await continueToPlace(p1);
  await confirmCondition(p1, "none_observed", "sound");
  const recordId = await commitIntake(p1);
  const recordNumber = (await p1.locator("#page-title").textContent())?.trim();
  expect(recordNumber).toMatch(/^BR-\d+/);

  const chemistryField = p1
    .locator("[data-field]")
    .filter({ hasText: CHEMISTRY_LABELS.li_lfp });
  await expect(
    chemistryField.locator('[data-field-source="entered_by"]'),
  ).toBeVisible();

  // --- 2 · P6: the proposal beside its photo, approved with a reason ------------
  const admin = await browser.newContext({
    storageState: storageStateFor("p6"),
  });
  const p6 = await admin.newPage();
  await p6.goto("/settings/catalog");
  const proposal = p6
    .locator("[data-proposal]")
    .filter({ hasText: MANUFACTURER })
    .first();
  await expect(proposal).toBeVisible();
  await expect(proposal.locator('[data-proposal-photo="label"]')).toBeVisible();
  await expect(
    proposal.locator('[data-proposal-photo="label_crop"]'),
  ).toBeVisible();
  const entryId = await proposal.getAttribute("data-proposal");

  await proposal.locator("[data-approve-proposal]").click();
  const approve = p6.locator("[data-approve-dialog]");
  await expect(approve.locator("[data-approve-confirm]")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await approve
    .locator("[data-approve-reason]")
    .fill("Checked against the manufacturer's datasheet");
  await approve.locator("[data-approve-confirm]").click();
  await expect(p6.locator(`[data-proposal="${entryId}"]`)).toHaveCount(0);
  await expect(
    p6.locator(`[data-catalog-admin-entry="${entryId}"]`),
  ).toBeVisible();

  // --- 3 · the record is unchanged until a person confirms ------------------------
  await p1.goto(`/batteries/${recordId}`);
  await expect(
    p1
      .locator("[data-field]")
      .filter({ hasText: CHEMISTRY_LABELS.li_lfp })
      .locator('[data-field-source="entered_by"]'),
  ).toBeVisible();

  await p1.goto("/review");
  const raised = p1.locator(
    `[data-queue-item-kind="rematch"][data-record-number="${recordNumber}"]`,
  );
  await expect(raised).toBeVisible();
  await raised.click();
  const rematch = p1.locator('[data-queue-item-pane="rematch"]');
  await expect(rematch).toBeVisible();
  await expect(rematch.locator("[data-rematch-entry]")).toContainText(
    MANUFACTURER,
  );
  await rematch.locator("[data-confirm-rematch]").click();

  await p1.waitForURL((url) => url.searchParams.get("outcome") === "matched");
  await expect(p1.locator('[data-review-resolved="matched"]')).toContainText(
    recordNumber ?? "",
  );
  await expect(raised).toHaveCount(0);

  await p1.goto(`/batteries/${recordId}`);
  await expect(
    p1
      .locator("[data-field]")
      .filter({ hasText: CHEMISTRY_LABELS.li_lfp })
      .locator('[data-field-source="matched_from_catalog"]'),
  ).toBeVisible();

  await handler.close();
  await admin.close();
});
