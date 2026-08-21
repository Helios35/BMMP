import { expect, test, type Page } from "@playwright/test";

import { fixtureIds, personaFor, storageStateFor } from "./support/roles";

/**
 * **E-12 — no Terms of Service acceptance in force** (`UX_SPEC.md` §5,
 * Rules 7.1, 7.2, 7.4, 1.19).
 *
 * Two halves, and the second is the one that is easy to get wrong.
 *
 * 1. **Intake is blocked organization-wide.** `/batteries/new` renders a
 *    `critical` block in place of the capture step, and the block **names what
 *    must be accepted and who in this organization can accept it** — a block
 *    that can only refuse leaves a warehouse handler with nobody to walk over
 *    to (D-35).
 * 2. **Every read-only route stays reachable.** *"Do not lock the whole app."*
 *    An organization has to be able to set itself up while consent is pending,
 *    so this file walks every read-only route the unit builds, as the roles
 *    that can reach them, and asserts each one renders.
 *
 * **Where it is driven.** `ORG.olympic` holds a real `tos_acceptance` row in
 * state `not_accepted` — an absent acceptance, recorded rather than missing
 * (`TOS.olympicNotAccepted`). Tom holds the only `write` on `/batteries/new`
 * there; Rosa holds Olympic's binding authority and is the person the block
 * names. Nothing here touches `src/data` (D-15, D-16).
 *
 * **Rosa is never sent to `/batteries/new`.** She holds `none` on it, so the
 * guard would redirect her *and write a denial to Olympic's audit log*
 * (§5.3(8)) — which would take Olympic's log out of the zero-events state that
 * `edge-list-and-lookup-states.spec.ts` proves. Her half of the block is
 * asserted on `/`, where the same notice renders.
 */

/** The `(app)` content region, so a nav item never satisfies a content assertion. */
const MAIN = "#main-content";

const INTAKE_ROUTE = "/batteries/new";
const BLOCK = '[data-intake-gate-state="blocked"]';

/** `INTAKE_BLOCK_HEADLINE` — `src/features/consent/read-intake-gate.ts`. */
const BLOCK_HEADLINE = "Batteries can't be logged yet.";

/**
 * Every read-only route this unit builds, with the role that can reach it.
 *
 * `/batteries/[id]` is absent because Olympic holds no battery record — which
 * is the same fixture fact E-1 turns on. Routes units 03–05 own (`/review`,
 * `/containers*`, `/shipments*`, `/documents/[id]`, `/settings/catalog`) are
 * absent because they do not exist yet; each unit extends this list when it
 * builds them.
 */
const READ_ONLY_ROUTES = {
  /** P1 at Olympic. */
  p1Olympic: [
    "/",
    "/batteries",
    "/catalog",
    `/catalog/${fixtureIds.CATALOG.mobilityScooterSla}`,
  ],
  /** P2 at Olympic — the four above plus the three P1 cannot reach. */
  p2Olympic: [
    "/",
    "/batteries",
    "/catalog",
    `/catalog/${fixtureIds.CATALOG.mobilityScooterSla}`,
    "/settings/organization",
    "/settings/users",
    "/audit",
  ],
} as const;

/**
 * The three routes §5 E-12 names as the block's home.
 *
 * `/settings/organization` carries it inside the Terms of Service card, because
 * that is the page the remedy points at. Everywhere else its presence would be
 * the failure Rule 7.2 exists to prevent, so the walk asserts absence rather
 * than merely not looking.
 */
const BLOCK_ROUTES: ReadonlySet<string> = new Set([
  "/",
  INTAKE_ROUTE,
  "/settings/organization",
]);

/**
 * Open a route and prove it rendered — status, URL and a heading.
 *
 * The URL assertion is what stops this passing vacuously: a role that cannot
 * reach a route is redirected to `/` and a signed-out caller to `/sign-in`, and
 * a 200 on either would otherwise read as success.
 */
async function expectRouteRenders(page: Page, pathname: string): Promise<void> {
  const response = await page.goto(pathname);
  expect(response?.status(), `${pathname} did not answer 200`).toBe(200);
  await expect(page).toHaveURL(pathname);
  await expect(
    page.locator("#page-title"),
    `${pathname} rendered no heading, so the gate may have blocked it`,
  ).toBeVisible();
}

