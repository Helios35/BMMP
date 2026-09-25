"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactElement } from "react";
import { toast } from "sonner";

import { ReasonDialog } from "@/components/extraction-review/reason-dialog";
import { InlineActionError } from "@/components/extraction-review/review-controls";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import {
  editContainerDetails,
  markReadyToShip,
  recordInspection,
  recordRemediation,
  retireContainer,
} from "../actions";
import {
  EDIT_DETAILS,
  MARK_READY_TO_SHIP,
  RECORD_REMEDIATION,
  RECORD_STORAGE_EVENT,
  REMEDIATION_BODY,
  REMEDIATION_REASON_LABEL,
  REMEDIATION_REASON_REQUIRED,
  REMEDIATION_TITLE,
  RETIRE_CONTAINER,
  STORAGE_EVENT_BODY,
  STORAGE_EVENT_TITLE,
} from "../container-copy";

/**
 * The container's writes that are not moves — `UX_SPEC.md` §3.10;
 * `SITE_ARCHITECTURE.md` §5.5, Flow C4.
 *
 * **What renders is decided on the server** from the §5.5 map and passed in as
 * booleans; this island decides nothing about access. A refused action still
 * fails on the server with its stated reason (the map is read there too).
 *
 * **There is no re-date, pause, hold, extend or snooze control here, for any
 * role** — they do not exist, so there is nothing to disable (Rules 4.6,
 * 4.9–4.12; E-6).
 */

export interface ContainerActionsProps {
  readonly containerId: string;
  readonly containerCode: string;
  readonly siteTimeZone: string;
  /** `YYYY-MM-DDTHH:mm` — now, as the site's wall clock reads it. */
  readonly siteNow: string;
  readonly storageLocation: string | null;
  readonly capacityKg: string | null;
  readonly can: {
    readonly recordStorageEvent: boolean;
    /** P2/P6, and only while the container is overdue (Rule 4.17). */
    readonly recordRemediation: boolean;
    readonly markReadyToShip: boolean;
    readonly editDetails: boolean;
    /** P2/P6, and only an empty container whose clock has closed (Rule 4.30). */
    readonly retire: boolean;
  };
  /** `?dialog=storage-event` — §3.8b's **Record a storage event** from `/review`. */
  readonly openStorageEvent: boolean;
}

export function ContainerActions(
  props: ContainerActionsProps,
): ReactElement | null {
  const { can } = props;
  if (
    !can.recordStorageEvent &&
    !can.recordRemediation &&
    !can.markReadyToShip &&
    !can.editDetails &&
    !can.retire
  ) {
    return null;
  }
  return (
    <div
      data-container-actions="true"
      className="flex flex-wrap items-center gap-2"
    >
      {can.recordStorageEvent ? <StorageEventDialog {...props} /> : null}
      {can.recordRemediation ? <RemediationDialog {...props} /> : null}
      {can.markReadyToShip ? <MarkReadyToShip {...props} /> : null}
      {can.editDetails ? <EditDetailsDialog {...props} /> : null}
      {can.retire ? <RetireDialog {...props} /> : null}
    </div>
  );
}

/** Run an action, toast on success, refresh the server render; the error stays in the dialog. */
function useContainerWrite() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(
    action: () => Promise<ActionResult<unknown>>,
    success: string,
  ): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  }
  return { pending, error, setError, run };
}

/**
 * §3.10's storage-event dialog — event type, note, timestamp. **Inspect is
 * the one type offered**: which other handling activities a handler may
 * perform is jurisdiction data (Rule 3.21) and none is carried yet, so the
 * rest are not offered rather than offered and argued with. Moves have their
 * own dialog on Contents; a remediation has its own.
 */
