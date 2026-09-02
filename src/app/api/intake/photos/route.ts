import { data } from "@/data";
import type { CreateIntakePhoto, RequestContext } from "@/data/contracts";
import type { DataUseEligibility } from "@/domain/taxonomy/data-use-eligibility";
import {
  intakeBlockSentence,
  readIntakeGate,
} from "@/features/consent/read-intake-gate";
import {
  INTAKE_CLOSED,
  INTAKE_NOT_FOUND,
  PHOTO_ALREADY_ON_INTAKE,
  PHOTO_FILE_MISSING,
  PHOTO_INTAKE_CLOSED,
  PHOTO_TYPE_UNSUPPORTED,
  PHOTO_UNREADABLE,
} from "@/features/intake/copy";
import { firstIssue, intakePhotoUploadSchema } from "@/features/intake/schemas";
import { userEvent } from "@/features/intake/server/audit";
import {
  fileExtensionFor,
  INTAKE_PHOTO_BUCKET,
  intakeObjectPath,
} from "@/features/intake/server/intake-pipeline";
import { requireWrite } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { ConflictError, isAppError, type AppErrorCode } from "@/lib/errors";
import {
  extractJpegCaptureTime,
  isSupportedImageMimeType,
  readImageDimensions,
  sha256Hex,
  stripJpegExif,
} from "@/lib/images";
import type { Uuid } from "@/types/common";

/**
 * `POST /api/intake/photos` — one captured image onto an open intake
 * (`TECHNICAL_SPEC.md` §7.2, §11.1 step 1; Rules 7.6, 7.7, 7.21; T-12, T-50).
 *
 * **A route handler and not a Server Action for the one reason §7.1 permits
 * one: the request is multipart bytes**, sent by `fetch` from the capture step
 * and from the offline queue when the network returns.
 *
 * The obligations, in the order they are enforced:
 *
 * - **The write guard and the Terms of Service gate**, exactly as every intake
 *   Server Action (Rules 7.1, 7.2). A blocked organization sends no photo.
 * - **EXIF is stripped before the bytes are hashed or stored** (Rule 7.21).
 *   GPS and device identifiers never reach the bucket, and `content_hash` is
 *   the hash of what is kept.
 * - **Dimensions are read from the bytes**, never trusted from the client; an
 *   image whose header cannot be read is refused rather than stored with a
 *   made-up size.
 * - **Data-use eligibility is stamped once, now, from the gate** (T-12): an
 *   acceptance in force or in grace stamps `training_eligible`, anything else
 *   `training_excluded`, and no role recomputes it later (Rules 7.6, 7.7).
 * - **The photo is a row and an audited act** (`intake_photo.captured`).
 *
 * Errors are RFC 9457 `application/problem+json`, carrying the `AppError`
 * code the client branches on and the correlation id a person reads back
 * over the phone. Never a stack trace, never a provider name.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE_PATH = "/api/intake/photos";

interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: AppErrorCode;
  readonly detail: string;
  readonly instance: string;
  readonly correlationId: string | null;
}

const STATUS_BY_CODE: Readonly<Record<AppErrorCode, number>> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TENANT_SCOPE: 403,
  RULE_UNRESOLVED: 422,
  INTEGRATION: 502,
  DOCUMENT_RENDER: 500,
  DOCUMENT_INTEGRITY: 500,
  DATA_INTEGRITY: 500,
  NOT_IMPLEMENTED: 501,
};

const TITLE_BY_CODE: Readonly<Record<AppErrorCode, string>> = {
  VALIDATION: "The photo was not accepted",
  UNAUTHENTICATED: "Not signed in",
  FORBIDDEN: "Not available",
  NOT_FOUND: "Not found",
  CONFLICT: "Already on this intake",
  TENANT_SCOPE: "Not available",
  RULE_UNRESOLVED: "A rule is missing",
  INTEGRATION: "A service did not respond",
  DOCUMENT_RENDER: "The photo could not be stored",
  DOCUMENT_INTEGRITY: "The photo could not be stored",
  DATA_INTEGRITY: "The photo could not be stored",
  NOT_IMPLEMENTED: "Not available",
};

function problem(
  code: AppErrorCode,
  detail: string,
  correlationId: string | null,
  status: number = STATUS_BY_CODE[code],
): Response {
  const body: ProblemBody = {
    type: "about:blank",
    title: TITLE_BY_CODE[code],
    status,
    code,
    detail,
    instance: ROUTE_PATH,
    correlationId,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/problem+json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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

function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** What a successful upload returns — the stored facts the capture step renders beside its local preview. */
export interface IntakePhotoUploadResponse {
  readonly intakePhotoId: Uuid;
  readonly storagePath: string;
  readonly width: number;
  readonly height: number;
  readonly contentHash: string;
  /** Echoed so the client can hand it to the label read; the row has no column for it. */
  readonly fileName: string | null;
}

