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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { addProduct, changeProductStates } from "../actions";
import {
  ADD_PRODUCT,
  ADDING,
  CHOOSE_ENTRY,
  CHOOSE_STATES,
  EDIT_STATES,
  ENTRY_PLACEHOLDER,
  NO_ENTRIES_LEFT,
  SAVING,
} from "../obligation-copy";
import { StatePicker } from "./state-picker";

/**
 * **Add product** and **Edit states** — Rule 8.6; `UX_SPEC.md` §3.21. A
 * product is a **published** catalog entry; its facts are the entry's, never
 * typed here. Saving sets a run going (Rule 8.11), so the page that comes back
 * already shows the product's band in each state.
 */

export interface StateOption {
  readonly value: string;
  readonly label: string;
  readonly code: string;
}

export function AddProductDialog({
  entryOptions,
  stateOptions,
}: {
  readonly entryOptions: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly stateOptions: readonly StateOption[];
}): ReactElement {
  const router = useRouter();
  const call = useActionCall();
  const entryId = useId();
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState("");
  const [states, setStates] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const gated =
    entry === ""
      ? "Choose a catalog entry."
      : states.size === 0
        ? "Choose at least one state it is sold in."
        : null;

  async function confirm(): Promise<void> {
    if (gated !== null) return;
    let checkNote: string | null = null;
    const result = await call.run(async () => {
      const added = await addProduct({
        catalogEntryId: entry,
        jurisdictionIds: [...states],
      });
      if (added.ok) checkNote = added.data.note;
      return added;
    });
    if (result?.ok === true) {
      setNote(checkNote);
      setOpen(false);
      setEntry("");
      setStates(new Set());
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <Button
          type="button"
          variant="default"
          size="lg"
          className={ACTION_BUTTON_CLASS}
          onClick={() => setOpen(true)}
          data-add-product="true"
        >
          {ADD_PRODUCT}
        </Button>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg"
          data-add-product-dialog="true"
        >
          <DialogHeader>
            <DialogTitle className="text-h2">{ADD_PRODUCT}</DialogTitle>
            <DialogDescription className="text-body">
              A published catalog entry you are the producer of, and the states
              you sell it in. Its chemistry, weight, energy and removability
              come from the catalog.
            </DialogDescription>
          </DialogHeader>
          {entryOptions.length === 0 ? (
            <p className="text-body text-muted-foreground">{NO_ENTRIES_LEFT}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={entryId} className="text-label text-foreground">
                  {CHOOSE_ENTRY}
                </Label>
                <Select value={entry} onValueChange={setEntry}>
                  <SelectTrigger
                    id={entryId}
                    className="min-h-11 w-full rounded-md text-body"
                    data-add-product-entry="true"
                  >
                    <SelectValue placeholder={ENTRY_PLACEHOLDER} />
                  </SelectTrigger>
                  <SelectContent>
                    {entryOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="min-h-11"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <StatePicker
                options={stateOptions}
                selected={states}
                onChange={setStates}
                label={CHOOSE_STATES}
              />
            </div>
          )}
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
              pendingLabel={ADDING}
              gatedReason={gated}
              onPress={() => void confirm()}
              data-add-product-submit="true"
            >
              {ADD_PRODUCT}
            </ReviewButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {note === null ? null : (
        <InlineActionError
          dataAttribute="data-product-check-note"
          message={note}
        />
      )}
    </div>
  );
}

export function EditStatesDialog({
  productId,
  productLabel,
  stateOptions,
  current,
}: {
  readonly productId: string;
  readonly productLabel: string;
  readonly stateOptions: readonly StateOption[];
  readonly current: readonly string[];
}): ReactElement {
  const router = useRouter();
  const call = useActionCall();
  const [open, setOpen] = useState(false);
  const [states, setStates] = useState<ReadonlySet<string>>(new Set(current));
  const [note, setNote] = useState<string | null>(null);

  const gated =
    states.size === 0 ? "Choose at least one state it is sold in." : null;

  async function confirm(): Promise<void> {
    if (gated !== null) return;
    let checkNote: string | null = null;
    const result = await call.run(async () => {
      const changed = await changeProductStates({
        productId,
        jurisdictionIds: [...states],
      });
      if (changed.ok) checkNote = changed.data.note;
      return changed;
    });
    if (result?.ok === true) {
      setNote(checkNote);
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setStates(new Set(current));
          setOpen(next);
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="lg"
          className={ACTION_BUTTON_CLASS}
          onClick={() => {
            setStates(new Set(current));
            setOpen(true);
          }}
          data-edit-states={productId}
        >
          {EDIT_STATES}
        </Button>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg"
          data-edit-states-dialog={productId}
        >
          <DialogHeader>
            <DialogTitle className="text-h2">{EDIT_STATES}</DialogTitle>
            <DialogDescription className="text-body">
              Where {productLabel} is sold, offered for sale or distributed.
            </DialogDescription>
          </DialogHeader>
          <StatePicker
            options={stateOptions}
            selected={states}
            onChange={setStates}
            label={CHOOSE_STATES}
          />
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
              gatedReason={gated}
              onPress={() => void confirm()}
              data-edit-states-submit="true"
            >
              {EDIT_STATES}
            </ReviewButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {note === null ? null : (
        <InlineActionError
          dataAttribute="data-product-check-note"
          message={note}
        />
      )}
    </div>
  );
}
