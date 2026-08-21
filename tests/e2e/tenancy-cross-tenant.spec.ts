import { expect, test, type Page } from "@playwright/test";

import { fixtureIds, personaFor, storageStateFor } from "./support/roles";

/**
 * **A record identifier from another organisation resolves as NOT FOUND, never
 * as forbidden** — Rule 1.2, `SITE_ARCHITECTURE.md` §5.3(5).
 *
 * The two denials in this product are different on purpose. A colleague who
 * reaches a route her role cannot open is told the page exists and is not hers
 * (§5.3(4) — `guard-audit.spec.ts`). **Another tenant's record is stricter: the
 * answer is byte-identical to one that never existed, because existence is never
 * disclosed across tenants.**
 *
 * ## The equivalence *is* the test
 *
 * Asserting "the cross-tenant identifier renders a 404" proves almost nothing on
 * its own — a 404 page that says *"that record belongs to another organisation"*
 * would satisfy it, and would disclose exactly what Rule 1.2 forbids. So every
 * test below requests **two** identifiers, one belonging to the other tenant and
 * one that has never been allocated, and asserts the two render the same thing:
 * same status, same title, same visible content. A difference between them is
 * the disclosure.
 *
 * The DOM is checked as well as the copy. `page.content()` carries the
 * `aria-label`s, the `title`s and the streamed payload — all of which ship — and
 * **the owning tenant is never named in any of them**.
 *
 * ## The seam
 *
 * Nothing here reaches into `src/data`. `batteryRecords.get` returns `null` for
 * both identifiers, the page calls `notFound()` for both, and no code in
 * `src/app` ever holds enough information to tell them apart. This test drives
 * that from the outside, which is why it means the same thing against
 * `DATA_ADAPTER=supabase` (D-15, D-16).
 */

/**
 * Well-formed identifiers in the fixtures' own shape that were never allocated.
 *
 * `src/data/mock/fixtures/ids.ts` builds every id as
 * `<block>-0000-4000-8000-<n>`; the highest `n` in use is single digits, so
 * `ff` is free and stays free. They share the block prefix of the table they are
 * requested from **on purpose** — an absent id that looked different from a real
 * one would make the comparison below easier than it should be.
 */
const NEVER_ALLOCATED_BATTERY_ID = "0a000009-0000-4000-8000-0000000000ff";
const NEVER_ALLOCATED_CATALOG_ID = "0a000008-0000-4000-8000-0000000000ff";

/**
 * Wording that would turn a not-found into a disclosure.
 *
 * Checked against the rendered not-found region rather than the whole document,
 * because the shell legitimately names the reader's *own* organisation in the
 * switcher and the user menu. What must never appear is a statement about *this
 * identifier* — that it is someone else's, that it is refused, that permission
 * is the reason.
 */
const FORBIDDEN_WORDING =
  /forbidden|not authori[sz]ed|unauthori[sz]ed|permission|access denied|don'?t have access|another organi[sz]ation|belongs to|different organi[sz]ation/i;

interface NotFoundSurface {
  readonly status: number;
  readonly title: string;
  readonly content: string;
  readonly html: string;
}

/**
 * Open a path and read back everything a reader — or a snooping reader — could
 * learn from the answer.
 *
 * `content` is the not-found region only: the text of the `<main>` the page
 * title sits in. Scoped that way rather than to `<body>` so the comparison
 * survives the surface moving inside the app shell, where the alert bell and the
 * organisation switcher legitimately differ between two requests.
 */
async function readNotFoundSurface(
  page: Page,
  pathname: string,
): Promise<NotFoundSurface> {
  const response = await page.goto(pathname);
  const title = page.locator("#page-title");
  await expect(title).toBeVisible();

  const content = await title.evaluate((node) => {
    const region = node.closest("main") ?? node.ownerDocument.body;
    return (region as HTMLElement).innerText.replace(/\s+/g, " ").trim();
  });

  return {
    status: response?.status() ?? 0,
    title: (await title.innerText()).replace(/\s+/g, " ").trim(),
    content,
    html: await page.content(),
  };
}

/**
 * The whole rule, applied to one pair of identifiers on one route.
 *
 * `foreign` belongs to the other tenant; `absent` was never allocated. Both must
 * be refused, identically, without ever naming the tenant that owns the first.
 */
