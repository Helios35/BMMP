import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Playwright owns tests/e2e. Vitest must not try to run it.
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
    ],
    setupFiles: ["tests/setup/env.ts"],
    // The domain-boundary gate runs ESLint in-process; loading the flat config
    // costs several seconds on the first call.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 'server-only' throws when imported outside a React Server Component.
      // Its job is to stop the seam leaking into the browser bundle at build
      // time; under Vitest there is no bundler, so it is stubbed out.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
});
