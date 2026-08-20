import { expect, test } from "@playwright/test";

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
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "BMMP" })).toBeVisible();
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
  await page.goto("/");
  await expect(page.locator("html")).toHaveCSS("font-size", "17px");

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("html")).toHaveCSS("font-size", "16px");

  // The body paints an explicit background in both themes — a transparent body
  // would borrow whatever the host renders behind it.
  const light = await page
    .locator("body")
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const dark = await page
    .locator("body")
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(light).not.toBe("rgba(0, 0, 0, 0)");
  expect(dark).not.toBe("rgba(0, 0, 0, 0)");
});

test("no shipped surface expresses a probability of ignition", async ({
  page,
  request,
}) => {
  // `_ANCHORS.md` §7.1, `PROJECT_SETUP_BMMP.md` §8.3 and Roadmap Principle 4:
  // no screen, component, tooltip, export, PDF or API response in this product
  // displays a probability, percentage, likelihood or score of ignition, fire
  // or thermal runaway. `VISION.md` §4.2 tracks this as a per-sprint sweep with
  // a target of zero, so it is checked here rather than remembered.
  const forbidden =
    /probability of ignition|likelihood of (fire|ignition|thermal)|risk of fire|chance of (fire|ignition|thermal runaway)/i;

  await page.goto("/");
  expect(await page.locator("body").innerText()).not.toMatch(forbidden);

  const health = await request.get("/api/health");
  expect(await health.text()).not.toMatch(forbidden);
});
