import {
  PLATFORM_BUCKET,
  PLATFORM_PATH_PREFIX,
  type BucketKey,
  type ObjectStore,
} from "@/data/contracts/object-store";
import type { RequestContext } from "@/data/contracts/context";
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

/**
 * Whether the caller may read the path. An organization's objects are its own
 * (`org/{id}/`); the platform bucket's reference label photos are every
 * member's to read (Rule 2.36) and nothing else lives under its prefix.
 */
function readable(
  ctx: RequestContext,
  bucket: BucketKey,
  path: string,
): boolean {
  if (bucket === PLATFORM_BUCKET) return path.startsWith(PLATFORM_PATH_PREFIX);
  return path.startsWith(`org/${ctx.organizationId}/`);
}

/**
 * Whether the caller may write the path. **Only P6 writes the platform
 * bucket** (D-75 #1, #2) — a tenant's bytes can never land where every
 * tenant reads them.
 */
function writable(
  ctx: RequestContext,
  bucket: BucketKey,
  path: string,
): boolean {
  if (bucket === PLATFORM_BUCKET) {
    return ctx.isPlatformAdmin && path.startsWith(PLATFORM_PATH_PREFIX);
  }
  return path.startsWith(`org/${ctx.organizationId}/`);
}

export const mockObjects: ObjectStore = {
  async put(ctx, req) {
    if (!writable(ctx, req.bucket, req.path)) {
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
    if (stored === undefined || !readable(ctx, req.bucket, req.path)) {
      throw new NotFoundError({
        userMessage: "That file could not be retrieved.",
        correlationId: ctx.correlationId,
        context: { path: req.path },
      });
    }
    return stored.bytes;
  },
  async signedUrl(ctx, req) {
    if (!readable(ctx, req.bucket, req.path)) {
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
