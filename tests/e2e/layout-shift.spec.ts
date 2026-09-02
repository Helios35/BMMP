import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

import { storageStateFor } from "./support/roles";

/**
 * §6.3 — **the layout must not shift when content arrives.**
 *
 * *"First paint of a list or detail: `Skeleton` matching the final layout
 * exactly — same row heights, same column widths."* That is a layout
 * requirement wearing a loading label, and it is **invisible in a screenshot**:
 * the contact sheet only ever photographs the loaded state, so a `loading.tsx`
 * standing in a 36px bar for a header that renders a title, a description and a
 * 44px action looks perfect in every image and drops the page forty pixels under
 * a reader's thumb on every single navigation.
 *
 * Unit 01 shipped exactly that on five routes, and no gate said a word.
 *
 * ## How the skeleton is held on screen long enough to measure
 *
 * Two things have to be true at once, and they pull in opposite directions.
 *
 * **The router has to know the destination has a loading boundary.** It learns
 * that from a prefetch — Next's partial prefetch returns the layout and the
 * `loading.tsx` and *not* the dynamic segment. Block every RSC request and the
 * router never learns, so it renders no fallback and simply waits on the old
 * page. That is what the first version of this spec did, and it timed out on all
 * three viewports waiting for a skeleton that could not exist.
 *
 * **The navigation's own fetch has to be slow enough to measure.** So the gate
 * holds RSC requests that are *not* prefetches, and lets prefetches through
 * untouched.
 *
 * The journey is walked twice: once with nothing held, which is what teaches the
 * router the boundary exists, then back, then again with the gate installed. The
 * client router cache keeps dynamic segments for zero seconds by default, so the
 * second navigation genuinely refetches.
 *
 * **Deterministic.** Nothing here waits a fixed number of milliseconds and hopes.
 *
 * ## Why the navigation is a click and not a `goto`
 *
 * A `loading.tsx` fallback is a *client* transition state. On a hard navigation
 * Next streams the fallback and its replacement down one response, so there is
 * no separate paint to measure. Only a router navigation renders the boundary as
 * its own frame — which is also the navigation a person actually performs once
 * they are inside the shell.
 *
 * ## What is compared
 *
 * `[data-page-header-block]` — the header's **structural** part: breadcrumbs,
 * title, subtitle, description, primary action and the meta strip. Both
 * `PageHeader` and `PageHeaderSkeleton` carry it, and it is the block that
 * pushes everything below it when its height changes.
 *
 * **The notice slot is deliberately outside it.** A read-only banner, a
 * damaged-or-defective block and an unverified-contact alert exist *because of
 * what the data said*, and no skeleton can know that before the read. Reserving
 * space for an alert that may never appear is a worse answer than the shift it
 * would prevent — an empty 180px gap on every load, for the one case in ten
 * where the alert fires.
 *
 * The 2px tolerance absorbs sub-pixel rounding on a `1.5` line height and
 * nothing else. **A failure is fixed in the skeleton, not in this number.**
 */

/** Sub-pixel line-height rounding, and nothing larger. */
const TOLERANCE_PX = 2;

interface Gate {
  readonly release: () => void;
}

/**
 * Hold the RSC fetch a navigation makes, and nothing else.
 *
 * **A prefetch is deliberately let through.** It is how the router learns the
 * destination has a `loading.tsx` at all; holding it means no fallback ever
 * renders and there is nothing to measure.
 */
async function holdNavigationRsc(page: Page): Promise<Gate> {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route("**/*", async (route: Route) => {
    const headers = route.request().headers();
    const isPrefetch =
      headers["next-router-prefetch"] === "1" ||
      (headers["next-router-state-tree"] === undefined &&
        headers["purpose"] === "prefetch");
    const isRsc = headers["rsc"] === "1";
    if (isRsc && !isPrefetch) await held;
    await route.continue();
  });

  return { release };
}

async function headerHeight(page: Page): Promise<number> {
  const box = await page
    .locator("[data-page-header-block]")
    .first()
    .boundingBox();
  expect(
    box,
    "no [data-page-header-block] on screen to measure",
  ).not.toBeNull();
  return (box as { height: number }).height;
}

interface Journey {
  /** Where the reader starts. Loaded normally, before the gate matters. */
  readonly from: string;
  /** The link they click. It must be a `next/link`, or there is no client transition. */
  readonly link: (page: Page) => Locator;
  /** Where they land, for the failure message. */
  readonly to: string;
}

/**
 * Walk one journey and measure the header in both states.
 *
 * The first walk is a warm-up whose only job is to put the destination's loading
 * boundary into the client router. The second is the measured one.
 */
async function measure(
  page: Page,
  journey: Journey,
): Promise<{ readonly loading: number; readonly loaded: number }> {
  const skeleton = page.locator('[data-page-header-state="loading"]');

  await page.goto(journey.from);
  await expect(page.locator("#page-title")).toBeVisible();

  // The destination, taken off the link rather than restated: a row's href is
  // only known once the list has rendered.
  const href = await journey.link(page).getAttribute("href");
  expect(href, `${journey.to}: the link has no href to follow`).not.toBeNull();
  const destination = new URL(href as string, page.url()).pathname;

  // Warm. Nothing is held, so this is an ordinary navigation and it is what
  // teaches the router that the destination has a loading boundary.
  //
  // **Waiting on the URL, not on a heading.** The route being left has an
  // `#page-title` of its own, so asserting one here would pass instantly on the
  // page we are still standing on — and the `goBack` below would then run
  // mid-navigation and land somewhere neither route expects. That is exactly
  // how the first version of this spec failed.
  await journey.link(page).click();
  await page.waitForURL((url) => url.pathname === destination);
  await expect(page.locator("#page-title")).toBeVisible();
  const loaded = await headerHeight(page);

  await page.goBack();
  await page.waitForURL((url) => url.pathname !== destination);
  await expect(page.locator("#page-title")).toBeVisible();

  // Measured. The navigation's own fetch is held; the prefetch is not.
  const gate = await holdNavigationRsc(page);
  await journey.link(page).click();
  await skeleton.waitFor({ state: "visible", timeout: 20_000 });
  const loading = await headerHeight(page);

  gate.release();
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.waitForURL((url) => url.pathname === destination);
  await expect(skeleton).toHaveCount(0);
  await expect(page.locator("#page-title")).toBeVisible();

  return { loading, loaded };
}

