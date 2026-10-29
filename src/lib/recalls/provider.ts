import type { RecallHit, RecallQuery } from "@/domain/recalls/hit";

/**
 * The recall source's contract — `TECHNICAL_SPEC.md` §12.3; Rules 10.11,
 * 10.17; D-73.
 *
 * `search(query): Promise<RecallHit[]>`, behind one interface for both
 * sources, so the caller does not know which implementation answered. A
 * provider returns what the source published for the query; whether a hit is
 * a candidate is the domain's question (`candidateFor`), never the
 * provider's, and **no provider returns a score**.
 *
 * Built like `src/lib/vision/`: one file per implementation under
 * `providers/`, one entry in the selector, nothing outside this folder names
 * a source's endpoint. The real sources are unit 19.
 */

export type { RecallHit, RecallQuery };

export interface RecallProvider {
  readonly code: string;
  search(query: RecallQuery): Promise<RecallHit[]>;
}

/**
 * Why a source did not answer. Recorded on the failed check run as its reason
 * code — **a failure is never shown as "no match"** (Rule 10.17).
 */
export const RECALL_PROVIDER_ERROR_CODES = [
  "source_unavailable",
  "timeout",
  "rate_limited",
  "malformed",
] as const;

export type RecallProviderErrorCode =
  (typeof RECALL_PROVIDER_ERROR_CODES)[number];

/** The one error a provider throws. Nothing below the seam names a source in a message. */
export class RecallProviderError extends Error {
  readonly code: RecallProviderErrorCode;

  constructor(
    code: RecallProviderErrorCode,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
  }
}

export function isRecallProviderError(
  value: unknown,
): value is RecallProviderError {
  return value instanceof RecallProviderError;
}
