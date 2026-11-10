import { expect, test, type Page } from "@playwright/test";

import { csvLine } from "@/lib/export/csv";
import { BATTERY_CSV_HEADERS } from "@/features/battery-record/battery-csv";

import {
  chooseContainer,
  commitIntake,
  confirmRow,
  continueToPlace,
  fixturePayload,
  openReview,
  readLabel,
  selectTopCandidate,
  sendLabelPhoto,
  type IntakeFixtureImage,
} from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * b2-10 — the photo checks, as a person meets them (Rules 1.29, 2.36, 2.37,
 * 6.25, 6.26; D-75). Driven from outside only: real uploads under each
 * fixture image's own name (byte-unique, so no exact-copy check trips), real
 * clicks, the screens the product renders.
 *
 * Fixture images: `damage-swelling.png` (two suggestions),
 * `damage-unavailable.png` (the check fails), `label-different.png` (looks
 * different from its reference), `label-resaved.png` (a re-saved copy of
 * BR-0015's label photo). BR-0016 is the seeded model-assisted assessment.
 */

const { BATTERY, CATALOG, CONTAINER } = fixtureIds;

/** No score, similarity, percentage or probability on a photo check, ever. */
const NO_NUMBER_WORDING = /%|score|similar|probab|likel|confidence/i;

/**
 * Step 1 with a label and a damage photo, then step 2's three confirmations,
 * then step 3 — where the Suggestions list lives.
 */
async function toConditionStep(
  page: Page,
  damageImage: IntakeFixtureImage,
): Promise<void> {
  await sendLabelPhoto(page, "label-clean.png");
  await page.locator('[data-photo-type-option="damage"]').click();
  await page
    .locator('input[type="file"][data-photo-type="damage"]')
    .first()
    .setInputFiles(await fixturePayload(damageImage, {}));
  await expect(
    page.locator(
      '[data-thumbnail][data-photo-type="damage"][data-upload-state="sent"]',
    ),
  ).toHaveCount(1);
  await readLabel(page);
  await confirmRow(page, "model");
  await selectTopCandidate(page);
  await confirmRow(page, "chemistry_code");
  await continueToPlace(page);
}

function suggestion(page: Page, finding: string) {
  return page.locator(
    `[data-condition-form] [data-damage-suggestions] [data-suggestion="${finding}"]`,
  );
}

async function decide(
  page: Page,
  finding: string,
  decision: "accept" | "reject",
): Promise<void> {
  const row = suggestion(page, finding);
  await row.locator(`[data-suggestion-${decision}="${finding}"]`).click();
  await expect(row).toHaveAttribute(
    "data-suggestion-decision",
    decision === "accept" ? "accepted" : "rejected",
  );
}

test.describe("AI damage suggestions on the condition step (Rules 6.25, 6.26)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("a damage photo shows two Suggestions, ticks nothing, and Confirm waits until each is decided", async ({
    page,
  }) => {
    await toConditionStep(page, "damage-swelling.png");
    const form = page.locator("[data-condition-form]");

    await expect(
      form.locator("[data-damage-suggestions] [data-suggestion]"),
    ).toHaveCount(2);
    for (const finding of ["swelling", "surface_marking"]) {
      const row = suggestion(page, finding);
      await expect(row).toHaveAttribute(
        "data-suggestion-decision",
        "undecided",
      );
      await expect(row.locator("[data-ai-suggested]")).toHaveText(
        "AI suggested",
      );
      await expect(row).toContainText("photo 2");
      // Nothing is pre-ticked (D-75 #3).
      await expect(form.locator(`[data-finding="${finding}"]`)).toHaveAttribute(
        "data-state",
        "unchecked",
      );
    }
    await expect(form.locator("[data-damage-suggestions]")).not.toContainText(
      NO_NUMBER_WORDING,
    );

    await form.locator('[data-finding-row="none_observed"]').click();
    await expect(form.locator("[data-confirm-condition]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("accept one, reject one: the record logs, and its history shows both decisions tagged AI suggested", async ({
    page,
  }) => {
    await toConditionStep(page, "damage-swelling.png");
    const form = page.locator("[data-condition-form]");
    await decide(page, "surface_marking", "accept");
    await decide(page, "swelling", "reject");
    await expect(
      form.locator('[data-finding="surface_marking"]'),
    ).toHaveAttribute("data-state", "checked");
    await expect(form).toHaveAttribute(
      "data-assessed-condition",
      "cosmetic_wear_only",
    );
    await form.locator("[data-confirm-condition]").click();
    await expect(form).toHaveAttribute("data-condition-state", "confirmed");
    await chooseContainer(page, CONTAINER.soundDrum);
    const recordId = await commitIntake(page);

    await page.goto(`/batteries/${recordId}?tab=history`);
    const decisions = page.locator("[data-assessment-suggestions]");
    await expect(decisions).toBeVisible();
    await expect(
      decisions.locator('[data-assessment-suggestion="surface_marking"]'),
    ).toContainText(/AI suggested · confirmed by/);
    await expect(
      decisions.locator('[data-assessment-suggestion="swelling"]'),
    ).toContainText(/AI suggested · rejected by/);
    await expect(
      page.locator('[data-assessment-method="model_assisted_visual"]').first(),
    ).toHaveText("AI suggested, confirmed by a person");
  });

  test("an accepted swelling sets the damaged flag as a picked one would: the hard block and quarantine", async ({
    page,
  }) => {
    await toConditionStep(page, "damage-swelling.png");
    const form = page.locator("[data-condition-form]");
    await decide(page, "swelling", "accept");
    await decide(page, "surface_marking", "reject");
    await expect(form).toHaveAttribute(
      "data-assessed-condition",
      "damaged_or_defective",
    );
    await expect(form.locator("[data-ddr-sentence]")).toBeVisible();
    await form.locator("[data-confirm-condition]").click();
    await expect(form).toHaveAttribute("data-condition-state", "confirmed");
    await chooseContainer(page, CONTAINER.quarantineDrum);
    const recordId = await commitIntake(page);

    await expect(page).toHaveURL(new RegExp(`/batteries/${recordId}`));
    const block = page.locator('[data-hard-block-notice="ddr"]');
    await expect(block).toBeVisible();
    await expect(block).toHaveAttribute("role", "alert");
  });

  test("a failed check reads AI suggestions unavailable, blocks nothing, and the intake completes", async ({
    page,
  }) => {
    await toConditionStep(page, "damage-unavailable.png");
    const form = page.locator("[data-condition-form]");
    await expect(form.locator("[data-suggestions-unavailable]")).toHaveText(
      "AI suggestions unavailable — inspect as usual.",
    );
    await expect(form.locator("[data-suggestion]")).toHaveCount(0);
    await form.locator('[data-finding-row="none_observed"]').click();
    await form.locator("[data-confirm-condition]").click();
    await expect(form).toHaveAttribute("data-condition-state", "confirmed");
    await chooseContainer(page, CONTAINER.soundDrum);
    await commitIntake(page);
  });
});

