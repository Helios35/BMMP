import type { RequestContext } from "./context";
import type { Sha256 } from "@/types/common";

/**
 * Object storage, behind the same seam — `TECHNICAL_SPEC.md` §5.2.
 *
 * **No bucket name reaches a feature file.** Two private buckets, both keyed on
 * an `org/{organizationId}/…` prefix, with storage policies allowing access only
 * when that path segment belongs to the caller. **No public bucket exists in
 * this project** (§9.5).
 */

/**
 * The buckets. Both private.
 *
 * `documents` holds rendered legal PDFs with overwrite disabled — a
 * `document_render` row's bytes are immutable, and a reprint serves the stored
 * bytes rather than re-rendering (`TECHNICAL_SPEC.md` §8.4).
 */
export const BUCKET_KEYS = ["intake-photos", "documents"] as const;

export type BucketKey = (typeof BUCKET_KEYS)[number];

export interface StoredObject {
  readonly bucket: BucketKey;
  readonly path: string;
  readonly contentHash: Sha256;
  readonly byteSize: number;
  readonly contentType: string;
}

export interface ObjectStore {
  /**
   * `immutable` is required and always `true`. Nothing in this product overwrites
   * a stored object: a correction is a new object with a new path, exactly as a
   * correction to an append-only row is a new row.
   */
  put(
    ctx: RequestContext,
    req: {
      readonly bucket: BucketKey;
      readonly path: string;
      readonly bytes: Uint8Array;
      readonly contentType: string;
      readonly immutable: true;
    },
  ): Promise<StoredObject>;

  get(
    ctx: RequestContext,
    req: { readonly bucket: BucketKey; readonly path: string },
  ): Promise<Uint8Array>;

  /**
   * A short-lived signed URL, minted server-side **after an authorization
   * check**. `ttlSeconds` is 60 for document bytes. **A signed URL is never
   * logged** (`TECHNICAL_SPEC.md` §10.2).
   */
  signedUrl(
    ctx: RequestContext,
    req: {
      readonly bucket: BucketKey;
      readonly path: string;
      readonly ttlSeconds: number;
    },
  ): Promise<string>;
}
