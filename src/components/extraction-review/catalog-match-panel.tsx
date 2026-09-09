"use client";

import { useId, type ReactElement } from "react";
import { BookOpen, CircleAlert, SearchX } from "lucide-react";

import {
  INTENT_SURFACE_CLASSES,
  INTENT_TEXT_CLASSES,
} from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Uuid } from "@/types/common";
import {
  CANNOT_SHIP_NOTE,
  CATALOG_CONTINUE_WITHOUT,
  CATALOG_EMPTY_BODY,
  CATALOG_EMPTY_TITLE,
  CATALOG_ENTER_MANUALLY,
  CATALOG_ERROR_TITLE,
  CATALOG_MATCHING,
  CATALOG_PANEL_NOTE,
  CATALOG_PANEL_TITLE,
  CATALOG_PROPOSE,
  CATALOG_RETRY,
  CATALOG_SELECTING,
  CATALOG_TOP_CANDIDATE,
  matchedOnSentence,
  SEARCH_CATALOG,
} from "./review-copy";
import {
  InlineActionError,
  ReviewButton,
  useActionCall,
  useReviewDisabled,
} from "./review-controls";
import type {
  CatalogCandidateView,
  CatalogMatchState,
  ExtractionReviewActions,
} from "./types";

/**
 * `CatalogMatchPanel` — `UX_SPEC.md` §2.13, E-5; Rules 2.18–2.20.
 *
 * Up to five candidates, each with its manufacturer and model, chemistry, key
 * specs and **the match basis stated explicitly** — *Matched on manufacturer +
 * part number*. A `RadioGroup` selects one.
 *
 * **Never auto-selected.** The top candidate is highlighted so the eye lands
 * on it, and it is not checked: nothing is chosen until a person chooses it
 * (Rule 2.19). Selecting a candidate populates chemistry and any specification
 * the label did not carry, each tagged *Matched from catalog* and each still
 * requiring confirmation — a match is a suggestion, never an answer.
 *
 * The miss state says the thing `/shipments/new` would otherwise discover
 * later: the record can be logged now and **cannot ship until the product is
 * in the catalog** (Rule 5.9). Discovering that at the shipment is a failure
 * of this screen.
 *
 * `matchScore` is on the view so the gate can compare it; **it is never
 * rendered**. A number beside a candidate would read as a probability the
 * ranking does not carry.
 */
export interface CatalogMatchPanelProps {
  readonly state: CatalogMatchState;
  readonly candidates: readonly CatalogCandidateView[];
  readonly selectedCatalogEntryId: Uuid | null;
  readonly cannotShipNote: boolean;
  readonly actions: Pick<
    ExtractionReviewActions,
    | "selectCandidate"
    | "searchCatalog"
    | "enterManually"
    | "proposeEntry"
    | "retryExtraction"
  >;
}