test.describe("the label look and copy checks on /review (Rules 2.36, 2.37)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("a label that looks different from its reference lands on /review with both photos, tagged, and no number", async ({
    page,
  }) => {
    const sessionId = await openReview(page, "label-different.png");
    const banner = page.locator("[data-gate-banner]");
    await expect(
      banner.locator('[data-gate-reason="label_look_differs"]'),
    ).toBeVisible();
    const look = banner.locator("[data-label-look]");
    await expect(look.locator("[data-ai-suggested]")).toHaveText(
      "AI suggested",
    );
    await expect(
      look.locator('[data-photo-pair-item="This label"]'),
    ).toBeVisible();
    await expect(
      look.locator('[data-photo-pair-item="Catalog reference"]'),
    ).toBeVisible();
    await expect(look).not.toContainText(NO_NUMBER_WORDING);

    await banner.locator("[data-save-to-queue]").click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/review" &&
        url.searchParams.get("item") === sessionId,
    );
    const pane = page.locator(
      `[data-queue-item-pane="intake"][data-session-id="${sessionId}"]`,
    );
    await expect(
      pane.locator("[data-label-look] [data-photo-pair-item]"),
    ).toHaveCount(2);
  });

  test("a re-saved copy of another record's photo lands on /review naming that record", async ({
    page,
  }) => {
    const sessionId = await openReview(page, "label-resaved.png");
    const banner = page.locator("[data-gate-banner]");
    await expect(
      banner.locator('[data-gate-reason="photo_looks_reused"]'),
    ).toBeVisible();
    const target = banner.locator(
      `[data-photo-reuse-record="${BATTERY.photoCopyTarget}"]`,
    );
    await expect(target).toContainText("BR-0015");
    await expect(target.locator("[data-photo-pair-item]")).toHaveCount(2);
    // A fingerprint is not a model's judgment: no AI tag (D-75 #8).
    await expect(
      banner.locator("[data-photo-reuse] [data-ai-suggested]"),
    ).toHaveCount(0);

    await banner.locator("[data-save-to-queue]").click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/review" &&
        url.searchParams.get("item") === sessionId,
    );
    await expect(
      page.locator(
        `[data-queue-item-pane="intake"][data-session-id="${sessionId}"] [data-photo-reuse-record="${BATTERY.photoCopyTarget}"]`,
      ),
    ).toBeVisible();
  });
});

