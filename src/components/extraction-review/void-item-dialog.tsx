"use client";

import { useId, useState, type ReactElement } from "react";

import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  VOID_BODY,
  VOID_CANCEL,
  VOID_CONFIRM,
  VOID_CONFIRMING,
  VOID_ITEM,
  VOID_REASON_LABEL,
  VOID_REASON_REQUIRED,
  VOID_TITLE,
} from "./review-copy";
import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "./review-controls";
import type { ExtractionReviewActions } from "./types";

/**
 * Void — the only other way out of the review queue (`UX_SPEC.md` §2.1.5;
 * Rule 2.23).
 *
 * A queue item leaves in exactly two ways: a person confirms it, or a person
 * **voids it with a stated reason**. There is no dismiss, no ignore and no
 * expiry, for any role. The reason is required and typed: the confirm stays
 * inert — `aria-disabled` with its reason visible, never the `disabled`
 * attribute — until one is entered, and the dialog stays open until the server
 * has recorded it. The session, its photos and its extraction are all retained
 * (Rule 2.1).
 */
export function VoidItemDialog({
  onVoid,
}: {
  readonly onVoid: NonNullable<ExtractionReviewActions["voidItem"]>;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const call = useActionCall();

  const trimmed = reason.trim();

  async function confirm(): Promise<void> {
    if (trimmed.length === 0) return;
    const result = await call.run(() => onVoid(trimmed));
    if (result?.ok === true) {
      setOpen(false);
      setReason("");
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <ReviewButton
        variant="ghost"
        data-void-item="true"
        className={INTENT_TEXT_CLASSES.critical}
        onPress={() => setOpen(true)}
      >
        {VOID_ITEM}
      </ReviewButton>
      <AlertDialogContent data-void-dialog="true">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-h2">{VOID_TITLE}</AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            {VOID_BODY}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={reasonId} className="text-label text-foreground">
            {VOID_REASON_LABEL}
          </Label>
          <Textarea
            id={reasonId}
            data-void-reason="true"
            required
            aria-required="true"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-16 rounded-md text-body"
          />
        </div>
        {call.error === null ? null : (
          <InlineActionError
            dataAttribute="data-dialog-error"
            message={call.error}
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className={cn(ACTION_BUTTON_CLASS)}>
            {VOID_CANCEL}
          </AlertDialogCancel>
          <ReviewButton
            variant="destructive"
            data-void-confirm="true"
            pending={call.pending}
            pendingLabel={VOID_CONFIRMING}
            gatedReason={trimmed.length === 0 ? VOID_REASON_REQUIRED : null}
            onPress={() => void confirm()}
          >
            {VOID_CONFIRM}
          </ReviewButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