export function CatalogMatchPanel({
  state,
  candidates,
  selectedCatalogEntryId,
  cannotShipNote,
  actions,
}: CatalogMatchPanelProps): ReactElement {
  const headingId = useId();
  const disabled = useReviewDisabled();
  const select = useActionCall();
  const search = useActionCall();
  const enter = useActionCall();
  const propose = useActionCall();
  const retry = useActionCall();
  const inert = disabled.reason !== null;

  const error =
    select.error ?? search.error ?? enter.error ?? propose.error ?? retry.error;

  return (
    <section
      aria-labelledby={headingId}
      data-catalog-match-panel="true"
      data-catalog-match-state={state}
      aria-busy={select.pending ? "true" : undefined}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="flex items-center gap-2 text-h2">
          <BookOpen aria-hidden="true" className="size-4" />
          {CATALOG_PANEL_TITLE}
        </h3>
        {state === "default" && candidates.length > 0 ? (
          <p className="max-w-[72ch] text-body text-muted-foreground">
            {CATALOG_PANEL_NOTE}
          </p>
        ) : null}
      </div>

      {state === "loading" ? (
        <div className="flex flex-col gap-2" data-catalog-loading="true">
          <p role="status" className="text-body">
            {CATALOG_MATCHING}
          </p>
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
        </div>
      ) : null}

      {state === "error" ? (
        <Alert
          role="alert"
          data-intent="attention"
          className={cn("gap-2", INTENT_SURFACE_CLASSES.attention)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong text-balance">
            {CATALOG_ERROR_TITLE}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2 text-body text-current sm:flex-row">
            <ReviewButton
              variant="outline"
              data-catalog-action="retry"
              pending={retry.pending}
              pendingLabel="Retrying…"
              onPress={() => void retry.run(() => actions.retryExtraction())}
            >
              {CATALOG_RETRY}
            </ReviewButton>
            <ReviewButton
              variant="ghost"
              data-catalog-action="continue-without"
              pending={select.pending}
              pendingLabel={CATALOG_SELECTING}
              onPress={() =>
                void select.run(() => actions.selectCandidate(null))
              }
            >
              {CATALOG_CONTINUE_WITHOUT}
            </ReviewButton>
          </AlertDescription>
        </Alert>
      ) : null}

      {state === "empty" || (state === "default" && candidates.length === 0) ? (
        <div data-catalog-empty="true" className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <SearchX
              aria-hidden="true"
              className={cn(
                "mt-1 size-4 shrink-0",
                INTENT_TEXT_CLASSES.neutral,
              )}
            />
            <div className="flex flex-col gap-2">
              <p className="max-w-[72ch] text-body-strong text-balance">
                {CATALOG_EMPTY_TITLE}
              </p>
              <p className="max-w-[72ch] text-body">{CATALOG_EMPTY_BODY}</p>
              {cannotShipNote ? (
                <p
                  data-cannot-ship-note="true"
                  className="max-w-[72ch] text-body-strong"
                >
                  {CANNOT_SHIP_NOTE}
                </p>
              ) : null}
            </div>
          </div>
          {/* Three actions, all equally available (E-5). */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <ReviewButton
              variant="outline"
              data-catalog-action="search"
              pending={search.pending}
              pendingLabel="Opening the catalog…"
              onPress={() => void search.run(() => actions.searchCatalog())}
            >
              {SEARCH_CATALOG}
            </ReviewButton>
            <ReviewButton
              variant="outline"
              data-catalog-action="enter"
              pending={enter.pending}
              pendingLabel="Switching to manual entry…"
              onPress={() => void enter.run(() => actions.enterManually())}
            >
              {CATALOG_ENTER_MANUALLY}
            </ReviewButton>
            <ReviewButton
              variant="outline"
              data-catalog-action="propose"
              pending={propose.pending}
              pendingLabel="Sending the proposal…"
              onPress={() => void propose.run(() => actions.proposeEntry())}
            >
              {CATALOG_PROPOSE}
            </ReviewButton>
          </div>
        </div>
      ) : null}

      {state === "default" && candidates.length > 0 ? (
        <div className="flex flex-col gap-4">
          <RadioGroup
            aria-label={CATALOG_PANEL_TITLE}
            data-catalog-candidates="true"
            // `""` is Radix's "nothing checked". Nothing is chosen until a
            // person chooses it (Rule 2.19).
            value={selectedCatalogEntryId ?? ""}
            aria-disabled={inert ? "true" : undefined}
            onValueChange={(value) => {
              if (inert || select.pending) return;
              void select.run(() => actions.selectCandidate(value));
            }}
            className="gap-2"
          >
            {candidates.slice(0, 5).map((candidate, index) => (
              <CandidateRow
                key={candidate.catalogEntryId}
                candidate={candidate}
                isTop={index === 0}
                isSelected={candidate.catalogEntryId === selectedCatalogEntryId}
                inert={inert}
              />
            ))}
          </RadioGroup>
          <div>
            <ReviewButton
              variant="outline"
              data-catalog-action="search"
              pending={search.pending}
              pendingLabel="Opening the catalog…"
              onPress={() => void search.run(() => actions.searchCatalog())}
            >
              {SEARCH_CATALOG}
            </ReviewButton>
          </div>
        </div>
      ) : null}

      {error === null ? null : (
        <InlineActionError dataAttribute="data-catalog-error" message={error} />
      )}
    </section>
  );
}

/** One candidate: 56px minimum, the basis stated, the score never shown. */
function CandidateRow({
  candidate,
  isTop,
  isSelected,
  inert,
}: {
  readonly candidate: CatalogCandidateView;
  readonly isTop: boolean;
  readonly isSelected: boolean;
  /** The card's disabled state: readable, `aria-disabled`, never `disabled`. */
  readonly inert: boolean;
}): ReactElement {
  const itemId = useId();
  return (
    <div
      data-catalog-candidate={candidate.catalogEntryId}
      data-top-candidate={isTop ? "true" : undefined}
      data-selected={isSelected ? "true" : undefined}
      className={cn(
        "flex min-h-14 items-start gap-3 rounded-md border p-3 transition-colors duration-100 motion-reduce:transition-none",
        // Pre-highlighted, not pre-selected: the wash draws the eye; the
        // radio stays unchecked.
        isTop && !isSelected && "bg-muted/50",
        isSelected && "border-ring",
        inert && "opacity-60",
      )}
    >
      <RadioGroupItem
        id={itemId}
        value={candidate.catalogEntryId}
        aria-describedby={`${itemId}-basis`}
        aria-disabled={inert ? "true" : undefined}
        className={cn("mt-1", inert && "opacity-60")}
      />
      <Label
        htmlFor={itemId}
        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 text-body"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-body-strong">{candidate.title}</span>
          {isTop ? (
            <span className="text-caption text-muted-foreground">
              {CATALOG_TOP_CANDIDATE}
            </span>
          ) : null}
        </span>
        <span className="text-body">{candidate.chemistryLabel}</span>
        {candidate.specs.length === 0 ? null : (
          <span className="text-caption text-muted-foreground">
            {candidate.specs.join(" · ")}
          </span>
        )}
        <span
          id={`${itemId}-basis`}
          data-match-basis="true"
          className="text-caption"
        >
          {matchedOnSentence(candidate.matchedOnLabel)}
        </span>
      </Label>
    </div>
  );
}
