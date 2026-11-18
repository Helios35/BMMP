"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";

import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "@/components/extraction-review/review-controls";

import { rankNow } from "../actions";
import { RANK_NOW, RANKING } from "../ranking-copy";
import type { RANK_NOW_ROUTES } from "../schemas";

/**
 * **Rank now** — P2 and P6 (Rule 10.24). Ranks the organization's held
 * batteries, containers and lots in one run, then the page re-renders from
 * `src/data`. Rendered only for the roles the ranking action map lets act;
 * the Server Action asks again. A refusal renders beside the button.
 */
export function RankNowButton({
  route,
}: {
  readonly route: (typeof RANK_NOW_ROUTES)[number];
}): ReactElement {
  const router = useRouter();
  const call = useActionCall();

  async function rank(): Promise<void> {
    const result = await call.run(() => rankNow({ route }));
    if (result?.ok === true) router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <ReviewButton
        variant="outline"
        size="lg"
        pending={call.pending}
        pendingLabel={RANKING}
        onPress={() => void rank()}
        data-rank-now="true"
      >
        {RANK_NOW}
      </ReviewButton>
      {call.error === null ? null : (
        <InlineActionError
          dataAttribute="data-rank-now-error"
          message={call.error}
        />
      )}
    </div>
  );
}
