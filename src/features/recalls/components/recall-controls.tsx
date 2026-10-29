"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactElement } from "react";

import {
  ReasonDialog,
  type ReasonDialogAttributes,
} from "@/components/extraction-review/reason-dialog";
import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "@/components/extraction-review/review-controls";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RECALL_RECORDING_SOURCES,
  type RecallRecordingSource,
} from "@/domain/recalls/hit";
import { RECALL_SOURCE_LABELS } from "@/domain/taxonomy/recall-source";

import {
  checkRecallsNow,
  confirmRecall,
  dismissRecall,
  recordRecall,
} from "../actions";
import {
  CANCEL,
  CHECK_NOW,
  CHECKING,
  CONFIRM,
  CONFIRMING,
  DISMISS_COPY,
  RECORD_BODY,
  RECORD_RECALL,
  RECORD_REFERENCE,
  RECORD_SOURCE,
  RECORD_SUBMIT,
  RECORD_SUBMITTING,
  RECORD_TITLE,
  RECORD_TITLE_FIELD,
  WITHDRAW_COPY,
} from "../recall-copy";

/**
 * The recall controls — `UX_SPEC.md` §3.7; Rules 6.23, 6.24, 10.10,
 * 10.14–10.16.
 *
 * Rendered only for the roles the recall action map lets act, and every one
 * goes to a Server Action that asks again. **Nothing is optimistic**: each
 * waits for the server, then the page re-renders from `src/data`. A refusal
 * renders beside the control that asked.
 */

/** **Check now** — P1, P2, P6 (Rule 10.10). */
export function CheckNowButton({
  recordId,
}: {
  readonly recordId: string;
}): ReactElement {
  const router = useRouter();
  const call = useActionCall();

  async function check(): Promise<void> {
    const result = await call.run(() => checkRecallsNow({ recordId }));
    if (result?.ok === true) router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <ReviewButton
        variant="outline"
        pending={call.pending}
        pendingLabel={CHECKING}
        onPress={() => void check()}
        data-recall-check-now="true"
      >
        {CHECK_NOW}
      </ReviewButton>
      {call.error === null ? null : (
        <InlineActionError
          dataAttribute="data-recall-check-error"
          message={call.error}
        />
      )}
    </div>
  );
}

/** **Confirm recall** on a possible match — P1, P2, P6 (Rule 10.14). */
export function ConfirmRecallButton({
  recordId,
  matchId,
}: {
  readonly recordId: string;
  readonly matchId: string;
}): ReactElement {
  const router = useRouter();
  const call = useActionCall();

  async function confirm(): Promise<void> {
    const result = await call.run(() => confirmRecall({ recordId, matchId }));
    if (result?.ok === true) router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <ReviewButton
        pending={call.pending}
        pendingLabel={CONFIRMING}
        onPress={() => void confirm()}
        data-recall-confirm={matchId}
      >
        {CONFIRM}
      </ReviewButton>
      {call.error === null ? null : (
        <InlineActionError
          dataAttribute="data-recall-confirm-error"
          message={call.error}
        />
      )}
    </div>
  );
}

/**
 * **Dismiss** a possible match or **Withdraw** a confirmed one — P1, P6, each
 * with a stated reason that stays on the row (Rules 6.24, 10.14, 10.16).
 */
export function DismissRecallDialog({
  recordId,
  matchId,
  withdraw,
}: {
  readonly recordId: string;
  readonly matchId: string;
  readonly withdraw: boolean;
}): ReactElement {
  const router = useRouter();
  const kind = withdraw ? "withdraw" : "dismiss";
  const attributes: ReasonDialogAttributes = {
    trigger: { [`data-recall-${kind}`]: matchId },
    dialog: { [`data-recall-${kind}-dialog`]: matchId },
    reason: { [`data-recall-${kind}-reason`]: matchId },
    confirm: { [`data-recall-${kind}-confirm`]: matchId },
  };

  return (
    <ReasonDialog
      copy={withdraw ? WITHDRAW_COPY : DISMISS_COPY}
      tone="destructive"
      attributes={attributes}
      onSubmit={async (reason) => {
        const result = await dismissRecall({ recordId, matchId, reason });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}

/** **Record a recall** by hand — P1, P2, P6; confirmed at once (Rule 10.15). */
export function RecordRecallDialog({
  recordId,
}: {
  readonly recordId: string;
}): ReactElement {
  const router = useRouter();
  const sourceId = useId();
  const referenceId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<RecallRecordingSource>(
    "manufacturer_notice",
  );
  const [reference, setReference] = useState("");
  const [title, setTitle] = useState("");
  const call = useActionCall();

  async function submit(): Promise<void> {
    const result = await call.run(() =>
      recordRecall({ recordId, source, reference, title }),
    );
    if (result?.ok === true) {
      setOpen(false);
      setReference("");
      setTitle("");
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          data-record-recall-trigger="true"
          className={ACTION_BUTTON_CLASS}
        >
          {RECORD_RECALL}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg"
        data-record-recall-dialog="true"
      >
        <DialogHeader>
          <DialogTitle className="text-h2">{RECORD_TITLE}</DialogTitle>
          <DialogDescription className="text-body">
            {RECORD_BODY}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={sourceId} className="text-label text-foreground">
              {RECORD_SOURCE}
            </Label>
            <Select
              value={source}
              onValueChange={(value) =>
                setSource(value as RecallRecordingSource)
              }
            >
              <SelectTrigger
                id={sourceId}
                data-record-recall-source="true"
                className="min-h-11 w-full rounded-md text-body"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                {RECALL_RECORDING_SOURCES.map((value) => (
                  <SelectItem
                    key={value}
                    value={value}
                    data-record-recall-source-option={value}
                    className="min-h-11 rounded-md text-body"
                  >
                    {RECALL_SOURCE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={referenceId} className="text-label text-foreground">
              {RECORD_REFERENCE}
            </Label>
            <Input
              id={referenceId}
              name="reference"
              required
              aria-required="true"
              value={reference}
              autoComplete="off"
              data-record-recall-reference="true"
              onChange={(event) => setReference(event.currentTarget.value)}
              className="min-h-11 rounded-md text-body"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={titleId} className="text-label text-foreground">
              {RECORD_TITLE_FIELD}
            </Label>
            <Input
              id={titleId}
              name="title"
              value={title}
              autoComplete="off"
              data-record-recall-title="true"
              onChange={(event) => setTitle(event.currentTarget.value)}
              className="min-h-11 rounded-md text-body"
            />
          </div>
          {call.error === null ? null : (
            <InlineActionError
              dataAttribute="data-record-recall-error"
              message={call.error}
            />
          )}
          <DialogFooter className="rounded-b-lg">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setOpen(false)}
              className={ACTION_BUTTON_CLASS}
            >
              {CANCEL}
            </Button>
            <ReviewButton
              pending={call.pending}
              pendingLabel={RECORD_SUBMITTING}
              onPress={() => void submit()}
              data-record-recall-submit="true"
            >
              {RECORD_SUBMIT}
            </ReviewButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
