import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";

import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";

/**
 * Driving `/batteries/new` the way a person does, for the intake specs.
 *
 * Everything here is a click, a file chosen into the real `<input type="file">`,
 * and a wait on what the product renders afterwards. **Nothing reaches into
 * `src/data`, forges a session, or short-cuts a Server Action** — the same
 * suite has to pass against `DATA_ADAPTER=supabase` (D-15, D-16), and a driver
 * that seeded a draft out of band would prove nothing about the pipeline the
 * specs exist to prove.
 *
 * ## Why the file name matters
 *
 * The fixture label reader (`src/lib/vision/providers/fixture.ts`) picks its
 * scenario from the **last hyphen token of the uploaded file's name** —
 * `label-low.png` reads as the low-confidence label, `label-fail.png` makes the
 * provider refuse. So every upload here goes through `setInputFiles` with the
 * real path under `tests/e2e/fixtures/intake/`, never a renamed copy, and the
 * name travels from the upload reply through `runLabelExtraction` to the
 * provider. A spec that lands on the wrong branch should look at that hand-off
 * before it looks here.
 *
 * ## Structural selectors only
 *
 * Every locator is a `data-*` attribute the step components and the review card
 * emit for exactly this purpose (`data-field-row`, `data-field-status`,
 * `data-primary-action`, `data-container-row`, …). Copy is asserted by the specs
 * where the copy is the point; structure is never found by its label, because a
 * label changes and a selector that found nothing would pass by finding nothing.
 */

/** The synthetic PNGs `scripts/make-intake-fixture-images.mjs` writes. */
export type IntakeFixtureImage =
  | "label-clean.png"
  | "label-low.png"
  | "label-nomatch.png"
  | "label-unreadable.png"
  | "label-fail.png"
  | "label-manualcrop.png"
  | "label-scooter.png"
  | "whole-pack.png"
  | "damage.png";

export const INTAKE_FIXTURE_DIR = path.join(
  process.cwd(),
  "tests",
  "e2e",
  "fixtures",
  "intake",
);

/** The absolute path of one fixture image — the real file, under its real name. */
export function fixtureImage(name: IntakeFixtureImage): string {
  return path.join(INTAKE_FIXTURE_DIR, name);
}

/** `UX_SPEC.md` §1.5 — the floor every control a finger hits has to clear. */
export const MINIMUM_TARGET_PX = 44;

/**
 * Click a control, after proving it is a target a thumb can hit.
 *
 * The happy path runs one-handed at 375×812, and §1.5's 44px floor is a rule
 * for every control on that path rather than a sweep run once elsewhere. A
 * control that shrank below the floor fails here, on the click that would have
 * missed, with its size in the message.
 */
export async function tap(control: Locator, what: string): Promise<void> {
  await expect(control, `${what} is not on screen`).toBeVisible();
  const box = await control.boundingBox();
  if (box === null) throw new Error(`${what} has no bounding box to measure`);
  expect(
    box.width,
    `${what} is ${box.width}px wide — under the ${MINIMUM_TARGET_PX}px floor (UX_SPEC.md §1.5)`,
  ).toBeGreaterThanOrEqual(MINIMUM_TARGET_PX);
  expect(
    box.height,
    `${what} is ${box.height}px tall — under the ${MINIMUM_TARGET_PX}px floor (UX_SPEC.md §1.5)`,
  ).toBeGreaterThanOrEqual(MINIMUM_TARGET_PX);
  await control.click();
}

/* ------------------------------------------------------------- locators */

/** The step's primary, wherever `MobileActionBar` has put it at this width. */
export function primaryAction(page: Page): Locator {
  return page.locator('[data-mobile-action-bar] [data-primary-action="true"]');
}

/** One row of the extraction review card. */
export function fieldRow(page: Page, fieldCode: LabelFieldCode): Locator {
  return page.locator(`[data-field-row="${fieldCode}"]`);
}

/** The hidden file input behind the label shutter — the camera, on a phone. */
export function labelFileInput(page: Page): Locator {
  return page.locator('input[type="file"][data-photo-type="label"]').first();
}

