import { expect, test, type Page } from "@playwright/test";

import {
  AUDIT_EVENT_TYPE_LABELS,
  type AuditEventType,
} from "@/domain/taxonomy/audit-event-type";
import { BATTERY_RECORD_STATUS_LABELS } from "@/domain/taxonomy/battery-record-status";
import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import {
  LABEL_FIELD_CODE_LABELS,
  LABEL_FIELD_CODES,
} from "@/domain/taxonomy/label-field-code";
import { STATE_OF_CHARGE_BAND_LABELS } from "@/domain/taxonomy/state-of-charge-band";

import {
  chooseContainer,
  commitIntake,
  confirmCondition,
  confirmRow,
  continueToPlace,
  fieldRow,
  openReview,
  primaryAction,
  selectTopCandidate,
  tap,
} from "./support/intake-flow";
import { fixtureIds, personaFor, storageStateFor } from "./support/roles";

/**
 * **Flow A — a clean label, one-handed, from the first photo to the audit
 * trail** (`UX_SPEC.md` §3.6, §3.9, §2.1, §2.13; `TECHNICAL_SPEC.md` §11.1;
 * Rules 2.10, 2.15, 2.19, 2.21, 6.2, 12.3).
 *
 * The one journey the whole unit exists for, driven exactly as Dana drives it:
 * at 375×812, with a thumb. Every control on the path is measured against
 * §1.5's 44px floor before it is pressed (`tap`), so a control that shrank
 * fails on the press that would have missed it.
 *
 * What has to be true, in the order a person meets it:
 *
 * 1. **The photo is the camera's file** — chosen into the real
 *    `<input type="file">` and stored through the upload route; the thumbnail
 *    reads *Sent* only after the `201`.
 * 2. **The card renders rows, and chemistry is never a thing a camera read.**
 *    The chemistry row carries *Matched from catalog* after the candidate is
 *    chosen, and nothing on the page says a chemistry was read or detected
 *    (Rule 2.10, `_ANCHORS.md` §7.2). The primary stays `aria-disabled` with a
 *    checklist that names the chemistry until a person confirms it (Rule 2.15).
 * 3. **The candidate is highlighted, not chosen** (Rule 2.19) until the tap.
 * 4. **Step 3 confirms a derivation** (Rule 6.4), previews the classification
 *    with its reasoning and the rule version it applied (Rule 3.7), and places
 *    the pack into the open, sound drum.
 * 5. **The commit lands on the record**, with the toast and *Log another*, the
 *    catalog-sourced chemistry, *In storage*, and both photographs.
 * 6. **The trail is evidence** (Rules 12.3, 12.5): as a role that may read the
 *    log, every event type the intake wrote is there, and the rows one request
 *    produced share one correlation id.
 *
 * ## The seam
 *
 * Nothing here touches `src/data`, resets a store or forges a session. The
 * record is created by driving the product and read back by driving the
 * product; the trail is read through `/audit` as Marta would read it. That is
 * what keeps this meaningful against `DATA_ADAPTER=supabase` (D-15, D-16).
 *
 * ## Why every count is paired with a positive count
 *
 * "Found no forbidden phrase" and "found no rows" look identical to a test
 * that only asserts absence. Each absence below sits beside the presence that
 * proves the surface rendered.
 */

const { CONTAINER, USER } = fixtureIds;

/** Copy a camera must never be credited with (Rule 2.10; design §0.3). */
const CHEMISTRY_FROM_A_PHOTO =
  /detected chemistry|read chemistry|chemistry (was )?(read|detected) from/i;

/** The two source labels the chemistry row may never wear (`field-source-badge.tsx`). */
const FORBIDDEN_CHEMISTRY_SOURCES = ["Read from label", "Detected from image"];

