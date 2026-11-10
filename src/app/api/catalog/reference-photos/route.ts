import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { requireWrite } from "@/lib/auth/guard";
import { isAppError, type AppErrorCode } from "@/lib/errors";
import {
  isSupportedImageMimeType,
  readImageDimensions,
  stripJpegExif,
} from "@/lib/images";

/**
 * `POST /api/catalog/reference-photos` — P6 sets or replaces a catalog
 * entry's reference label photo (Rule 2.36; D-75 #1, #2; `UX_SPEC.md` §3.19).
 *
 * **A route handler and not a Server Action for the reason TECH §7.1 permits
 * one: the request is multipart bytes**, exactly as `POST /api/intake/photos`.
 * It is not a page: the twenty pages are unchanged.
 *
 * - **P6 only.** The write guard on `/settings/catalog`, which only P6 holds;
 *   `catalogReferencePhotos.set` refuses anyone else again.
 * - **A platform photo, never a tenant's** (D-75 #1). The bytes are the
 *   maker's image, a spec sheet or one the platform took, uploaded here —
 *   nothing reads them out of an organization's records — and they are stored
 *   under the platform prefix, never under `org/{id}/`.
 * - **EXIF is stripped before the bytes are hashed or stored**, as for an
 *   intake photo (Rule 7.21), and the size is read from the bytes.
 * - **Replacing keeps the old one on the entry's history**, and the act is
 *   audited `catalog_entry.reference_photo_set` with before and after.
 *
 * Errors are RFC 9457 `application/problem+json`, as the intake route's are.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE_PATH = "/api/catalog/reference-photos";

const STATUS_BY_CODE: Readonly<Partial<Record<AppErrorCode, number>>> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TENANT_SCOPE: 403,
};

const FILE_MISSING = "Choose an image to use as the reference label photo.";
const FILE_UNSUPPORTED =
  "The reference photo must be a JPEG, PNG or WebP image.";
const FILE_UNREADABLE = "That image could not be read. Choose another file.";
const ENTRY_MISSING =
  "Choose the catalog entry this photo is the reference for.";

/** What a successful upload returns — the transport reads exactly these. */
export interface ReferencePhotoUploadResponse {
  readonly catalogReferencePhotoId: string;
  readonly width: number;
  readonly height: number;
}

function problem(
  code: AppErrorCode,
  detail: string,
  correlationId: string | null,
): Response {
  const status = STATUS_BY_CODE[code] ?? 500;
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title:
        status === 400
          ? "The photo was not accepted"
          : status < 500
            ? "Not available"
            : "The photo could not be stored",
      status,
      code,
      detail,
      instance: ROUTE_PATH,
      correlationId,
    }),
    {
      status,
      headers: {
        "content-type": "application/problem+json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function attributionFrom(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstAddress = forwarded?.split(",")[0]?.trim();
  return {
    requestId: request.headers.get("x-request-id"),
    ipAddress:
      firstAddress === undefined || firstAddress === "" ? null : firstAddress,
    userAgent: request.headers.get("user-agent"),
  };
}

async function failure(error: unknown, ctx: RequestContext): Promise<Response> {
  console.error(
    `[reference-photos] the reference photo was not stored (correlationId=${ctx.correlationId})`,
    error,
  );
  if (!isAppError(error)) {
    return problem(
      "DATA_INTEGRITY",
      "Something went wrong on our side and the photo was not stored. Nothing was changed — try again.",
      ctx.correlationId,
    );
  }
  return problem(error.code, error.userMessage, ctx.correlationId);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await requireWrite("/settings/catalog", "setReferencePhoto");
  if (!guard.ok) {
    return problem(
      guard.error.code,
      guard.error.message,
      guard.error.correlationId,
    );
  }
  const { ctx } = guard;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem("VALIDATION", FILE_MISSING, ctx.correlationId);
  }
  const catalogEntryId = form.get("catalogEntryId");
  if (typeof catalogEntryId !== "string" || catalogEntryId.trim() === "") {
    return problem("VALIDATION", ENTRY_MISSING, ctx.correlationId);
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return problem("VALIDATION", FILE_MISSING, ctx.correlationId);
  }
  if (!isSupportedImageMimeType(file.type)) {
    return problem("VALIDATION", FILE_UNSUPPORTED, ctx.correlationId);
  }

  try {
    // Rule 7.21 — before the hash, before the store.
    const bytes = stripJpegExif(new Uint8Array(await file.arrayBuffer()));
    const dimensions = readImageDimensions(bytes, file.type);
    if (dimensions === null) {
      return problem("VALIDATION", FILE_UNREADABLE, ctx.correlationId);
    }
    const stored = await data.catalogReferencePhotos.set(ctx, {
      catalogEntryId: catalogEntryId.trim(),
      bytes,
      mimeType: file.type,
      widthPx: dimensions.width,
      heightPx: dimensions.height,
      fileName: file instanceof File && file.name !== "" ? file.name : null,
      at: new Date().toISOString(),
      attribution: attributionFrom(request),
    });
    const body: ReferencePhotoUploadResponse = {
      catalogReferencePhotoId: stored.id,
      width: stored.widthPx,
      height: stored.heightPx,
    };
    return new Response(JSON.stringify(body), {
      status: 201,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return failure(error, ctx);
  }
}