/* ---------------------------------------------------------- the session */

/**
 * The `?session=` of the URL the flow is standing on.
 *
 * The session id is only ever read back off the URL or off the capture step's
 * own attribute — never minted here — so a spec is always talking about the
 * session the product actually opened.
 */
export function sessionIdFromUrl(page: Page): string {
  const session = new URL(page.url()).searchParams.get("session");
  if (session === null || session === "") {
    throw new Error(`no ?session= on ${page.url()}`);
  }
  return session;
}

/** The step the URL says the flow is on, one-based, or `null` off the flow. */
export function stepFromUrl(page: Page): number | null {
  const step = new URL(page.url()).searchParams.get("step");
  return step === null ? null : Number(step);
}

/**
 * Open `/batteries/new` and send one label photo.
 *
 * The first capture starts the session on the server (`startIntakeSession`),
 * uploads through `POST /api/intake/photos`, and the thumbnail reads **Sent**
 * only once the route has answered `201`. The step's own `data-label-sent`
 * flips with it, which is what enables **Read label**.
 */
export async function sendLabelPhoto(
  page: Page,
  image: IntakeFixtureImage,
): Promise<void> {
  await page.goto("/batteries/new");
  await expect(page).toHaveURL("/batteries/new");
  await expect(page.locator("#page-title")).toBeVisible();

  await labelFileInput(page).setInputFiles(fixtureImage(image));

  await expect(
    page.locator(
      '[data-thumbnail][data-photo-type="label"][data-upload-state="sent"]',
    ),
  ).toHaveCount(1);
  await expect(page.locator("[data-photo-capture-step]")).toHaveAttribute(
    "data-label-sent",
    "true",
  );
}

/** The session the capture step started, once a photo has been sent. */
export async function startedSessionId(page: Page): Promise<string> {
  const id = await page
    .locator("[data-photo-capture-step]")
    .getAttribute("data-session-id");
  if (id === null || id === "") {
    throw new Error("the capture step has not started a session yet");
  }
  return id;
}

/**
 * Press **Read label** and wait for the pipeline to hand the session to a
 * person — the flow moves to step 2 only once `runLabelExtraction` has
 * returned `reviewed` (§11.1 steps 2–5, Rule 2.2).
 */
export async function readLabel(page: Page): Promise<string> {
  const primary = primaryAction(page);
  await expect(primary).not.toHaveAttribute("aria-disabled", "true");
  await tap(primary, "Read label");
  await page.waitForURL((url) => url.searchParams.get("step") === "2");
  await expect(page.locator("[data-review-card]")).toBeVisible();
  return sessionIdFromUrl(page);
}

/** Capture and read in one go; resolves to the session id on step 2. */
export async function openReview(
  page: Page,
  image: IntakeFixtureImage,
): Promise<string> {
  await sendLabelPhoto(page, image);
  return readLabel(page);
}

/* ------------------------------------------------------------- step 2 */

/**
 * Confirm one row as read.
 *
 * A row reads `confirmed` only when the server has written it and the step has
 * re-rendered (§6.4 — never optimistic), so the wait here is on the attribute
 * the server's answer produces, not on the click.
 */
export async function confirmRow(
  page: Page,
  fieldCode: LabelFieldCode,
): Promise<void> {
  const row = fieldRow(page, fieldCode);
  await tap(row.locator("[data-confirm]"), `Confirm on ${fieldCode}`);
  await expect(row).toHaveAttribute("data-field-status", "confirmed");
}

/**
 * Choose the top-ranked catalog candidate.
 *
 * Highlighted but **not pre-selected** (Rule 2.19) — the radio is unchecked
 * until this click, and `data-selected` appears only after
 * `selectCatalogCandidate` has landed and the step has re-read the draft.
 */
export async function selectTopCandidate(page: Page): Promise<string> {
  const top = page.locator(
    '[data-catalog-candidate][data-top-candidate="true"]',
  );
  await expect(top).toHaveCount(1);
  await expect(top).not.toHaveAttribute("data-selected", "true");
  await tap(top.locator("label"), "the closest catalog match");
  await expect(top).toHaveAttribute("data-selected", "true");
  const id = await top.getAttribute("data-catalog-candidate");
  if (id === null) throw new Error("the selected candidate carries no id");
  return id;
}