test.describe("Flow A — the clean label, one-handed", () => {
  test.use({
    storageState: storageStateFor("p1"),
    viewport: { width: 375, height: 812 },
  });

  test("photo → review → confirm and place → record → audit trail", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(240_000);

    expect(personaFor("p1").role).toBe("compliance_handler");

    /* ------------------------------------------------ step 1 → step 2 */

    const sessionId = await openReview(page, "label-clean.png");
    await expect(page).toHaveURL(
      `/batteries/new?session=${encodeURIComponent(sessionId)}&step=2`,
    );

    // §2.15 — the primary is 56px full-width on a phone; §1.5's floor is the
    // least it may ever be, and it is measured rather than trusted.
    const primary = primaryAction(page);
    const primaryBox = await primary.boundingBox();
    expect(primaryBox).not.toBeNull();
    expect(primaryBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(primaryBox?.width ?? 0).toBeGreaterThanOrEqual(44);

    /* --------------------------------------------- the card, as read */

    const card = page.locator("[data-review-card]");
    await expect(card).toHaveAttribute("data-review-state", "default");

    // Eleven T-09 rows, in taxonomy order — the positive count every absence
    // below leans on.
    const rows = page.locator("[data-field-row]");
    await expect(rows).toHaveCount(LABEL_FIELD_CODES.length);

    // Rule 2.15 — hard-gated, so the primary is inert with the reason listed,
    // and the list names the chemistry.
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    const outstanding = page.locator("[data-outstanding-item]");
    expect(await outstanding.count()).toBeGreaterThan(0);
    const chemistryItem = page.locator(
      '[data-outstanding-item][data-outstanding-field="chemistry_code"]',
    );
    expect(await chemistryItem.count()).toBeGreaterThan(0);
    await expect(chemistryItem.first()).toContainText(
      LABEL_FIELD_CODE_LABELS.chemistry_code,
    );

    /* ----------------------------------------------- the three acts */

    await confirmRow(page, "model");
    await selectTopCandidate(page);

    // Rule 2.10 — chemistry comes from the matched entry and says so. The
    // badge is asserted inside the row so a badge elsewhere cannot satisfy it.
    const chemistry = fieldRow(page, "chemistry_code");
    await expect(
      chemistry.locator('[data-field-source="matched_from_catalog"]'),
    ).toBeVisible();
    await expect(chemistry).toContainText(CHEMISTRY_LABELS.li_nmc);
    for (const forbidden of FORBIDDEN_CHEMISTRY_SOURCES) {
      await expect(chemistry).not.toContainText(forbidden);
    }
    expect(await page.content()).not.toMatch(CHEMISTRY_FROM_A_PHOTO);

    await confirmRow(page, "chemistry_code");

    // The checklist has emptied and the primary is live — only now.
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await continueToPlace(page);

    /* -------------------------------------------------------- step 3 */

    await confirmCondition(page, "none_observed", "sound");

    // State of charge — the band is what is recorded (T-21).
    await tap(
      page.locator("[data-soc-band-trigger]"),
      "the state of charge band",
    );
    await tap(
      page.getByRole("option", {
        name: STATE_OF_CHARGE_BAND_LABELS.at_or_below_storage_limit,
      }),
      "the at-or-below band",
    );
    await expect(page.locator("[data-state-of-charge-form]")).toHaveAttribute(
      "data-soc-band",
      "at_or_below_storage_limit",
    );

    await chooseContainer(page, CONTAINER.soundDrum);

    // Rule 3.7 — the outcome is previewed with its reasoning and the rule
    // version it applied, not behind a disclosure. `decided` is the positive
    // count for the trail below.
    const outcome = page.locator('[data-classification-outcome="preview"]');
    await expect(outcome).toHaveAttribute(
      "data-classification-kind",
      "decided",
    );
    expect(
      await outcome.locator("[data-applied-rule]").count(),
    ).toBeGreaterThan(0);
    await expect(outcome.locator("[data-classification-state]")).toHaveCount(0);

    /* -------------------------------------------------- the commit */

    const recordId = await commitIntake(page);
    const recordPath = `/batteries/${recordId}`;

    // §6.2 — the toast fires on the destination, with **Log another**.
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Battery logged");
    const logAnother = toast.getByRole("button", { name: "Log another" });
    await expect(logAnother).toBeVisible();
    await expect(page.locator("#page-title")).toBeVisible();
    const recordNumber = (
      await page.locator("#page-title").textContent()
    )?.trim();
    expect(recordNumber).toMatch(/^BR-\d+$/);

    /* --------------------------------------------- the record page */

    const header = page.locator("[data-page-header]").first();
    await expect(header).toContainText(BATTERY_RECORD_STATUS_LABELS.stored);

    const chemistryField = page
      .locator("[data-field]")
      .filter({ hasText: CHEMISTRY_LABELS.li_nmc });
    await expect(chemistryField).toHaveCount(1);
    await expect(
      chemistryField.locator('[data-field-source="matched_from_catalog"]'),
    ).toBeVisible();
    for (const forbidden of FORBIDDEN_CHEMISTRY_SOURCES) {
      await expect(chemistryField).not.toContainText(forbidden);
    }
    expect(await page.content()).not.toMatch(CHEMISTRY_FROM_A_PHOTO);

    // The Photos tab holds both rows — the original and the crop the pipeline
    // appended — and one extraction row per T-09 field (Rule 2.12).
    await page.goto(`${recordPath}?tab=photos`);
    await expect(page.locator("#page-title")).toBeVisible();
    await expect(page.locator("[data-intake-photo]")).toHaveCount(2);
    await expect(page.locator("[data-field-code]")).toHaveCount(
      LABEL_FIELD_CODES.length,
    );

    // **Log another** returns to intake with the drum pre-selected — the one
    // control a handler taps between every battery, measured against §1.5's
    // floor like every other control on the path.
    await page.goto(`${recordPath}?logged=1`);
    await tap(
      page
        .locator("[data-sonner-toast]")
        .first()
        .getByRole("button", { name: "Log another" }),
      "Log another",
    );
    await expect(page).toHaveURL(
      `/batteries/new?container=${encodeURIComponent(CONTAINER.soundDrum)}`,
    );
    await expect(
      page.locator(`[data-container-context="${CONTAINER.soundDrum}"]`),
    ).toBeVisible();

    /* --------------------------------------------- the audit trail */

    // A second session rather than a second sign-in: P1 cannot read `/audit`
    // (Rule 12.8), so the trail is read as Marta, in the same organisation.
    const readerContext = await browser.newContext({
      storageState: storageStateFor("p2"),
      baseURL,
    });
    try {
      const audit = await readerContext.newPage();
      await expectIntakeTrail(audit, { sessionId, recordId });
    } finally {
      await readerContext.close();
    }
  });
});

