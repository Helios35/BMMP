import { expect, test, type Page } from "@playwright/test";

import { personaFor, storageStateFor, type PersonaRef } from "./support/roles";

/**
 * **E-1 — zero batteries** (`UX_SPEC.md` §5, `SITE_ARCHITECTURE.md` §6).
 *
 * The edge case exists because *an empty list means five different things*. A
 * handler is being asked to start; a facility manager is waiting on her
 * handlers; a producer or a technician is looking at a list that is not theirs
 * to fill; an auditor is being pointed at the record that does exist. One
 * generic *"Nothing here"* would be true for all five and useful to none — so
 * **the point of this file is that the variants differ**, and every test below
 * asserts the variant it expects *and the absence of every other variant's
 * sentence*. Asserting one string five times would pass against a build that
 * shipped one string five times, which is the defect the edge case exists to
 * catch.
 *
 * **Where it is driven.** `ORG.olympic` is the fixture organization that holds
 * no battery record at all (`src/data/mock/fixtures/ids.ts`), so E-1 is reached
 * the way a person reaches it: by being a member of an organization that has
 * not logged anything yet. Nothing here empties a table, resets a store or
 * touches `src/data` — the same suite has to pass against Supabase (D-15,
 * D-16).
 *
 * **Two of the five variants are reachable end-to-end and three are not.**
 * Olympic has exactly three memberships — Tom (P1), Rosa (P2) and Marta's
 * second P2 membership — so no P3, P4 or P5 session can be in an organization
 * with zero records. The three unreachable variants are declared at the bottom
 * of this file as skipped tests naming the fixture gap rather than quietly
 * omitted, and their copy is asserted *absent* from every screen that does
 * render, which is the half of that coverage this file can still give.
 */

/** The `(app)` content region, so a nav item never satisfies a content assertion. */
const MAIN = "#main-content";

interface VariantAction {
  /** The route pattern the action points at. Asserted, never followed. */
  readonly route: string;
  readonly label: string;
}

interface ZeroBatteriesVariant {
  readonly ref: PersonaRef;
  /** `data-empty-role` on `/batteries` — the T-37 code the variant was chosen for. */
  readonly emptyRole: string;
  /** `data-zero-batteries-variant` on `/`. */
  readonly dashboardVariant: string;
  /** §5 E-1's sentence, verbatim. Not a paraphrase of it. */
  readonly sentence: string;
  readonly listAction: VariantAction | null;
  /** The dashboard card's action, which E-12 suppresses for the create variant. */
  readonly dashboardAction: VariantAction | null;
}

/**
 * The four sentences §5 E-1 defines, in one place.
 *
 * Every screen asserts its own and the absence of the other three, so the two
 * variants no fixture session can render are still guarded against leaking onto
 * a screen they do not belong on.
 */
const SENTENCES = {
  handler:
    "No batteries logged yet. Log your first one — photograph the label and we'll read it.",
  facilityManager:
    "No batteries logged yet. Once your handlers start logging, containers and storage clocks appear here.",
  observer: "No batteries logged yet.",
  auditor:
    "No battery records in this organization yet. The audit log shows everything that has happened so far.",
} as const;

const ALL_SENTENCES: readonly string[] = Object.values(SENTENCES);

/**
 * The two variants a Playwright session can actually be.
 *
 * The sentences are §5 E-1's table and are the same strings
 * `src/features/battery-record/battery-empty-state.tsx` and
 * `src/features/dashboard/zero-batteries.tsx` render. A drift in either fails
 * here rather than shipping a sentence nobody agreed to.
 */
const VARIANTS: readonly ZeroBatteriesVariant[] = [
  {
    ref: "p1Olympic",
    emptyRole: "compliance_handler",
    dashboardVariant: "handler",
    sentence: SENTENCES.handler,
    // E-12 and E-1 overlap here, and E-12 wins on both screens. Olympic is the
    // only fixture organization with no battery records, and it is also the one
    // holding no Terms of Service acceptance in force — so intake is blocked
    // organization-wide and every invitation to log a battery is **omitted, not
    // disabled**. Nobody in this organization can do it yet, and the Terms of
    // Service alert above already carries the reason (§2.9, §3.1.7, Rules 7.1,
    // 7.2). The handler's E-1 *sentence* still renders; only its action goes.
    //
    // These two were `null` and `{ /batteries/new }` respectively until the two
    // screens were made to agree — `/batteries` was still offering the button
    // the dashboard had already withdrawn.
    listAction: null,
    dashboardAction: null,
  },
  {
    ref: "p2Olympic",
    emptyRole: "facility_manager",
    dashboardVariant: "facility_manager",
    sentence: SENTENCES.facilityManager,
    listAction: { route: "/containers", label: "View containers" },
    dashboardAction: { route: "/containers", label: "View containers" },
  },
];

/**
 * The rendered paragraphs of the content region, whitespace-normalised.
 *
 * `getByText` matches a substring by default and *"No batteries logged yet."*
 * is a prefix of two other variants — so an absence assertion has to compare
 * whole rendered paragraphs rather than ask whether a string appears anywhere.
 */
async function renderedParagraphs(page: Page): Promise<readonly string[]> {
  const values = await page.locator(`${MAIN} p`).allTextContents();
  return values.map((value) => value.replace(/\s+/g, " ").trim());
}