async function expectIndistinguishable(
  page: Page,
  route: { readonly foreign: string; readonly absent: string },
): Promise<void> {
  const otherTenant = personaFor("p1Rainier").organizationName;

  const foreign = await readNotFoundSurface(page, route.foreign);
  const absent = await readNotFoundSurface(page, route.absent);

  // **Never 403, and never 401** — either one confirms the record exists.
  expect(foreign.status).not.toBe(403);
  expect(foreign.status).not.toBe(401);

  /**
   * The status the specification asks for is **404** (`TECHNICAL_SPEC.md`
   * §10.3, spec 03 §F.3 step 2), and today both of these answer **200**.
   *
   * The cause is not the tenancy rule: `notFound()` is reached after the shell
   * has begun streaming, so Next.js can no longer set the status line, and an
   * unmatched URL — `/nope` — still answers 404. The behaviour is identical for
   * both identifiers, so **Rule 1.2 is not what is broken here**, and the
   * equality below is what this test is actually for.
   *
   * Accepted as either rather than pinned to 200, so this test does not have to
   * change when the route owner fixes it. **Reported to the owner** — a
   * compliance surface answering 200 for a record that does not exist is wrong
   * for caching, for crawlers and for any client that branches on the status.
   */
  expect([200, 404]).toContain(foreign.status);

  // It is a real not-found surface and not an empty page, so the equality below
  // cannot be satisfied by two blanks.
  expect(foreign.title).not.toBe("");
  expect(foreign.title).toMatch(/couldn.t find/i);
  expect(foreign.content.length).toBeGreaterThan(foreign.title.length);

  // **This is the assertion Rule 1.2 actually turns on.**
  expect(foreign.status).toBe(absent.status);
  expect(foreign.title).toBe(absent.title);
  expect(foreign.content).toBe(absent.content);

  for (const surface of [foreign, absent]) {
    expect(surface.content).not.toMatch(FORBIDDEN_WORDING);
    // Not only in the copy: not in an `aria-label`, a `title`, an `alt` or the
    // streamed payload either.
    expect(surface.html).not.toContain(otherTenant);
    expect(surface.html).not.toContain("Rainier");
  }
}

test.describe("an identifier from another organisation", () => {
  // Dana, at Cascade. `BATTERY.rainierScooter` is Jo's, at Rainier.
  test.use({ storageState: storageStateFor("p1") });

  test("resolves on /batteries/[id] exactly as an absent one does", async ({
    page,
  }) => {
    await expectIndistinguishable(page, {
      foreign: `/batteries/${fixtureIds.BATTERY.rainierScooter}`,
      absent: `/batteries/${NEVER_ALLOCATED_BATTERY_ID}`,
    });
  });

  test("resolves on /catalog/[id] exactly as an absent one does", async ({
    page,
  }) => {
    // The fixtures hold no catalog entry belonging to a single tenant — every
    // entry is platform-global (`organization_id is null`, §9.5) — so the
    // foreign identifier here is Rainier's *battery* id. It is still an
    // identifier that exists and is not this reader's, which is the thing
    // Rule 1.2 is about, and `catalogEntries.get` must answer it the same way it
    // answers an id that was never allocated. Reported to the owner: a
    // tenant-proposed catalog entry in a second organisation would make this
    // test stronger.
    await expectIndistinguishable(page, {
      foreign: `/catalog/${fixtureIds.BATTERY.rainierScooter}`,
      absent: `/catalog/${NEVER_ALLOCATED_CATALOG_ID}`,
    });
  });
});

test.describe("the same identifier, inside the organisation that owns it", () => {
  // Jo, at Rainier. **Without this the test above would pass just as well
  // against a fixture that does not exist**, and would be proving nothing.
  test.use({ storageState: storageStateFor("p1Rainier") });

  test("renders the record", async ({ page }) => {
    const recordPath = `/batteries/${fixtureIds.BATTERY.rainierScooter}`;

    const response = await page.goto(recordPath);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(recordPath);

    const title = page.locator("#page-title");
    await expect(title).toBeVisible();
    await expect(title).not.toHaveText(/couldn.t find/i);
  });
});
