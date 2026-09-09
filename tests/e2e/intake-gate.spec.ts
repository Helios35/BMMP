import { expect, test } from "@playwright/test";

import {
  HARD_GATED_LABEL_FIELD_CODES,
  LABEL_FIELD_CODE_LABELS,
} from "@/domain/taxonomy/label-field-code";

import {
  confirmRow,
  fieldRow,
  openReview,
  primaryAction,
} from "./support/intake-flow";
import { storageStateFor } from "./support/roles";

/**
 * **The gate is not configurable; only its thresholds are** — `UX_SPEC.md`
 * §2.1.4(4), §2.1.4(6), §2.12, §3.9, Flow A-a; Rules 2.15, 2.17, 2.21;
 * `_ANCHORS.md` §6.
 *
 * Four things this file holds the built product to, each driven from the
 * outside on a session the test itself opened:
 *
 * 1. **A hard-gated field stops the flow until a person confirms it**, and the
 *    reason is a checklist that names the field — never a silent disabled
 *    button (Rule 1.26).
 * 2. **Bulk confirm never touches the three hard-gated fields.** The control
 *    exists for the high-confidence rest; after it runs, every hard-gated row
 *    is still pending. This is the assertion `_ANCHORS.md` §6 asks for from
 *    the outside, beside the unit test that holds the card to it.
 * 3. **The draft survives.** A confirmation is written to the session before
 *    the action returns (§6.4), so a reload and a fresh page of the same URL
 *    render the same confirmed rows — a locked phone in a storage room loses
 *    nothing.
 * 4. **Resume finds the intake.** `/batteries/new` without a session lists the
 *    unfinished one at the step it reached (Flow A-a).
 *
 * Every attribute asserted is one the card emits for this purpose, and every
 * "none confirmed" sits beside a "some confirmed" so the test cannot pass on an
 * empty card. Nothing touches `src/data` (D-15, D-16).
 */

