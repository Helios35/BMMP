"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";

import { InlineActionError } from "@/components/extraction-review/review-controls";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { ContainerPicker } from "@/components/storage/container-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ContainerContentsMoveResult } from "@/data/contracts";
import {
  admitContentsMove,
  type ContentsMoveOperation,
  type MoveContainerFacts,
} from "@/domain/storage/accumulation";

import { createContainer, moveContents } from "../actions";
import {
  CONSOLIDATE,
  CONTENTS_CAPTION,
  CONTENTS_EMPTY,
  MOVE,
  SPLIT,
} from "../container-copy";

/**
 * **Contents** — `UX_SPEC.md` §3.10: every battery in the container with its
 * condition and chemistry; **add and remove for P1 and P6 only** (§5.5).
 *
 * A battery leaves by one of three operations, all through the adapter's one
 * `moveContents` (Rules 4.9–4.12): **Move** the selected batteries into any
 * container that admits them, **Split** them into a new, empty one, or
 * **Consolidate** everything here into a container that already holds
 * batteries. **Every one carries the earliest start date forward** — the
 * receiving container takes it, never today's date — and the dialog says so
 * after the move, including when receipt made the container overdue on the
 * spot (Rule 4.10; E-6).
 *
 * The picker lists every other container with **the adapter's own refusal**:
 * each row's admission is `admitContentsMove`, the same pure function the
 * adapter runs, recomputed as the selection changes.
 */

export interface ContentsRow {
  readonly id: string;
  readonly recordNumber: string;
  readonly href: string;
  readonly description: string;
  readonly chemistryLabel: string;
  readonly conditionLabel: string;
  readonly isDamaged: boolean;
}

export interface MoveTargetRow {
  readonly id: string;
  readonly code: string;
  readonly typeLabel: string;
  readonly location: string | null;
  readonly status: string;
  readonly clockTier: string | null;
  readonly fillText: string | null;
  readonly timeZone: string;
  readonly facts: MoveContainerFacts;
}

export interface ContentsPanelProps {
  readonly containerCode: string;
  readonly rows: readonly ContentsRow[];
  readonly canMove: boolean;
  /** P1/P6 may create the fresh container a split needs, inline. */
  readonly canCreate: boolean;
  readonly source: MoveContainerFacts;
  readonly targets: readonly MoveTargetRow[];
}

const OPERATION_TITLE: Readonly<Record<ContentsMoveOperation, string>> = {
  move: "Move batteries",
  split: "Split into a new container",
  consolidate: "Consolidate this container",
};

const OPERATION_BODY: Readonly<Record<ContentsMoveOperation, string>> = {
  move: "The receiving container takes the earliest accumulation start date among its contents, immediately. If that makes it overdue, it becomes overdue.",
  split:
    "The chosen batteries go into a new, empty container, which takes the earliest start date of its own contents. This container keeps its date.",
  consolidate:
    "Everything here goes into a container that already holds batteries. It takes the earliest start date across both.",
};

function civilDate(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(instant));
}

function batteries(count: number): string {
  return `${count} ${count === 1 ? "battery" : "batteries"}`;
}

/** What happened, stated — the start the receiving container now carries, and overdue when it is (E-6). */
function moveOutcome(
  result: ContainerContentsMoveResult,
  movedCount: number,
): { readonly title: string; readonly description: string } {
  const code = result.target.containerCode;
  const start =
    result.target.accumulationStartedAt === null
      ? null
      : civilDate(
          result.target.accumulationStartedAt,
          result.target.siteTimeZone,
        );
  const startLine =
    start === null
      ? ""
      : result.targetStartChanged
        ? `${code} now carries an accumulation start of ${start}, the earliest of its contents.`
        : `${code} keeps its accumulation start of ${start}.`;
  const overdueLine = result.targetBecameOverdue
    ? ` ${code} is overdue and accepts no new items.`
    : "";
  return {
    title: `Moved ${batteries(movedCount)} to ${code}`,
    description: `${startLine}${overdueLine}`,
  };
}

