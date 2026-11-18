import type { ReactElement } from "react";

import { StatusBadge } from "@/components/status/status-badge";
import { CHANGED_SINCE } from "@/domain/hazard/words";
import type { HazardRankingView } from "@/domain/hazard/view";

/**
 * The **Ranking** column — `UX_SPEC.md` §3.5, §3.9; Rule 10.23; T-33.
 *
 * The band label and "3 of 41", in the one neutral colour. An item with no
 * ranking says why in words — "Not ranked yet", never a blank cell. A ranking
 * an input has moved on from says "Changed since — rank again to update"
 * beside it (Rule 10.24). The set and the as-of time are on the item's own
 * panel and in the export; the column is a pointer to them.
 */
export function HazardRankingCell({
  view,
}: {
  readonly view: HazardRankingView;
}): ReactElement {
  if (view.kind !== "ranked") {
    return (
      <span className="text-body" data-hazard-ranking-cell={view.kind}>
        {view.message}
      </span>
    );
  }
  return (
    <span
      className="flex flex-col items-start gap-1"
      data-hazard-ranking-cell={view.changedSince ? "changed_since" : "ranked"}
      data-hazard-band={view.band}
    >
      <StatusBadge system="hazard_ranking_band" value={view.band} size="sm" />
      {view.shortPosition === null ? null : (
        <span className="tabular text-body" data-hazard-short-position="true">
          {view.shortPosition}
        </span>
      )}
      {view.changedSince ? (
        <span className="text-caption text-foreground">{CHANGED_SINCE}</span>
      ) : null}
    </span>
  );
}
