"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  Camera,
  CircleAlert,
  CircleCheck,
  ImageOff,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { PhotoCaptureInput } from "@/components/capture/photo-capture-input";
import {
  MobileActionBar,
  type MobileActionBarAction,
} from "@/components/flow/mobile-action-bar";
import { captureQueue } from "@/components/offline/capture-queue";
import { useOnlineStatus } from "@/components/offline/use-online-status";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import {
  INTENT_SURFACE_CLASSES,
  INTENT_TEXT_CLASSES,
} from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OutstandingItem } from "@/domain/intake/commit-gate";
import {
  INTAKE_PHOTO_TYPE_LABELS,
  type IntakePhotoType,
} from "@/domain/taxonomy/intake-photo-type";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

/**
 * `PhotoCaptureStep` — step 1 of `/batteries/new` (`UX_SPEC.md` §2.2, §3.9,
 * E-3, E-10; `TECHNICAL_SPEC.md` §7.2).
 *
 * Mobile-first: this is the component P1 and P4 hold in one hand. The camera
 * is the phone's own, reached through `PhotoCaptureInput`'s file input — see
 * that component for why there is no `getUserMedia`.
 *
 * ## What happens to a photo
 *
 * 1. **Captured.** It exists on the device, with a local preview. The session
 *    is started on the first capture (`startSession`) so a photo always has a
 *    session to belong to.
 * 2. **Checked.** The preview is decoded once to read its size. If the long
 *    edge is short the `attention` alert asks *Re-take?* before anything is
 *    sent (§2.2 guidance). **Size is the only legibility heuristic here**:
 *    glare, blur and darkness need a decoder the browser does not give a page
 *    without drawing the image to a canvas and reading pixels, and a guess at
 *    "too dark" that fires wrongly would train people to tap *Use anyway*
 *    without reading. Nothing is rejected silently either way.
 * 3. **Sent.** `POST` to `uploadUrl` as multipart with `file`,
 *    `intakeSessionId` and `photoType`; a `201` carries the stored facts, an
 *    error is RFC 9457 `problem+json`. The ring on the thumbnail is
 *    determinate from the transport's upload progress.
 * 4. **Retried.** A retryable failure (no network, a 5xx) is retried twice,
 *    at 500ms and 1500ms, and each attempt is a visible state on the
 *    thumbnail (E-3(2)). A 4xx is not retried — a refused encoding or a
 *    duplicate will not fix itself — and goes straight to **failed**.
 * 5. **Failed.** Critical border, **Retry** overlay, the toast, and a listing
 *    in the failure alert with **Retry** and **Remove** (E-3(1), E-3(6)).
 *    Nothing is discarded on the reader's behalf.
 * 6. **Queued.** Offline, the photo goes to the capture queue as **Queued**
 *    and is sent when the browser reports a network again (§2.10, E-10).
 *
 * **The flow does not advance without at least one label photo sent**
 * (E-3(5)) — the primary is `aria-disabled` with that reason until then, and
 * offline, with *reconnect* as the reason: the read is not run offline
 * (§2.10 Offline — extraction).
 *
 * Every write here goes through the route handler the design names; the
 * component holds no `data` and no session beyond the id it was given or
 * started.
 */

/* --------------------------------------------------------------- transport */

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

/** The default transport. */
export const xhrUploadTransport: UploadTransport = (request, onProgress) =>
  new Promise((resolve) => {
    const body = new FormData();
    body.set("file", request.file, request.file.name);
    body.set("intakeSessionId", request.intakeSessionId);
    body.set("photoType", request.photoType);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", request.uploadUrl);
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
        const photo = parseUploadedPhoto(parsed);
        if (photo !== null) {
          onProgress(100);
          resolve({ ok: true, photo });
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

/* ---------------------------------------------------------- image sizing */

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The preview's natural size, or `null` when the browser could not decode it.
 * `null` is not a rejection: a photo the browser cannot decode is still sent,
 * and the route answers with a 400 that says so.
 */
export const readImageSizeFromUrl = (url: string): Promise<ImageSize | null> =>
  new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    });
    image.addEventListener("error", () => resolve(null));
    image.src = url;
  });

