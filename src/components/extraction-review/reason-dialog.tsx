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
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "./review-controls";

/**
 * An act that needs a **stated reason** before the server will record it —
 * voiding a queue item (Rule 2.23), keeping a record as identified against an
 * approved catalog entry (EC-10), approving or rejecting a catalog proposal
 * (Flow F step 3).
 *
 * One dialog for all of them, because the guarantees are the same: the reason
 * is required and typed; the confirm stays inert — `aria-disabled` with its
 * reason visible, never the `disabled` attribute — until one is entered; and
 * the dialog stays open until the server has recorded the act (§6.4). A
 * refusal renders inside the dialog, beside the words it refused.
 *
 * `tone` is presentation only: `destructive` for an act that ends something
 * (a void, a rejection), `affirmative` for one that records a decision in
 * favour (an approval). It changes no requirement.
 */

export interface ReasonDialogCopy {
  readonly trigger: string;
  readonly title: string;
  readonly body: string;
  readonly reasonLabel: string;
  readonly reasonRequired: string;
  readonly confirm: string;
  readonly confirming: string;
  readonly cancel: string;
}

/** The structural hooks each use carries, so a spec finds the dialog it means. */
export interface ReasonDialogAttributes {
  readonly trigger: Readonly<Record<string, string>>;
  readonly dialog: Readonly<Record<string, string>>;
  readonly reason: Readonly<Record<string, string>>;
  readonly confirm: Readonly<Record<string, string>>;
}

export interface ReasonDialogProps {
  readonly copy: ReasonDialogCopy;
  readonly onSubmit: (reason: string) => Promise<ActionResult<unknown>>;
  readonly tone?: "destructive" | "affirmative";
  readonly attributes: ReasonDialogAttributes;
}

export function ReasonDialog({
  copy,
  onSubmit,
  tone = "destructive",
  attributes,
}: ReasonDialogProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const call = useActionCall();

  const trimmed = reason.trim();

  async function confirm(): Promise<void> {
    if (trimmed.length === 0) return;
    const result = await call.run(() => onSubmit(trimmed));
    if (result?.ok === true) {
      setOpen(false);
      setReason("");
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <ReviewButton
        variant={tone === "destructive" ? "ghost" : "default"}
        className={
          tone === "destructive" ? INTENT_TEXT_CLASSES.critical : undefined
        }
        onPress={() => setOpen(true)}
        {...attributes.trigger}
      >
        {copy.trigger}
      </ReviewButton>
      <AlertDialogContent {...attributes.dialog}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-h2">{copy.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            {copy.body}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={reasonId} className="text-label text-foreground">
            {copy.reasonLabel}
          </Label>
          <Textarea
            id={reasonId}
            required
            aria-required="true"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-16 rounded-md text-body"
            {...attributes.reason}
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
            {copy.cancel}
          </AlertDialogCancel>
          <ReviewButton
            variant={tone === "destructive" ? "destructive" : "default"}
            pending={call.pending}
            pendingLabel={copy.confirming}
            gatedReason={trimmed.length === 0 ? copy.reasonRequired : null}
            onPress={() => void confirm()}
            {...attributes.confirm}
          >
            {copy.confirm}
          </ReviewButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