test.describe("the confidence gate, from the outside", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("with model confirmed and chemistry not, the primary is inert and the checklist names the chemistry", async ({
    page,
  }) => {
    await openReview(page, "label-clean.png");
    await confirmRow(page, "model");

    // The chemistry row is still pending — the fact the checklist reports.
    await expect(fieldRow(page, "chemistry_code")).toHaveAttribute(
      "data-field-status",
      "pending",
    );

    // `aria-disabled` with an inert handler inside `GatedControl`, never the
    // `disabled` attribute (§2.9, Rule 1.26) — the reason stays reachable.
    const primary = primaryAction(page);
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    expect(
      await primary.evaluate(
        (node) => (node as HTMLButtonElement).disabled === true,
      ),
    ).toBe(false);
    await expect(
      primary.locator('xpath=ancestor::*[@data-gated-control="true"][1]'),
    ).toHaveCount(1);

    // The checklist is the commit gate's own list: it names the chemistry and
    // no longer names the model.
    const items = page.locator("[data-outstanding-item]");
    expect(await items.count()).toBeGreaterThan(0);
    const chemistryItems = page.locator(
      '[data-outstanding-item][data-outstanding-field="chemistry_code"]',
    );
    expect(await chemistryItems.count()).toBeGreaterThan(0);
    await expect(chemistryItems.first()).toContainText(
      LABEL_FIELD_CODE_LABELS.chemistry_code,
    );
    await expect(
      page.locator('[data-outstanding-item][data-outstanding-field="model"]'),
    ).toHaveCount(0);

    // Pressing it does nothing: the URL does not move to step 3. `force`
    // because Playwright itself honours `aria-disabled` and would refuse the
    // click — the point here is that the product refuses it too.
    await primary.click({ force: true });
    await page.waitForTimeout(500);
    expect(new URL(page.url()).searchParams.get("step")).toBe("2");
    await expect(page.locator("[data-review-card]")).toBeVisible();
  });

  test("bulk confirm confirms the high-confidence rest and leaves every hard-gated row pending", async ({
    page,
  }) => {
    await openReview(page, "label-clean.png");

    // §2.1.4(4) — offered only with three or more High rows, and it says how
    // many it would touch.
    const bulk = page.locator("[data-bulk-confirm]");
    await expect(bulk).toBeVisible();
    const eligible = Number(await bulk.getAttribute("data-bulk-confirm-count"));
    expect(eligible).toBeGreaterThanOrEqual(3);
    await expect(page.locator('[data-field-status="confirmed"]')).toHaveCount(
      0,
    );

    await bulk.click();

    // The positive half: rows were confirmed, as many as the control promised.
    await expect(page.locator('[data-field-status="confirmed"]')).toHaveCount(
      eligible,
    );

    // The half that matters: model, chemistry code and assessed condition are
    // still exactly where they were (Rules 2.15, 2.17).
    const hardGated = page.locator('[data-field-row][data-hard-gated="true"]');
    await expect(hardGated).toHaveCount(HARD_GATED_LABEL_FIELD_CODES.length);
    for (const code of HARD_GATED_LABEL_FIELD_CODES) {
      await expect(fieldRow(page, code)).not.toHaveAttribute(
        "data-field-status",
        "confirmed",
      );
    }
    await expect(primaryAction(page)).toHaveAttribute("aria-disabled", "true");
  });

  test("the draft survives a reload and a fresh page of the same URL", async ({
    page,
    context,
  }) => {
    const sessionId = await openReview(page, "label-clean.png");
    const url = page.url();

    await confirmRow(page, "manufacturer");
    await confirmRow(page, "voltage");

    // §6.4 — the server wrote it before the row said so, so a reload shows it.
    await page.reload();
    await expect(page.locator("[data-review-card]")).toBeVisible();
    await expect(fieldRow(page, "manufacturer")).toHaveAttribute(
      "data-field-status",
      "confirmed",
    );
    await expect(fieldRow(page, "voltage")).toHaveAttribute(
      "data-field-status",
      "confirmed",
    );
    // And a pending row is still pending: the draft persisted the decisions
    // made, not a blanket state.
    await expect(fieldRow(page, "model")).toHaveAttribute(
      "data-field-status",
      "pending",
    );

    // A second tab of the same person, opened cold on the same URL.
    const fresh = await context.newPage();
    try {
      await fresh.goto(url);
      await expect(fresh).toHaveURL(
        `/batteries/new?session=${encodeURIComponent(sessionId)}&step=2`,
      );
      await expect(fresh.locator("[data-review-card]")).toBeVisible();
      await expect(fieldRow(fresh, "manufacturer")).toHaveAttribute(
        "data-field-status",
        "confirmed",
      );
      await expect(fieldRow(fresh, "voltage")).toHaveAttribute(
        "data-field-status",
        "confirmed",
      );
      await expect(fieldRow(fresh, "model")).toHaveAttribute(
        "data-field-status",
        "pending",
      );
    } finally {
      await fresh.close();
    }
  });

  test("/batteries/new without a session lists the unfinished intake at the step it reached", async ({
    page,
  }) => {
    const sessionId = await openReview(page, "label-clean.png");

    await page.goto("/batteries/new");
    await expect(page).toHaveURL("/batteries/new");
    await expect(page.locator("#page-title")).toBeVisible();

    // Flow A-a — a status, not an alarm, and the resume link goes to step 2,
    // where the session actually is (T-53).
    const notice = page.locator("[data-resume-notice]");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "status");
    expect(
      Number(await notice.getAttribute("data-resume-count")),
    ).toBeGreaterThan(0);
    const resume = page.locator(`[data-resume-session="${sessionId}"]`);
    await expect(resume).toBeVisible();
    await expect(resume).toHaveAttribute(
      "href",
      `/batteries/new?session=${encodeURIComponent(sessionId)}&step=2`,
    );

    await resume.click();
    await page.waitForURL(
      (url) => url.searchParams.get("session") === sessionId,
    );
    expect(new URL(page.url()).searchParams.get("step")).toBe("2");
    await expect(page.locator("[data-review-card]")).toBeVisible();
  });
});
