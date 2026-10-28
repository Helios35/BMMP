"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactElement } from "react";

import {
  InlineActionError,
  ReviewButton,
  useActionCall,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LotStatus } from "@/domain/taxonomy/lot-status";

import { changeLotMembership, changeLotStatus, openLot } from "../actions";
import {
  ADD_TO_LOT,
  ADD_TO_LOT_CHOOSE,
  ADD_TO_LOT_LABEL,
  ADD_TO_NEW_LOT,
  ADDING_TO_LOT,
  CANCEL,
  CLOSE_LOT,
  CLOSING_LOT,
  DISSOLVE_LOT,
  DISSOLVE_LOT_BODY,
  DISSOLVE_LOT_CONFIRM,
  DISSOLVE_LOT_TITLE,
  DISSOLVING_LOT,
  NEW_LOT,
  NEW_LOT_BODY,
  NEW_LOT_CONFIRM,
  NEW_LOT_CONFIRMING,
  NEW_LOT_DESCRIPTION_LABEL,
  NEW_LOT_TITLE,
  REMOVE_FROM_LOT,
  REMOVING_FROM_LOT,
  REOPEN_LOT,
  REOPENING_LOT,
} from "../container-copy";

/**
 * The lot controls — T-25; the owner's call in `b1a-08` puts them on
 * `/containers` (the Lots view) and `/containers/[id]`, because a lot has no
 * route of its own. Rendered only for P1 and P6 — the route decides from
 * `mayTakeContainerAction(role, "manage_lot")` — and every one goes to a
 * Server Action that asks again. **Each refusal renders beside the control
 * that asked**, never instead of the page.
 */

