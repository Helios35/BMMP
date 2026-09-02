"use client";

import { useId, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { toast } from "sonner";

import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import type { Uuid } from "@/types/common";

/**
 * **Void this record** — `UX_SPEC.md` §3.7; Rules 3.25, 12.12.
 *
 * An `AlertDialog`, because there is no undo: the record is retained with its
 * decisions and its assessments and leaves every operational count. **The
 * reason is typed, required and refused when empty** — it lands on the audit
 * row as the only explanation the trail will ever carry for this act.
 *
 * The action redirects to `/batteries` on success (the record is no longer a
 * page this person needs to be on), so a resolved promise with no failure is
 * the success signal here.
 */

export const VOID_REASON_REQUIRED =
  "Enter the reason this record is voided. It is recorded on the audit trail.";

export type VoidRecordAction = (
  input: unknown,
) => Promise<ActionResult<never> | undefined>;

export interface VoidRecordDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly recordId: Uuid;
  readonly recordNumber: string;
  readonly action: VoidRecordAction;
}

export function VoidRecordDialog({
  open,
  onOpenChange,
  recordId,
  recordNumber,
  action,
}: VoidRecordDialogProps): ReactElement {
  const router = useRouter();
  const reasonId = useId();
  const errorId = useId();
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    if (isPending) return;
    const trimmed = reason.trim();
    if (trimmed === "") {
      setError(VOID_REASON_REQUIRED);
      return;
    }
    setIsPending(true);
    setError(null);
    const result = await action({ recordId, reason: trimmed });
    setIsPending(false);
    if (result !== undefined && !result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success(`${recordNumber} voided`, {
      description: "The record is kept for the trail and left every count.",
    });
    onOpenChange(false);
    router.push("/batteries");
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        data-record-dialog="void-this-record"
        className="rounded-lg text-body"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-h2">
            Void {recordNumber}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body text-foreground">
            The record, its classification decisions and its assessments are
            kept and stay readable. It leaves every list and count. There is no
            undo.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-2">
          <Label htmlFor={reasonId} className="text-label">
            Reason
          </Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
              if (error !== null) setError(null);
            }}
            aria-required="true"
            aria-invalid={error === null ? undefined : "true"}
            aria-describedby={error === null ? undefined : errorId}
            data-void-reason="true"
            className="min-h-16 rounded-md text-body"
          />
        </div>

        {error === null ? null : (
          <Alert
            id={errorId}
            role="alert"
            className={cn(INTENT_SURFACE_CLASSES.critical, "gap-2 px-3 py-3")}
          >
            <CircleAlert aria-hidden="true" className="size-4" />
            <AlertDescription className="text-body text-current">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter className="p-0">
          <AlertDialogCancel size="lg" className={ACTION_BUTTON_CLASS}>
            Keep this record
          </AlertDialogCancel>
          {/* Radix closes on Action by default; the default is prevented so
              an empty reason keeps the dialog open with its message, and a
              failed action keeps it open with the server's. */}
          <AlertDialogAction
            variant="destructive"
            size="lg"
            data-primary-action="void-record"
            data-destructive="true"
            aria-disabled={isPending ? "true" : undefined}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
            className={ACTION_BUTTON_CLASS}
          >
            {isPending ? "Voiding…" : "Void this record"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
