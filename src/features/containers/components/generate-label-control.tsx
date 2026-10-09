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

import { generateLabel } from "../actions";
import {
  LABEL_BLOCKED_GATED,
  LABEL_CANCEL,
  LABEL_CONFIRM,
  LABEL_CONFIRM_BODY,
  LABEL_CONFIRM_SUPERSEDES,
  LABEL_CONFIRM_TITLE,
  LABEL_GENERATE,
  LABEL_GENERATE_NEW,
  LABEL_GENERATING,
} from "../container-copy";

/**
 * **Generate label** on the Label tab — Rules 4.18–4.21; `UX_SPEC.md` §3.10.
 *
 * Inert, with its reason, while the label cannot be built — `aria-disabled`,
 * never `disabled`, so the reason stays reachable (Rule 1.26). A final
 * `AlertDialog` before the label is issued, saying what happens to the one in
 * force. The server rebuilds the label from the rows at commit and refuses
 * anything this screen thought was complete, so the gate is a courtesy and
 * never the enforcement. **A human prints** (Rule 4.21): the new label opens
 * once it is issued.
 */
export function GenerateLabelControl({
  containerId,
  buildable,
  replacesLabel,
}: {
  readonly containerId: string;
  /** The label builder found every input it needs. */
  readonly buildable: boolean;
  /** A label is in force and this one supersedes it. */
  readonly replacesLabel: boolean;
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
      const result = await generateLabel({ containerId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      router.push(`/documents/${result.data.documentRenderId}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <ReviewButton
        gatedReason={buildable ? null : LABEL_BLOCKED_GATED}
        onPress={() => setOpen(true)}
        data-generate-label="true"
      >
        {replacesLabel ? LABEL_GENERATE_NEW : LABEL_GENERATE}
      </ReviewButton>
      <AlertDialogContent data-generate-label-dialog="true">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-h2">
            {LABEL_CONFIRM_TITLE}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            {LABEL_CONFIRM_BODY}
          </AlertDialogDescription>
          {replacesLabel ? (
            <p className="text-body">{LABEL_CONFIRM_SUPERSEDES}</p>
          ) : null}
        </AlertDialogHeader>
        {error === null ? null : (
          <InlineActionError
            message={error}
            dataAttribute="data-generate-label-error"
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className={ACTION_BUTTON_CLASS}>
            {LABEL_CANCEL}
          </AlertDialogCancel>
          <ReviewButton
            pending={pending}
            pendingLabel={LABEL_GENERATING}
            onPress={() => void generate()}
            data-generate-label-confirm="true"
          >
            {LABEL_CONFIRM}
          </ReviewButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
