import type { ReactElement } from "react";
import { Sparkles } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * `AiSuggestedTag` — **the one place "AI suggested" is drawn** (Rule 1.29;
 * `UX_SPEC.md` §2.16; D-67 #3, D-75 #9).
 *
 * Wherever a value, finding or flag came from a model, the screen says so.
 * Once a person has decided, it also says who: "AI suggested · confirmed by
 * Dana R." or "· rejected by". **Neutral, never a scale** — no colour that
 * grades the suggestion, no number, no confidence, nothing the model wrote
 * (D-75 #5). It never appears on chemistry, a catalog match, a classification,
 * a clock, a shipping paper, a recall or a ranking, because those are rules
 * (Rule 1.29); the caller decides where it goes, and those callers never ask.
 *
 * The copy check (Rule 2.37) is not a model's judgment and carries no tag
 * (D-75 #8).
 */

export const AI_SUGGESTED = "AI suggested";

export type AiDecisionVerb = "confirmed" | "rejected";

export interface AiSuggestedTagProps {
  /** After a decision — who, and which way. Absent or null before one. */
  readonly decision?: {
    readonly verb: AiDecisionVerb;
    readonly byName: string;
  } | null;
  readonly className?: string;
}

/** The tag's words — exported so an export or a document says exactly the same. */
export function aiSuggestedText(
  decision: AiSuggestedTagProps["decision"],
): string {
  if (decision === undefined || decision === null) return AI_SUGGESTED;
  return `${AI_SUGGESTED} · ${decision.verb} by ${decision.byName}`;
}

export function AiSuggestedTag({
  decision = null,
  className,
}: AiSuggestedTagProps): ReactElement {
  return (
    <Badge
      variant="outline"
      data-ai-suggested="true"
      data-ai-decision={decision?.verb ?? "none"}
      className={cn(
        "gap-1 border text-caption whitespace-normal",
        INTENT_SURFACE_CLASSES.neutral,
        className,
      )}
    >
      <Sparkles aria-hidden="true" className="size-3 shrink-0" />
      <span>{aiSuggestedText(decision)}</span>
    </Badge>
  );
}
