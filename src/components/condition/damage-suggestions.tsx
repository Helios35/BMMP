"use client";

import { useState, type ReactElement } from "react";
import { CircleAlert, ImageIcon } from "lucide-react";

import { AiSuggestedTag } from "@/components/ai/ai-suggested-tag";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

/**
 * The **Suggestions** list — `UX_SPEC.md` §3.6 step 3, §3.7, §3.8a; Rules
 * 6.25, 6.26; D-75 #3.
 *
 * Above the findings, one row per finding the model proposed: the finding,
 * the photo it was seen on, the **AI suggested** tag, and **Accept** /
 * **Reject**. **Nothing is pre-ticked** — a proposal reaches the findings
 * only when a person accepts it — and the condition cannot be confirmed until
 * every row is decided. Each decision stays, rejected ones included, and the
 * tag then says who decided (Rule 1.29).
 *
 * A failed check reads **"AI suggestions unavailable — inspect as usual."**
 * and blocks nothing (Rule 6.26). An empty list renders nothing: "nothing
 * proposed" is never "none observed", and the person inspects either way.
 *
 * Shared by `ConditionForm` (intake and `/review`) and the record's **Edit
 * assessed condition** dialog, so the two read the same.
 */

export const SUGGESTIONS_TITLE = "Suggestions";
export const SUGGESTIONS_UNAVAILABLE =
  "AI suggestions unavailable — inspect as usual.";
export const SUGGESTIONS_UNDECIDED_REASON =
  "Accept or reject each AI suggestion first.";
export const SUGGESTIONS_INTRO =
  "A model looked at the photos and suggests these findings. Nothing counts until you accept it — and you still inspect the battery yourself.";

export type SuggestionDecision = "accepted" | "rejected";

export interface DamageSuggestionView {
  /** `photoCheckId:findingType` — the proposal's stable key. */
  readonly key: string;
  readonly photoCheckId: string;
  readonly findingType: string;
  readonly findingLabel: string;
  /** 1-based, among the session's photos ("photo 2"). */
  readonly photoNumber: number;
  readonly decision: SuggestionDecision | null;
  readonly decidedByName: string | null;
}

export interface DamageSuggestionsView {
  readonly rows: readonly DamageSuggestionView[];
  /** A damage check on these photos failed (Rule 6.26). */
  readonly unavailable: boolean;
}

export const NO_SUGGESTION_VIEW: DamageSuggestionsView = {
  rows: [],
  unavailable: false,
};

export function hasUndecidedSuggestion(view: DamageSuggestionsView): boolean {
  return view.rows.some((row) => row.decision === null);
}

export interface DamageSuggestionsProps {
  readonly view: DamageSuggestionsView;
  /** `null` renders the rows read-only — a role that does not decide, or a disabled form. */
  readonly onDecide:
    | ((
        row: DamageSuggestionView,
        decision: SuggestionDecision,
      ) => Promise<ActionResult<unknown>>)
    | null;
  readonly disabledReason?: string;
  readonly className?: string;
}

export function DamageSuggestions({
  view,
  onDecide,
  disabledReason,
  className,
}: DamageSuggestionsProps): ReactElement | null {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (view.rows.length === 0 && !view.unavailable) return null;

  async function decide(
    row: DamageSuggestionView,
    decision: SuggestionDecision,
  ): Promise<void> {
    if (onDecide === null || disabledReason !== undefined) return;
    if (pending !== null) return;
    setPending(`${row.key}:${decision}`);
    setError(null);
    try {
      const result = await onDecide(row, decision);
      if (!result.ok) setError(result.error.message);
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      data-damage-suggestions="true"
      aria-labelledby="damage-suggestions-title"
      className={cn("flex flex-col gap-2", className)}
    >
      <h3 id="damage-suggestions-title" className="text-label text-foreground">
        {SUGGESTIONS_TITLE}
      </h3>

      {view.unavailable ? (
        <Alert
          role="status"
          data-suggestions-unavailable="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.neutral)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body">
            {SUGGESTIONS_UNAVAILABLE}
          </AlertTitle>
        </Alert>
      ) : null}

      {view.rows.length === 0 ? null : (
        <>
          <p className="max-w-[72ch] text-caption text-muted-foreground">
            {SUGGESTIONS_INTRO}
          </p>
          <ul className="flex flex-col gap-2">
            {view.rows.map((row) => {
              const decision =
                row.decision === null || row.decidedByName === null
                  ? null
                  : {
                      verb:
                        row.decision === "accepted"
                          ? ("confirmed" as const)
                          : ("rejected" as const),
                      byName: row.decidedByName,
                    };
              return (
                <li
                  key={row.key}
                  data-suggestion={row.findingType}
                  data-suggestion-decision={row.decision ?? "undecided"}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <ImageIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="text-body-strong">{`${row.findingLabel} — photo ${row.photoNumber}`}</span>
                    <AiSuggestedTag decision={decision} />
                  </div>
                  {onDecide === null ? null : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={
                          row.decision === "accepted" ? "default" : "outline"
                        }
                        size="lg"
                        data-suggestion-accept={row.findingType}
                        aria-pressed={row.decision === "accepted"}
                        aria-disabled={
                          disabledReason !== undefined ? "true" : undefined
                        }
                        aria-busy={
                          pending === `${row.key}:accepted` ? "true" : undefined
                        }
                        onClick={() => void decide(row, "accepted")}
                        className={ACTION_BUTTON_CLASS}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant={
                          row.decision === "rejected" ? "default" : "outline"
                        }
                        size="lg"
                        data-suggestion-reject={row.findingType}
                        aria-pressed={row.decision === "rejected"}
                        aria-disabled={
                          disabledReason !== undefined ? "true" : undefined
                        }
                        aria-busy={
                          pending === `${row.key}:rejected` ? "true" : undefined
                        }
                        onClick={() => void decide(row, "rejected")}
                        className={ACTION_BUTTON_CLASS}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {error === null ? null : (
        <Alert
          role="alert"
          data-suggestion-error="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">{error}</AlertTitle>
        </Alert>
      )}
    </section>
  );
}
