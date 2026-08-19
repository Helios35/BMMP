import { defineConfig, devices } from "@playwright/test";

/**
 * The e2e suite is stack-critical here. It runs against DATA_ADAPTER=mock from
 * day one and against DATA_ADAPTER=supabase after migration, and the same suite
 * must pass both ways. That is the proof the swap point held. Section 5, D-15.
 *
 * So nothing in this config or in the specs hard-codes "mock". The adapter comes
 * from the environment and the specs assert the app reports whichever one is
 * configured.
 */
const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;
const dataAdapter = process.env.DATA_ADAPTER ?? "mock";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Built rather than dev-served, so e2e exercises what actually ships.
    command: "pnpm build && pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATA_ADAPTER: dataAdapter,
      NEXT_PUBLIC_APP_URL: baseURL,
      PORT: String(PORT),
    },
  },
});
