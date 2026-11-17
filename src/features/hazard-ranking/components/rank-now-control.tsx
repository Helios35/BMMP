import type { ReactNode } from "react";

import { GatedControl } from "@/components/access/gated-control";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  controlTreatment,
  controlTreatmentReason,
} from "@/domain/access/control-treatment";
import { mayTakeHazardRankingAction } from "@/domain/access/hazard-ranking-actions";
import { capabilityFor } from "@/domain/access/route-capability";
import type { RoleCode } from "@/domain/taxonomy/role";
import { cn } from "@/lib/utils";

import { RANK_NOW } from "../ranking-copy";
import type { RANK_NOW_ROUTES } from "../schemas";
import { RankNowButton } from "./rank-now-button";

/**
 * **Rank now** in a list's toolbar — `UX_SPEC.md` §3.5, §3.9; Rule 10.24.
 *
 * P2 and P6 get the button. **The auditor sees it disabled, with the reason**
 * (E-8a — the auditor's job is to see the controls). Every other role sees
 * nothing: Rank now is absent, not disabled. `undefined` when absent, so the
 * toolbar leaves no empty slot.
 */
export function rankNowControl(
  role: RoleCode,
  route: (typeof RANK_NOW_ROUTES)[number],
): ReactNode {
  if (mayTakeHazardRankingAction(role, "rank_now")) {
    return <RankNowButton route={route} />;
  }
  const reason = controlTreatmentReason(
    controlTreatment({
      role,
      capability: capabilityFor(role, route),
      isDestructive: false,
      isExportOrPrint: false,
    }),
  );
  if (reason === null) return undefined;
  return (
    <GatedControl reason={reason}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        aria-disabled="true"
        data-disabled="true"
        data-mutating="true"
        data-rank-now="true"
        className={cn(ACTION_BUTTON_CLASS, "opacity-60")}
      >
        {RANK_NOW}
      </Button>
    </GatedControl>
  );
}