export async function POST(request: Request): Promise<Response> {
  const guard = await requireWrite("/batteries/new", "uploadIntakePhoto");
  if (!guard.ok) {
    return problem(
      guard.error.code,
      guard.error.message,
      guard.error.correlationId,
    );
  }
  const { ctx } = guard;

  // One read of the consent rows serves both the block and the stamp: the
  // same evaluation `requireIntakeGate` performs, with the status kept.
  const gate = await readIntakeGate(ctx);
  if (gate.status === "blocked") {
    return problem("FORBIDDEN", intakeBlockSentence(gate), ctx.correlationId);
  }
  const eligibility: DataUseEligibility =
    gate.status === "open" || gate.status === "grace"
      ? "training_eligible"
      : "training_excluded";

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem("VALIDATION", PHOTO_FILE_MISSING, ctx.correlationId);
  }

  const parsed = intakePhotoUploadSchema.safeParse({
    intakeSessionId: formText(form, "intakeSessionId"),
    photoType: formText(form, "photoType"),
    capturedAt: formText(form, "capturedAt"),
  });
  if (!parsed.success) {
    return problem(
      "VALIDATION",
      firstIssue(parsed.error).message,
      ctx.correlationId,
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return problem("VALIDATION", PHOTO_FILE_MISSING, ctx.correlationId);
  }
  const mimeType = file.type;
  if (!isSupportedImageMimeType(mimeType)) {
    return problem("VALIDATION", PHOTO_TYPE_UNSUPPORTED, ctx.correlationId);
  }
  const fileName = file instanceof File && file.name !== "" ? file.name : null;

  try {
    return await storePhoto(ctx, request, {
      sessionId: parsed.data.intakeSessionId,
      photoType: parsed.data.photoType,
      capturedAt: parsed.data.capturedAt ?? null,
      mimeType,
      fileName,
      bytes: new Uint8Array(await file.arrayBuffer()),
      eligibility,
    });
  } catch (error) {
    return await problemFor(error, ctx);
  }
}

interface StoreRequest {
  readonly sessionId: Uuid;
  readonly photoType: CreateIntakePhoto["photoType"];
  readonly capturedAt: string | null;
  readonly mimeType: string;
  readonly fileName: string | null;
  readonly bytes: Uint8Array;
  readonly eligibility: DataUseEligibility;
}

async function storePhoto(
  ctx: RequestContext,
  request: Request,
  input: StoreRequest,
): Promise<Response> {
  const session = await data.intakeSessions.get(ctx, input.sessionId);
  if (session === null) {
    await recordNotFound(ctx, "intake_session", input.sessionId);
    return problem("NOT_FOUND", INTAKE_NOT_FOUND, ctx.correlationId);
  }
  if (session.status === "completed" || session.status === "abandoned") {
    return problem(
      "CONFLICT",
      `${PHOTO_INTAKE_CLOSED} ${INTAKE_CLOSED}`,
      ctx.correlationId,
    );
  }

  // Rule 7.21 — before the hash, before the store. The capture instant is
  // read first because it lives in the segment being removed; the reader
  // returns nothing in B1a and the upload instant stands in for it.
  const capturedFromExif = extractJpegCaptureTime(input.bytes);
  const bytes = stripJpegExif(input.bytes);
  const contentHash = await sha256Hex(bytes);
  const dimensions = readImageDimensions(bytes, input.mimeType);
  if (dimensions === null) {
    return problem("VALIDATION", PHOTO_UNREADABLE, ctx.correlationId);
  }

  const extension = fileExtensionFor(input.mimeType);
  const stored = await data.objects.put(ctx, {
    bucket: INTAKE_PHOTO_BUCKET,
    path: intakeObjectPath(
      ctx.organizationId,
      session.id,
      `${contentHash}.${extension}`,
    ),
    bytes,
    contentType: input.mimeType,
    immutable: true,
  });

  const at = new Date().toISOString();
  const photoInput: CreateIntakePhoto = {
    intakeSessionId: session.id,
    parentIntakePhotoId: null,
    photoType: input.photoType,
    storageObjectPath: stored.path,
    contentHash,
    byteSize: bytes.byteLength,
    mimeType: input.mimeType,
    widthPx: dimensions.width,
    heightPx: dimensions.height,
    cropGeometry: null,
    cropMethod: null,
    capturedAt: input.capturedAt ?? capturedFromExif ?? at,
    dataUseEligibility: input.eligibility,
    isExifStripped: true,
    takenBy: ctx.userId,
  };
  const photo = await data.intakePhotos.append(ctx, photoInput);

  await data.auditEvents.write(
    ctx,
    userEvent(ctx, {
      eventType: "intake_photo.captured",
      entityTable: "intake_photo",
      entityId: photo.id,
      at,
      afterState: {
        intakeSessionId: session.id,
        photoType: photo.photoType,
        contentHash: photo.contentHash,
        byteSize: photo.byteSize,
        widthPx: photo.widthPx,
        heightPx: photo.heightPx,
        dataUseEligibility: photo.dataUseEligibility,
        isExifStripped: photo.isExifStripped,
      },
      attribution: attributionFrom(request),
    }),
  );

  const body: IntakePhotoUploadResponse = {
    intakePhotoId: photo.id,
    storagePath: photo.storageObjectPath,
    width: photo.widthPx,
    height: photo.heightPx,
    contentHash: photo.contentHash,
    fileName: input.fileName,
  };
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * One failure, translated once. **Nothing is swallowed** (§10.1): every arm
 * logs with the correlation id, and a duplicate object is the one case that
 * gets its own sentence, because "already exists" is what the person did.
 */
async function problemFor(
  error: unknown,
  ctx: RequestContext,
): Promise<Response> {
  console.error(
    `[intake-photos] the photo was not stored (correlationId=${ctx.correlationId})`,
    error,
  );
  if (error instanceof ConflictError) {
    return problem("CONFLICT", PHOTO_ALREADY_ON_INTAKE, ctx.correlationId);
  }
  if (!isAppError(error)) {
    return problem(
      "DATA_INTEGRITY",
      "Something went wrong on our side and the photo was not stored. Nothing was changed — try again.",
      ctx.correlationId,
    );
  }
  return problem(error.code, error.userMessage, ctx.correlationId);
}
