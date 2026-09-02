"use client";

import { useId, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { toast } from "sonner";

import { PhotoCaptureInput } from "@/components/capture/photo-capture-input";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INTAKE_PHOTO_TYPE_LABELS,
  type IntakePhotoType,
} from "@/domain/taxonomy/intake-photo-type";
import { cn } from "@/lib/utils";
import type { Uuid } from "@/types/common";
import { NO_SESSION_FOR_PHOTO } from "./edit-condition-dialog";
import { uploadRecordPhoto } from "./upload-photo";

/**
 * **Attach a photo** — `UX_SPEC.md` §3.7; T-50.
 *
 * A photo attaches to the record's intake session through the same upload
 * route intake uses (`POST /api/intake/photos`); the Photos tab then lists it
 * with the rest. **A record with no intake session has nowhere to put a
 * photo** — `intake_photo.intake_session_id` is the only link — so the menu
 * never opens this dialog for one, and the dialog itself refuses too rather
 * than trusting that it was opened correctly.
 *
 * The type list is T-50's top level only: a crop is produced by the pipeline,
 * and clearing evidence is attached by the condition dialog that needs it.
 */

const ATTACHABLE_PHOTO_TYPES: readonly IntakePhotoType[] = [
  "whole_pack",
  "label",
  "damage",
];

export interface AttachPhotoDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly intakeSessionId: Uuid | null;
}

interface ChosenFile {
  readonly file: File;
  readonly previewUrl: string;
}

export function AttachPhotoDialog({
  open,
  onOpenChange,
  intakeSessionId,
}: AttachPhotoDialogProps): ReactElement {
  const router = useRouter();
  const typeId = useId();
  const [photoType, setPhotoType] = useState<IntakePhotoType>("whole_pack");
  const [chosen, setChosen] = useState<ChosenFile | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAttach = intakeSessionId !== null;
  const isReady = canAttach && chosen !== null && !isPending;

  async function attach(): Promise<void> {
    if (!isReady || chosen === null || intakeSessionId === null) return;
    setIsPending(true);
    setError(null);
    const result = await uploadRecordPhoto({
      file: chosen.file,
      intakeSessionId,
      photoType,
    });
    setIsPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success("Photo attached", {
      description: "It is listed on the Photos tab.",
    });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-record-dialog="attach-a-photo"
        // Capped to the viewport and scrolling, so the footer — the save — is
        // reachable at 1280×720, where the body alone is taller than the
        // viewport (§2.6). The 2rem is the primitive's own inset.
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg text-body sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-h2">Attach a photo</DialogTitle>
          <DialogDescription className="text-body text-foreground">
            The photo is stored with this record&apos;s intake photos and shown
            on the Photos tab.
          </DialogDescription>
        </DialogHeader>

        {canAttach ? null : (
          <Alert
            role="alert"
            className={cn(INTENT_SURFACE_CLASSES.attention, "gap-2 px-3 py-3")}
          >
            <CircleAlert aria-hidden="true" className="size-4" />
            <AlertDescription className="text-body text-current">
              {NO_SESSION_FOR_PHOTO}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2">
          <Label htmlFor={typeId} className="text-label">
            Photo type
          </Label>
          <Select
            value={photoType}
            onValueChange={(value) => setPhotoType(value as IntakePhotoType)}
          >
            <SelectTrigger
              id={typeId}
              className="min-h-11 rounded-md text-body"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTACHABLE_PHOTO_TYPES.map((type) => (
                <SelectItem
                  key={type}
                  value={type}
                  className="min-h-11 text-body"
                >
                  {INTAKE_PHOTO_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <PhotoCaptureInput
          photoType={photoType}
          variant="button"
          label={
            chosen === null ? "Choose a photo" : "Choose a different photo"
          }
          onFile={(file, previewUrl) => {
            setError(null);
            setChosen({ file, previewUrl });
          }}
          disabled={!canAttach}
          {...(canAttach ? {} : { disabledReason: NO_SESSION_FOR_PHOTO })}
        />

        {chosen === null ? null : (
          <figure className="grid gap-2">
            {/* A local object URL for the preview only; the stored bytes are
                the route's. next/image cannot optimise a blob URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={chosen.previewUrl}
              alt={`Preview of ${chosen.file.name}`}
              className="max-h-64 w-full rounded-md border border-border object-contain"
            />
            <figcaption className="text-caption">
              <span className="text-mono">{chosen.file.name}</span>
            </figcaption>
          </figure>
        )}

        {error === null ? null : (
          <Alert
            role="alert"
            className={cn(INTENT_SURFACE_CLASSES.critical, "gap-2 px-3 py-3")}
          >
            <CircleAlert aria-hidden="true" className="size-4" />
            <AlertDescription className="text-body text-current">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="rounded-b-lg p-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            className={ACTION_BUTTON_CLASS}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            data-primary-action="attach-photo"
            aria-disabled={isReady ? undefined : "true"}
            onClick={() => {
              void attach();
            }}
            className={cn(ACTION_BUTTON_CLASS, isReady ? "" : "opacity-60")}
          >
            {isPending ? "Sending…" : "Attach photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
