import type { IntakePhotoType } from "@/domain/taxonomy/intake-photo-type";

/**
 * How a photo reaches `POST /api/intake/photos` — `TECHNICAL_SPEC.md` §7.2.
 *
 * Shared because two places send a photo to the same route: the capture step
 * on `/batteries/new` and the damage-photo prompt inside `ConditionForm`,
 * which `/review` renders as well as step 3. A shared component does not
 * reach into a feature folder, so the transport lives here and the capture
 * step re-exports it.
 */

export interface UploadPhotoRequest {
  readonly file: File;
  readonly intakeSessionId: string;
  readonly photoType: IntakePhotoType;
  readonly uploadUrl: string;
}

/** The `201` body `POST /api/intake/photos` returns (`TECHNICAL_SPEC.md` §7.2). */
export interface UploadedPhoto {
  readonly intakePhotoId: string;
  readonly storagePath: string;
  readonly width: number;
  readonly height: number;
  readonly contentHash: string;
  /**
   * The original file name, as the route echoed it back. **Carried, not
   * dropped**: the label read is keyed on it — `runLabelExtraction` takes it
   * as `labelFileName`, and the fixture vision provider picks its scenario
   * from the stem — so a step that lost it here would read every label the
   * same way. `null` when the browser gave the file no name.
   */
  readonly fileName: string | null;
}

export type UploadPhotoResult =
  | { readonly ok: true; readonly photo: UploadedPhoto }
  | {
      readonly ok: false;
      /** What the reader is told. From `problem.detail`, else `problem.title`, else the transport's own sentence. */
      readonly message: string;
      /** `true` for a network failure or a 5xx; `false` for a 4xx, which will not fix itself. */
      readonly retryable: boolean;
      readonly code?: string;
      readonly correlationId?: string;
    };

/**
 * How bytes reach the route. Injectable so a test can drive progress and
 * failure without a network; the default is `XMLHttpRequest`, the one
 * browser API that reports **upload** progress — `fetch` reports none, and
 * §2.2's ring is determinate.
 */
export type UploadTransport = (
  request: UploadPhotoRequest,
  onProgress: (percent: number) => void,
) => Promise<UploadPhotoResult>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** Parse the route's `201` body. Anything else is reported, never guessed at. */
export function parseUploadedPhoto(body: unknown): UploadedPhoto | null {
  if (!isRecord(body)) return null;
  const intakePhotoId = readString(body.intakePhotoId);
  const storagePath = readString(body.storagePath);
  const width = readNumber(body.width);
  const height = readNumber(body.height);
  const contentHash = readString(body.contentHash);
  // Optional on the wire: a body without it is still a stored photo, and a
  // missing name simply means the read falls back to the provider's default.
  const fileName = readString(body.fileName) ?? null;
  if (
    intakePhotoId === undefined ||
    storagePath === undefined ||
    width === undefined ||
    height === undefined ||
    contentHash === undefined
  ) {
    return null;
  }
  return { intakePhotoId, storagePath, width, height, contentHash, fileName };
}

/** Parse an RFC 9457 `problem+json` body into the reader's message and the trace id. */
export function parseProblem(body: unknown): {
  readonly message: string | undefined;
  readonly code: string | undefined;
  readonly correlationId: string | undefined;
} {
  if (!isRecord(body)) {
    return { message: undefined, code: undefined, correlationId: undefined };
  }
  return {
    message: readString(body.detail) ?? readString(body.title),
    code: readString(body.code),
    correlationId: readString(body.correlationId),
  };
}

const HTTP_CREATED = 201;
const HTTP_SERVER_ERROR_FLOOR = 500;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * One multipart POST with upload progress — the core every transport here
 * shares, so the intake photo and the catalog reference photo travel the
 * same way and report failures in the same words. `parse` reads the 201
 * body; anything it cannot read is reported, never guessed at.
 */
function postMultipart<T>(
  uploadUrl: string,
  body: FormData,
  onProgress: (percent: number) => void,
  parse: (body: unknown) => T | null,
): Promise<
  | { readonly ok: true; readonly value: T }
  | Extract<UploadPhotoResult, { readonly ok: false }>
> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.responseType = "text";

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total === 0) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    });

    xhr.addEventListener("error", () => {
      resolve({
        ok: false,
        message: "The photo could not be sent. Check the connection and retry.",
        retryable: true,
      });
    });
    xhr.addEventListener("abort", () => {
      resolve({
        ok: false,
        message: "Sending was cancelled.",
        retryable: true,
      });
    });
    xhr.addEventListener("load", () => {
      const parsed = parseJson(xhr.responseText);
      if (xhr.status === HTTP_CREATED) {
        const value = parse(parsed);
        if (value !== null) {
          onProgress(100);
          resolve({ ok: true, value });
          return;
        }
        resolve({
          ok: false,
          message:
            "The server accepted the photo but its reply could not be read. Retry to confirm it was stored.",
          retryable: false,
        });
        return;
      }
      const problem = parseProblem(parsed);
      resolve({
        ok: false,
        message:
          problem.message ??
          "The photo was not stored. Nothing has changed; retry or remove it.",
        retryable: xhr.status >= HTTP_SERVER_ERROR_FLOOR || xhr.status === 0,
        ...(problem.code === undefined ? {} : { code: problem.code }),
        ...(problem.correlationId === undefined
          ? {}
          : { correlationId: problem.correlationId }),
      });
    });

    xhr.send(body);
  });
}

/** The default transport. */
export const xhrUploadTransport: UploadTransport = async (
  request,
  onProgress,
) => {
  const body = new FormData();
  body.set("file", request.file, request.file.name);
  body.set("intakeSessionId", request.intakeSessionId);
  body.set("photoType", request.photoType);
  const result = await postMultipart(
    request.uploadUrl,
    body,
    onProgress,
    parseUploadedPhoto,
  );
  return result.ok ? { ok: true, photo: result.value } : result;
};

/**
 * A catalog entry's reference label photo — Rule 2.36; `UX_SPEC.md`
 * §3.19. P6 sends the image to `POST /api/catalog/reference-photos`; the
 * route strips EXIF, reads the size from the bytes and stores it under the
 * platform prefix. Same core as the intake transport.
 */
export interface UploadReferencePhotoRequest {
  readonly file: File;
  readonly catalogEntryId: string;
  readonly uploadUrl: string;
}

export interface UploadedReferencePhoto {
  readonly catalogReferencePhotoId: string;
  readonly width: number;
  readonly height: number;
}

export type ReferencePhotoTransport = (
  request: UploadReferencePhotoRequest,
  onProgress: (percent: number) => void,
) => Promise<
  | { readonly ok: true; readonly photo: UploadedReferencePhoto }
  | Extract<UploadPhotoResult, { readonly ok: false }>
>;

export function parseUploadedReferencePhoto(
  body: unknown,
): UploadedReferencePhoto | null {
  if (!isRecord(body)) return null;
  const catalogReferencePhotoId = readString(body.catalogReferencePhotoId);
  const width = readNumber(body.width);
  const height = readNumber(body.height);
  if (
    catalogReferencePhotoId === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return null;
  }
  return { catalogReferencePhotoId, width, height };
}

export const xhrReferencePhotoTransport: ReferencePhotoTransport = async (
  request,
  onProgress,
) => {
  const body = new FormData();
  body.set("file", request.file, request.file.name);
  body.set("catalogEntryId", request.catalogEntryId);
  const result = await postMultipart(
    request.uploadUrl,
    body,
    onProgress,
    parseUploadedReferencePhoto,
  );
  return result.ok ? { ok: true, photo: result.value } : result;
};
