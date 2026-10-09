"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";

import {
  InlineActionError,
  ReviewButton,
} from "@/components/extraction-review/review-controls";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { generateShippingPaper } from "../actions";
import {
  CANCEL,
  GENERATE,
  GENERATE_CONFIRM,
  GENERATE_CONFIRM_BODY,
  GENERATE_CONFIRM_TITLE,
  GENERATE_GATED,
  GENERATING,
} from "../shipment-copy";

/**
 * Step 3's **Generate shipping paper** — `UX_SPEC.md` §3.12; Flow B4.
 *
 * Inert, with its reason, until every precondition is met — `aria-disabled`,
 * never the `disabled` attribute, so the reason stays reachable (Rule 1.26).
 * A final `AlertDialog` before commit. The server rebuilds the paper from the
 * rows at commit and refuses if anything is unmet, so this gate is a courtesy
 * and never the enforcement.
 */
export function GenerateControl({
  shipmentId,
  complete,
}: {
  readonly shipmentId: string;
  readonly complete: boolean;
}): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await generateShippingPaper({ shipmentId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      router.push(`/shipments/${shipmentId}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <ReviewButton
        gatedReason={complete ? null : GENERATE_GATED}
        onPress={() => setOpen(true)}
        data-generate-paper="true"
      >
        {GENERATE}
      </ReviewButton>
      <AlertDialogContent data-generate-dialog="true">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-h2">
            {GENERATE_CONFIRM_TITLE}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            {GENERATE_CONFIRM_BODY}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error === null ? null : (
          <InlineActionError
            message={error}
            dataAttribute="data-generate-error"
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className={ACTION_BUTTON_CLASS}>
            {CANCEL}
          </AlertDialogCancel>
          <ReviewButton
            pending={pending}
            pendingLabel={GENERATING}
            onPress={() => void generate()}
            data-generate-confirm="true"
          >
            {GENERATE_CONFIRM}
          </ReviewButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
