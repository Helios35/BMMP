import type { BucketKey, ObjectStore } from "@/data/contracts/object-store";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { sha256Hex } from "@/lib/hash/sha256";

import { mockStore } from "./store";

/**
 * The mock object store — `TECHNICAL_SPEC.md` §5.2; the private buckets.
 *
 * **Overwrite is refused** — a correction is a new object at a new path,
 * exactly as a correction to an append-only row is a new row — and **a path
 * outside the caller's `org/{organizationId}/` prefix is refused**, as the
 * bucket policy refuses it. The digest it reports is the real SHA-256 of the
 * bytes it kept.
 *
 * A write that puts bytes and then fails restores the store with
 * {@link snapshotObjects}, so there is never a stored object a rolled-back
 * write left behind — and never a row pointing at bytes that are not there.
 */

function key(bucket: BucketKey, path: string): string {
  return `${bucket}:${path}`;
}

/** Whether bytes are stored at the path — what departure and a reprint stand on. */
export function hasStoredObject(bucket: BucketKey, path: string): boolean {
  return path !== "" && mockStore().objects.has(key(bucket, path));
}

/** Snapshot the stored keys; the returned function removes any object put since. */
export function snapshotObjects(): () => void {
  const objects = mockStore().objects;
  const before = new Set(objects.keys());
  return () => {
    for (const stored of [...objects.keys()]) {
      if (!before.has(stored)) objects.delete(stored);
    }
  };
}

export const mockObjects: ObjectStore = {
  async put(ctx, req) {
    if (!req.path.startsWith(`org/${ctx.organizationId}/`)) {
      throw new ValidationError({
        userMessage: "That storage path is not available.",
        correlationId: ctx.correlationId,
        context: { path: req.path },
      });
    }
    const stored = key(req.bucket, req.path);
    if (mockStore().objects.has(stored)) {
      throw new ConflictError({
        userMessage: "That object already exists and cannot be overwritten.",
        correlationId: ctx.correlationId,
        context: { path: req.path },
      });
    }
    // A copy, so a caller holding the array cannot change what was stored.
    const bytes = new Uint8Array(req.bytes);
    mockStore().objects.set(stored, { bytes, contentType: req.contentType });
    return {
      bucket: req.bucket,
      path: req.path,
      contentHash: await sha256Hex(bytes),
      byteSize: bytes.byteLength,
      contentType: req.contentType,
    };
  },
  async get(ctx, req) {
    const stored = mockStore().objects.get(key(req.bucket, req.path));
    if (
      stored === undefined ||
      !req.path.startsWith(`org/${ctx.organizationId}/`)
    ) {
      throw new NotFoundError({
        userMessage: "That file could not be retrieved.",
        correlationId: ctx.correlationId,
        context: { path: req.path },
      });
    }
    return stored.bytes;
  },
  async signedUrl(ctx, req) {
    if (!req.path.startsWith(`org/${ctx.organizationId}/`)) {
      throw new NotFoundError({
        userMessage: "That file could not be retrieved.",
        correlationId: ctx.correlationId,
        context: { path: req.path },
      });
    }
    // Never logged, in either adapter.
    return `mock://${req.bucket}/${req.path}?ttl=${req.ttlSeconds}`;
  },
};
