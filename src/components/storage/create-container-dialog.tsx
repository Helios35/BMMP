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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    /** Set when {@link CreateContainerDialogProps.typeOptions} asked for one. */
    readonly containerType?: string;
  }) => Promise<ActionResult<{ readonly id: string }>>;
  /** Called after the server confirms, with the new container's id. */
  readonly onCreated: (id: string) => void | Promise<void>;
  /** The type the server will assign, for the reader's information. */
  readonly requiredTypeLabel: string | null;
  /**
   * T-23's options, in its own order, where the reader chooses the type —
   * `/containers`' **New container** (§3.9). Absent on intake, where the
   * server assigns the one type the record needs.
   */
  readonly typeOptions?: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  /** Default *"Create a container"* (E-2). */
  readonly triggerLabel?: string;
  readonly className?: string;
}

export function CreateContainerDialog({
  onCreate,
  onCreated,
  requiredTypeLabel,
  typeOptions,
  triggerLabel = "Create a container",
  className,
}: CreateContainerDialogProps): ReactElement {
  const inputId = useId();
  const typeId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [storageLocation, setStorageLocation] = useState("");
  const [containerType, setContainerType] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choosesType = typeOptions !== undefined;
  const canSubmit =
    storageLocation.trim().length > 0 &&
    (!choosesType || containerType !== "") &&
    !isPending;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await onCreate({
        storageLocation: storageLocation.trim(),
        ...(choosesType ? { containerType } : {}),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setIsOpen(false);
      setStorageLocation("");
      setContainerType("");
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
          {triggerLabel}
        </Button>
      </DialogTrigger>
      {/* Capped to the viewport and scrolling, so the footer is reachable
          however short the viewport (§2.6). The 2rem is the primitive's own
          inset. */}
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg"
        data-create-container-dialog="true"
      >
        <DialogHeader>
          <DialogTitle className="text-h2">{triggerLabel}</DialogTitle>
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
          {typeOptions === undefined ? null : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={typeId} className="text-label text-foreground">
                What it will hold
              </Label>
              <Select value={containerType} onValueChange={setContainerType}>
                <SelectTrigger
                  id={typeId}
                  data-create-container-type="true"
                  className="min-h-11 w-full rounded-md text-body"
                >
                  <SelectValue placeholder="Choose a segregation class" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((option) => (
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
              <p className="max-w-[72ch] text-caption text-muted-foreground">
                A container holds one class, and it cannot change once the
                container holds anything.
              </p>
            </div>
          )}

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
