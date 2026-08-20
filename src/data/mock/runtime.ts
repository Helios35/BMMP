/**
 * Mock runtime behaviour — latency and seeded failures.
 *
 * `UX_SPEC.md` §0 requires the mock to **simulate latency (150–600ms) and expose
 * at least one seeded failure per contract method**, otherwise the loading and
 * error states the spec defines are unreachable and will ship broken.
 *
 * Both are **off by default** and switched on deliberately. Nothing in this unit
 * renders a loading state — there are no screens yet — and a default-on latency
 * would add minutes to every test run for no signal. The first unit that builds
 * a screen turns it on for the app and leaves it off for tests.
 */

export interface MockRuntimeConfig {
  /**
   * Simulated round-trip latency, in milliseconds. `null` disables it.
   *
   * When set, each call waits a deterministic value inside the range, derived
   * from the call's own name — deterministic rather than random, so a failing
   * test is reproducible.
   */
  readonly latencyRangeMs: readonly [number, number] | null;
  /**
   * Contract methods seeded to fail, as `"entity.method"` — for example
   * `"batteryRecords.list"`.
   *
   * A seeded method throws its stated error on **every** call while listed, so
   * an error state can be driven from a single switch rather than by breaking
   * fixtures.
   */
  readonly seededFailures: readonly string[];
}

const DEFAULT: MockRuntimeConfig = {
  latencyRangeMs: null,
  seededFailures: [],
};

let current: MockRuntimeConfig = DEFAULT;

export function mockRuntimeConfig(): MockRuntimeConfig {
  return current;
}

export function configureMockRuntime(
  config: Partial<MockRuntimeConfig>,
): MockRuntimeConfig {
  current = { ...current, ...config };
  return current;
}

export function resetMockRuntime(): MockRuntimeConfig {
  current = DEFAULT;
  return current;
}

/** A stable hash of a method name, so the same call always waits the same time. */
function stableOffset(methodName: string, span: number): number {
  let hash = 0;
  for (let index = 0; index < methodName.length; index += 1) {
    hash = (hash * 31 + methodName.charCodeAt(index)) % 100_000;
  }
  return span === 0 ? 0 : hash % span;
}

export async function simulateLatency(methodName: string): Promise<void> {
  const range = current.latencyRangeMs;
  if (range === null) return;
  const [low, high] = range;
  const delay = low + stableOffset(methodName, Math.max(0, high - low));
  await new Promise((resolve) => setTimeout(resolve, delay));
}

export function isSeededToFail(methodName: string): boolean {
  return current.seededFailures.includes(methodName);
}
