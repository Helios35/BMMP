import "server-only";

import { fixtureRecallProvider } from "./providers/fixture";
import type { RecallProvider } from "./provider";

export type {
  RecallHit,
  RecallProvider,
  RecallProviderErrorCode,
  RecallQuery,
} from "./provider";
export {
  RECALL_PROVIDER_ERROR_CODES,
  RecallProviderError,
  isRecallProviderError,
} from "./provider";

/**
 * Every implementation, keyed by the code `RECALL_PROVIDER` selects it with.
 * The real sources are one file each under `providers/` and one entry here
 * (unit 19); nothing outside this folder names one (`TECHNICAL_SPEC.md`
 * §12.3).
 */
const PROVIDERS = { fixture: fixtureRecallProvider } as const;

/**
 * The variables the selector reads. Narrower than NodeJS.ProcessEnv on
 * purpose: the guard is the thing under test, and a test hands it exactly the
 * keys it needs.
 */
export interface RecallEnvironment {
  RECALL_PROVIDER?: string | undefined;
  DATA_ADAPTER?: string | undefined;
  VERCEL_ENV?: string | undefined;
  [key: string]: string | undefined;
}

/**
 * Resolve the recall source, or throw — `TECHNICAL_SPEC.md` §12.3.
 *
 * **`fixture` is the default under `DATA_ADAPTER=mock`** (and so in CI, which
 * pins the mock), because the spec makes it one: on fake data the fixture
 * recalls are the only recalls there are. Everywhere else an unset value is a
 * hard failure, and **an unrecognized value fails at boot, always** — the same
 * as `VISION_PROVIDER`. The fixture is refused in production, as the mock is
 * (D-16): a real customer's battery checked against a test script's recalls
 * would read "No match" when nothing was asked.
 */
export function resolveRecallProvider(env: RecallEnvironment = process.env): {
  code: keyof typeof PROVIDERS;
  provider: RecallProvider;
} {
  const set = (env.RECALL_PROVIDER ?? "").trim();
  const code =
    set === "" && (env.DATA_ADAPTER ?? "").trim() === "mock" ? "fixture" : set;

  if (!(code in PROVIDERS)) {
    throw new Error(
      `RECALL_PROVIDER must be 'fixture'; got ${JSON.stringify(env.RECALL_PROVIDER)}`,
    );
  }
  if (code === "fixture" && env.VERCEL_ENV === "production") {
    throw new Error("RECALL_PROVIDER=fixture is refused in production.");
  }

  const key = code as keyof typeof PROVIDERS;
  return { code: key, provider: PROVIDERS[key] };
}

// Read once, at module load, like DATA_ADAPTER and VISION_PROVIDER: a process
// with no valid recall source fails here, where the boot log sees it, not on
// the first check.
const resolved = resolveRecallProvider();

/** Which recall source this process runs. */
export const activeRecallProviderCode = resolved.code;

/** The recall source this process runs. One per process; never re-resolved per request. */
export function recallProvider(): RecallProvider {
  return resolved.provider;
}
