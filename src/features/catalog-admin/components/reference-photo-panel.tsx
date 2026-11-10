"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { toast } from "sonner";

import { PhotoCaptureInput } from "@/components/capture/photo-capture-input";
import {
  xhrReferencePhotoTransport,
  type ReferencePhotoTransport,
} from "@/components/capture/upload-transport";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  ReferencePhotoFigure,
  type ReferencePhotoView,
} from "@/features/catalog/components/reference-photo";

/**
 * **Reference label photo** panel — `UX_SPEC.md` §3.19; Rule 2.36; D-75 #1,
 * #2. P6 only, on `/settings/catalog?entry=`.
 *
 * Upload or replace the entry's reference: a platform photo — the maker's
 * image, a spec sheet, or one the platform took. **Never a customer's
 * photo**: nothing here reads an organization's records, and the bytes go to
 * the platform bucket. Replacing keeps the old one on the entry's history.
 * The rest of entry editing stays deferred (D-50).
 *
 * Nothing is optimistic: the panel shows what the server re-renders with.
 */

export const UPLOAD_REFERENCE = "Upload a reference photo";
export const REPLACE_REFERENCE = "Replace the reference photo";
export const REFERENCE_SET = "Reference photo set";
export const PLATFORM_PHOTO_ONLY =
  "Use the maker's image, a spec sheet, or a photo the platform took — never a photo from a customer's records.";

const UPLOAD_URL = "/api/catalog/reference-photos";

export interface ReferencePhotoPanelProps {
  readonly catalogEntryId: string;
  readonly current: ReferencePhotoView | null;
  /** Tests inject a transport; the default is the browser's. */
  readonly transport?: ReferencePhotoTransport;
}

export function ReferencePhotoPanel({
  catalogEntryId,
  current,
  transport = xhrReferencePhotoTransport,
}: ReferencePhotoPanelProps): ReactElement {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File): Promise<void> {
    if (isSending) return;
    setIsSending(true);
    setError(null);
    const result = await transport(
      { file, catalogEntryId, uploadUrl: UPLOAD_URL },
      () => {},
    );
    setIsSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success(REFERENCE_SET, {
      description: "The label look check compares against it from now on.",
    });
    router.refresh();
  }

  return (
    <div
      data-reference-photo-panel={catalogEntryId}
      className="flex flex-col gap-4"
    >
      <ReferencePhotoFigure photo={current} />
      <p className="max-w-[72ch] text-caption text-muted-foreground">
        {PLATFORM_PHOTO_ONLY}
      </p>
      <PhotoCaptureInput
        photoType="label"
        variant="button"
        label={current === null ? UPLOAD_REFERENCE : REPLACE_REFERENCE}
        disabled={isSending}
        {...(isSending ? { disabledReason: "Sending the photo…" } : {})}
        onFile={(file) => void send(file)}
      />
      {isSending ? (
        <p role="status" className="text-caption">
          Sending the photo…
        </p>
      ) : null}
      {error === null ? null : (
        <Alert
          role="alert"
          data-reference-photo-error="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">{error}</AlertTitle>
        </Alert>
      )}
    </div>
  );
}
