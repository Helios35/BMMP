import Link from "next/link";
import type { ReactElement } from "react";

import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import type { RequestContext } from "@/data/contracts";
import { RenderViewer } from "@/features/documents/components/render-viewer";
import { DocumentPageContent } from "@/features/documents/document-page";
import { readDocument } from "@/features/documents/server/read-document";
import type { DocumentRender } from "@/types/documents";

import {
  LABEL_NONE,
  LABEL_OPEN,
  LABEL_REGENERATE_FLAG,
} from "./container-copy";

/**
 * **Label** — `UX_SPEC.md` §3.10: the `container_label` in force, previewed
 * through the same `DocumentViewer` `/documents/[id]` uses, carrying the
 * required regulatory phrase, the contents description and the accumulation
 * start date **exactly as they were printed** (Rule 4.18).
 *
 * The system **flags** when the label must be regenerated — the start date
 * changed, most visibly — **and a human prints** (Rule 4.21). **Generate and
 * Reprint are document generation, unit 06**, so neither renders here: a
 * button that could not produce a render would be a dead control. Print and
 * Download of the render that exists are never disabled (Rule 5.27).
 */
export async function LabelTab({
  ctx,
  labelRender,
  needsRelabel,
}: {
  readonly ctx: RequestContext;
  readonly labelRender: DocumentRender | null;
  readonly needsRelabel: boolean;
}): Promise<ReactElement> {
  if (labelRender === null) {
    return (
      <p
        role="status"
        data-label-none="true"
        className="max-w-[72ch] text-body"
      >
        {LABEL_NONE}
      </p>
    );
  }
  const view = await readDocument(ctx, labelRender);
  return (
    <div data-label-tab="true" className="flex flex-col gap-4">
      {needsRelabel ? (
        <p
          data-label-regenerate="true"
          className="max-w-[72ch] text-body-strong"
        >
          {LABEL_REGENERATE_FLAG}
        </p>
      ) : null}
      <div>
        <Button
          asChild
          variant="outline"
          size="lg"
          className={ACTION_BUTTON_CLASS}
        >
          <Link href={`/documents/${labelRender.id}`} data-open-label="true">
            {LABEL_OPEN}
          </Link>
        </Button>
      </div>
      <RenderViewer
        renderId={labelRender.id}
        pageCount={labelRender.pageCount}
        embedded
        metadata={{
          typeLabel: view.typeLabel,
          generatedAt: view.generatedAt,
          generatedBy: view.generatedBy,
          source: view.source,
          renderId: labelRender.id,
          statusLabel: view.statusLabel,
        }}
      >
        <DocumentPageContent view={view} />
      </RenderViewer>
    </div>
  );
}
