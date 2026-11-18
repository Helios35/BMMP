"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";

import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "@/components/extraction-review/review-controls";

import { checkNow } from "../actions";
import { CHECK_NOW, CHECKING } from "../obligation-copy";

/**
 * **Check now** — `UX_SPEC.md` §3.21; Rule 8.11. P3 and P6. One run over the
 * whole organization, then the page re-reads it; nothing is optimistic.
 */
export function CheckNowButton(): ReactElement {
  const router = useRouter();
  const call = useActionCall();

  async function check(): Promise<void> {
    const result = await call.run(() => checkNow());
    if (result?.ok === true) router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <ReviewButton
        variant="outline"
        size="lg"
        pending={call.pending}
        pendingLabel={CHECKING}
        onPress={() => void check()}
        data-check-now="true"
      >
        {CHECK_NOW}
      </ReviewButton>
      {call.error === null ? null : (
        <InlineActionError
          dataAttribute="data-check-now-error"
          message={call.error}
        />
      )}
    </div>
  );
}
