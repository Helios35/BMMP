import { expect, test, type Page } from "@playwright/test";

import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * Filings from the outside — `UX_SPEC.md` §3.14, §3.21; Rules 8.17–8.23;
 * brief b1b-13.
 *
 * **Dates move.** These assert shapes — a gap line, "Not on file", a period
 * line, "A packet is not the filing" — never which year is the default or
 * which deadline is overdue. **e2e shares one store, fully parallel**: each
 * test makes its own packets (a later packet supersedes, so a retry is
 * harmless), records sales only for Kestrel in Connecticut in 2023, and
 * reopens the one deadline it marks done. Vermont's 2023 is never recorded
 * here — its gap is the fixture's. Make packet and Mark done are row actions,
 * desk and tablet only.
 */

const { PRODUCER_PRODUCT, JURISDICTION, DOCUMENT_RENDER } = fixtureIds;

/** How long an issue may take to render and store its PDF. */
const RENDER_WAIT = 60_000;

function deadlineRows(page: Page, duty: string) {
  return page.locator("tbody tr", { hasText: duty });
}

async function openMakePacket(page: Page, duty: string) {
  const row = deadlineRows(page, duty).filter({
    has: page.locator("button[data-make-packet]"),
  });
  await row.first().locator("button[data-make-packet]").click();
  const dialog = page.locator("[data-make-packet-dialog]");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Issue from an open dialog, then follow its link to the packet. */
async function issueAndOpen(page: Page) {
  const dialog = page.locator("[data-make-packet-dialog]");
  await dialog.locator('[data-issue-packet="true"]').click();
  // A packet is rendered, hashed and stored before it reads issued; under
  // the suite's parallel load that outlasts the default wait.
  const issued = dialog.locator("[data-make-packet-issued]");
  await expect(issued).toBeVisible({ timeout: RENDER_WAIT });
  await dialog.locator("[data-open-packet]").click();
  await page.waitForURL(/\/documents\//u);
}

test.describe("P3 — Priya records sales and makes packets", () => {
  test.use({ storageState: storageStateFor("p3") });

  test("records sales, corrects them, and sees the old entry marked replaced", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const key = `${PRODUCER_PRODUCT.kestrelScrubberLfp}:${JURISDICTION.connecticut}`;
    await page.goto("/obligations?tab=sales&year=2023");
    const table = page.getByRole("table");
    // A year with nothing recorded reads Not on file — never zero.
    await expect(
      table.locator("[data-sales-not-on-file]").first(),
    ).toBeVisible();

    for (const units of ["70", "72"]) {
      await table.locator(`button[data-record-sales="${key}"]`).click();
      const dialog = page.locator(`[data-record-sales-dialog="${key}"]`);
      await expect(dialog).toBeVisible();
      await dialog.locator('[data-record-sales-units="true"]').fill(units);
      await dialog
        .locator('[data-record-sales-note="true"]')
        .fill(`Order ledger, calendar 2023 — e2e ${units}.`);
      await dialog.locator('[data-record-sales-submit="true"]').click();
      await expect(dialog).toHaveCount(0);
    }

    await expect(
      table.locator(`[data-sales-row="${key}"]`).locator("xpath=ancestor::tr"),
    ).toContainText("72");
    const replaced = table
      .locator("tbody tr", { has: page.locator("[data-sales-replaced-label]") })
      .filter({ hasText: "Connecticut" })
      .filter({ hasText: "Kestrel" });
    expect(await replaced.count()).toBeGreaterThan(0);
    await expect(replaced.first()).toContainText("Replaced");
  });

  test("makes California's notice, issues it, and opens it — it is not the filing", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/obligations?state=US-CA");
    const dialog = await openMakePacket(page, "Send retailers and CalRecycle");
    await expect(dialog).toContainText("Notice to retailers and CalRecycle");
    await expect(dialog.locator("[data-filing-not-the-filing]")).toContainText(
      "A packet is not the filing",
    );
    await expect(dialog.locator("[data-filing-send-to]")).toContainText(
      "Send it to: every retailer selling these products in California",
    );
    await expect(
      dialog.locator('[data-filing-item="statement"]'),
    ).toBeVisible();

    await issueAndOpen(page);
    await expect(
      page.locator("[data-filing-not-the-filing]").first(),
    ).toContainText("A packet is not the filing");
    await expect(page.locator("[data-filing-send-to]").first()).toContainText(
      "every retailer selling these products in California",
    );
    await expect(page.locator('[data-pdf-pages="ready"]')).toBeVisible();
  });

  test("makes New Jersey's annual report: it asks which year, and the packet says who picked it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/obligations?state=US-NJ");
    const dialog = await openMakePacket(
      page,
      "Report the propulsion batteries you sold into New Jersey.",
    );
    // No year is guessed (Rule 8.21): nothing is picked, and Issue waits.
    await expect(dialog.locator("[data-make-packet-needs-year]")).toBeVisible();
    await expect(dialog.locator('[data-issue-packet="true"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await dialog.locator('[data-make-packet-year="true"]').click();
    await page.getByRole("option").first().click();
    const period = dialog.locator('[data-filing-period="chosen_year"]');
    await expect(period).toContainText("picked by Priya Narang");
    await expect(period).toContainText("The law doesn't state a period.");

    await issueAndOpen(page);
    const stored = page.locator('[data-filing-period="chosen_year"]').first();
    await expect(stored).toContainText(
      "picked by Priya Narang when making this packet",
    );
    await expect(stored).toContainText("The law doesn't state a period.");
  });

  test('a gap reads "Not on file" in the dialog and on the packet', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/obligations?state=US-ME");
    const dialog = await openMakePacket(
      page,
      "Give the information the law requires for products with embedded batteries.",
    );
    await expect(
      dialog.locator('[data-filing-line="gap"]', { hasText: "GTIN" }),
    ).toContainText("Not on file");

    await issueAndOpen(page);
    await expect(
      page
        .locator('[data-filing-content="true"] [data-filing-line="gap"]')
        .filter({ hasText: "GTIN" }),
    ).toContainText("Not on file");
  });

  test("marks a deadline done with a packet as its evidence, then reopens it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Connecticut's notice to DEEP is this spec's own: nothing else marks it.
    const duty = "Tell DEEP whether you'll join a plan jointly or on your own.";
    await page.goto("/obligations?state=US-CT");
    const dialog = await openMakePacket(page, duty);
    await dialog.locator('[data-issue-packet="true"]').click();
    await expect(dialog.locator("[data-make-packet-issued]")).toBeVisible({
      timeout: RENDER_WAIT,
    });
    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expect(dialog).toHaveCount(0);

    const open = deadlineRows(page, duty).filter({
      has: page.locator("button[data-mark-done]"),
    });
    await expect(open.locator("[data-deadline-packet]").first()).toBeVisible();
    await open.locator("button[data-mark-done]").click();
    const done = page.locator("[data-mark-done-dialog]");
    await done
      .locator('[data-mark-done-note="true"]')
      .fill("Sent DEEP the notice — e2e.");
    await done.locator('[data-mark-done-evidence="true"]').click();
    await page
      .getByRole("option", { name: /Notice to DEEP: joining a plan/u })
      .click();
    await done.locator('[data-mark-done-submit="true"]').click();
    await expect(done).toHaveCount(0);

    const marked = deadlineRows(page, duty).filter({
      has: page.locator("[data-deadline-evidence]"),
    });
    await expect(marked).toHaveCount(1);
    await expect(marked.locator("[data-deadline-evidence]")).toContainText(
      "Evidence: Notice to DEEP",
    );

    await marked.locator("[data-reopen]").click();
    const reopen = page.locator("[data-reopen-dialog]");
    await reopen
      .locator('[data-reopen-reason="true"]')
      .fill("Reopened by the e2e suite.");
    await reopen.locator('[data-reopen-confirm="true"]').click();
    await expect(reopen).toHaveCount(0);
    await expect(
      deadlineRows(page, duty).filter({
        has: page.locator("button[data-mark-done]"),
      }),
    ).toHaveCount(1);
  });

  test("a product's plan lists its duties in every state, earliest first", async ({
    page,
  }) => {
    await page.goto(
      `/obligations?tab=products&product=${PRODUCER_PRODUCT.tidewaterAlkalineAa}`,
    );
    const plan = page.locator(
      `[data-product-plan="${PRODUCER_PRODUCT.tidewaterAlkalineAa}"]`,
    );
    await expect(plan).toBeVisible();
    const dues = await plan
      .locator("ol [data-plan-entry]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-plan-due") ?? ""),
      );
    expect(dues.length).toBeGreaterThan(1);
    const dated = dues.filter((due) => due !== "no_date");
    expect(dated).toEqual([...dated].sort());
    // "No date yet" comes after every date.
    expect(dues.slice(dated.length).every((due) => due === "no_date")).toBe(
      true,
    );
  });
});