/** **New lot** — the Lots view's primary action. It opens empty. */
export function NewLotAction(): ReactElement {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const call = useActionCall();

  async function submit(): Promise<void> {
    const result = await call.run(() =>
      openLot({
        description: description.trim() === "" ? null : description.trim(),
        containerId: null,
      }),
    );
    if (result?.ok === true) {
      setOpen(false);
      setDescription("");
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="lg"
          data-new-lot="true"
          className={ACTION_BUTTON_CLASS}
        >
          {NEW_LOT}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg"
        data-new-lot-dialog="true"
      >
        <DialogHeader>
          <DialogTitle className="text-h2">{NEW_LOT_TITLE}</DialogTitle>
          <DialogDescription className="text-body">
            {NEW_LOT_BODY}
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
            <Label htmlFor={inputId} className="text-label text-foreground">
              {NEW_LOT_DESCRIPTION_LABEL}
            </Label>
            <Input
              id={inputId}
              name="lotDescription"
              value={description}
              autoComplete="off"
              data-new-lot-description="true"
              onChange={(event) => setDescription(event.currentTarget.value)}
              className="min-h-11 rounded-md text-body"
            />
          </div>
          {call.error === null ? null : (
            <InlineActionError
              dataAttribute="data-new-lot-error"
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
              pendingLabel={NEW_LOT_CONFIRMING}
              onPress={() => void submit()}
              data-new-lot-submit="true"
            >
              {NEW_LOT_CONFIRM}
            </ReviewButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One lot's moves (T-25): **Close** an open lot to fix its membership,
 * **Reopen** a closed one, **Dissolve** either — confirmed first, because a
 * dissolved lot is final. A lot on a shipment, shipped or dissolved has no
 * move a person makes, so nothing renders.
 */
export function LotRowActions({
  lotId,
  lotCode,
  status,
}: {
  readonly lotId: string;
  readonly lotCode: string;
  readonly status: LotStatus;
}): ReactElement | null {
  const router = useRouter();
  const close = useActionCall();
  const reopen = useActionCall();
  const dissolve = useActionCall();
  const [confirming, setConfirming] = useState(false);

  if (status !== "open" && status !== "closed") return null;

  async function move(
    call: ReturnType<typeof useActionCall>,
    to: "closed" | "open" | "dissolved",
  ): Promise<void> {
    const result = await call.run(() => changeLotStatus({ lotId, status: to }));
    if (result?.ok === true) {
      setConfirming(false);
      router.refresh();
    }
  }

  const error = close.error ?? reopen.error ?? dissolve.error;
  return (
    <div data-lot-actions={lotCode} className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "open" ? (
          <ReviewButton
            variant="outline"
            pending={close.pending}
            pendingLabel={CLOSING_LOT}
            onPress={() => void move(close, "closed")}
            data-lot-close={lotCode}
          >
            {CLOSE_LOT}
          </ReviewButton>
        ) : (
          <ReviewButton
            variant="outline"
            pending={reopen.pending}
            pendingLabel={REOPENING_LOT}
            onPress={() => void move(reopen, "open")}
            data-lot-reopen={lotCode}
          >
            {REOPEN_LOT}
          </ReviewButton>
        )}
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              data-lot-dissolve={lotCode}
              className={ACTION_BUTTON_CLASS}
            >
              {DISSOLVE_LOT}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent data-lot-dissolve-dialog={lotCode}>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-h2">
                {DISSOLVE_LOT_TITLE}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-body">
                {DISSOLVE_LOT_BODY}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {dissolve.error === null ? null : (
              <InlineActionError
                dataAttribute="data-lot-dissolve-error"
                message={dissolve.error}
              />
            )}
            <AlertDialogFooter>
              <AlertDialogCancel className={ACTION_BUTTON_CLASS}>
                {CANCEL}
              </AlertDialogCancel>
              <ReviewButton
                variant="destructive"
                pending={dissolve.pending}
                pendingLabel={DISSOLVING_LOT}
                onPress={() => void move(dissolve, "dissolved")}
                data-lot-dissolve-confirm={lotCode}
              >
                {DISSOLVE_LOT_CONFIRM}
              </ReviewButton>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error === null || dissolve.error !== null ? null : (
        <InlineActionError dataAttribute="data-lot-error" message={error} />
      )}
    </div>
  );
}

/**
 * `/containers/[id]`'s lot control: **Add to a lot** — an open one, or a new
 * one started with this container — or **Remove from lot** while the lot is
 * open (T-25). A container is in one lot at a time.
 */
export function ContainerLotControl({
  containerId,
  lot,
  openLots,
}: {
  readonly containerId: string;
  readonly lot: {
    readonly id: string;
    readonly lotCode: string;
    readonly status: LotStatus;
  } | null;
  readonly openLots: readonly {
    readonly id: string;
    readonly lotCode: string;
    readonly description: string | null;
  }[];
}): ReactElement | null {
  const router = useRouter();
  const selectId = useId();
  const [choice, setChoice] = useState("");
  const add = useActionCall();
  const remove = useActionCall();

  if (lot !== null) {
    if (lot.status !== "open") return null;
    return (
      <div className="flex flex-col items-start gap-2">
        <ReviewButton
          variant="outline"
          pending={remove.pending}
          pendingLabel={REMOVING_FROM_LOT}
          onPress={() =>
            void remove
              .run(() =>
                changeLotMembership({
                  lotId: lot.id,
                  containerId,
                  change: "leave",
                }),
              )
              .then((result) => {
                if (result?.ok === true) router.refresh();
              })
          }
          data-remove-from-lot={lot.lotCode}
        >
          {REMOVE_FROM_LOT}
        </ReviewButton>
        {remove.error === null ? null : (
          <InlineActionError
            dataAttribute="data-lot-membership-error"
            message={remove.error}
          />
        )}
      </div>
    );
  }

  const NEW = "new";
  async function submit(): Promise<void> {
    if (choice === "") return;
    const result = await add.run(() =>
      choice === NEW
        ? openLot({ description: null, containerId })
        : changeLotMembership({ lotId: choice, containerId, change: "join" }),
    );
    if (result?.ok === true) {
      setChoice("");
      router.refresh();
    }
  }

  return (
    <div
      data-container-lot-control="true"
      className="flex flex-col gap-2 sm:max-w-md"
    >
      <Label htmlFor={selectId} className="text-label text-foreground">
        {ADD_TO_LOT_LABEL}
      </Label>
      <Select value={choice} onValueChange={setChoice}>
        <SelectTrigger
          id={selectId}
          data-add-to-lot-trigger="true"
          className="min-h-11 w-full rounded-md text-body"
        >
          <SelectValue placeholder={ADD_TO_LOT_CHOOSE} />
        </SelectTrigger>
        <SelectContent className="rounded-lg">
          {openLots.map((open) => (
            <SelectItem
              key={open.id}
              value={open.id}
              data-add-to-lot-option={open.lotCode}
              className="min-h-11 rounded-md text-body"
            >
              {open.description === null
                ? open.lotCode
                : `${open.lotCode} — ${open.description}`}
            </SelectItem>
          ))}
          <SelectItem
            value={NEW}
            data-add-to-lot-option="new"
            className="min-h-11 rounded-md text-body"
          >
            {ADD_TO_NEW_LOT}
          </SelectItem>
        </SelectContent>
      </Select>
      <div>
        <ReviewButton
          variant="outline"
          pending={add.pending}
          pendingLabel={ADDING_TO_LOT}
          gatedReason={choice === "" ? ADD_TO_LOT_CHOOSE : null}
          onPress={() => void submit()}
          data-add-to-lot="true"
        >
          {ADD_TO_LOT}
        </ReviewButton>
      </div>
      {add.error === null ? null : (
        <InlineActionError
          dataAttribute="data-lot-membership-error"
          message={add.error}
        />
      )}
    </div>
  );
}
