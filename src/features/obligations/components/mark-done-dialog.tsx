"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactElement } from "react";

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
import { Textarea } from "@/components/ui/textarea";

import { markDeadlineDone } from "../actions";
import {
  DATE_MET,
  EVIDENCE,
  EVIDENCE_HINT,
  EVIDENCE_NONE,
  MARK_DONE,
  MARK_DONE_BODY,
  NOTE,
  NOTE_REQUIRED,
  REFERENCE,
  REFERENCE_HINT,
  SAVING,
} from "../obligation-copy";

/** Radix `Select` cannot carry an empty value; "no packet" never reaches the server. */
const NO_EVIDENCE = "__none__";

/**
 * **Mark done** — Rule 8.12; `UX_SPEC.md` §3.21. The date it was met (never
 * after today), a required note saying what was done, and an optional
 * reference. The confirm stays inert, with its reason, until the note is
 * written; the dialog stays open until the server has recorded it.
 *
 * Where the deadline has issued packets, an optional **Evidence** select
 * links one as what was filed (Rule 8.19) — never required, and a packet
 * never marks a deadline done on its own.
 */
export function MarkDoneDialog({
  deadlineId,
  duty,
  today,
  packets = [],
}: {
  readonly deadlineId: string;
  readonly duty: string;
  readonly today: string;
  /** This deadline's issued packets. */
  readonly packets?: readonly { readonly id: string; readonly label: string }[];
}): ReactElement {
  const router = useRouter();
  const call = useActionCall();
  const [open, setOpen] = useState(false);
  const [completedOn, setCompletedOn] = useState(today);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [evidence, setEvidence] = useState(NO_EVIDENCE);
  const dateId = useId();
  const noteId = useId();
  const referenceId = useId();
  const evidenceId = useId();

  const trimmed = note.trim();

  async function confirm(): Promise<void> {
    if (trimmed.length === 0) return;
    const result = await call.run(() =>
      markDeadlineDone({
        deadlineId,
        completedOn,
        note: trimmed,
        ...(reference.trim() === "" ? {} : { reference: reference.trim() }),
        ...(evidence === NO_EVIDENCE
          ? {}
          : { evidenceDocumentRenderId: evidence }),
      }),
    );
    if (result?.ok === true) {
      setOpen(false);
      setNote("");
      setReference("");
      setEvidence(NO_EVIDENCE);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className={ACTION_BUTTON_CLASS}
        onClick={() => setOpen(true)}
        data-mark-done={deadlineId}
      >
        {MARK_DONE}
      </Button>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg"
        data-mark-done-dialog={deadlineId}
      >
        <DialogHeader>
          <DialogTitle className="text-h2">{MARK_DONE}</DialogTitle>
          <DialogDescription className="text-body">
            {duty} {MARK_DONE_BODY}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={dateId} className="text-label text-foreground">
              {DATE_MET}
            </Label>
            <Input
              id={dateId}
              type="date"
              max={today}
              value={completedOn}
              onChange={(event) => setCompletedOn(event.currentTarget.value)}
              className="min-h-11 rounded-md text-body"
              data-mark-done-date="true"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={noteId} className="text-label text-foreground">
              {NOTE}
            </Label>
            <Textarea
              id={noteId}
              required
              aria-required="true"
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              className="min-h-16 rounded-md text-body"
              data-mark-done-note="true"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={referenceId} className="text-label text-foreground">
              {REFERENCE}
            </Label>
            <Input
              id={referenceId}
              value={reference}
              autoComplete="off"
              onChange={(event) => setReference(event.currentTarget.value)}
              className="min-h-11 rounded-md text-body"
              data-mark-done-reference="true"
            />
            <p className="text-caption text-muted-foreground">
              {REFERENCE_HINT}
            </p>
          </div>
          {packets.length === 0 ? null : (
            <div className="flex flex-col gap-2">
              <Label
                htmlFor={evidenceId}
                className="text-label text-foreground"
              >
                {EVIDENCE}
              </Label>
              <Select value={evidence} onValueChange={setEvidence}>
                <SelectTrigger
                  id={evidenceId}
                  className="min-h-11 w-full rounded-md text-body"
                  data-mark-done-evidence="true"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value={NO_EVIDENCE}
                    className="min-h-11 text-body"
                  >
                    {EVIDENCE_NONE}
                  </SelectItem>
                  {packets.map((packet) => (
                    <SelectItem
                      key={packet.id}
                      value={packet.id}
                      className="min-h-11 text-body"
                    >
                      {packet.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                {EVIDENCE_HINT}
              </p>
            </div>
          )}
        </div>
        {call.error === null ? null : (
          <InlineActionError
            dataAttribute="data-dialog-error"
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
            Cancel
          </Button>
          <ReviewButton
            variant="default"
            pending={call.pending}
            pendingLabel={SAVING}
            gatedReason={trimmed.length === 0 ? NOTE_REQUIRED : null}
            onPress={() => void confirm()}
            data-mark-done-submit="true"
          >
            {MARK_DONE}
          </ReviewButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
