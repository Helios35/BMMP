"use client";

import { useState, type ReactElement } from "react";
import { CircleAlert, PackageOpen } from "lucide-react";

import { ACTION_BUTTON_CLASS } from "@/components/page";
import { StatusBadge } from "@/components/status/status-badge";
import {
  INTENT_SURFACE_CLASSES,
  INTENT_TEXT_CLASSES,
} from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { PlacementAdmission } from "@/domain/storage/placement";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import { CreateContainerDialog } from "./create-container-dialog";

/**
 * `ContainerPicker` — step 3's *Place into a container* (`UX_SPEC.md` §3.9,
 * E-2; Rules 4.4, 4.16, 4.28).
 *
 * A `Command` list of the site's containers, each with its code, type,
 * location, fill and clock tier. **A container this record may not enter is
 * rendered, `aria-disabled`, with the stated reason — never hidden.** The
 * reason is `admitToContainer`'s own message, resolved server-side and
 * passed in as `admission`, so the row says exactly what the commit would
 * refuse with: an overdue container accepts no new items (Rule 4.16), a
 * segregation mismatch is the placement being wrong (Rule 4.28). A handler
 * standing next to a drum learns why it is not on offer instead of wondering
 * where it went.
 *
 * **Selection is not optimistic.** `onSelect` is the `choosePlacement`
 * action; the highlighted row is the `selectedId` the server re-rendered
 * with, and a failure is shown, not swallowed.
 *
 * ## E-2, zero containers
 *
 * The picker is replaced by the hard-block alert with E-2's sentence. P1/P6
 * get **Create a container** inline; other roles get the names of who can.
 * After a create the picker calls `onSelect` with the new id so the flow
 * returns to step 3 with it chosen — the draft is never discarded to go and
 * create one.
 */

export interface ContainerPickerRow {
  readonly id: string;
  /** `C-0001`. Mono. */
  readonly code: string;
  /** From `CONTAINER_TYPE_LABELS`. */
  readonly typeLabel: string;
  readonly location: string | null;
  /** Already composed — *"3 of 12"*, *"Empty"*. The picker adds no arithmetic. */
  readonly fillText: string | null;
  /** From `STORAGE_CLOCK_ALERT_BAND_LABELS`, or `null` when no clock runs. */
  readonly clockTier: string | null;
  /** T-24 as stored. */
  readonly status: string;
  readonly admission: PlacementAdmission;
}

export interface ContainerPickerProps {
  readonly containers: readonly ContainerPickerRow[];
  readonly selectedId: string | null;
  /** `choosePlacement`. `null` clears the placement (unplaced intake). */
  readonly onSelect: (id: string | null) => Promise<ActionResult<unknown>>;
  /** P1/P6 — the roles that may create a container from here. */
  readonly canCreate: boolean;
  /** *"A Facility Manager or a Platform Admin can create one."* — for every other role. */
  readonly whoCanCreate: string;
  readonly onCreate: (input: {
    readonly storageLocation: string;
  }) => Promise<ActionResult<{ readonly id: string }>>;
  /** What this record needs, from `requiredContainerType` — `null` while undetermined. */
  readonly requiredTypeLabel: string | null;
  readonly className?: string;
}

export const ZERO_CONTAINERS_COPY =
  "You need a container before you can log a battery — the storage clock starts when the battery goes into one.";

