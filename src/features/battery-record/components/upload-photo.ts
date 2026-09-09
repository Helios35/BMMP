import type { IntakePhotoType } from "@/domain/taxonomy/intake-photo-type";
import type { Uuid } from "@/types/common";

/**
 * The browser side of `POST /api/intake/photos` — `TECHNICAL_SPEC.md` §7.2.
 *
 * A photo is bytes, and bytes do not go through a Server Action; the route
 * handler takes the multipart body, strips EXIF, hashes, stores and appends
 * the `intake_photo` row, then answers `201 { intakePhotoId, … }` or an RFC
 * 9457 problem. This helper is the one place a record dialog talks to that
 * route, so the field names and the error shape are read in one file.
 *
 * **The photo attaches to the record's intake session**, because
 * `intake_photo.intake_session_id` is the only column that links a photo to
 * anything. A record with no session has nowhere to put a photo — an ERD
 * finding this unit reports rather than works around.
 */

export type UploadPhotoResult =
  | { readonly ok: true; readonly intakePhotoId: Uuid }
  | { readonly ok: false; readonly message: string };

const UPLOAD_PATH = "/api/intake/photos";

const GENERIC_FAILURE =
  "The photo was not sent. Nothing was changed — try again.";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/** What a problem or a success body says, without trusting its shape. */
async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function uploadRecordPhoto(input: {
  readonly file: File;
  readonly intakeSessionId: Uuid;
  readonly photoType: IntakePhotoType;
}): Promise<UploadPhotoResult> {
  const body = new FormData();
  body.set("file", input.file, input.file.name);
  body.set("intakeSessionId", input.intakeSessionId);
  body.set("photoType", input.photoType);

  let response: Response;
  try {
    response = await fetch(UPLOAD_PATH, { method: "POST", body });
  } catch {
    return { ok: false, message: GENERIC_FAILURE };
  }

  const payload = await readBody(response);

  if (!response.ok) {
    const detail =
      isRecord(payload) && typeof payload.detail === "string"
        ? payload.detail
        : isRecord(payload) && typeof payload.title === "string"
          ? payload.title
          : GENERIC_FAILURE;
    return { ok: false, message: detail };
  }

  if (isRecord(payload) && typeof payload.intakePhotoId === "string") {
    return { ok: true, intakePhotoId: payload.intakePhotoId };
  }
  return { ok: false, message: GENERIC_FAILURE };
}