test.describe("E-12 — the block on /batteries/new", () => {
  test.use({ storageState: storageStateFor("p1Olympic") });

  test("names what must be accepted and who in this organization can accept it", async ({
    page,
  }) => {
    await expectRouteRenders(page, INTAKE_ROUTE);

    const block = page.locator(BLOCK);
    await expect(block).toBeVisible();
    // A hard compliance block is an alert, never a toast — a toast disappears
    // and a compliance block must not (§6.1, §2.6).
    await expect(block).toHaveAttribute("role", "alert");
    await expect(block).toContainText(BLOCK_HEADLINE);

    // What must be accepted. The training-rights grant is named in the block
    // itself rather than behind a link (§3.2, Rule 7.1).
    await expect(block).toContainText("Terms of Service");
    await expect(block).toContainText("data training-rights grant");

    // Who can accept it — a person, from live membership data, not a role in
    // the abstract (Rule 7.2, D-35).
    const acceptor = personaFor("p2Olympic");
    await expect(block).toContainText(acceptor.fullName);
    await expect(block).toContainText("Facility Manager");
    await expect(block).toContainText(
      "can accept this in Organization settings",
    );
  });

  test("never offers a platform admin as the remedy, and never a link this role is redirected away from", async ({
    page,
  }) => {
    await expectRouteRenders(page, INTAKE_ROUTE);
    const block = page.locator(BLOCK);

    // Rules 7.4 and 1.19 — **P6 can never accept on a tenant's behalf, under
    // any circumstance**, including under a recorded support grant. A block
    // that named one would send a customer to the one person who cannot help.
    await expect(block).not.toContainText("Platform Admin");
    await expect(block).not.toContainText("Admin");

    // E-11 generalised (§5.3(7)): P1 cannot reach `/settings/organization`, so
    // the block gives the name with no link rather than a dead one.
    await expect(
      page.locator(`${MAIN} a[href="/settings/organization"]`),
    ).toHaveCount(0);
  });

  test("the same block renders on the dashboard, and the create actions are absent rather than disabled", async ({
    page,
  }) => {
    await expectRouteRenders(page, "/");

    const block = page.locator(BLOCK);
    await expect(block).toBeVisible();
    await expect(block).toContainText(BLOCK_HEADLINE);

    // **Absent, not disabled** (§2.9's decision table, §3.1.7). Nobody in this
    // organization can log a battery yet, so this is not a permission
    // difference between colleagues — there is no reason for a reader to
    // discover on a greyed-out control, and the alert above carries it.
    await expect(
      page.locator(`${MAIN} a[href="${INTAKE_ROUTE}"]`),
      "the dashboard offered a route into blocked intake",
    ).toHaveCount(0);
    await expect(
      page.locator(`${MAIN} [aria-disabled="true"]`),
      "a disabled create control is E-12 rendered the wrong way",
    ).toHaveCount(0);
    await expect(page.locator(`${MAIN} button[disabled]`)).toHaveCount(0);
  });
});

test.describe("E-12 — the block, read by the person who can lift it", () => {
  test.use({ storageState: storageStateFor("p2Olympic") });

  test("names the reader herself and offers the route she can reach", async ({
    page,
  }) => {
    await expectRouteRenders(page, "/");

    const block = page.locator(BLOCK);
    await expect(block).toBeVisible();
    await expect(block).toContainText(BLOCK_HEADLINE);
    await expect(block).toContainText(
      "You can accept this in Organization settings.",
    );
    // She holds `write` on `/settings/organization`, so the block links there —
    // the same capability map the guard reads decides that (§5.3(7)).
    await expect(block.locator('a[href="/settings/organization"]')).toHaveCount(
      1,
    );
  });
});

for (const [ref, routes] of Object.entries(READ_ONLY_ROUTES) as readonly [
  keyof typeof READ_ONLY_ROUTES,
  readonly string[],
][]) {
  test.describe(`E-12 — every read-only route stays reachable for ${ref}`, () => {
    test.use({ storageState: storageStateFor(ref) });

    test("the gate blocks intake, not the app", async ({ page }) => {
      for (const pathname of routes) {
        await expectRouteRenders(page, pathname);
        // The reason the walk matters: the block belongs on the three routes
        // §5 E-12 names and must not have followed the reader anywhere else
        // (Rules 7.1, 7.2).
        await expect(
          page.locator(`${MAIN} ${BLOCK}`),
          `${pathname} disagrees with E-12 about where the intake block belongs`,
        ).toHaveCount(BLOCK_ROUTES.has(pathname) ? 1 : 0);
      }
    });
  });
}