export function ContentsPanel({
  containerCode,
  rows,
  canMove,
  canCreate,
  source,
  targets,
}: ContentsPanelProps): ReactElement {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [operation, setOperation] = useState<ContentsMoveOperation | null>(
    null,
  );
  const [targetId, setTargetId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moving =
    operation === "consolidate"
      ? rows.map((row) => row.id)
      : rows.filter((row) => selected.has(row.id)).map((row) => row.id);

  const pickerRows = useMemo(
    () =>
      operation === null
        ? []
        : targets.map((target) => ({
            id: target.id,
            code: target.code,
            typeLabel: target.typeLabel,
            location: target.location,
            fillText: target.fillText,
            clockTier: target.clockTier,
            status: target.status,
            admission: admitContentsMove({
              operation,
              source,
              target: target.facts,
              movingCount: moving.length,
            }),
          })),
    [operation, targets, source, moving.length],
  );

  function open(next: ContentsMoveOperation): void {
    setOperation(next);
    setTargetId(null);
    setError(null);
  }

  function close(): void {
    setOperation(null);
    setTargetId(null);
    setError(null);
  }

  async function submit(): Promise<void> {
    if (operation === null || targetId === null || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await moveContents({
        operation,
        sourceContainerId: source.id,
        targetContainerId: targetId,
        batteryRecordIds: moving,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const outcome = moveOutcome(result.data, moving.length);
      if (result.data.targetBecameOverdue) {
        toast.warning(outcome.title, { description: outcome.description });
      } else {
        toast.success(outcome.title, { description: outcome.description });
      }
      setSelected(new Set());
      close();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (rows.length === 0) {
    return (
      <p
        role="status"
        data-contents-empty="true"
        className="max-w-[72ch] text-body"
      >
        {CONTENTS_EMPTY}
      </p>
    );
  }

  const selectionCount = selected.size;

  return (
    <div data-contents-panel="true" className="flex flex-col gap-4">
      {canMove ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="lg"
            data-move-open="move"
            aria-disabled={selectionCount === 0 ? "true" : undefined}
            onClick={() => {
              if (selectionCount > 0) open("move");
            }}
            className={cn(
              ACTION_BUTTON_CLASS,
              selectionCount === 0 && "opacity-60",
            )}
          >
            {selectionCount === 0
              ? MOVE
              : `${MOVE} ${batteries(selectionCount)}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            data-move-open="split"
            aria-disabled={selectionCount === 0 ? "true" : undefined}
            onClick={() => {
              if (selectionCount > 0) open("split");
            }}
            className={cn(
              ACTION_BUTTON_CLASS,
              selectionCount === 0 && "opacity-60",
            )}
          >
            {SPLIT}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            data-move-open="consolidate"
            onClick={() => open("consolidate")}
            className={ACTION_BUTTON_CLASS}
          >
            {CONSOLIDATE}
          </Button>
          {selectionCount === 0 ? (
            <span className="text-caption text-muted-foreground">
              Choose batteries to move or split.
            </span>
          ) : null}
        </div>
      ) : null}

      <Table>
        <TableCaption className="sr-only">{CONTENTS_CAPTION}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {canMove ? (
              <TableHead className="w-12 px-3">
                <span className="sr-only">Select</span>
              </TableHead>
            ) : null}
            <TableHead className="h-11 px-3 text-label">Record</TableHead>
            <TableHead className="h-11 px-3 text-label">Battery</TableHead>
            <TableHead className="h-11 px-3 text-label">Chemistry</TableHead>
            <TableHead className="h-11 px-3 text-label">Condition</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} data-contents-row={row.id}>
              {canMove ? (
                <TableCell className="px-3">
                  <Checkbox
                    aria-label={`Select ${row.recordNumber}`}
                    data-contents-select={row.id}
                    checked={selected.has(row.id)}
                    onCheckedChange={(checked) => {
                      setSelected((current) => {
                        const next = new Set(current);
                        if (checked === true) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      });
                    }}
                    className="size-6"
                  />
                </TableCell>
              ) : null}
              <TableCell className="px-3">
                <Link
                  href={row.href}
                  className="inline-flex min-h-11 items-center text-mono underline underline-offset-4"
                >
                  {row.recordNumber}
                </Link>
              </TableCell>
              <TableCell className="px-3 text-body">
                {row.description}
              </TableCell>
              <TableCell className="px-3 text-body">
                {row.chemistryLabel}
              </TableCell>
              <TableCell className="px-3 text-body">
                {row.conditionLabel}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={operation !== null}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent
          data-move-dialog={operation ?? undefined}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle className="text-h2">
              {operation === null ? "" : OPERATION_TITLE[operation]}
            </DialogTitle>
            <DialogDescription className="text-body">
              {operation === null
                ? ""
                : `${batteries(moving.length)} from ${containerCode}. ${OPERATION_BODY[operation]}`}
            </DialogDescription>
          </DialogHeader>

          {operation === null ? null : (
            <ContainerPicker
              containers={pickerRows}
              selectedId={targetId}
              onSelect={async (id) => {
                setTargetId(id);
                return { ok: true, data: null };
              }}
              canCreate={operation === "split" && canCreate}
              whoCanCreate=""
              onCreate={async (input) => {
                // The fresh container a split needs, of this container's class;
                // the refresh brings it into the list before it is selected.
                const created = await createContainer({
                  storageLocation: input.storageLocation,
                  containerType: source.containerType,
                });
                if (created.ok) router.refresh();
                return created;
              }}
              requiredTypeLabel={null}
              emptyCopy="There is no other container at this site to move into."
              clearable={false}
            />
          )}

          {error !== null ? (
            <InlineActionError
              message={error}
              dataAttribute="data-move-error"
            />
          ) : null}

          <DialogFooter className="rounded-b-lg">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={close}
              className={ACTION_BUTTON_CLASS}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="lg"
              data-move-submit="true"
              aria-disabled={targetId === null ? "true" : undefined}
              aria-busy={pending ? "true" : undefined}
              onClick={() => void submit()}
              className={cn(
                ACTION_BUTTON_CLASS,
                targetId === null && "opacity-60",
              )}
            >
              {pending ? "Moving…" : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
