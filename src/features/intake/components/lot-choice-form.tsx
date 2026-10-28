"use client";

import { useId, useState, type ReactElement } from "react";

import { InlineActionError } from "@/components/extraction-review";
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
import type { DraftLotChoice } from "@/types/intake";

import { useSyncedText } from "./state-of-charge-form";

/**
 * Step A4's lot — `SITE_ARCHITECTURE.md` A4; `UX_SPEC.md` §3.6 "Container or
 * lot assignment"; T-25.
 *
 * **A lot holds containers** (`ERD.md` §6.2; the owner's call in `b1a-08`), so
 * this is a choice about the container the battery goes into: it joins an
 * open lot, starts a new one, or keeps its grouping. A container already in a
 * lot keeps it — a container is in one lot at a time — and the form says so
 * rather than offering a choice it would refuse. Nothing is written until the
 * record commits, and the commit re-checks the lot is still open.
 */

export interface LotPlacementView {
  /** The chosen container's code, or null before one is chosen. */
  readonly containerCode: string | null;
  /** The lot the chosen container is already in, which it keeps. */
  readonly containerLot: {
    readonly lotCode: string;
    readonly statusLabel: string;
  } | null;
  readonly openLots: readonly {
    readonly id: string;
    readonly lotCode: string;
    readonly description: string | null;
  }[];
  readonly choice: DraftLotChoice | null;
}

export interface LotChoiceFormProps {
  readonly view: LotPlacementView;
  readonly onChoose: (
    lot: DraftLotChoice | null,
  ) => Promise<ActionResult<unknown>>;
}

const NONE = "none";
const OPEN = "open";
const JOIN_PREFIX = "join:";

const LOT_LABEL = "Lot (optional)";
const NONE_LABEL = "No lot";
const OPEN_LABEL = "Start a new lot";
const DESCRIPTION_LABEL = "New lot description (optional)";
const NEEDS_CONTAINER =
  "Choose a container first. A lot holds containers, so the battery joins a lot through the container it goes into.";
const HELPER =
  "A lot groups containers for shipping and reporting. It has no clock or fill level of its own.";

function valueOf(choice: DraftLotChoice | null): string {
  if (choice === null) return NONE;
  return choice.kind === "open" ? OPEN : `${JOIN_PREFIX}${choice.lotId}`;
}

export function LotChoiceForm({
  view,
  onChoose,
}: LotChoiceFormProps): ReactElement {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useSyncedText(
    view.choice?.kind === "open" ? (view.choice.description ?? "") : "",
  );

  async function choose(next: DraftLotChoice | null): Promise<void> {
    setError(null);
    const result = await onChoose(next);
    if (!result.ok) setError(result.error.message);
  }

  if (view.containerCode === null) {
    return (
      <p data-lot-choice="needs-container" className="max-w-[72ch] text-body">
        {NEEDS_CONTAINER}
      </p>
    );
  }

  if (view.containerLot !== null) {
    return (
      <p data-lot-choice="kept" className="max-w-[72ch] text-body">
        {`${view.containerCode} is in lot `}
        <span className="font-mono">{view.containerLot.lotCode}</span>
        {` (${view.containerLot.statusLabel}). A container is in one lot at a time.`}
      </p>
    );
  }

  function change(value: string): void {
    if (value === NONE) {
      void choose(null);
    } else if (value === OPEN) {
      void choose({ kind: "open", description: null });
    } else if (value.startsWith(JOIN_PREFIX)) {
      void choose({ kind: "join", lotId: value.slice(JOIN_PREFIX.length) });
    }
  }

  function saveDescription(): void {
    if (view.choice?.kind !== "open") return;
    const trimmed = description.trim();
    const next = trimmed === "" ? null : trimmed;
    if (next === view.choice.description) return;
    void choose({ kind: "open", description: next });
  }

  return (
    <div
      data-lot-choice-form="true"
      data-lot-choice={view.choice?.kind ?? NONE}
      className="flex flex-col gap-2"
    >
      <Label htmlFor={`${id}-lot`} className="text-label text-foreground">
        {LOT_LABEL}
      </Label>
      <Select value={valueOf(view.choice)} onValueChange={change}>
        <SelectTrigger
          id={`${id}-lot`}
          data-lot-trigger="true"
          className="min-h-11 w-full rounded-md text-body"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-lg">
          <SelectItem
            value={NONE}
            data-lot-option={NONE}
            className="min-h-11 rounded-md text-body"
          >
            {NONE_LABEL}
          </SelectItem>
          {view.openLots.map((lot) => (
            <SelectItem
              key={lot.id}
              value={`${JOIN_PREFIX}${lot.id}`}
              data-lot-option={lot.lotCode}
              className="min-h-11 rounded-md text-body"
            >
              {`Add ${view.containerCode} to ${lot.lotCode}${lot.description === null ? "" : ` — ${lot.description}`}`}
            </SelectItem>
          ))}
          <SelectItem
            value={OPEN}
            data-lot-option={OPEN}
            className="min-h-11 rounded-md text-body"
          >
            {`${OPEN_LABEL} with ${view.containerCode}`}
          </SelectItem>
        </SelectContent>
      </Select>
      <p className="max-w-[72ch] text-caption text-muted-foreground">
        {HELPER}
      </p>
      {view.choice?.kind === "open" ? (
        <div className="flex flex-col gap-2">
          <Label
            htmlFor={`${id}-description`}
            className="text-label text-foreground"
          >
            {DESCRIPTION_LABEL}
          </Label>
          <Input
            id={`${id}-description`}
            name="lotDescription"
            autoComplete="off"
            value={description}
            data-lot-description="true"
            onChange={(event) => setDescription(event.currentTarget.value)}
            onBlur={saveDescription}
            className="min-h-11 rounded-md text-body"
          />
        </div>
      ) : null}
      {error === null ? null : (
        <InlineActionError dataAttribute="data-lot-error" message={error} />
      )}
    </div>
  );
}
