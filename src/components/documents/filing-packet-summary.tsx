import type { ReactElement } from "react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import {
  gapLineText,
  totalLineText,
  type FilingLine,
  type FilingPacketContent,
} from "@/domain/documents/build-filing-packet-payload";
import { cn } from "@/lib/utils";

/**
 * A filing packet's content as a person reads it on screen — the Make packet
 * dialog before issuing, and `/documents/[id]` beside the stored PDF. Rules
 * 8.19, 8.20; `UX_SPEC.md` §3.14, §3.21.
 *
 * **Every value and every gap where it falls**: "Not on file" with who can
 * fix it, "Not held here" by name, and a total with a gap says how many
 * entries are missing. It leads with "A packet is not the filing" and where
 * to send it. It prints what the payload holds and decides nothing.
 */

function Line({ line }: { readonly line: FilingLine }): ReactElement {
  switch (line.kind) {
    case "value":
      return (
        <li className="text-body" data-filing-line="value">
          {line.text}
        </li>
      );
    case "gap":
      return (
        <li
          className={cn(
            "rounded-md px-2 py-1 text-body-strong",
            INTENT_SURFACE_CLASSES.attention,
          )}
          data-filing-line="gap"
        >
          {gapLineText(line)}
        </li>
      );
    case "not_held":
      return (
        <li
          className="rounded-md border border-border px-2 py-1 text-body-strong"
          data-filing-line="not_held"
        >
          {line.text}
        </li>
      );
    case "total":
      return (
        <li
          className="text-body-strong"
          data-filing-line="total"
          data-filing-total-missing={String(line.missing)}
        >
          {totalLineText(line)}
        </li>
      );
  }
}

export function FilingPacketSummary({
  content,
  showNotice = true,
}: {
  readonly content: Pick<
    FilingPacketContent,
    "notTheFiling" | "sendToWords" | "period" | "gaps" | "items"
  >;
  /** The dialog shows the notice in its own header. */
  readonly showNotice?: boolean;
}): ReactElement {
  return (
    <div className="flex flex-col gap-4" data-filing-packet-summary="true">
      {showNotice ? (
        <div
          className={cn(
            "flex flex-col gap-1 rounded-md px-3 py-3",
            INTENT_SURFACE_CLASSES.neutral,
          )}
          role="note"
          data-filing-not-the-filing="true"
        >
          <p className="text-body-strong">{content.notTheFiling}</p>
          <p className="text-body" data-filing-send-to="true">
            {content.sendToWords}
          </p>
        </div>
      ) : null}
      <p className="text-body" data-filing-period={content.period.kind}>
        {content.period.words}
      </p>
      <p className="text-body-strong" data-filing-gaps="true">
        {content.gaps.words}
      </p>
      <ol className="flex flex-col gap-3">
        {content.items.map((item, index) => (
          <li
            key={`${item.source}-${String(index)}`}
            className="flex flex-col gap-1 border-t border-border pt-3"
            data-filing-item={item.source}
            data-filing-item-gaps={String(item.gaps)}
          >
            <p className="text-body-strong">{item.label}</p>
            <p className="text-caption text-muted-foreground">
              {`${item.sourceLabel} · ${item.citation}`}
            </p>
            <ul className="flex flex-col gap-1">
              {item.lines.map((line, lineIndex) => (
                <Line key={String(lineIndex)} line={line} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
