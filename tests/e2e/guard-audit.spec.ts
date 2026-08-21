import { expect, test } from "@playwright/test";

import { denialDescription, routeDenialMessage } from "@/domain/access/denial";
import { canReadRoute } from "@/domain/access/route-capability";
import { ROLE_LABELS } from "@/domain/taxonomy/role";

import { fixtureIds, personaFor, storageStateFor } from "./support/roles";

/**
 * **P1 cannot reach `/audit`, and the refusal is evidence** —
 * `SITE_ARCHITECTURE.md` §5.3(4) and §5.3(8), Rules 12.8, 12.6, 1.16.
 *
 * This is the first of the three tests the brief names, and it is the one that
 * crosses the whole stack in a single pass: the segment guard refuses, the
 * redirect carries the route, the shell renders the toast on the destination,
 * the `security definer` audit door writes the row, and `/audit` renders it for
 * a role that may read it. Any one of those five links can be broken while the
 * other four look right, and only an end-to-end assertion catches that.
 *
 * ## Why the expected copy is derived rather than typed
 *
 * Every string asserted here comes from `routeDenialMessage` and `ROLE_LABELS`.
 * `TAXONOMY.md` §5.3 is explicit that a T-37 label written inline **in a test**
 * is a defect even when it happens to match, and §7.2 says the denial copy is
 * derived from `ROUTE_ACCESS` precisely so a toast cannot disagree with the
 * guard about who may open a page. A test that retyped the sentence would be
 * asserting against a second copy of the map.
 *
 * **Deriving it cannot make the test pass vacuously**, because the derived
 * strings are themselves checked first: the headline has to name the role that
 * was refused, the remedy has to name a role that may open the page, and the
 * governing rule has to be Rule 12.8. An empty or malformed message fails there,
 * before the browser is asked anything.
 *
 * ## The seam
 *
 * Nothing here imports an adapter, a fixture store or `resetMockStore()`. The
 * denial row is produced by driving the product — P1 asks for a page and is
 * refused — and it is read back by driving the product, as P2, through the same
 * screen a person would use. That is what keeps this test meaningful against
 * `DATA_ADAPTER=supabase` (D-15, D-16).
 */

/**
 * The audit `reason` a route denial carries.
 *
 * `src/lib/auth/record-denial.ts` — `recordRouteDenial` writes
 * `route_access_denied:<route>`. It is a stored value rather than display copy,
 * so it is restated here with its source named, exactly as the fixture addresses
 * are in `support/roles.ts`.
 */
const ROUTE_DENIAL_REASON = "route_access_denied:/audit";

test.describe("the Compliance Handler and the audit log", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("is redirected to the dashboard with a toast naming the restriction", async ({
    page,
  }) => {
    const persona = personaFor("p1");
    const message = routeDenialMessage(persona.role, "/audit");

    // The derived copy, checked before it is used as an expectation. Rule 1.26 —
    // a denial states the reason in plain language, names the remedy and names
    // the governing rule.
    expect(message.headline).toContain(ROLE_LABELS[persona.role]);
    expect(message.remedy).toContain(ROLE_LABELS.facility_manager);
    expect(message.remedy).toContain(ROLE_LABELS.auditor);
    expect(message.governingRule).toBe("Rule 12.8");

    await page.goto("/audit");

    // §5.3(4) — redirected to `/`, never a 403 page and never a blank screen.
    // The toast fires on the destination and `RouteDenialToast` then strips
    // `?denied=` from the URL, so the settled address is the bare dashboard.
    await expect(page).toHaveURL("/");

    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(message.headline);
    await expect(toast).toContainText(denialDescription(message));
    // Named explicitly as well as through the description, because "the remedy
    // names who can" is the half of Rule 1.26 that is easiest to lose.
    await expect(toast).toContainText(ROLE_LABELS.facility_manager);
    await expect(toast).toContainText("Rule 12.8");
  });

  test("is offered no navigation entry to it at all — absent, not disabled", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#page-title")).toBeVisible();

    const sidebar = page.locator('nav[data-nav-variant="sidebar"]');

    // Not vacuous: the navigation renders, and it renders other destinations.
    // Without this a sidebar that failed to render would satisfy every
    // assertion below.
    await expect(sidebar).toBeVisible();
    expect(await sidebar.locator("a[href]").count()).toBeGreaterThan(0);

    // §2.1, §5.3(7) — **a nav item the current role cannot reach is not
    // rendered.** No greyed-out entry, no dead link, no "ask for access"
    // affordance. So the assertion is absence of the element, not absence of an
    // enabled state.
    await expect(sidebar.locator('a[href="/audit"]')).toHaveCount(0);
    await expect(sidebar.getByText("Audit", { exact: true })).toHaveCount(0);
    await expect(sidebar.locator("[aria-disabled]")).toHaveCount(0);

    // And nowhere else on the shell either — no cross-route link, no quick
    // action, no breadcrumb offers a destination the guard would refuse.
    await expect(page.locator('a[href="/audit"]')).toHaveCount(0);
  });

  test("and the denial lands in the audit log, where a role that may read it sees it", async ({
    page,
    browser,
    baseURL,
  }) => {
    const denied = personaFor("p1");
    const reader = personaFor("p2");

    // The premise, read from the map rather than assumed: one of these two may
    // open `/audit` and the other may not. P5 and P6 also hold `read` and either
    // would serve as the reader — P2 is chosen because she is in the same
    // organisation and carries no support grant to complicate the row.
    expect(canReadRoute(denied.role, "/audit")).toBe(false);
    expect(canReadRoute(reader.role, "/audit")).toBe(true);

    // The attempt. It is refused, and the refusal is what this test is about.
    await page.goto("/audit");
    await expect(page).toHaveURL("/");

    // A second session rather than a second sign-in: the reader has to be a
    // role that holds `read` on `/audit` (P2 here — P5 and P6 also qualify), and
    // she has to be in the same organisation, or the row is correctly invisible
    // to her (Rule 1.2).
    const readerContext = await browser.newContext({
      storageState: storageStateFor(reader.key),
      baseURL,
    });

    try {
      const auditPage = await readerContext.newPage();

      // Narrowed by equality rather than by free text: an in-memory scorer and
      // Postgres may rank a search differently, and this suite has to pass
      // identically against both (see `harness.spec.ts`). Event type, actor and
      // entity table are all exact matches on either adapter.
      await auditPage.goto(
        `/audit?type=denial.recorded&actor=${fixtureIds.USER.danaHandler}` +
          `&entity=user&perPage=100`,
      );
      await expect(auditPage).toHaveURL(/\/audit\?/);
      await expect(auditPage.locator("#page-title")).toBeVisible();

      // **This is the assertion that proves denials are evidence** (Rules 12.6,
      // 1.16; §5.3(8)). Asserted on the row rather than on the table, so the
      // reason and the actor cannot be satisfied by two different rows.
      const denialRow = auditPage
        .getByRole("row")
        .filter({ hasText: ROUTE_DENIAL_REASON })
        .first();

      await expect(denialRow).toBeVisible();
      await expect(denialRow).toContainText(denied.fullName);
      await expect(denialRow).toContainText(ROLE_LABELS[denied.role]);
    } finally {
      await readerContext.close();
    }
  });
});
