import { configureMockRuntime, type MockRuntimeConfig } from "./runtime";

/**
 * Turns the mock's latency and seeded failures on from the environment —
 * `UX_SPEC.md` §0 and §7.2, and the job `BUILD_NOTES_b1a-00-foundation.md` §7.3
 * hands to the first unit that builds a screen.
 *
 * The mock has to **simulate latency and expose seeded failures**, or the
 * loading, empty and error states the spec defines are unreachable in the
 * prototype and ship broken — the developer never sees the skeleton and never
 * sees the retry, so neither gets built.
 *
 * **Both stay off unless the environment asks.** A default-on latency would add
 * minutes to every vitest run for no signal, and a default-on failure would make
 * a green suite depend on a coin toss. A developer sets `MOCK_LATENCY_MS` in
 * `.env.local` to see the real thing; Playwright pins both to empty in
 * `webServer.env` so a developer's shell cannot leak into a run.
 *
 * **Neither key is `NEXT_PUBLIC_`.** These are server-only behaviour switches,
 * and that prefix would ship them to the browser (`CLAUDE.md`, Environment).
 *
 * This reads the environment; `src/data/index.ts` does not and must not — that
 * file reads `DATA_ADAPTER` and only `DATA_ADAPTER` (`TECHNICAL_SPEC.md` §5.4).
 * Called once at module load from `src/data/mock/index.ts`.
 */
export function applyMockRuntimeFromEnv(
  env: Record<string, string | undefined> = process.env,
): MockRuntimeConfig {
  return configureMockRuntime({
    latencyRangeMs: parseLatencyRange(env.MOCK_LATENCY_MS),
    seededFailures: parseSeededFailures(env.MOCK_SEEDED_FAILURES),
  });
}

/**
 * `"150,600"` turns latency on. Empty, unset, malformed, negative or inverted
 * leaves it `null` — an unreadable value means off, never a guessed range, and
 * never a throw: a typo in someone's `.env.local` must not take the app down.
 */
function parseLatencyRange(
  value: string | undefined,
): readonly [number, number] | null {
  if (value === undefined) return null;

  const parts = value.split(",");
  if (parts.length !== 2) return null;

  const low = Number(parts[0]?.trim());
  const high = Number(parts[1]?.trim());
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low < 0 || high < low) return null;

  return [low, high];
}

/**
 * Comma-separated `entity.method` — for example
 * `"batteryRecords.list,alerts.list"`. Empty or unset leaves it `[]`.
 */
function parseSeededFailures(value: string | undefined): readonly string[] {
  if (value === undefined) return [];

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}
