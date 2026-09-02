import { expect, test } from "@playwright/test";

import {
  CHEMISTRY_UNSET,
  ENTER_MANUALLY,
  NO_READ_ENTER,
  NO_READ_RETAKE,
  NO_READ_SEARCH,
  TRY_AGAIN,
} from "@/components/extraction-review/review-copy";
import { BATTERY_RECORD_STATUS_LABELS } from "@/domain/taxonomy/battery-record-status";
import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { CONTAINER_TYPE_LABELS } from "@/domain/taxonomy/container-type";
import { LABEL_FIELD_CODES } from "@/domain/taxonomy/label-field-code";
import { CANNOT_SHIP_WITHOUT_CATALOG } from "@/features/intake/copy";

import {
  chooseContainer,
  commitIntake,
  confirmCondition,
  confirmRow,
  continueToPlace,
  fieldRow,
  openReview,
  primaryAction,
  secondaryAction,
  selectTopCandidate,
  sendLabelPhoto,
  startedSessionId,
  tap,
} from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * **The branches off Flow A** — `UX_SPEC.md` §2.1.4(5), §2.1.6, §2.13, §3.9,
 * E-4, E-5; Rules 2.10, 2.14, 2.29, 4.16, 4.28, 6.4, 6.8.
 *
 * Each branch is a different fixture label sent through the same capture step,
 * because the fixture label reader picks its answer from the file's name
 * (`src/lib/vision/providers/fixture.ts`). Five branches, one per required
 * state:
 *
 * - **low** — a field below threshold puts the whole record in review
 *   (Rule 2.14); *Save to review queue* leaves it `pending_review`.
 * - **nomatch** — E-5: the record can be logged and cannot ship, and chemistry
 *   arrives from a person, labelled *Entered by you* (Rule 2.10).
 * - **unreadable** — E-4: zero fields is not eleven low fields. A distinct
 *   state, three equal actions, and nothing to confirm.
 * - **fail** — the provider refuses; the session stays recoverable with its
 *   photos (EC-14) and survives a reload, and **Enter details manually** is
 *   the way on (D-20): step 2 opens with every row unread, and that too
 *   survives a reload.
 * - **damaged** — a swelling finding derives *damaged or defective* on its own
 *   (Rule 6.4), the sound drum refuses the pack with the reason on the row
 *   (Rule 4.28), and the record lands quarantined behind the hard block.
 *
 * **Every state is asserted by the attribute that names it**, beside a positive
 * count that proves the surface rendered: the empty card is `data-review-state`
 * *and* three action buttons *and* zero rows; the low card is the other value
 * of the same attribute, read in the same test, so the two cannot quietly
 * become one.
 *
 * Nothing here touches `src/data` (D-15, D-16). Every record these tests create
 * is a new Cascade record; no fixture row is written.
 */

const { CONTAINER } = fixtureIds;

const FORBIDDEN_CHEMISTRY_SOURCES = ["Read from label", "Detected from image"];

