import { expect, test } from "@playwright/test";

import { MOCK_DATA_BANNER_TEXT } from "@/features/shell/chrome/mock-data-banner-copy";

import { storageStateFor } from "./support/roles";

/**
 * The mock banner — `RUNBOOK.md` §1.4, brief 07 outcome 7: on every screen,
 * `(app)` and `(auth)`, whenever the adapter is the mock; never dismissible;
 * never `role="alert"`.
 *
 * **Adapter-agnostic, like the rest of the suite** (D-15): the expectation is
 * read from `GET /api/health`, so after migration the same spec asserts the
 * banner is absent rather than failing.
 */

async function adapterIsMock(
  request: import("@playwright/test").APIRequestContext,
): Promise<boolean> {
  const health = (await (await request.get("/api/health")).json()) as {
    activeAdapterName: string;
  };
  return health.activeAdapterName === "mock";
}

const AUTH_SCREENS = ["/sign-in", "/sign-up"] as const;
const APP_SCREENS = [
  "/",
  "/batteries",
  "/containers",
  "/shipments",
  "/catalog",
  "/settings/organization",
  "/audit",
] as const;

async function expectBanner(
  page: import("@playwright/test").Page,
  mock: boolean,
): Promise<void> {
  const banner = page.locator("[data-mock-data-banner]");
  if (!mock) {
    await expect(banner).toHaveCount(0);
    return;
  }
  await expect(banner).toHaveCount(1);
  await expect(banner).toHaveText(MOCK_DATA_BANNER_TEXT);
  await expect(banner).toHaveAttribute("role", "status");
  // Not dismissible: nothing to press, nothing to close.
  await expect(banner.locator("button, a, [role='button']")).toHaveCount(0);
}

test.describe("before sign-in", () => {
  for (const path of AUTH_SCREENS) {
    test(`${path} carries the banner`, async ({ page, request }) => {
      const mock = await adapterIsMock(request);
      await page.goto(path);
      await expectBanner(page, mock);
    });
  }
});

test.describe("signed in", () => {
  test.use({ storageState: storageStateFor("p2") });

  test("every screen carries the banner", async ({ page, request }) => {
    const mock = await adapterIsMock(request);
    for (const path of APP_SCREENS) {
      await page.goto(path);
      await expect(page.locator("#page-title")).toBeVisible();
      await expectBanner(page, mock);
    }
  });
});
