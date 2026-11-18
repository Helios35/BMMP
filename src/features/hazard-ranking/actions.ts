"use server";

import { revalidatePath } from "next/cache";

import {
  mayTakeHazardRankingAction,
  rolesForHazardRankingAction,
} from "@/domain/access/hazard-ranking-actions";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { requireActionOn } from "@/lib/auth/guard";
import { nowIso } from "@/lib/auth/session";
import { requestAttribution } from "@/features/intake/server/session-action";

import { rankNowSchema } from "./schemas";
import { rankNowFor } from "./server/run";

/**
 * **Rank now** on `/batteries` and `/containers` — `UX_SPEC.md` §3.5, §3.9;
 * Rule 10.24; D-77 #6.
 *
 * Thin, as every action is: (1) the guard — the route the button sits on is
 * one the role reads, and the ranking action map lets it act, and a refusal
 * is audited; (2) zod; (3) the run in `./server/run.ts`; (4) `ActionResult`,
 * never a throw across the boundary; (5) revalidate, because every list and
 * record that shows a ranking changes. **Nothing is optimistic**: the page
 * re-renders from `src/data`.
 */

function refusal(): string {
  const names = rolesForHazardRankingAction("rank_now").map(
    (role) => ROLE_LABELS[role],
  );
  return `Your role cannot run a hazard ranking. ${names.join(" or ")} can.`;
}

export async function rankNow(input: unknown): Promise<
  ActionResult<{
    readonly ranked: number;
    readonly computedAt: string;
  }>
> {
  const parsed = rankNowSchema.safeParse(input);
  const guard = await requireActionOn(
    parsed.success ? parsed.data.route : "/batteries",
    "rankNow",
    (role) => mayTakeHazardRankingAction(role, "rank_now"),
    refusal(),
  );
  if (!guard.ok) return guard;
  const { ctx } = guard;
  if (!parsed.success) {
    return actionFailed({
      code: "VALIDATION",
      message:
        parsed.error.issues[0]?.message ?? "Rank now could not be started.",
      correlationId: ctx.correlationId,
    });
  }
  try {
    const recorded = await rankNowFor(
      ctx,
      nowIso(),
      await requestAttribution(),
    );
    revalidatePath("/", "layout");
    return actionSucceeded({
      ranked: recorded.ranked,
      computedAt: recorded.computedAt,
    });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}