export function ContainerPicker({
  containers,
  selectedId,
  onSelect,
  canCreate,
  whoCanCreate,
  onCreate,
  requiredTypeLabel,
  className,
}: ContainerPickerProps): ReactElement {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(id: string | null): Promise<void> {
    if (pendingId !== null) return;
    setPendingId(id ?? "none");
    setError(null);
    try {
      const result = await onSelect(id);
      if (!result.ok) setError(result.error.message);
    } finally {
      setPendingId(null);
    }
  }

  const createControl = canCreate ? (
    <CreateContainerDialog
      onCreate={onCreate}
      onCreated={(id) => choose(id)}
      requiredTypeLabel={requiredTypeLabel}
    />
  ) : (
    <p data-who-can-create="true" className="max-w-[72ch] text-body">
      {whoCanCreate}
    </p>
  );

  if (containers.length === 0) {
    return (
      <div
        data-container-picker="true"
        data-container-picker-state="empty"
        className={cn("flex flex-col gap-4", className)}
      >
        <Alert
          role="alert"
          data-zero-containers="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
        >
          <PackageOpen aria-hidden="true" />
          <AlertTitle className="text-body-strong">
            {ZERO_CONTAINERS_COPY}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 text-current">
            {requiredTypeLabel !== null ? (
              <span className="text-body">
                {`This record needs ${requiredTypeLabel}.`}
              </span>
            ) : null}
            {createControl}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div
      data-container-picker="true"
      data-container-picker-state="default"
      data-selected-container={selectedId ?? undefined}
      className={cn("flex flex-col gap-4", className)}
    >
      {requiredTypeLabel !== null ? (
        <p data-required-container-type="true" className="text-body">
          {`This record needs ${requiredTypeLabel}.`}
        </p>
      ) : null}

      <Command
        label="Containers"
        // Rows filter on their code and location only; a reason or a type
        // label is not something a person searches for.
        className="rounded-lg border border-border bg-background text-foreground"
      >
        <CommandInput
          placeholder="Search containers"
          aria-label="Search containers"
        />
        <CommandList className="max-h-none">
          <CommandEmpty className="text-body">
            No container matches that search.
          </CommandEmpty>
          {containers.map((row) => {
            const admissible = row.admission.ok;
            const isSelected = row.id === selectedId;
            const isPending = row.id === pendingId;
            return (
              <CommandItem
                key={row.id}
                value={`${row.code} ${row.location ?? ""}`}
                data-container-row={row.id}
                data-admission={row.admission.ok ? "ok" : row.admission.reason}
                data-selected-row={isSelected ? "true" : "false"}
                aria-selected={isSelected}
                // cmdk renders a `div` option and writes `aria-disabled` from
                // this prop; no HTML `disabled` attribute is involved, and
                // the row stays in the DOM with its reason (§2.9).
                disabled={!admissible}
                aria-busy={isPending ? "true" : undefined}
                onSelect={() => {
                  if (!admissible) return;
                  void choose(row.id);
                }}
                className={cn(
                  "min-h-11 flex-col items-start gap-1 rounded-md px-3 py-2",
                  isSelected && "border border-primary",
                  !admissible && "opacity-60",
                )}
              >
                <div className="flex w-full flex-wrap items-center gap-2">
                  <span className="text-mono">{row.code}</span>
                  <span className="text-body-strong">{row.typeLabel}</span>
                  <StatusBadge
                    system="container_status"
                    value={row.status}
                    size="sm"
                  />
                  {isSelected ? (
                    <span className="text-caption">Selected</span>
                  ) : null}
                  {isPending ? (
                    <span className="text-caption">Choosing…</span>
                  ) : null}
                </div>
                <div className="flex w-full flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                  {row.location !== null ? <span>{row.location}</span> : null}
                  {row.fillText !== null ? <span>{row.fillText}</span> : null}
                  {row.clockTier !== null ? <span>{row.clockTier}</span> : null}
                </div>
                {row.admission.ok ? null : (
                  <span
                    data-admission-reason="true"
                    className={cn(
                      "flex items-start gap-2 text-caption",
                      INTENT_TEXT_CLASSES.critical,
                    )}
                  >
                    <CircleAlert
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    <span>{row.admission.message}</span>
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandList>
      </Command>

      {error !== null ? (
        <Alert
          role="alert"
          data-container-picker-error="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">{error}</AlertTitle>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {selectedId !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            data-clear-container="true"
            onClick={() => void choose(null)}
            className={ACTION_BUTTON_CLASS}
          >
            Clear selection
          </Button>
        ) : null}
        {createControl}
      </div>
    </div>
  );
}