/**
 * Below this long edge a label photo is unlikely to be legible to the reader
 * (§2.2 guidance). A pixel count is a fact about the file, not a rule of any
 * jurisdiction — it lives here as the UI heuristic it is.
 */
export const LEGIBILITY_MIN_LONG_EDGE_PX = 640;

export function isLikelyTooSmall(size: ImageSize | null): boolean {
  if (size === null) return false;
  return Math.max(size.width, size.height) < LEGIBILITY_MIN_LONG_EDGE_PX;
}

/* ------------------------------------------------------------------ props */

export interface ExistingIntakePhoto {
  readonly id: string;
  /** T-50 as stored. Rendered through the labels, unrecognised as stored. */
  readonly photoType: string;
  readonly width: number;
  readonly height: number;
  readonly state: "sent";
}

export interface PhotoCaptureStepProps {
  /** `null` until the first capture starts one. */
  readonly sessionId: string | null;
  /** `?container=` — the drum the reader is standing next to. */
  readonly containerContext: {
    readonly id: string;
    readonly code: string;
  } | null;
  readonly startSession: () => Promise<
    ActionResult<{ sessionId: string; batteryRecordId: string }>
  >;
  /** `/api/intake/photos`. */
  readonly uploadUrl: string;
  /**
   * Fired once per label photo that reached the server, with its
   * `intake_photo.id` and the file's original name. The name is what
   * `runLabelExtraction` is handed as `labelFileName` — the route keeps hold
   * of both because the read cannot be keyed on an id alone.
   */
  readonly onLabelPhotoReady: (
    photoId: string,
    fileName: string | null,
  ) => void;
  /** Photos already stored on a resumed session. */
  readonly existingPhotos: readonly ExistingIntakePhoto[];
  readonly primary: {
    readonly label: string;
    readonly onContinue: () => Promise<void>;
  };
  /** *Enter details manually* — the route supplies it; offline it is the only way on (D-20). */
  readonly secondary?: MobileActionBarAction;
  /** Tests inject these; the defaults are the browser's. */
  readonly transport?: UploadTransport;
  readonly readImageSize?: (url: string) => Promise<ImageSize | null>;
  readonly className?: string;
}

/* ------------------------------------------------------------------ state */

export type CaptureItemState =
  "held" | "queued" | "uploading" | "sent" | "failed";

interface CaptureItem {
  readonly id: string;
  readonly file: File;
  readonly previewUrl: string;
  readonly photoType: IntakePhotoType;
  readonly state: CaptureItemState;
  /** 1-based; the third attempt is the last automatic one. */
  readonly attempt: number;
  readonly progress: number;
  readonly error: string | null;
  readonly photo: UploadedPhoto | null;
  readonly size: ImageSize | null;
  readonly isSmall: boolean;
}

/** E-3(2): two automatic retries with backoff, each visible. */
const RETRY_DELAYS_MS: readonly number[] = [500, 1500];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

const CAPTURE_TYPES: readonly IntakePhotoType[] = [
  "label",
  "whole_pack",
  "damage",
];

const PHOTO_NOT_SENT_TOAST = "Photo not sent — it's kept on this device.";