/** **Confirm and continue** — step 2 to step 3, once the review gate is clear. */
export async function continueToPlace(page: Page): Promise<void> {
  const primary = primaryAction(page);
  await expect(primary).not.toHaveAttribute("aria-disabled", "true");
  await tap(primary, "Confirm and continue");
  await page.waitForURL((url) => url.searchParams.get("step") === "3");
  await expect(page.locator("[data-condition-form]")).toBeVisible();
}

/* ------------------------------------------------------------- step 3 */

/**
 * Record one finding and confirm the condition it derives.
 *
 * The label row is the target (44px, `htmlFor` the checkbox), and the derived
 * condition is asserted from the form's own attribute before the confirm is
 * pressed — the person confirms a derivation, never picks a grade (Rule 6.4).
 */
export async function confirmCondition(
  page: Page,
  finding: DamageFindingType,
  expectedCondition: string,
): Promise<void> {
  const form = page.locator("[data-condition-form]");
  await tap(
    form.locator(`[data-finding-row="${finding}"]`),
    `the ${finding} finding`,
  );
  await expect(form).toHaveAttribute(
    "data-assessed-condition",
    expectedCondition,
  );
  await tap(
    form.locator("[data-confirm-condition]"),
    "Confirm assessed condition",
  );
  await expect(form).toHaveAttribute("data-condition-state", "confirmed");
}

/** Pick a container by its fixture id and wait for the draft to name it. */
export async function chooseContainer(
  page: Page,
  containerId: string,
): Promise<void> {
  const row = page.locator(`[data-container-row="${containerId}"]`);
  await expect(row).toHaveAttribute("data-admission", "ok");
  await tap(row, `container ${containerId}`);
  await expect(page.locator("[data-container-picker]")).toHaveAttribute(
    "data-selected-container",
    containerId,
  );
}

/**
 * **Confirm and log battery** — the commit.
 *
 * `confirmIntake` redirects to the record on success, so the resolved URL is
 * the proof the adapter wrote every row as one operation (design §5). The id
 * is taken off that URL and nowhere else.
 */
export async function commitIntake(page: Page): Promise<string> {
  const primary = primaryAction(page);
  await expect(primary).not.toHaveAttribute("aria-disabled", "true");
  await tap(primary, "Confirm and log battery");
  await page.waitForURL(
    (url) =>
      /^\/batteries\/[^/]+$/.test(url.pathname) &&
      url.pathname !== "/batteries/new",
  );
  return new URL(page.url()).pathname.replace("/batteries/", "");
}

/* ------------------------------------------------------- whole journeys */

export interface LoggedRecord {
  readonly sessionId: string;
  readonly recordId: string;
  readonly recordNumber: string;
  readonly catalogEntryId: string;
}

/**
 * The clean label, start to finish: confirm the two hard-gated rows on step 2
 * (model, then chemistry from the catalog match), record *none observed* on
 * step 3, optionally place, and commit.
 *
 * Specs that need a record of their own — the write paths, the audit thread —
 * start here rather than editing a fixture row another spec asserts on.
 */
export async function logCleanBattery(
  page: Page,
  options: { readonly containerId?: string } = {},
): Promise<LoggedRecord> {
  const sessionId = await openReview(page, "label-clean.png");

  await confirmRow(page, "model");
  const catalogEntryId = await selectTopCandidate(page);
  await confirmRow(page, "chemistry_code");
  await continueToPlace(page);

  await confirmCondition(page, "none_observed", "sound");
  if (options.containerId !== undefined) {
    await chooseContainer(page, options.containerId);
  }
  const recordId = await commitIntake(page);

  const recordNumber = (
    await page.locator("#page-title").textContent()
  )?.trim();
  if (recordNumber === undefined || recordNumber === "") {
    throw new Error("the record page rendered no record number");
  }
  return { sessionId, recordId, recordNumber, catalogEntryId };
}
