"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";

import { ReasonDialog } from "@/components/extraction-review/reason-dialog";

import { reopenDeadline } from "../actions";
import { REOPEN_COPY } from "../obligation-copy";

/** **Reopen** — a deadline marked done goes back to open, with a reason (Rule 8.12). */
export function ReopenDeadline({
  deadlineId,
}: {
  readonly deadlineId: string;
}): ReactElement {
  const router = useRouter();
  return (
    <ReasonDialog
      copy={REOPEN_COPY}
      tone="destructive"
      onSubmit={async (reason) => {
        const result = await reopenDeadline({ deadlineId, reason });
        if (result.ok) router.refresh();
        return result;
      }}
      attributes={{
        trigger: { "data-reopen": deadlineId },
        dialog: { "data-reopen-dialog": deadlineId },
        reason: { "data-reopen-reason": "true" },
        confirm: { "data-reopen-confirm": "true" },
      }}
    />
  );
}