/* ------------------------------------------------------------- the trail */

interface AuditRow {
  readonly text: string;
  readonly correlationId: string;
  readonly hrefs: readonly string[];
}

/**
 * One narrowing of `/audit`, with every row's change detail expanded so the
 * correlation id — which lives inside the disclosure (§3.20) — is readable.
 *
 * The URL narrows by event type and actor, which the screen supports; it
 * cannot narrow by entity id, so a row is picked out afterwards by the record
 * link it carries, the id its detail names, or the correlation id it shares.
 */
async function auditRows(
  page: Page,
  url: string,
): Promise<readonly AuditRow[]> {
  await page.goto(url);
  await expect(page).toHaveURL(/\/audit\?/);
  await expect(page.locator("#page-title")).toBeVisible();

  // Expand every disclosure in one pass — the toggles are ordinary buttons,
  // and the page is shared by every spec in the run, so a hundred rows is an
  // ordinary page — then wait until none is collapsed.
  const collapsed = page.locator('[data-audit-detail="collapsed"]');
  const toExpand = await collapsed.count();
  if (toExpand > 0) {
    await collapsed.locator("button").evaluateAll((buttons) => {
      for (const button of buttons) {
        if (button instanceof HTMLElement) button.click();
      }
    });
    await expect(collapsed).toHaveCount(0);
    await expect(page.locator('[data-audit-detail="expanded"]')).toHaveCount(
      toExpand,
    );
  }

  return page
    .locator("tr")
    .filter({ has: page.locator("[data-correlation-id]") })
    .evaluateAll((rows) =>
      rows.map((row) => ({
        text: row.textContent ?? "",
        correlationId:
          row.querySelector("[data-correlation-id]")?.textContent?.trim() ?? "",
        hrefs: Array.from(row.querySelectorAll("a[href]")).map(
          (anchor) => anchor.getAttribute("href") ?? "",
        ),
      })),
    );
}

/** Whose row it is: Dana's own act, or the pipeline's. */
type Actor = "dana" | "system";

