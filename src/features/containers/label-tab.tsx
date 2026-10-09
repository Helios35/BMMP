import Link from "next/link";
import type { ReactElement } from "react";

import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import type { RequestContext } from "@/data/contracts";
import type { ContainerLabelContentBuild } from "@/domain/documents/build-container-label-payload";
import { DocumentPanel } from "@/features/documents/document-page";
import { readDocument } from "@/features/documents/server/read-document";
import type { DocumentRender } from "@/types/documents";

import { GenerateLabelControl } from "./components/generate-label-control";
import {
  LABEL_BLOCKED_TITLE,
  LABEL_NONE,
  LABEL_OPEN,
  LABEL_REGENERATE_FLAG,
} from "./container-copy";

/**
 * **Label** — `UX_SPEC.md` §3.10: the `container_label` in force, shown as
 * the PDF that was issued, carrying the required regulatory phrase, the
 * contents description and the accumulation start date **exactly as they
 * were printed** (Rule 4.18).
 *
 * **Generate label** issues a new one — P1, P2 and P6 (§5.5) — and the one
 * it replaces is kept and marked superseded (Rules 4.20, 5.15). The system
 * **flags** when the label must be regenerated and **a human prints**
 * (Rule 4.21). When the label cannot be built, every missing input is listed
 * here, by name, beside the inert control. Print and Download of the label
 * in force are never disabled (Rule 5.27).
 */
export async function LabelTab({
  ctx,
  containerId,
  labelRender,
  needsRelabel,
  labelBuild,
}: {
  readonly ctx: RequestContext;
  readonly containerId: string;
  readonly labelRender: DocumentRender | null;
  readonly needsRelabel: boolean;
  /** Null for a role that cannot generate — nothing to explain to it. */
  readonly labelBuild: ContainerLabelContentBuild | null;
}): Promise<ReactElement> {
  const view =
    labelRender === null ? null : await readDocument(ctx, labelRender);
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
      {labelBuild === null ? null : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <GenerateLabelControl
              containerId={containerId}
              buildable={labelBuild.ok}
              replacesLabel={labelRender !== null}
            />
            {labelRender === null ? null : (
              <Button
                asChild
                variant="outline"
                size="lg"
                className={ACTION_BUTTON_CLASS}
              >
                <Link
                  href={`/documents/${labelRender.id}`}
                  data-open-label="true"
                >
                  {LABEL_OPEN}
                </Link>
              </Button>
            )}
          </div>
          {labelBuild.ok ? null : (
            <div
              data-label-blocked="true"
              className="flex max-w-[72ch] flex-col gap-1"
            >
              <p className="text-body-strong">{LABEL_BLOCKED_TITLE}</p>
              <ul className="grid list-disc gap-1 pl-6">
                {labelBuild.findings.map((finding) => (
                  <li
                    key={finding}
                    data-label-finding="true"
                    className="text-body"
                  >
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {labelBuild === null && labelRender !== null ? (
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
      ) : null}
      {view === null ? (
        <p
          role="status"
          data-label-none="true"
          className="max-w-[72ch] text-body"
        >
          {LABEL_NONE}
        </p>
      ) : (
        <DocumentPanel view={view} embedded />
      )}
    </div>
  );
}
