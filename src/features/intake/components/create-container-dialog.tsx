"use client";

import { useId, useState, type ReactElement } from "react";
import { CircleAlert } from "lucide-react";

import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertTitle } from "@/components/ui/alert";
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
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

/**
 * `CreateContainerDialog` — E-2's inline **Create a container** on step 3
 * (`UX_SPEC.md` E-2, §3.9).
 *
 * The one thing the reader supplies is where the container stands; the type
 * comes from `requiredContainerType` on the server, the zone from the
 * organisation, the status is `open`. **The intake draft is never discarded
 * to go and create a container** — the dialog opens over step 3 and returns
 * to it with the new container selected (the caller does the selecting).
 *
 * The dialog waits for the action and shows its message; nothing is
 * rendered as created before the server says so.
 */

export interface CreateContainerDialogProps {
  readonly onCreate: (input: {
    readonly storageLocation: string;
  }) => Promise<ActionResult<{ readonly id: string }>>;
  /** Called after the server confirms, with the new container's id. */
  readonly onCreated: (id: string) => void | Promise<void>;
  /** The type the server will assign, for the reader's information. */
  readonly requiredTypeLabel: string | null;
  readonly className?: string;
}

export function CreateContainerDialog({
  onCreate,
  onCreated,
  requiredTypeLabel,
  className,
}: CreateContainerDialogProps): ReactElement {
  const inputId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [storageLocation, setStorageLocation] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = storageLocation.trim().length > 0 && !isPending;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await onCreate({
        storageLocation: storageLocation.trim(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setIsOpen(false);
      setStorageLocation("");
      await onCreated(result.data.id);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="default"
          size="lg"
          data-create-container="true"
          className={cn(ACTION_BUTTON_CLASS, className)}
        >
          Create a container
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-lg" data-create-container-dialog="true">
        <DialogHeader>
          <DialogTitle className="text-h2">Create a container</DialogTitle>
          <DialogDescription className="text-body">
            {requiredTypeLabel === null
              ? "A new, open container at this site. The storage clock starts when the first battery goes into it."
              : `A new, open container for ${requiredTypeLabel} at this site. The storage clock starts when the first battery goes into it.`}
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
              Storage location
            </Label>
            <Input
              id={inputId}
              name="storageLocation"
              value={storageLocation}
              autoComplete="off"
              placeholder="Bay 3, rack B"
              aria-invalid={error === null ? undefined : "true"}
              onChange={(event) =>
                setStorageLocation(event.currentTarget.value)
              }
              className="min-h-11 rounded-md text-body"
            />
          </div>

          {error !== null ? (
            <Alert
              role="alert"
              className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
            >
              <CircleAlert aria-hidden="true" />
              <AlertTitle className="text-body-strong">{error}</AlertTitle>
            </Alert>
          ) : null}

          <DialogFooter className="rounded-b-lg">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setIsOpen(false)}
              className={ACTION_BUTTON_CLASS}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="lg"
              aria-disabled={canSubmit ? undefined : "true"}
              aria-busy={isPending ? "true" : undefined}
              data-create-container-submit="true"
              className={cn(ACTION_BUTTON_CLASS, !canSubmit && "opacity-60")}
            >
              {isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
