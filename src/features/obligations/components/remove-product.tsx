"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";

import { ReasonDialog } from "@/components/extraction-review/reason-dialog";

import { removeProduct } from "../actions";
import { REMOVE_COPY } from "../obligation-copy";

/** **Remove** — a dated update with a reason, never a delete (Rule 8.6; TECH §9.5). */
export function RemoveProduct({
  productId,
}: {
  readonly productId: string;
}): ReactElement {
  const router = useRouter();
  return (
    <ReasonDialog
      copy={REMOVE_COPY}
      tone="destructive"
      onSubmit={async (reason) => {
        const result = await removeProduct({ productId, reason });
        if (result.ok) router.refresh();
        return result;
      }}
      attributes={{
        trigger: { "data-remove-product": productId },
        dialog: { "data-remove-product-dialog": productId },
        reason: { "data-remove-product-reason": "true" },
        confirm: { "data-remove-product-confirm": "true" },
      }}
    />
  );
}