function expectNoShift(
  journey: Journey,
  viewport: string,
  measured: { readonly loading: number; readonly loaded: number },
): void {
  const delta = Math.abs(measured.loaded - measured.loading);
  expect(
    delta,
    `${journey.to} at ${viewport}: the page header is ${measured.loading}px while loading and ${measured.loaded}px once the read lands, so everything below it moves ${delta}px under the reader (UX_SPEC.md §6.3). Fix the skeleton in loading.tsx, not this threshold.`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);
}

/**
 * A sidebar destination, which exists from `md` up.
 *
 * `:visible` because the sidebar renders its rail and its full list as separate
 * lists and hides one of them at each width — exactly so only one is in the
 * accessibility tree at a time. Clicking the hidden one is a Playwright error,
 * not a navigation.
 */
function viaSidebar(href: string): (page: Page) => Locator {
  return (page) =>
    page.locator(`nav[aria-label="Primary"] a[href="${href}"]:visible`).first();
}

/** The first navigable row of the list the reader is standing on. */
function viaFirstRow(): (page: Page) => Locator {
  return (page) => page.locator('a[data-row-anchor="true"]').first();
}

/**
 * The seven routes with a `loading.tsx` that a Facility Manager reaches.
 *
 * `/` has none, and correctly: its four regions stream inside their own
 * `<Suspense>` boundaries and the page header renders before any of them, so
 * there is no whole-page fallback that could disagree with anything.
 *
 * `/batteries/new` gained one in unit 02 and is walked below as the role that
 * can reach it — P2 holds nothing on it, so it cannot join this list.
 */
const JOURNEYS: readonly Journey[] = [
  { from: "/", link: viaSidebar("/batteries"), to: "/batteries" },
  { from: "/", link: viaSidebar("/catalog"), to: "/catalog" },
  { from: "/", link: viaSidebar("/audit"), to: "/audit" },
  {
    from: "/",
    link: viaSidebar("/settings/organization"),
    to: "/settings/organization",
  },
  { from: "/", link: viaSidebar("/settings/users"), to: "/settings/users" },
  { from: "/batteries", link: viaFirstRow(), to: "/batteries/[id]" },
  { from: "/catalog", link: viaFirstRow(), to: "/catalog/[id]" },
];

/**
 * The two widths the sidebar exists at.
 *
 * **375 is swept separately**, through the one destination the mobile tab bar
 * carries: below `sm` the header's action goes full-width, which is the only
 * rule in `PageHeader` that differs by width, and `/batteries` is the route that
 * has an action.
 */
const VIEWPORTS = [
  { name: "desktop 1280×800", width: 1280, height: 800 },
  { name: "tablet 768×1024", width: 768, height: 1024 },
] as const;

test.describe("a skeleton's dimensions match the content that replaces it", () => {
  test.use({ storageState: storageStateFor("p2") });

  for (const viewport of VIEWPORTS) {
    test(`every route with a loading boundary, at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      for (const journey of JOURNEYS) {
        expectNoShift(journey, viewport.name, await measure(page, journey));
      }
    });
  }

  test("the phone, where the header's action goes full-width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const journey: Journey = {
      from: "/",
      link: (page_) => page_.locator('[data-mobile-tab="/batteries"]'),
      to: "/batteries",
    };
    expectNoShift(journey, "phone 375×812", await measure(page, journey));
  });
});

/**
 * `/batteries/new`, which only a Compliance Handler reaches.
 *
 * Unit 02 gave the intake route a `loading.tsx` — a breadcrumb trail, the
 * title, the stepper's line and one card — and the header block it stands in
 * for has to be the same height, or every tap on the centre tab drops the
 * capture surface under the thumb that pressed it (§6.3).
 *
 * Two ways in, both walked as P1: the dashboard's **Log a battery** quick
 * action from `md` up, and the raised centre tab on the phone — the route's
 * only entry from the tab bar and the form factor the flow is designed for
 * (`SITE_ARCHITECTURE.md` §2.2).
 */
test.describe("the intake route's skeleton, as the handler reaches it", () => {
  test.use({ storageState: storageStateFor("p1") });

  const viaQuickAction: Journey = {
    from: "/",
    link: (page_) =>
      page_.locator('#main-content a[href="/batteries/new"]').first(),
    to: "/batteries/new",
  };

  for (const viewport of VIEWPORTS) {
    test(`from the dashboard's quick action, at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      expectNoShift(
        viaQuickAction,
        viewport.name,
        await measure(page, viaQuickAction),
      );
    });
  }

  test("from the mobile centre tab, on the phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const journey: Journey = {
      from: "/",
      link: (page_) =>
        page_.locator(
          '[data-mobile-tab="centre"][data-mobile-tab-route="/batteries/new"]',
        ),
      to: "/batteries/new",
    };
    expectNoShift(journey, "phone 375×812", await measure(page, journey));
  });
});
