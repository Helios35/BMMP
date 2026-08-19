import { expect, test } from "@playwright/test";

const expectedAdapter = process.env.DATA_ADAPTER ?? "mock";

test("the application boots", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "BMMP" })).toBeVisible();
});

test("the health endpoint states which adapter is live", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.activeAdapterName).toBe(expectedAdapter);
  expect(body.adapter.name).toBe(expectedAdapter);
  expect(body.adapter.kind).toBe(expectedAdapter === "mock" ? "fake" : "live");
});