test.describe("P2 reads sales and packets with no controls (Rule 8.22)", () => {
  test.use({ storageState: storageStateFor("p2") });

  test("the Sales tab and a deadline's packets, and nothing to change them with", async ({
    page,
  }) => {
    await page.goto("/obligations?tab=sales");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator("[data-record-sales]")).toHaveCount(0);
    await page.goto("/obligations?state=US-CA");
    await expect(
      page.locator(
        `[data-deadline-packet="${DOCUMENT_RENDER.caNoticePacket}"]`,
      ),
    ).toBeVisible();
    await expect(page.locator("[data-make-packet]")).toHaveCount(0);
  });
});

test.describe("P5 reads with no live controls (Rule 8.22, E-8a)", () => {
  test.use({ storageState: storageStateFor("p5") });

  test("Record sales and Make packet shown disabled with the reason; the packet opens", async ({
    page,
  }) => {
    for (const [path, selector] of [
      ["/obligations?tab=sales", "[data-record-sales]"],
      ["/obligations?state=US-CA", "[data-make-packet]"],
    ] as const) {
      await page.goto(path);
      const controls = page.locator(selector);
      await expect(controls.first()).toBeVisible();
      for (const disabled of await controls.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-disabled")),
      )) {
        expect(disabled).toBe("true");
      }
    }
    await page.goto(`/documents/${DOCUMENT_RENDER.caNoticePacket}`);
    await expect(
      page.locator("[data-filing-not-the-filing]").first(),
    ).toContainText("A packet is not the filing");
  });
});

test.describe("P1 can't open a filing packet (Rule 8.22)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("is refused, citing the rule, and sees no packet", async ({ page }) => {
    await page.goto(`/documents/${DOCUMENT_RENDER.caNoticePacket}`);
    await expect(page.locator('[data-document-refused="8.22"]')).toContainText(
      "Rule 8.22",
    );
    await expect(page.locator("[data-filing-packet-summary]")).toHaveCount(0);
    const pdf = await page.request.get(
      `/api/documents/${DOCUMENT_RENDER.caNoticePacket}/pdf`,
    );
    expect(pdf.status()).toBe(403);
  });
});