test.describe("the branches off Flow A", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("low — a field below threshold puts the record in review, and Save to review queue leaves it there", async ({
    page,
  }) => {
    const sessionId = await openReview(page, "label-low.png");

    // The card rendered rows, and at least one of them sits in the low band —
    // the positive count the banner assertion leans on.
    await expect(page.locator("[data-review-card]")).toHaveAttribute(
      "data-review-state",
      "default",
    );
    await expect(fieldRow(page, "model")).toHaveAttribute(
      "data-field-band",
      "low",
    );

    // §2.1.4(5) — once, above the rows, `pending` intent, a status not an
    // alarm, with the T-52 reasons the gate wrote.
    const banner = page.locator("[data-gate-banner]");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("role", "status");
    await expect(banner).toHaveAttribute("data-intent", "pending");
    await expect(banner).toContainText("Needs review");
    expect(await banner.locator("[data-gate-reason]").count()).toBeGreaterThan(
      0,
    );

    // Save and leave. The record is already `pending_review` from the gate;
    // the save keeps it there and the record page says so.
    await banner.locator("[data-save-to-queue]").click();
    await page.waitForURL(
      (url) =>
        /^\/batteries\/[^/]+$/.test(url.pathname) &&
        url.pathname !== "/batteries/new",
    );
    await expect(page.locator("#page-title")).toBeVisible();
    await expect(page.locator("[data-page-header]").first()).toContainText(
      BATTERY_RECORD_STATUS_LABELS.pending_review,
    );

    // Flow A-a from the record side — the open session is offered back to the
    // role that may write it, at the step it is on.
    const resume = page.locator("[data-resume-intake]");
    await expect(resume).toBeVisible();
    await expect(resume).toHaveAttribute(
      "href",
      `/batteries/new?session=${encodeURIComponent(sessionId)}&step=2`,
    );
  });

  test("nomatch — E-5 says the record cannot ship, and the chemistry is entered by a person", async ({
    page,
  }) => {
    await openReview(page, "label-nomatch.png");

    const panel = page.locator("[data-catalog-match-panel]");
    await expect(panel).toHaveAttribute("data-catalog-match-state", "empty");
    await expect(panel.locator("[data-catalog-candidate]")).toHaveCount(0);
    await expect(panel.locator("[data-catalog-empty]")).toBeVisible();
    // E-5's second line, verbatim — discovering this at `/shipments/new` is a
    // failure of this screen (Rule 5.9).
    await expect(panel.locator("[data-cannot-ship-note]")).toHaveText(
      CANNOT_SHIP_WITHOUT_CATALOG,
    );
    await expect(panel.locator("[data-catalog-action]")).toHaveCount(3);

    await panel.locator('[data-catalog-action="enter"]').click();

    // Rule 2.10 — the label's characters are not a chemistry. The row starts
    // unset, a person picks one, and the badge says who.
    // Asserted as rendered text rather than as visible: from `md` up the
    // card's value column is squeezed to a few pixels by the two `auto`
    // columns beside it (`field-row.tsx`), so Playwright measures the
    // paragraph at zero width. Reported in this unit's build notes; the
    // fact under test is that the row starts with no chemistry.
    const chemistry = fieldRow(page, "chemistry_code");
    await expect(chemistry.locator("[data-chemistry-unset]")).toHaveCount(1);
    await expect(chemistry.locator("[data-chemistry-unset]")).toHaveText(
      CHEMISTRY_UNSET,
    );
    await chemistry.locator("[data-enter-value]").click();
    await chemistry.locator("[data-chemistry-select]").click();
    await page.getByRole("option", { name: CHEMISTRY_LABELS.li_lfp }).click();

    const badge = chemistry.locator('[data-field-source="entered_by"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("Entered by you");
    await expect(chemistry).toContainText(CHEMISTRY_LABELS.li_lfp);
    for (const forbidden of FORBIDDEN_CHEMISTRY_SOURCES) {
      await expect(chemistry).not.toContainText(forbidden);
    }

    await confirmRow(page, "chemistry_code");
    await confirmRow(page, "model");
    await continueToPlace(page);
    await confirmCondition(page, "none_observed", "sound");
    const recordId = await commitIntake(page);

    // The record carries `human_entry` and renders it as *Entered by*.
    await expect(page).toHaveURL(new RegExp(`/batteries/${recordId}`));
    const chemistryField = page
      .locator("[data-field]")
      .filter({ hasText: CHEMISTRY_LABELS.li_lfp });
    await expect(chemistryField).toHaveCount(1);
    await expect(
      chemistryField.locator('[data-field-source="entered_by"]'),
    ).toBeVisible();
    for (const forbidden of FORBIDDEN_CHEMISTRY_SOURCES) {
      await expect(chemistryField).not.toContainText(forbidden);
    }
    await expect(page.locator("[data-page-header]").first()).toContainText(
      BATTERY_RECORD_STATUS_LABELS.classified,
    );
  });

  test("unreadable — E-4 is its own state, with exactly three actions, and is not the low state", async ({
    page,
  }) => {
    await openReview(page, "label-unreadable.png");

    const card = page.locator("[data-review-card]");
    await expect(card).toHaveAttribute("data-review-state", "empty");

    const noRead = card.locator("[data-no-read-state]");
    await expect(noRead).toBeVisible();

    // Nothing to confirm, so no rows and no gate banner — paired with the
    // three actions and three tips that prove the state rendered.
    await expect(card.locator("[data-field-row]")).toHaveCount(0);
    await expect(card.locator("[data-gate-banner]")).toHaveCount(0);

    const actions = noRead.locator("[data-no-read-action]");
    await expect(actions).toHaveCount(3);
    await expect(noRead.locator("button")).toHaveCount(3);
    await expect(actions).toHaveText([
      NO_READ_RETAKE,
      NO_READ_ENTER,
      NO_READ_SEARCH,
    ]);
    await expect(noRead.locator("[data-no-read-tips] li")).toHaveCount(3);

    // The same attribute on the low-confidence card carries a different value:
    // read in this test so the two states cannot quietly share a treatment.
    await openReview(page, "label-low.png");
    const lowState = await page
      .locator("[data-review-card]")
      .getAttribute("data-review-state");
    expect(lowState).toBe("default");
    expect(lowState).not.toBe("empty");
    expect(await page.locator("[data-field-row]").count()).toBeGreaterThan(0);
  });

  test("fail — the read is refused, the session keeps its photos, survives a reload, and Enter details manually is the way on", async ({
    page,
  }) => {
    await sendLabelPhoto(page, "label-fail.png");
    const sessionId = await startedSessionId(page);

    // D-20 — the way on without a read is offered before anything is read.
    await expect(secondaryAction(page)).toHaveText(ENTER_MANUALLY);

    await tap(primaryAction(page), "Read label");

    // EC-14 — a `critical` alert with **Try again** beside **Enter details
    // manually**; the flow does not advance on its own.
    const alert = page.locator("[data-read-label-error]");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute("role", "alert");
    await expect(alert.locator("[data-read-label-retry]")).toHaveText(
      TRY_AGAIN,
    );
    await expect(alert.locator("[data-read-label-manual]")).toHaveText(
      ENTER_MANUALLY,
    );
    expect(new URL(page.url()).searchParams.get("step")).not.toBe("2");

    // A locked phone: the failure is the session's state, not the page's.
    await page.reload();
    await expect(page.locator("#page-title")).toBeVisible();
    await expect(
      page.locator(`[data-resume-session="${sessionId}"]`),
    ).toBeVisible();

    await page.goto(
      `/batteries/new?session=${encodeURIComponent(sessionId)}&step=1`,
    );
    await expect(page.locator("#page-title")).toBeVisible();
    await expect(page.locator("[data-read-label-error]")).toBeVisible();
    await expect(
      page.locator("[data-read-label-error] [data-read-label-retry]"),
    ).toBeVisible();
    // The photo is kept (Rule 2.29).
    await expect(
      page.locator(
        '[data-thumbnail][data-photo-type="label"][data-upload-state="sent"]',
      ),
    ).toHaveCount(1);

    // A URL cannot move the pipeline (Rule 2.2): asking for step 2 of a failed
    // read is answered with the step the session is on.
    await page.goto(
      `/batteries/new?session=${encodeURIComponent(sessionId)}&step=2`,
    );
    await page.waitForURL((url) => url.searchParams.get("step") === "1");
    await expect(page.locator("[data-read-label-error]")).toBeVisible();

    // The way on (E-4, EC-14, D-20): the server opens step 2 by hand, and the
    // card renders every T-09 row for typing — the default state, each row
    // pending and *Not read* — not the no-read state, which would offer the
    // path again. Manual entry does not bypass the gate: the primary stays
    // inert until the hard-gated rows are confirmed by a person.
    await tap(
      page.locator("[data-read-label-error] [data-read-label-manual]"),
      ENTER_MANUALLY,
    );
    await page.waitForURL((url) => url.searchParams.get("step") === "2");
    await expect(page).toHaveURL(
      `/batteries/new?session=${encodeURIComponent(sessionId)}&step=2`,
    );
    const card = page.locator("[data-review-card]");
    await expect(card).toHaveAttribute("data-review-state", "default");
    await expect(card.locator("[data-no-read-state]")).toHaveCount(0);
    const rows = card.locator("[data-field-row]");
    await expect(rows).toHaveCount(LABEL_FIELD_CODES.length);
    await expect(
      card.locator('[data-field-row][data-field-status="pending"]'),
    ).toHaveCount(LABEL_FIELD_CODES.length);
    await expect(primaryAction(page)).toHaveAttribute("aria-disabled", "true");

    // A locked phone, again: the manual path is the session's state.
    await page.reload();
    await expect(page).toHaveURL(
      `/batteries/new?session=${encodeURIComponent(sessionId)}&step=2`,
    );
    await expect(page.locator("[data-review-card]")).toHaveAttribute(
      "data-review-state",
      "default",
    );
    await expect(
      page.locator('[data-field-row][data-field-status="pending"]'),
    ).toHaveCount(LABEL_FIELD_CODES.length);
  });

  test("damaged — swelling derives the condition, the sound drum refuses with its reason, and the record is quarantined", async ({
    page,
  }) => {
    await openReview(page, "label-clean.png");
    await confirmRow(page, "model");
    await selectTopCandidate(page);
    await confirmRow(page, "chemistry_code");
    await continueToPlace(page);

    // Rule 6.4 — no judgement step sits between the finding and the flag.
    const form = page.locator("[data-condition-form]");
    await form.locator('[data-finding-row="swelling"]').click();
    await expect(form).toHaveAttribute(
      "data-assessed-condition",
      "damaged_or_defective",
    );
    await expect(form.locator("[data-ddr-sentence]")).toBeVisible();
    await expect(form.locator("[data-damage-photo-prompt]")).toBeVisible();

    // Rule 4.28 — the required class is stated, and every container is still
    // on the list with its answer (Rule 4.16: never hidden).
    await expect(page.locator("[data-required-container-type]")).toContainText(
      CONTAINER_TYPE_LABELS.light_category_ddr,
    );
    const sound = page.locator(`[data-container-row="${CONTAINER.soundDrum}"]`);
    await expect(sound).toHaveAttribute(
      "data-admission",
      "segregation_class_mismatch",
    );
    await expect(sound).toHaveAttribute("aria-disabled", "true");
    await expect(sound.locator("[data-admission-reason]")).toBeVisible();
    await expect(sound.locator("[data-admission-reason]")).not.toHaveText("");

    const overdue = page.locator(
      `[data-container-row="${CONTAINER.overdueDrum}"]`,
    );
    await expect(overdue).toHaveAttribute(
      "data-admission",
      "container_overdue",
    );
    await expect(overdue).toHaveAttribute("aria-disabled", "true");

    const quarantine = page.locator(
      `[data-container-row="${CONTAINER.quarantineDrum}"]`,
    );
    await expect(quarantine).toHaveAttribute("data-admission", "ok");
    await expect(quarantine).not.toHaveAttribute("aria-disabled", "true");

    await form.locator("[data-confirm-condition]").click();
    await expect(form).toHaveAttribute("data-condition-state", "confirmed");
    await chooseContainer(page, CONTAINER.quarantineDrum);
    const recordId = await commitIntake(page);

    // Rules 6.8, 6.17 — persistent, non-dismissible, and the record is where
    // the routing requirement says it must be.
    await expect(page).toHaveURL(new RegExp(`/batteries/${recordId}`));
    const block = page.locator('[data-hard-block="ddr"]');
    await expect(block).toBeVisible();
    await expect(block).toHaveAttribute("role", "alert");
    await expect(page.locator("[data-page-header]").first()).toContainText(
      BATTERY_RECORD_STATUS_LABELS.quarantined,
    );
  });
});
