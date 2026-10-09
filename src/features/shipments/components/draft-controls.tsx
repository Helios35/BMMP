"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";

import {
  InlineActionError,
  ReviewButton,
} from "@/components/extraction-review/review-controls";
import { documentPdfPath } from "@/features/documents/verification";

import { storeDraftPaper } from "../actions";
import {
  DOWNLOAD_DRAFT,
  DRAFT_STORED_NOTE,
  PRINT_DRAFT,
} from "../shipment-copy";

/**
 * Step 3's draft — **stored as a `draft` render only when someone prints or
 * downloads it** (D-58 item 9; Rule 5.28), never per page view.
 *
 * Either control first has the server render and store the draft as it
 * stands, watermarked not valid on every page. **Open the draft to print**
 * then opens that render, where Print streams its stored bytes like any
 * document's; **Download draft** streams them as a file. Neither changes the
 * checklist, and neither can turn a draft into a paper.
 */
export function DraftPaperControls({
  shipmentId,
}: {
  readonly shipmentId: string;
}): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState<"print" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function stored(): Promise<string | null> {
    const result = await storeDraftPaper({ shipmentId });
    if (!result.ok) {
      setError(result.error.message);
      return null;
    }
    return result.data.documentRenderId;
  }

  async function print(): Promise<void> {
    if (pending !== null) return;
    setPending("print");
    setError(null);
    try {
      const renderId = await stored();
      if (renderId !== null) router.push(`/documents/${renderId}`);
    } finally {
      setPending(null);
    }
  }

  async function download(): Promise<void> {
    if (pending !== null) return;
    setPending("download");
    setError(null);
    try {
      const renderId = await stored();
      if (renderId === null) return;
      const response = await fetch(documentPdfPath(renderId, "download"), {
        credentials: "same-origin",
      });
      if (!response.ok) {
        setError(
          "The draft was stored but could not be downloaded. Open it to print instead.",
        );
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `shipping_paper-draft-${renderId}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setPending(null);
    }
  }

  return (
    <div data-draft-controls="true" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <ReviewButton
          variant="outline"
          pending={pending === "print"}
          onPress={() => void print()}
          data-print-draft="true"
        >
          {PRINT_DRAFT}
        </ReviewButton>
        <ReviewButton
          variant="outline"
          pending={pending === "download"}
          onPress={() => void download()}
          data-download-draft="true"
        >
          {DOWNLOAD_DRAFT}
        </ReviewButton>
      </div>
      <p className="max-w-[72ch] text-caption">{DRAFT_STORED_NOTE}</p>
      {error === null ? null : (
        <InlineActionError message={error} dataAttribute="data-draft-error" />
      )}
    </div>
  );
}
