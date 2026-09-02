"use client";

import { useEffect, useId, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { toast } from "sonner";

import type { CatalogCandidateView } from "@/components/extraction-review/types";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import type { Uuid } from "@/types/common";
import type { ApplyCatalogRematchResult } from "../actions";

/**
 * **Re-run catalog matching** — `UX_SPEC.md` §3.7, §2.13; Rules 2.18, 2.19,
 * 2.32, 3.15.
 *
 * The ranked candidates render as a radio list of at most five. **The top
 * candidate is highlighted and never pre-selected** (Rule 2.19): a person
 * picks, and the dialog's confirm stays inert until one has. Selecting is not
 * saving — the pick is sent only when the person confirms, after reading that
 * the gate re-opens for chemistry and model and that the record will be
 * re-classified. The sentence is a constant so a test can assert it verbatim.
 *
 * The candidate list is built server-side by `findCatalogCandidatesForRecord`
 * against the record's own identifiers, and the dialog renders what it is
 * given — no score is shown as a number, and nothing about a photograph is
 * said or implied anywhere on it.
 *
 * `CatalogMatchPanel` (`src/components/extraction-review`) is the intake
 * step's composition of the same list; it was not available when this dialog
 * was written, so the dialog renders the list itself against the shared
 * `CatalogCandidateView` shape. Swapping the list for the panel is a
 * one-import change once the two are reconciled.
 */

export const REMATCH_GATE_NOTICE =
  "Changing the matched entry re-opens the confidence gate for chemistry and model. You confirm the new values now, and the record is re-classified.";

export const NO_CANDIDATES_NOTICE =
  "Nothing in the catalog matches this record's identifiers. The record keeps its current identification.";

export type FindCandidatesAction = (
  input: unknown,
) => Promise<ActionResult<readonly CatalogCandidateView[]>>;

export type ApplyRematchAction = (
  input: unknown,
) => Promise<ActionResult<ApplyCatalogRematchResult>>;

export interface RematchDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly recordId: Uuid;
  readonly currentCatalogEntryId: Uuid | null;
  readonly findCandidates: FindCandidatesAction;
  readonly applyRematch: ApplyRematchAction;
}

type ListState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly candidates: readonly CatalogCandidateView[];
    };

export function RematchDialog({
  open,
  onOpenChange,
  recordId,
  currentCatalogEntryId,
  findCandidates,
  applyRematch,
}: RematchDialogProps): ReactElement {
  const router = useRouter();
  const noticeId = useId();
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [selected, setSelected] = useState<Uuid | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The menu mounts this dialog only while it is open, so the list loads once
  // per opening and state moves only when the Server Action answers — never
  // synchronously inside the effect.
  useEffect(() => {
    let cancelled = false;
    void findCandidates({ recordId }).then((result) => {
      if (cancelled) return;
      setList(
        result.ok
          ? { kind: "ready", candidates: result.data }
          : { kind: "error", message: result.error.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [recordId, findCandidates]);

  const isReady = selected !== null && !isPending;

  async function confirm(): Promise<void> {
    if (!isReady || selected === null) return;
    setIsPending(true);
    setError(null);
    const result = await applyRematch({ recordId, catalogEntryId: selected });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success("Catalog entry matched", {
      description:
        result.data.classification === "unresolved"
          ? "The record could not be re-classified: no rule is on file for this site. A Facility Manager or a Platform Admin can supply what is missing."
          : "The record has been re-classified.",
    });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-record-dialog="rerun-catalog-matching"
        className="rounded-lg text-body sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-h2">Re-run catalog matching</DialogTitle>
          <DialogDescription className="text-body text-foreground">
            Candidates are ranked from this record&apos;s identifiers. Pick the
            entry that matches; nothing is chosen for you.
          </DialogDescription>
        </DialogHeader>

        <div data-catalog-match-state={list.kind}>
          {list.kind === "loading" ? (
            <div
              className="grid gap-2"
              role="status"
              aria-label="Ranking candidates"
            >
              <Skeleton className="h-11 rounded-md" />
              <Skeleton className="h-11 rounded-md" />
            </div>
          ) : null}

          {list.kind === "error" ? (
            <Alert
              role="alert"
              className={cn(INTENT_SURFACE_CLASSES.critical, "gap-2 px-3 py-3")}
            >
              <CircleAlert aria-hidden="true" className="size-4" />
              <AlertDescription className="text-body text-current">
                {list.message}
              </AlertDescription>
            </Alert>
          ) : null}

          {list.kind === "ready" && list.candidates.length === 0 ? (
            <p role="status" className="max-w-[72ch] text-body">
              {NO_CANDIDATES_NOTICE}
            </p>
          ) : null}

          {list.kind === "ready" && list.candidates.length > 0 ? (
            <RadioGroup
              value={selected ?? ""}
              onValueChange={(value) => setSelected(value)}
              aria-label="Catalog candidates"
              className="gap-2"
            >
              {list.candidates.map((candidate, index) => {
                const isCurrent =
                  candidate.catalogEntryId === currentCatalogEntryId;
                return (
                  <label
                    key={candidate.catalogEntryId}
                    data-catalog-candidate={candidate.catalogEntryId}
                    data-top-candidate={index === 0 ? "true" : undefined}
                    className={cn(
                      "flex min-h-11 items-start gap-3 rounded-md border border-border p-3",
                      index === 0 ? INTENT_SURFACE_CLASSES.pending : "",
                    )}
                  >
                    <RadioGroupItem
                      value={candidate.catalogEntryId}
                      className="mt-1"
                    />
                    <span className="grid gap-1">
                      <span className="text-body-strong">
                        {candidate.title}
                      </span>
                      <span className="text-body">
                        {candidate.chemistryLabel}
                      </span>
                      {candidate.specs.map((spec) => (
                        <span key={spec} className="text-caption">
                          {spec}
                        </span>
                      ))}
                      <span className="text-caption">
                        {candidate.matchedOnLabel}
                        {isCurrent ? " · Currently matched" : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          ) : null}
        </div>

        {error === null ? null : (
          <Alert
            role="alert"
            className={cn(INTENT_SURFACE_CLASSES.critical, "gap-2 px-3 py-3")}
          >
            <CircleAlert aria-hidden="true" className="size-4" />
            <AlertDescription className="text-body text-current">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <p
          id={noticeId}
          data-gate-notice="rematch"
          className="max-w-[72ch] text-body-strong"
        >
          {REMATCH_GATE_NOTICE}
        </p>

        <DialogFooter className="rounded-b-lg p-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            className={ACTION_BUTTON_CLASS}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            data-primary-action="apply-rematch"
            aria-disabled={isReady ? undefined : "true"}
            aria-describedby={noticeId}
            onClick={() => {
              void confirm();
            }}
            className={cn(ACTION_BUTTON_CLASS, isReady ? "" : "opacity-60")}
          >
            {isPending ? "Saving…" : "Confirm match"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