/**
 * The narrowing the screen supports for one event type: the type itself, and
 * the actor where the row is a person's or the actor type where it is the
 * pipeline's — exact matches on either adapter, as `guard-audit.spec.ts`
 * notes, so an in-memory scorer and Postgres cannot disagree about them.
 */
function byType(type: AuditEventType, actor: Actor): string {
  const narrowing =
    actor === "dana"
      ? `&actor=${encodeURIComponent(USER.danaHandler)}`
      : "&actorType=system";
  return `/audit?type=${encodeURIComponent(type)}${narrowing}&perPage=100`;
}

/**
 * Every event type the intake wrote, found through the log as a reader would,
 * and **all of it under one correlation id** — design §11; the brief's
 * reviewer checklist ("every step under one correlation ID, failures
 * included"); `ERD.md` §5.3.
 *
 * Several requests produce the trail — the session start, the photo upload,
 * the label read (which writes the extraction and the match), the
 * confirmations and the commit (which writes the confirmation, the
 * assessment, the decision and the status change as one operation, design
 * §5) — and each request arrives with an id of its own. The thread is the
 * session's: the request that opened it minted the id, and every later
 * request rebinds to it before it writes. So the start row's id is read
 * first, and every other row of the intake is required to carry it. No row
 * of this journey legitimately stands outside the thread: the one kind that
 * would — a denial recorded before a session is known — does not occur here.
 */
async function expectIntakeTrail(
  page: Page,
  ids: { readonly sessionId: string; readonly recordId: string },
): Promise<void> {
  const recordHref = `/batteries/${ids.recordId}`;

  // The start — Dana's own row, naming the draft record it opened. Its id is
  // the thread.
  const started = (
    await auditRows(page, byType("intake_session.started", "dana"))
  ).find((row) => row.text.includes(ids.recordId));
  expect(
    started,
    `no ${AUDIT_EVENT_TYPE_LABELS["intake_session.started"]} row names record ${ids.recordId}`,
  ).toBeDefined();
  const thread = started?.correlationId ?? "";
  expect(thread).not.toBe("");

  // Rows that link or name the record or the session: found by that, then
  // required to share the thread.
  const namedRows: readonly (readonly [
    AuditEventType,
    Actor,
    (row: AuditRow) => boolean,
  ])[] = [
    [
      "intake_photo.captured",
      "dana",
      (row) => row.text.includes(ids.sessionId),
    ],
    [
      "label_extraction.completed",
      "system",
      (row) => row.text.includes(ids.sessionId),
    ],
    [
      "catalog_entry.matched",
      "system",
      (row) => row.hrefs.includes(recordHref),
    ],
    [
      "battery_record.confirmed",
      "dana",
      (row) => row.hrefs.includes(recordHref),
    ],
  ];
  for (const [type, actor, names] of namedRows) {
    const rows = (await auditRows(page, byType(type, actor))).filter(names);
    expect(
      rows.length,
      `no ${AUDIT_EVENT_TYPE_LABELS[type]} row names this intake`,
    ).toBeGreaterThan(0);
    for (const row of rows) {
      expect(
        row.correlationId,
        `${AUDIT_EVENT_TYPE_LABELS[type]}: a row of this intake carries ${row.correlationId}, not the session's thread ${thread}`,
      ).toBe(thread);
    }
  }

  // The commit's other rows name neither the record link nor the session in
  // their text; they are found by the thread itself, beside a positive count
  // that the log lists rows of that type at all.
  const threadedRows: readonly (readonly [AuditEventType, Actor])[] = [
    ["damage_assessment.recorded", "dana"],
    ["classification_decision.recorded", "system"],
    ["battery_record.status_changed", "dana"],
  ];
  for (const [type, actor] of threadedRows) {
    const rows = await auditRows(page, byType(type, actor));
    expect(
      rows.length,
      `${type}: the log lists no rows at all`,
    ).toBeGreaterThan(0);
    expect(
      rows.filter((row) => row.correlationId === thread).length,
      `${AUDIT_EVENT_TYPE_LABELS[type]}: no row carries the session's thread ${thread}`,
    ).toBeGreaterThan(0);
  }
}
