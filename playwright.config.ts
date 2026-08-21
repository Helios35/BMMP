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
  /**
   * Playwright empties this directory at the start of every run. It is
   * `test-results/artifacts` rather than the default `test-results` so that
   * `test-results/.auth`, where the setup project saves each signed-in browser
   * state, survives the cleanup and is rewritten by setup instead — see
   * `tests/e2e/support/roles.ts` for why the states live there at all.
   */
  outputDir: "test-results/artifacts",
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
  projects: [
    /**
     * Signs in as each of the nine fixture identities **through the real
     * `/sign-in` form** and saves the cookie the product issued. Every browser
     * project depends on it, so a spec that declares
     * `test.use({ storageState: storageStateFor("p5") })` finds the file
     * already written.
     *
     * A setup project rather than a `globalSetup` because it needs a browser,
     * because a failure has to be reported as a failing test rather than as a
     * crash before the reporter starts, and because `dependencies` is what makes
     * the ordering explicit rather than incidental.
     */
    {
      name: "setup",
      testMatch: /support[\\/]auth\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testMatch: /\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Built rather than dev-served, so e2e exercises what actually ships.
    command: "pnpm build && pnpm start",
    url: baseURL,
    /**
     * Local only — `CI` is set in CI, so CI always starts its own server and the
     * pinned environment below is the environment the run gets. Locally a server
     * that is already listening is reused as it was started, which is the one
     * way a developer's `.env.local` can still reach a run.
     */
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    /**
     * **Every switch the server reads is stated here, not inherited.**
     *
     * `MOCK_LATENCY_MS` and `MOCK_SEEDED_FAILURES` are pinned empty because
     * either one leaking out of a developer's shell would change what the suite
     * is testing without changing a line of it: latency turns timing-sensitive
     * assertions into a coin toss, and a seeded failure makes a route render its
     * error state while the spec asserts its content. Both are off when empty
     * (`src/data/mock/runtime-from-env.ts`), and `.env.example` records that
     * Playwright pins them.
     *
     * `DATA_ADAPTER` is written explicitly for the same reason, but it is
     * **defaulted rather than fixed to "mock"**: hard-coding the literal here
     * would make `DATA_ADAPTER=supabase pnpm test:e2e` silently boot the mock
     * after migration, and proving the identical suite passes both ways is the
     * property this whole file exists to protect (D-15, D-16). The health test
     * reads the same default, so the two cannot disagree.
     */
    env: {
      DATA_ADAPTER: dataAdapter,
      MOCK_LATENCY_MS: "",
      MOCK_SEEDED_FAILURES: "",
      NEXT_PUBLIC_APP_URL: baseURL,
      PORT: String(PORT),
    },
  },
});