test.describe("reference label photos (Rule 2.36; D-75 #2)", () => {
  test.describe("as P6", () => {
    test.use({ storageState: storageStateFor("p6") });

    test("P6 sets an entry's reference photo on /settings/catalog?entry=, and it shows read-only on /catalog/[id]", async ({
      page,
    }) => {
      await page.goto(`/settings/catalog?entry=${CATALOG.laptopCellLco}`);
      const panel = page.locator(
        `[data-reference-photo-panel="${CATALOG.laptopCellLco}"]`,
      );
      await expect(panel).toBeVisible();
      await panel
        .locator('input[type="file"]')
        .first()
        .setInputFiles(await fixturePayload("label-clean.png", {}));
      await expect(
        panel.locator('[data-reference-photo="current"]'),
      ).toBeVisible();

      await page.goto(`/catalog/${CATALOG.laptopCellLco}`);
      await expect(
        page.locator('[data-reference-photo="current"]'),
      ).toBeVisible();
      await expect(page.locator("[data-reference-photo-panel]")).toHaveCount(0);
    });
  });

  test.describe("as P1", () => {
    test.use({ storageState: storageStateFor("p1") });

    test("P1 cannot reach the panel, and the entry page offers no way to set one", async ({
      page,
    }) => {
      await page.goto(`/settings/catalog?entry=${CATALOG.mobilityScooterSla}`);
      await expect(page).not.toHaveURL(/\/settings\/catalog/);
      await page.goto(`/catalog/${CATALOG.mobilityScooterSla}`);
      await expect(page.locator("[data-reference-photo]")).toBeVisible();
      await expect(page.locator("[data-reference-photo-panel]")).toHaveCount(0);
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
    });
  });
});

test.describe("exports and the read-only reader (Rule 1.29)", () => {
  test.describe("the /batteries CSV", () => {
    test.use({ storageState: storageStateFor("p2") });

    test("carries Identified by and Damage assessed by, and BR-0016's model-assisted method", async ({
      page,
    }) => {
      const response = await page.request.get("/api/exports/batteries");
      expect(response.status()).toBe(200);
      const body = (await response.text()).slice(1);
      const [headerLine, ...rows] = body.split("\r\n");
      expect(headerLine).toBe(csvLine(BATTERY_CSV_HEADERS));
      expect(headerLine).toContain("Identified by");
      expect(headerLine).toContain("Damage assessed by");
      const modelAssisted = rows.find((row) => row.startsWith("BR-0016,"));
      expect(modelAssisted).toContain("AI suggested, confirmed by a person");
      expect(body).not.toMatch(/probability|likelihood/i);
    });
  });

  test.describe("P5", () => {
    test.use({ storageState: storageStateFor("p5") });

    test("sees the tags on a record's history and photos, and no way to decide anything", async ({
      page,
    }) => {
      await page.goto(`/batteries/${BATTERY.modelAssisted}?tab=history`);
      const decisions = page.locator("[data-assessment-suggestions]");
      await expect(decisions.locator("[data-ai-suggested]")).toHaveCount(2);
      await expect(
        page.locator("[data-suggestion-accept], [data-suggestion-reject]"),
      ).toHaveCount(0);

      await page.goto(`/batteries/${BATTERY.modelAssisted}?tab=photos`);
      await expect(
        page.locator(
          '[data-photo-check="damage_proposal"] [data-ai-suggested]',
        ),
      ).toBeVisible();

      // The failed look check on BR-0015 reads as failed, never as a pass.
      await page.goto(`/batteries/${BATTERY.photoCopyTarget}?tab=photos`);
      await expect(
        page.locator(
          '[data-photo-check="label_look"][data-photo-check-outcome="failed"]',
        ),
      ).toContainText("Check failed");
      await expect(page.locator("[data-suggestion-accept]")).toHaveCount(0);
    });
  });
});
