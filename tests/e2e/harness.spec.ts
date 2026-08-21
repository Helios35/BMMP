import { expect, test, type Page } from "@playwright/test";

import { fixtureIds, INVITE_TOKENS, storageStateFor } from "./support/roles";

/**
 * The e2e suite is stack-critical here.
 *
 * It runs against `DATA_ADAPTER=mock` from day one and against
 * `DATA_ADAPTER=supabase` after migration, and **the same suite must pass both
 * ways** — that is the proof the swap point held (`TECHNICAL_SPEC.md` §5.5,
 * D-15). So nothing here hard-codes an adapter name: the specs assert the app
 * reports whichever one is configured.
 *
 * They also assert on **visible behaviour and containment rather than result
 * ordering**, because full-text ranking legitimately differs between an
 * in-memory scorer and Postgres, and an ordering assertion would make a green
 * mock suite lie.
 */

const expectedAdapter = process.env.DATA_ADAPTER ?? "mock";

test("the application boots", async ({ page }) => {
  // `/` is guarded now, so an anonymous visit redirects to
  // `/sign-in?next=%2F` and never renders. The boot check therefore points at
  // the first surface an unauthenticated caller is entitled to see.
  //
  // It asserts on the form rather than on a heading role: the `(auth)` layout
  // renders the wordmark as a `<p>` and shadcn's `CardTitle` is a `<div>`, so
  // `/sign-in` has no `<h1>` — see the build-notes.
  await page.goto("/sign-in");

  await expect(page.getByText("BMMP", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("the health endpoint states which adapter is live", async ({
  request,
}) => {
  // The property CI structurally cannot supply: CI cannot read the deployment
  // platform's environment values, so which adapter a running instance chose is
  // only checkable from the running instance (`TECHNICAL_SPEC.md` §5.1.1 point
  // 4). A production health check reporting `mock` is a page-someone alert.
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.activeAdapterName).toBe(expectedAdapter);
  expect(body.adapter.name).toBe(expectedAdapter);
  expect(body.adapter.kind).toBe(expectedAdapter === "mock" ? "fake" : "live");
});

test("the built application renders both themes and the 17px mobile base", async ({
  page,
}) => {
  // `UX_SPEC.md` §1.3 calls the 17px-below-md base the single highest-leverage
  // legibility decision in the spec, and §1.2 Rule 6 makes dark mode a
  // first-class target rather than a toggle bolted on. Both ship in B1a, so
  // both are checked against what actually builds rather than against the
  // stylesheet source.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sign-in");
  await expect(page.locator("html")).toHaveCSS("font-size", "17px");

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("html")).toHaveCSS("font-size", "16px");

  // The body paints an explicit background in both themes — a transparent body
  // would borrow whatever the host renders behind it.
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  const light = await page
    .locator("body")
    .evaluate((node) => getComputedStyle(node).backgroundColor);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/sign-in");
  // `next-themes` writes `.dark` on `<html>` from a pre-paint script, so the
  // emulated scheme has to be set before the navigation, not after it.
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  const dark = await page
    .locator("body")
    .evaluate((node) => getComputedStyle(node).backgroundColor);

  expect(light).not.toBe("rgba(0, 0, 0, 0)");
  expect(dark).not.toBe("rgba(0, 0, 0, 0)");
  // The assertion that stops this passing vacuously. Until `ThemeProvider`
  // landed, nothing put `.dark` on `<html>`, both themes measured identically
  // and the two checks above were satisfied by one stylesheet.
  expect(dark).not.toBe(light);
});

/**
 * Rule 1.25 — **no shipped surface expresses a probability of ignition.**
 *
 * `_ANCHORS.md` §7.1, `PROJECT_SETUP_BMMP.md` §8.3 and Roadmap Principle 4: no
 * screen, component, tooltip, export, PDF or API response in this product
 * displays a probability, percentage, likelihood or score of ignition, fire or
 * thermal runaway. `VISION.md` §4.2 tracks it as a per-sprint sweep with a
 * target of zero, so it is checked here rather than remembered — and it is the
 * cheapest possible guard against the single worst output this product could
 * produce.
 *
 * **The sweep reads `page.content()`, not `innerText`.** The rule covers copy a
 * reader never sees rendered as text: an `aria-label`, a `title`, an `alt`, a
 * placeholder, a value in the streamed payload. All of them ship.
 *
 * Every route is visited **as a role that can reach it**, and each visit asserts
 * the page actually rendered before it sweeps. A sweep of a redirect to
 * `/sign-in` finds nothing forbidden and proves nothing.
 *
 * Routes units 03–05 own — `/review`, `/containers*`, `/shipments*`,
 * `/documents/[id]`, `/settings/catalog` — do not exist yet and are not swept.
 * Each unit extends this list when it builds them.
 */
const IGNITION_PROBABILITY =
  /probabilit|likelihood|likely to (ignite|catch fire|combust)|risk of (fire|ignition|thermal)|chance of (fire|ignition|thermal runaway|ignit)|odds of (fire|ignition)|ignition (score|rate|risk)|fire risk/i;

function expectNoIgnitionProbability(label: string, body: string): void {
  const found = IGNITION_PROBABILITY.exec(body);
  expect(
    found === null ? null : found[0],
    `${label} expresses a probability of ignition (Rule 1.25): "${found?.[0]}"`,
  ).toBeNull();
}

/**
 * Open an `(app)` route, prove it rendered, and sweep everything it shipped.
 *
 * The URL assertion is what stops the sweep passing vacuously: a role that
 * cannot reach a route is redirected to `/` and a signed-out caller to
 * `/sign-in`, and neither destination expresses a probability of anything.
 */
async function sweepAppRoute(page: Page, pathname: string): Promise<void> {
  await page.goto(pathname);
  await expect(page).toHaveURL(pathname);
  await expect(page.locator("#page-title")).toBeVisible();
  expectNoIgnitionProbability(pathname, await page.content());
}

test.describe("no shipped surface expresses a probability of ignition", () => {
  test("the three public routes, signed out", async ({ page, request }) => {
    for (const pathname of [
      "/sign-in",
      "/sign-up",
      `/invite/${INVITE_TOKENS.pendingHandler}`,
    ]) {
      await page.goto(pathname);
      await expect(
        page.getByText("BMMP", { exact: true }),
        `${pathname} did not render the (auth) layout`,
      ).toBeVisible();
      expectNoIgnitionProbability(pathname, await page.content());
    }

    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    expectNoIgnitionProbability("/api/health", await health.text());
  });

  test.describe("every route a Facility Manager reaches", () => {
    test.use({ storageState: storageStateFor("p2") });

    test("renders none of it", async ({ page }) => {
      const { BATTERY, CATALOG } = fixtureIds;

      for (const pathname of [
        "/",
        "/batteries",
        // Four records rather than one: the vehicle pack, the small
        // mobility-device pack beside it, the swollen pack that sets the
        // damaged-or-defective flag — the record most likely to attract a
        // reassuring number — and the one mid-review with confidence spread
        // across all four bands, where a confidence band could be mistaken for
        // a hazard one.
        `/batteries/${BATTERY.vehicleTraction}`,
        `/batteries/${BATTERY.mobilityScooter}`,
        `/batteries/${BATTERY.swollenLaptop}`,
        `/batteries/${BATTERY.midReviewSpread}`,
        "/catalog",
        `/catalog/${CATALOG.vehicleTractionNmc}`,
        `/catalog/${CATALOG.mobilityScooterSla}`,
        "/settings/organization",
        "/settings/users",
        "/audit",
      ]) {
        await sweepAppRoute(page, pathname);
      }
    });

    test("nor does the audit export", async ({ page }) => {
      // Rule 1.25 names exports explicitly, and this is the only file this unit
      // produces. It is fetched through the page's context so it carries the
      // same session the screen would.
      const response = await page.request.get("/api/exports/audit");
      expect(response.status()).toBe(200);
      expectNoIgnitionProbability("/api/exports/audit", await response.text());
    });
  });

  test.describe("the intake route, which only a Compliance Handler reaches", () => {
    test.use({ storageState: storageStateFor("p1") });

    test("renders none of it", async ({ page }) => {
      // `/batteries/new` is the Terms of Service gate and nothing else in this
      // unit, and P1 holds the only membership `write` on it.
      await sweepAppRoute(page, "/batteries/new");
    });
  });
});
