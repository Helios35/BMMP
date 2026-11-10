import type { DamageSuggestionsView } from "@/components/condition/damage-suggestions";
import type { Uuid } from "@/types/common";

import type { SessionSuggestions } from "./server/suggestions";

/**
 * The Suggestions list as the condition step renders it — the rows, each with
 * its decision and who made it (Rule 1.29), and whether a check failed
 * (Rule 6.26). Pure: names are resolved by the caller.
 */
export function suggestionsView(
  suggestions: SessionSuggestions,
  names: ReadonlyMap<Uuid, string>,
): DamageSuggestionsView {
  return {
    unavailable: suggestions.unavailable,
    rows: suggestions.rows.map((row) => ({
      key: row.key,
      photoCheckId: row.proposal.photoCheckId,
      findingType: row.proposal.findingType,
      findingLabel: row.findingLabel,
      photoNumber: row.photoNumber,
      decision: row.decision?.decision ?? null,
      decidedByName:
        row.decision === null
          ? null
          : (names.get(row.decision.decidedBy) ?? "a colleague"),
    })),
  };
}

/** Every person who decided a row — for the caller's one name lookup. */
export function suggestionDeciders(
  suggestions: SessionSuggestions,
): readonly Uuid[] {
  return suggestions.rows
    .map((row) => row.decision?.decidedBy ?? null)
    .filter((id): id is Uuid => id !== null);
}