async function expectNoOtherVariant(
  page: Page,
  variant: ZeroBatteriesVariant,
  where: string,
): Promise<void> {
  const paragraphs = await renderedParagraphs(page);
  for (const sentence of ALL_SENTENCES) {
    if (sentence === variant.sentence) continue;
    expect(
      paragraphs,
      `${where} rendered another role's E-1 sentence to a ${variant.emptyRole}: "${sentence}"`,
    ).not.toContain(sentence);
  }
}

for (const variant of VARIANTS) {
  test.describe(`E-1 — ${variant.emptyRole}, in an organization with no records`, () => {
    test.use({ storageState: storageStateFor(variant.ref) });

    test("/batteries renders this role's own sentence and no other role's", async ({
      page,
    }) => {
      const persona = personaFor(variant.ref);
      await page.goto("/batteries");
      await expect(page).toHaveURL("/batteries");
      await expect(page.locator("#page-title")).toBeVisible();

      // The zero-records branch, not the filters-exclude-everything one. They
      // are different states with different copy and a different action, and
      // `RecordTable` records which one it took (§2.7).
      await expect(
        page.locator('[data-table-empty="zero-records"]'),
      ).toBeVisible();

      const emptyState = page.locator(
        `[data-empty-role="${variant.emptyRole}"]`,
      );
      await expect(
        emptyState,
        `${persona.fullName} is a ${variant.emptyRole} and should read that variant`,
      ).toBeVisible();
      await expect(emptyState).toContainText(variant.sentence);

      await expectNoOtherVariant(page, variant, "/batteries");
    });

    test("/batteries offers this role's own action and nothing it cannot reach", async ({
      page,
    }) => {
      await page.goto("/batteries");
      await expect(page.locator("#page-title")).toBeVisible();

      const action = page
        .locator(`[data-empty-role="${variant.emptyRole}"]`)
        .locator("[data-empty-action]");

      const expected = variant.listAction;
      if (expected === null) {
        // §5: *"Never show a create action to a role that cannot create. A dead
        // CTA is worse than no CTA."*
        await expect(action).toHaveCount(0);
        return;
      }

      await expect(action).toHaveCount(1);
      await expect(action).toHaveAttribute("data-empty-action", expected.route);
      await expect(action).toHaveText(expected.label);
      // The href is asserted, never followed: `/containers` is unit 04's route
      // and does not exist yet. A link into it is correct against the one
      // capability map today; navigating there would fail on a page nobody has
      // agreed to build.
      await expect(action).toHaveAttribute("href", expected.route);
    });

    test("the dashboard renders the same role's variant, composed for the dashboard", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page).toHaveURL("/");
      await expect(page.locator("#page-title")).toBeVisible();

      const card = page.locator(
        `[data-zero-batteries-variant="${variant.dashboardVariant}"]`,
      );
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute("data-region-state", "empty");
      await expect(card).toContainText(variant.sentence);

      await expectNoOtherVariant(page, variant, "/");

      const action = card.locator("a[href]");
      const expected = variant.dashboardAction;
      if (expected === null) {
        await expect(
          action,
          "E-12 omits the create invitation rather than disabling it (§2.9)",
        ).toHaveCount(0);
        return;
      }
      await expect(action).toHaveCount(1);
      await expect(action).toHaveAttribute("href", expected.route);
      await expect(action).toHaveText(expected.label);
    });
  });
}

test("the reachable variants say different things and offer different actions", () => {
  // The property this file exists to protect, asserted over the table the tests
  // above are generated from. A build that shipped one sentence for every role
  // could be made to satisfy each test above by editing this table; it cannot
  // satisfy this one.
  expect(new Set(VARIANTS.map((variant) => variant.sentence)).size).toBe(
    VARIANTS.length,
  );
  expect(
    new Set(VARIANTS.map((variant) => variant.listAction?.route)).size,
  ).toBe(VARIANTS.length);
});

/**
 * The three variants no fixture session can reach.
 *
 * **This is a fixture gap, not a coverage decision.** `ORG.olympic` is the only
 * organization with zero battery records and it has three memberships, all of
 * them P1 or P2 (`src/data/mock/fixtures/index.ts` — `MEMBERSHIP.rosaOlympic`,
 * `tomOlympic`, `martaOlympic`). Until Olympic gains a P3, a P4 and a P5 whose
 * grant is in force, no signed-in session can be a producer, a technician or an
 * auditor looking at an empty list — and driving it any other way would mean
 * mutating the store out of band, which is exactly what stops a Playwright
 * suite running unchanged against Supabase (D-15, D-16).
 *
 * Their sentences are asserted *absent* by every test above, and their positive
 * rendering is covered in vitest against the components themselves.
 */
test.skip("E-1 producer_compliance_officer variant — no P3 membership exists in the zero-record organization (fixture gap; see the build-notes)", () => {});
test.skip("E-1 mobility_supplier_technician variant — no P4 membership exists in the zero-record organization (fixture gap; see the build-notes)", () => {});
test.skip("E-1 auditor variant — no P5 grant exists in the zero-record organization (fixture gap; see the build-notes)", () => {});