const STATE_LABELS: Readonly<Record<CaptureItemState, string>> = {
  held: "Checking",
  queued: "Queued",
  uploading: "Sending",
  sent: "Sent",
  failed: "Not sent",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function labelForType(photoType: string): string {
  return (
    (INTAKE_PHOTO_TYPE_LABELS as Readonly<Record<string, string>>)[photoType] ??
    photoType
  );
}

let captureSequence = 0;
function nextCaptureId(): string {
  captureSequence += 1;
  return `capture-${captureSequence}`;
}

export function PhotoCaptureStep({
  sessionId,
  containerContext,
  startSession,
  uploadUrl,
  onLabelPhotoReady,
  existingPhotos,
  primary,
  secondary,
  transport = xhrUploadTransport,
  readImageSize = readImageSizeFromUrl,
  className,
}: PhotoCaptureStepProps): ReactElement {
  const isOnline = useOnlineStatus();
  const [captureType, setCaptureType] = useState<IntakePhotoType>("label");
  const [items, setItems] = useState<readonly CaptureItem[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // The async flows read the latest items through this mirror rather than
  // through a closure that may be a render behind. Synced after commit; the
  // capture path also writes it directly, because it sends in the same tick.
  const itemsRef = useRef<readonly CaptureItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // The session this step is uploading into: the one it was given, else the
  // one it started on the first capture.
  const [startedSessionId, setStartedSessionId] = useState<string | null>(null);
  const activeSessionId = sessionId ?? startedSessionId;
  const sessionRef = useRef<string | null>(sessionId);
  const startingRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    if (sessionId !== null) sessionRef.current = sessionId;
  }, [sessionId]);

  const updateItem = useCallback(
    (id: string, patch: Partial<CaptureItem>): void => {
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionRef.current !== null) return sessionRef.current;
    if (startingRef.current === null) {
      startingRef.current = (async () => {
        const result = await startSession();
        if (!result.ok) {
          startingRef.current = null;
          throw new Error(result.error.message);
        }
        sessionRef.current = result.data.sessionId;
        setStartedSessionId(result.data.sessionId);
        return result.data.sessionId;
      })();
    }
    return startingRef.current;
  }, [startSession]);

  const send = useCallback(
    async (id: string): Promise<void> => {
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (item === undefined) return;
      const queueLabel = `${labelForType(item.photoType)} photo`;

      if (!navigator.onLine) {
        captureQueue.enqueue({ id, label: queueLabel });
        updateItem(id, {
          state: "queued",
          attempt: 1,
          progress: 0,
          error: null,
        });
        return;
      }

      captureQueue.enqueue({ id, label: queueLabel });
      captureQueue.markSending(id);
      updateItem(id, {
        state: "uploading",
        attempt: 1,
        progress: 0,
        error: null,
      });

      let intakeSessionId: string;
      try {
        intakeSessionId = await ensureSession();
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "The intake could not be started.";
        setSessionError(message);
        captureQueue.markFailed(id, message);
        updateItem(id, { state: "failed", error: message });
        toast.error(PHOTO_NOT_SENT_TOAST, {
          description: message,
          className: INTENT_SURFACE_CLASSES.critical,
        });
        return;
      }

      // One attempt, then the two automatic retries (E-3(2)) — each a visible
      // state: the thumbnail reads "Sending · attempt 2 of 3" while the
      // backoff runs, never a silent pause.
      let message = "The photo could not be sent.";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 1) {
          updateItem(id, { state: "uploading", attempt, progress: 0 });
          await delay(RETRY_DELAYS_MS[attempt - 2] ?? 0);
        }

        const result = await transport(
          {
            file: item.file,
            intakeSessionId,
            photoType: item.photoType,
            uploadUrl,
          },
          (percent) => updateItem(id, { progress: percent }),
        );

        if (result.ok) {
          captureQueue.markSent(id);
          updateItem(id, { state: "sent", progress: 100, photo: result.photo });
          if (item.photoType === "label") {
            // The route echoes the name; the file on the device is the
            // fallback for a reply that did not, and an unnamed file is null.
            onLabelPhotoReady(
              result.photo.intakePhotoId,
              result.photo.fileName ??
                (item.file.name === "" ? null : item.file.name),
            );
          }
          return;
        }

        message = result.message;
        updateItem(id, { error: message });
        if (!result.retryable) break;
      }

      captureQueue.markFailed(id, message);
      updateItem(id, { state: "failed", error: message });
      toast.error(PHOTO_NOT_SENT_TOAST, {
        description: message,
        className: INTENT_SURFACE_CLASSES.critical,
      });
    },
    [ensureSession, onLabelPhotoReady, transport, updateItem, uploadUrl],
  );

  const retry = useCallback(
    (id: string): void => {
      void send(id);
    },
    [send],
  );

  // The banner's per-item Retry reaches this step through the store.
  useEffect(() => captureQueue.registerRetry(retry), [retry]);

  // Reconnect: everything queued goes now (§2.10 Reconnecting).
  useEffect(() => {
    if (!isOnline) return;
    for (const item of itemsRef.current) {
      if (item.state === "queued") void send(item.id);
    }
  }, [isOnline, send]);

  function remove(id: string): void {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (item !== undefined) URL.revokeObjectURL(item.previewUrl);
    captureQueue.remove(id);
    setItems((current) => current.filter((candidate) => candidate.id !== id));
  }

  async function capture(file: File, previewUrl: string): Promise<void> {
    const id = nextCaptureId();
    const item: CaptureItem = {
      id,
      file,
      previewUrl,
      photoType: captureType,
      state: "held",
      attempt: 1,
      progress: 0,
      error: null,
      photo: null,
      size: null,
      isSmall: false,
    };
    setItems((current) => [...current, item]);
    itemsRef.current = [...itemsRef.current, item];

    const size = await readImageSize(previewUrl);
    const isSmall = isLikelyTooSmall(size);
    updateItem(id, { size, isSmall });
    itemsRef.current = itemsRef.current.map((candidate) =>
      candidate.id === id ? { ...candidate, size, isSmall } : candidate,
    );
    if (isSmall) return; // Held for the reader's decision.
    await send(id);
  }

  const labelSent =
    items.some((item) => item.photoType === "label" && item.state === "sent") ||
    existingPhotos.some((photo) => photo.photoType === "label");

  const outstanding: OutstandingItem[] = [];
  if (!labelSent) {
    outstanding.push({
      kind: "required_value",
      label: "Send at least one label photo",
    });
  }
  if (!isOnline) {
    outstanding.push({ kind: "offline", label: "Reconnect to read the label" });
  }

  const failed = items.filter((item) => item.state === "failed");
  const held = items.filter((item) => item.state === "held" && item.isSmall);
  const isEmpty = items.length === 0 && existingPhotos.length === 0;

  return (
    <div
      data-photo-capture-step="true"
      data-session-id={activeSessionId ?? undefined}
      data-label-sent={labelSent ? "true" : "false"}
      className={cn("flex flex-col gap-6", className)}
    >
      {containerContext !== null ? (
        <Badge
          variant="outline"
          data-container-context={containerContext.id}
          className={cn(
            "h-7 w-fit gap-2 rounded-md border px-2 text-label",
            INTENT_SURFACE_CLASSES.neutral,
          )}
        >
          <span>Into container</span>
          <span className="font-mono">{containerContext.code}</span>
        </Badge>
      ) : null}

      {/* Capture-type selector (§2.2). */}
      <div
        role="group"
        aria-label="What this photo shows"
        data-capture-type={captureType}
        className="flex flex-wrap gap-2"
      >
        {CAPTURE_TYPES.map((type) => {
          const isActive = type === captureType;
          return (
            <Button
              key={type}
              type="button"
              variant={isActive ? "default" : "outline"}
              size="lg"
              aria-pressed={isActive}
              data-photo-type-option={type}
              onClick={() => setCaptureType(type)}
              className={ACTION_BUTTON_CLASS}
            >
              {type === "label"
                ? `${INTAKE_PHOTO_TYPE_LABELS[type]} (required)`
                : INTAKE_PHOTO_TYPE_LABELS[type]}
            </Button>
          );
        })}
      </div>

      {/* The framing guide and the capture surface. */}
      <div
        data-capture-surface="true"
        className="flex flex-col items-center gap-4 rounded-lg border border-border p-6"
      >
        <div
          aria-hidden="true"
          className="flex aspect-[4/3] w-full max-w-md items-center justify-center rounded-md border-2 border-dashed border-border"
        >
          <span className="text-body text-muted-foreground">
            Fill the frame with the label
          </span>
        </div>

        {isEmpty ? (
          <p data-capture-empty="true" className="max-w-[72ch] text-body">
            Photograph the label. You can add the whole pack and any damage
            next.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-4">
          <PhotoCaptureInput
            photoType={captureType}
            capture
            variant="shutter"
            label={`Take a ${labelForType(captureType).toLowerCase()} photo`}
            onFile={(file, previewUrl) => void capture(file, previewUrl)}
          />
          <PhotoCaptureInput
            photoType={captureType}
            variant="button"
            label="Use photo library"
            onFile={(file, previewUrl) => void capture(file, previewUrl)}
          />
        </div>

        <PhotoCaptureInput
          photoType={captureType}
          variant="dropzone"
          label="Choose a file"
          onFile={(file, previewUrl) => void capture(file, previewUrl)}
          className="hidden w-full md:flex"
        />
      </div>

      {sessionError !== null ? (
        <Alert
          role="alert"
          data-session-error="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">
            The intake could not be started
          </AlertTitle>
          <AlertDescription className="text-body text-current">
            {sessionError} Your photos are kept on this device; retry to try
            again.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Legibility guidance — before the read, never a silent rejection (§2.2). */}
      {held.map((item) => (
        <Alert
          key={item.id}
          role="alert"
          data-legibility-alert={item.id}
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.attention)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">
            This may be hard to read — the image is small. Re-take?
          </AlertTitle>
          <AlertDescription className="flex flex-wrap gap-2 text-current">
            <Button
              type="button"
              variant="outline"
              size="lg"
              data-legibility-retake={item.id}
              onClick={() => remove(item.id)}
              className={ACTION_BUTTON_CLASS}
            >
              Re-take
            </Button>
            <Button
              type="button"
              variant="default"
              size="lg"
              data-legibility-use-anyway={item.id}
              onClick={() => void send(item.id)}
              className={ACTION_BUTTON_CLASS}
            >
              Use anyway
            </Button>
          </AlertDescription>
        </Alert>
      ))}

      {/* Thumbnail strip with per-item state (§2.2 Loading / Error). */}
      {items.length > 0 || existingPhotos.length > 0 ? (
        <ul
          data-thumbnail-strip="true"
          aria-label="Photos"
          className="flex flex-wrap gap-3"
        >
          {existingPhotos.map((photo) => (
            <li
              key={photo.id}
              data-thumbnail={photo.id}
              data-upload-state="sent"
              data-photo-type={photo.photoType}
              className="flex w-32 flex-col gap-1"
            >
              <div
                className={cn(
                  "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border",
                  INTENT_SURFACE_CLASSES.ok,
                )}
              >
                <ImageOff aria-hidden="true" className="size-6" />
                <span className="text-caption">
                  {`${photo.width}×${photo.height}`}
                </span>
              </div>
              <span className="text-caption">
                {`${labelForType(photo.photoType)} · ${STATE_LABELS.sent}`}
              </span>
            </li>
          ))}

          {items.map((item) => (
            <Thumbnail
              key={item.id}
              item={item}
              onRetry={() => retry(item.id)}
            />
          ))}
        </ul>
      ) : null}

      {/* E-3(6): every failed photo named, with Retry and Remove. */}
      {failed.length > 0 ? (
        <Alert
          role="alert"
          data-upload-failures="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">
            {`${failed.length} ${failed.length === 1 ? "photo" : "photos"} couldn't be sent`}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-3 text-current">
            <span className="text-body">
              Each one is kept on this device until you retry or remove it.
            </span>
            <ul className="flex flex-col gap-2">
              {failed.map((item) => (
                <li
                  key={item.id}
                  data-failed-photo={item.id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="text-body-strong">
                    {`${labelForType(item.photoType)} photo`}
                  </span>
                  {item.error !== null ? (
                    <span className="w-full text-caption">{item.error}</span>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    data-failed-retry={item.id}
                    onClick={() => retry(item.id)}
                    className={ACTION_BUTTON_CLASS}
                  >
                    Retry
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    data-failed-remove={item.id}
                    onClick={() => remove(item.id)}
                    className={ACTION_BUTTON_CLASS}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <MobileActionBar
        primary={{
          label: primary.label,
          onClick: primary.onContinue,
          pendingLabel: "Reading label…",
          disabled: outstanding.length > 0,
        }}
        secondary={secondary}
        outstanding={outstanding}
      />
    </div>
  );
}

/* -------------------------------------------------------------- thumbnail */

const RING_RADIUS = 16;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** The determinate ring §2.2 puts on an uploading thumbnail. */
function ProgressRing({
  percent,
  label,
}: {
  readonly percent: number;
  readonly label: string;
}): ReactElement {
  const offset = RING_CIRCUMFERENCE * (1 - percent / 100);
  return (
    <svg
      viewBox="0 0 40 40"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent} of 100`}
      data-progress-ring="true"
      className="size-12"
    >
      <circle
        cx="20"
        cy="20"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="4"
        className="stroke-border"
      />
      <circle
        cx="20"
        cy="20"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        transform="rotate(-90 20 20)"
        className={cn("stroke-current", INTENT_TEXT_CLASSES.pending)}
      />
    </svg>
  );
}

function Thumbnail({
  item,
  onRetry,
}: {
  readonly item: CaptureItem;
  readonly onRetry: () => void;
}): ReactElement {
  const typeLabel = labelForType(item.photoType);
  const stateText =
    item.state === "uploading" && item.attempt > 1
      ? `${STATE_LABELS.uploading} · attempt ${item.attempt} of ${MAX_ATTEMPTS}`
      : STATE_LABELS[item.state];

  return (
    <li
      data-thumbnail={item.id}
      data-upload-state={item.state}
      data-upload-attempt={item.attempt}
      data-photo-type={item.photoType}
      className="flex w-32 flex-col gap-1"
    >
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-md border",
          item.state === "failed"
            ? cn("border-2", INTENT_SURFACE_CLASSES.critical)
            : "border-border",
        )}
      >
        {/* A blob: URL from the device; next/image cannot optimise it and
            must not try. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.previewUrl}
          alt={`${typeLabel} photo, ${stateText}`}
          className="size-full object-cover"
        />

        {item.state === "uploading" || item.state === "queued" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <ProgressRing
              percent={item.state === "queued" ? 0 : item.progress}
              label={`Sending ${typeLabel.toLowerCase()} photo`}
            />
          </div>
        ) : null}

        {item.state === "sent" ? (
          <span
            aria-hidden="true"
            className={cn(
              "absolute right-1 bottom-1 inline-flex size-6 items-center justify-center rounded-full",
              INTENT_SURFACE_CLASSES.ok,
            )}
          >
            <CircleCheck className="size-4" />
          </span>
        ) : null}

        {item.state === "failed" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Button
              type="button"
              variant="outline"
              size="lg"
              data-thumbnail-retry={item.id}
              onClick={onRetry}
              className={ACTION_BUTTON_CLASS}
            >
              <RefreshCw aria-hidden="true" />
              <span>Retry</span>
            </Button>
          </div>
        ) : null}

        {item.state === "held" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Camera aria-hidden="true" className="size-6" />
          </div>
        ) : null}
      </div>
      <span data-thumbnail-state-text="true" className="text-caption">
        {`${typeLabel} · ${stateText}`}
      </span>
    </li>
  );
}
