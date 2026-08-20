import { afterEach } from "vitest";

/**
 * Component-test setup.
 *
 * `@testing-library/jest-dom` adds the DOM matchers, and the cleanup keeps one
 * component test from leaving a tree behind for the next one — a suite that
 * passes only in the order it happens to run in is not a suite.
 *
 * Both are no-ops under the default `node` environment, so a pure-domain test
 * pays nothing for them.
 */
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
  });
}
