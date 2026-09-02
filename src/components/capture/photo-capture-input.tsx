"use client";

import { useId, useRef, useState, type ReactElement } from "react";
import { Camera, ImagePlus, Upload } from "lucide-react";

import { GatedControl } from "@/components/access/gated-control";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import type { IntakePhotoType } from "@/domain/taxonomy/intake-photo-type";
import { cn } from "@/lib/utils";

/**
 * `PhotoCaptureInput` — the one control that puts an image file into this
 * product (`UX_SPEC.md` §2.2, §3.7 Photos tab, B4's attach-a-photo dialog).
 *
 * ## The file input is the camera
 *
 * A hidden `<input type="file" accept="image/jpeg,image/png,image/webp"
 * capture="environment">` behind a visible control. On a phone, `capture`
 * opens the rear camera directly; on a desktop it opens a file picker. There
 * is **no `getUserMedia`, no live preview, no torch toggle and no shutter
 * flash** — §2.2's full-bleed camera view is the phone's own camera app,
 * reached through the input, rather than a second camera built in a web
 * view. The trade: the OS camera handles focus, exposure, permissions and the
 * "permission denied" panel better than a web page can, and the product never
 * holds a camera stream it does not need. Recorded as a judgment call in the
 * build-notes; §2.2's torch and 80ms flash are not implemented.
 *
 * Three visible shapes, one behaviour:
 *
 * - `shutter` — the 72px round control §2.2 centres in the bottom bar;
 * - `button` — a 44px labelled button (*Use photo library*, *Add a photo*);
 * - `dropzone` — the desktop drop target, which also carries a picker.
 *
 * The component reads the file, makes a preview URL and hands both to the
 * caller. It uploads nothing and knows no session — the step that owns the
 * upload does that, so the same control serves intake and the record page.
 */

export interface PhotoCaptureInputProps {
  /** T-50. Carried as `data-photo-type` so the caller's tests can find the right control. */
  readonly photoType: IntakePhotoType;
  /**
   * `capture="environment"` on the input — the rear camera on a phone. Off for
   * *Use photo library*, which should open the picker.
   */
  readonly capture?: boolean;
  readonly onFile: (file: File, previewUrl: string) => void;
  /** The accessible name of the control. */
  readonly label: string;
  readonly variant: "shutter" | "button" | "dropzone";
  readonly disabled?: boolean;
  /** Required when `disabled` — a silently disabled control is a defect (Rule 1.26). */
  readonly disabledReason?: string;
  readonly className?: string;
}

/** The three encodings the upload route accepts. Anything else is refused there with a 400. */
export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

const NO_REASON_GIVEN = "Adding a photo is not available right now.";

export function PhotoCaptureInput({
  photoType,
  capture = false,
  onFile,
  label,
  variant,
  disabled = false,
  disabledReason,
  className,
}: PhotoCaptureInputProps): ReactElement {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function accept(file: File | null | undefined): void {
    if (file === null || file === undefined || disabled) return;
    onFile(file, URL.createObjectURL(file));
  }

  function open(): void {
    if (disabled) return;
    inputRef.current?.click();
  }

  const input = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={ACCEPTED_IMAGE_TYPES}
      // `capture` is a boolean attribute in React's eyes only when true; the
      // string form is what browsers read.
      capture={capture ? "environment" : undefined}
      aria-label={label}
      data-photo-type={photoType}
      className="sr-only"
      // The visible button is the accessible control (§1.5); the input is
      // reached only through it. Hidden from the tree as well as the tab
      // order, so a 1×1px box is never counted as a target.
      aria-hidden="true"
      tabIndex={-1}
      onChange={(event) => {
        accept(event.currentTarget.files?.[0]);
        // The same file twice in a row must fire again — a re-take of the same
        // frame is a real event.
        event.currentTarget.value = "";
      }}
    />
  );

  const control =
    variant === "shutter" ? (
      <Button
        type="button"
        variant="default"
        size="lg"
        aria-label={label}
        aria-disabled={disabled ? "true" : undefined}
        data-capture-control="shutter"
        onClick={open}
        // 72px per §2.2 — a sizing figure, not a spacing one.
        className={cn("size-18 rounded-full", disabled && "opacity-60")}
      >
        <Camera aria-hidden="true" className="size-8" />
      </Button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="lg"
        aria-disabled={disabled ? "true" : undefined}
        data-capture-control={variant === "dropzone" ? "picker" : "button"}
        onClick={open}
        className={cn(ACTION_BUTTON_CLASS, disabled && "opacity-60")}
      >
        {variant === "dropzone" ? (
          <Upload aria-hidden="true" />
        ) : (
          <ImagePlus aria-hidden="true" />
        )}
        <span>{label}</span>
      </Button>
    );

  const gated = disabled ? (
    <GatedControl reason={disabledReason ?? NO_REASON_GIVEN}>
      {control}
    </GatedControl>
  ) : (
    control
  );

  if (variant !== "dropzone") {
    return (
      <span
        data-photo-capture-input="true"
        data-capture-variant={variant}
        data-photo-type={photoType}
        className={cn("inline-flex", className)}
      >
        {input}
        {gated}
      </span>
    );
  }

  return (
    <div
      data-photo-capture-input="true"
      data-capture-variant="dropzone"
      data-photo-type={photoType}
      data-drag-over={isDragOver ? "true" : "false"}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        accept(event.dataTransfer.files[0]);
      }}
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-6",
        isDragOver && "border-primary bg-muted",
        className,
      )}
    >
      {input}
      <p className="text-body">Drop a photo here, or choose a file.</p>
      {gated}
    </div>
  );
}
