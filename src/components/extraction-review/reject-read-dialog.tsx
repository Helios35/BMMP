"use client";

import { useState, type ReactElement } from "react";

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
import { cn } from "@/lib/utils";
import {
  REJECT_READ,
  REJECT_READ_BODY,
  REJECT_READ_CANCEL,
  REJECT_READ_CONFIRM,
  REJECT_READ_CONFIRMING,
  REJECT_READ_TITLE,
} from "./review-copy";
import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "./review-controls";
import type { ExtractionReviewActions } from "./types";

/**
 * The whole-read reject — `UX_SPEC.md` §2.1.5.
 *
 * *Reject this read* is `destructive outline` and opens an `AlertDialog` with
 * the spec's copy verbatim. On confirm the route marks the extraction rejected
 * **and retained** — a rejected read is training signal (D-7) — keeps every
 * photo, and returns the flow to step 1. The dialog stays open until the
 * action answers, so a failure is shown here and nothing is assumed.
 *
 * The confirm is a `ReviewButton` rather than `AlertDialogAction`, because
 * the primitive closes the dialog on press and this one must not close until
 * the server has said yes.
 */
export function RejectReadDialog({
  actions,
}: {
  readonly actions: Pick<ExtractionReviewActions, "rejectRead">;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const call = useActionCall();

  async function confirm(): Promise<void> {
    const result = await call.run(() => actions.rejectRead());
    if (result?.ok === true) setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <ReviewButton
        variant="outline"
        data-reject-read="true"
        className={INTENT_TEXT_CLASSES.critical}
        onPress={() => setOpen(true)}
      >
        {REJECT_READ}
      </ReviewButton>
      <AlertDialogContent data-reject-read-dialog="true">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-h2">
            {REJECT_READ_TITLE}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            {REJECT_READ_BODY}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {call.error === null ? null : (
          <InlineActionError
            dataAttribute="data-dialog-error"
            message={call.error}
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className={cn(ACTION_BUTTON_CLASS)}>
            {REJECT_READ_CANCEL}
          </AlertDialogCancel>
          <ReviewButton
            variant="destructive"
            data-reject-read-confirm="true"
            pending={call.pending}
            pendingLabel={REJECT_READ_CONFIRMING}
            onPress={() => void confirm()}
          >
            {REJECT_READ_CONFIRM}
          </ReviewButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
