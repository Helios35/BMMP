import "server-only";

import { fixtureProvider } from "./providers/fixture";
import type { VisionProvider } from "./provider";

export type {
  BoundingBox,
  ExtractionRequest,
  ExtractionUsage,
  LabelExtractionResult,
  LabelFieldKey,
  LabelFieldResult,
  RegionDetection,
  RegionRequest,
  VisionProvider,
  VisionProviderErrorCode,
} from "./provider";
export {
  HARD_GATED_FIELDS,
  LABEL_EXTRACTION_SCHEMA_VERSION,
  LABEL_FIELD_KEYS,
  VISION_PROVIDER_ERROR_CODES,
  VisionProviderError,
  isVisionProviderError,
} from "./provider";
export {
  labelExtractionResultSchema,
  parseLabelExtractionResult,
  type ValidatedLabelExtractionResult,
} from "./schema";

/**
 * Every implementation, keyed by the code `VISION_PROVIDER` selects it with.
 * Adding a vendor is one file under `providers/` and one entry here; nothing
 * outside this folder names it (D-25, `TECHNICAL_SPEC.md` §12.2).
 */
const PROVIDERS = { fixture: fixtureProvider } as const;

/**
 * The variable the selector reads. Narrower than NodeJS.ProcessEnv on purpose:
 * the guard is the thing under test, and a test should be able to hand it an
 * environment of exactly one key.
 */
export interface VisionEnvironment {
  VISION_PROVIDER?: string | undefined;
  [key: string]: string | undefined;
}

/**
 * Resolve the label reader, or throw.
 *
 * Fails closed, mirroring `src/data/index.ts` exactly. A default to the fixture
 * means an unset or misspelled variable silently reads every label with canned
 * answers — in production, a real customer's battery record filled from a test
 * script's idea of a label. The guard runs in the process that serves the
 * request, because CI cannot read the deployment platform's environment.
 */
export function resolveVisionProvider(env: VisionEnvironment = process.env): {
  code: keyof typeof PROVIDERS;
  provider: VisionProvider;
} {
  const code = (env.VISION_PROVIDER ?? "").trim();

  if (!(code in PROVIDERS)) {
    throw new Error(
      `VISION_PROVIDER must be 'fixture'; got ${JSON.stringify(env.VISION_PROVIDER)}`,
    );
  }

  const key = code as keyof typeof PROVIDERS;
  return { code: key, provider: PROVIDERS[key] };
}

// Read once, at module load, like DATA_ADAPTER. A process with no valid
// VISION_PROVIDER does not start serving requests and then fail on the first
// upload; it fails here, where the health endpoint and the boot log see it.
const resolved = resolveVisionProvider();

/** Exported so a health endpoint can state which label reader is live. */
export const activeVisionProviderCode = resolved.code;

/** The label reader this process runs. One per process; never re-resolved per request. */
export function visionProvider(): VisionProvider {
  return resolved.provider;
}
