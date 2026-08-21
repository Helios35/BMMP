import { expect, test, type Page } from "@playwright/test";

import {
  canReadRoute,
  readableRoutesFor,
} from "@/domain/access/route-capability";
import {
  APP_ROUTES,
  isPublicRoute,
  type AppRoute,
} from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";
import { visibleNavItems } from "@/features/shell/navigation/nav-items";

import { PERSONAS, personaFor, storageStateFor } from "./support/roles";

/**
 * **The navigation renders exactly what the guard would let this role open — for
 * all six roles.**
 *
 * This is the cheapest possible proof of the unit's whole premise: the guard,
 * the navigation, the command palette and every cross-route link read the *same*
 * `ROUTE_ACCESS`, and duplicating it is how a nav item and a route come to
 * disagree about whether a page exists (`SITE_ARCHITECTURE.md` §5.3(3), §5.3(7),
 * §7.2). A nav item the current role cannot reach is **not rendered** — no
 * greyed-out entry, no dead link, no "ask for access" affordance (§2.1).
 *
 * ## How the expectation is built
 *
 * `visibleNavItems(readableRoutesFor(role))` — the *presentation* list from
 * `NAV_ITEMS`, intersected with the *access* answer from `ROUTE_ACCESS`. Both
 * are the modules the application itself reads, so this test does not carry a
 * second route list of its own, and it stays true under
 * `DATA_ADAPTER=supabase`: neither module knows which adapter is live.
 *
 * Four of §2.1's ten destinations are commented out in `NAV_ITEMS` because
 * `/review`, `/containers`, `/shipments` and `/settings/catalog` have no page in
 * this unit. That is presentation, not access — `ROUTE_ACCESS` already carries
 * all four rows — so the expectation follows `NAV_ITEMS` and this file needs no
 * change when a later unit uncomments one.
 *
 * ## Which navigation is asserted
 *
 * The desktop sidebar. The rail and the mobile tab bar are the *same* primary
 * navigation at other breakpoints, and exactly one of the three is in the
 * accessibility tree at a time (`display: none` removes an element from it), so
 * the assertion is scoped to `[data-nav-variant="sidebar"]` rather than to
 * `nav[aria-label="Primary"]`, which all three carry.
 */

/**
 * Routes with a literal URL — the ones a link can be asserted against.
 *
 * `[id]` and `[token]` are patterns, not addresses, so a link to them is checked
 * by the routes that build them rather than here.
 */
const STATIC_ROUTES: readonly AppRoute[] = APP_ROUTES.filter(
  (route) => !route.includes("[") && !isPublicRoute(route),
);

/** Any anchor to a route, with or without a query string. */
function linksTo(page: Page, route: AppRoute) {
  return page.locator(`a[href="${route}"], a[href^="${route}?"]`);
}

async function expectNavigationMatchesTheMap(
  page: Page,
  role: RoleCode,
): Promise<void> {
  const expected = visibleNavItems(readableRoutesFor(role));

  // Every role reaches at least the dashboard, so an empty expectation means
  // the map or the presentation list has been emptied rather than that this
  // role has nothing.
  expect(expected.length).toBeGreaterThan(0);

  const sidebar = page.locator('nav[data-nav-variant="sidebar"]');
  await expect(sidebar).toBeVisible();

  const links = sidebar.locator("a[href]");
  await expect(links).toHaveCount(expected.length);

  // Order is display order (§2.1), and `NAV_ITEMS` is authored in it — so the
  // sequence is asserted, not just the set.
  expect(
    await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href")),
    ),
  ).toEqual(expected.map((item) => item.route));

  for (const [index, item] of expected.entries()) {
    await expect(links.nth(index)).toContainText(item.navLabel);
  }

  // Nothing in the navigation is rendered-but-refused.
  await expect(sidebar.locator("[aria-disabled]")).toHaveCount(0);
}

async function expectNoLinkToARouteThisRoleCannotOpen(
  page: Page,
  role: RoleCode,
): Promise<void> {
  const denied = STATIC_ROUTES.filter((route) => !canReadRoute(role, route));

  for (const route of denied) {
    // Page-wide, not sidebar-scoped: §5.3(7) covers the cross-route links, the
    // quick actions and the breadcrumbs as well as the nav. A link the guard
    // would refuse is a dead link wherever it is rendered.
    await expect(
      linksTo(page, route),
      `${role} was offered a link to ${route}, which the guard would refuse`,
    ).toHaveCount(0);
  }
}

for (const key of ["p1", "p2", "p3", "p4", "p5", "p6"] as const) {
  const persona = PERSONAS[key];

  test.describe(`${persona.personaId} — ${persona.fullName}`, () => {
    test.use({ storageState: storageStateFor(key) });

    test("the navigation renders only what this role can reach", async ({
      page,
    }) => {
      const role = personaFor(key).role;

      await page.goto("/");
      await expect(page).toHaveURL("/");
      await expect(page.locator("#page-title")).toBeVisible();

      await expectNavigationMatchesTheMap(page, role);
      await expectNoLinkToARouteThisRoleCannotOpen(page, role);
    });
  });
}