function StorageEventDialog({
  containerId,
  containerCode,
  siteTimeZone,
  siteNow,
  openStorageEvent,
}: ContainerActionsProps): ReactElement {
  const [open, setOpen] = useState(openStorageEvent);
  const [occurredAt, setOccurredAt] = useState(siteNow);
  const [note, setNote] = useState("");
  const write = useContainerWrite();
  const whenId = useId();
  const noteId = useId();

  async function submit(): Promise<void> {
    const done = await write.run(
      () =>
        recordInspection({
          containerId,
          occurredAt,
          note: note.trim() === "" ? null : note.trim(),
        }),
      `Inspection recorded on ${containerCode}`,
    );
    if (done) {
      setOpen(false);
      setNote("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          data-record-storage-event="true"
          className={ACTION_BUTTON_CLASS}
        >
          {RECORD_STORAGE_EVENT}
        </Button>
      </DialogTrigger>
      <DialogContent
        data-storage-event-dialog="true"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-h2">{STORAGE_EVENT_TITLE}</DialogTitle>
          <DialogDescription className="text-body">
            {STORAGE_EVENT_BODY}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-label">Event type</span>
            {/* T-16 through its lookup would be one option; stated as text
                rather than a one-item select that pretends to be a choice. */}
            <span data-storage-event-type="inspect" className="text-body">
              Inspect
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={whenId} className="text-label text-foreground">
              {`When (site time, ${siteTimeZone})`}
            </Label>
            <Input
              id={whenId}
              type="datetime-local"
              value={occurredAt}
              max={siteNow}
              onChange={(event) => setOccurredAt(event.currentTarget.value)}
              className="min-h-11 rounded-md text-body"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={noteId} className="text-label text-foreground">
              Note
            </Label>
            <Textarea
              id={noteId}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              className="min-h-24 rounded-md text-body"
            />
          </div>
          {write.error !== null ? (
            <InlineActionError message={write.error} />
          ) : null}
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
            <Button
              type="submit"
              size="lg"
              data-storage-event-submit="true"
              aria-busy={write.pending ? "true" : undefined}
              className={ACTION_BUTTON_CLASS}
            >
              {write.pending ? "Recording…" : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * **Record a remediation** — P2 or P6, overdue only, an `AlertDialog` with a
 * typed statement (Rule 4.17). It changes no date and no status.
 */
function RemediationDialog({
  containerId,
  containerCode,
}: ContainerActionsProps): ReactElement {
  const router = useRouter();
  return (
    <ReasonDialog
      tone="affirmative"
      copy={{
        trigger: RECORD_REMEDIATION,
        title: REMEDIATION_TITLE,
        body: REMEDIATION_BODY,
        reasonLabel: REMEDIATION_REASON_LABEL,
        reasonRequired: REMEDIATION_REASON_REQUIRED,
        confirm: "Record remediation",
        confirming: "Recording…",
        cancel: "Cancel",
      }}
      onSubmit={async (statement) => {
        const result = await recordRemediation({ containerId, statement });
        if (result.ok) {
          toast.success(`Remediation recorded on ${containerCode}`, {
            description:
              "The statement is on the container's history. Its start date is unchanged.",
          });
          router.refresh();
        }
        return result;
      }}
      attributes={{
        trigger: { "data-record-remediation": "true" },
        dialog: { "data-remediation-dialog": "true" },
        reason: { "data-remediation-statement": "true" },
        confirm: { "data-remediation-confirm": "true" },
      }}
    />
  );
}

/** **Mark ready to ship** — T-24 `closed`: sealed, and the clock keeps counting (Rule 4.6). */
function MarkReadyToShip({
  containerId,
  containerCode,
}: ContainerActionsProps): ReactElement {
  const write = useContainerWrite();
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          data-mark-ready-to-ship="true"
          className={ACTION_BUTTON_CLASS}
        >
          {MARK_READY_TO_SHIP}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-h2">
            {`Mark ${containerCode} ready to ship?`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            The container is sealed and takes nothing more. Its storage clock
            keeps counting until the contents leave on a shipment.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {write.error !== null ? (
          <InlineActionError message={write.error} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className={ACTION_BUTTON_CLASS}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            data-mark-ready-confirm="true"
            aria-busy={write.pending ? "true" : undefined}
            className={ACTION_BUTTON_CLASS}
            onClick={(event) => {
              event.preventDefault();
              void write
                .run(
                  () => markReadyToShip({ containerId }),
                  `${containerCode} marked ready to ship`,
                )
                .then((done) => {
                  if (done) setOpen(false);
                });
            }}
          >
            {MARK_READY_TO_SHIP}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Capacity and location — P2 and P6 (§5.5). Neither moves a date. */
function EditDetailsDialog({
  containerId,
  containerCode,
  storageLocation,
  capacityKg,
}: ContainerActionsProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState(storageLocation ?? "");
  const [capacity, setCapacity] = useState(capacityKg ?? "");
  const write = useContainerWrite();
  const locationId = useId();
  const capacityId = useId();

  async function submit(): Promise<void> {
    const done = await write.run(
      () =>
        editContainerDetails({
          containerId,
          storageLocation: location,
          capacityKg: capacity.trim() === "" ? null : capacity.trim(),
        }),
      `${containerCode} updated`,
    );
    if (done) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          data-edit-container="true"
          className={ACTION_BUTTON_CLASS}
        >
          {EDIT_DETAILS}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-h2">{EDIT_DETAILS}</DialogTitle>
          <DialogDescription className="text-body">
            Where the container stands and how much it holds. Neither changes
            its accumulation start date.
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
            <Label htmlFor={locationId} className="text-label text-foreground">
              Storage location
            </Label>
            <Input
              id={locationId}
              value={location}
              onChange={(event) => setLocation(event.currentTarget.value)}
              className="min-h-11 rounded-md text-body"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={capacityId} className="text-label text-foreground">
              Capacity (kg)
            </Label>
            <Input
              id={capacityId}
              inputMode="decimal"
              value={capacity}
              onChange={(event) => setCapacity(event.currentTarget.value)}
              className="min-h-11 rounded-md text-body"
            />
          </div>
          {write.error !== null ? (
            <InlineActionError message={write.error} />
          ) : null}
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
            <Button
              type="submit"
              size="lg"
              aria-busy={write.pending ? "true" : undefined}
              className={ACTION_BUTTON_CLASS}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Retire — terminal, so it confirms (Rule 4.30). A container is never deleted. */
function RetireDialog({
  containerId,
  containerCode,
}: ContainerActionsProps): ReactElement {
  const write = useContainerWrite();
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          data-retire-container="true"
          className={ACTION_BUTTON_CLASS}
        >
          {RETIRE_CONTAINER}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-h2">
            {`Retire ${containerCode}?`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            A retired container is out of service for good. It is kept, with its
            clock and its history, and is never reused.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {write.error !== null ? (
          <InlineActionError message={write.error} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className={ACTION_BUTTON_CLASS}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            aria-busy={write.pending ? "true" : undefined}
            className={cn(ACTION_BUTTON_CLASS)}
            onClick={(event) => {
              event.preventDefault();
              void write
                .run(
                  () => retireContainer({ containerId }),
                  `${containerCode} retired`,
                )
                .then((done) => {
                  if (done) setOpen(false);
                });
            }}
          >
            {RETIRE_CONTAINER}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
