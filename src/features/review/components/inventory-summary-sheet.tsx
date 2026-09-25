"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { CircleDashed, ImageOff } from "lucide-react";

import { ConfidenceBandDisplay } from "@/components/confidence/confidence-band-display";
import { NOT_READ } from "@/components/extraction-review";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { FieldSourceBadge } from "@/components/provenance/field-source-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  IMAGE_NOT_SERVED,
  OPEN_CONTAINER,
  OPEN_RECORD,
  SUMMARY_TITLE,
  WHO_CONFIRMS,
} from "../review-copy";
import type { InventorySummary } from "../server/inventory";

/**
 * The read-only summary panel — `UX_SPEC.md` §3.8b, §4.2, E-8b.
 *
 * **Not `ExtractionReviewCard`, and nothing on it acts.** The label crop, the
 * fields as they were read with their confidence bands and sources, and a
 * plain statement of what is still unconfirmed. No Confirm, no Change, no
 * Reject, no Void — **absent, not disabled**: P2 is a colleague doing a
 * different job, and a greyed-out Confirm is an invitation to ask for a
 * permission Rule 2.22 withholds. What she can do is open the record or the
 * container, at primary weight.
 *
 * Opened by `?item=` and closed by removing it, so the selection is a link.
 */
export function InventorySummarySheet({
  summary,
  closeHref,
  canOpenRecord,
  canOpenContainer,
}: {
  readonly summary: InventorySummary | null;
  readonly closeHref: string;
  readonly canOpenRecord: boolean;
  readonly canOpenContainer: boolean;
}): ReactElement {
  const router = useRouter();
  return (
    <Sheet
      open={summary !== null}
      onOpenChange={(open) => {
        if (!open) router.push(closeHref, { scroll: false });
      }}
    >
      <SheetContent
        side="right"
        data-inventory-summary="true"
        className="w-full gap-4 overflow-y-auto p-4 sm:max-w-lg"
      >
        {summary === null ? null : (
          <>
            <SheetHeader className="p-0">
              <SheetTitle className="text-h2">
                <span className="text-mono">{summary.recordNumber}</span>
              </SheetTitle>
              <SheetDescription className="text-body text-foreground">
                {summary.unconfirmed}
              </SheetDescription>
            </SheetHeader>

            {summary.crop === null ? null : (
              <figure
                data-summary-crop="true"
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <figcaption className="text-label">
                  {summary.crop.label}
                </figcaption>
                <div
                  style={{
                    aspectRatio: `${summary.crop.width} / ${summary.crop.height}`,
                  }}
                  className="flex w-full items-center justify-center rounded-md border border-border bg-muted"
                >
                  <ImageOff aria-hidden="true" className="size-6" />
                  <span className="sr-only">{IMAGE_NOT_SERVED}</span>
                </div>
              </figure>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-h3">{SUMMARY_TITLE}</h3>
              <ul data-summary-fields="true" className="flex flex-col gap-2">
                {summary.fields.map((field) => (
                  <li
                    key={field.fieldCode}
                    data-summary-field={field.fieldCode}
                    data-field-status={field.status}
                    className="flex flex-col gap-1 rounded-md border border-border p-3"
                  >
                    <span className="text-label">{field.label}</span>
                    <span className="text-body">
                      {field.value ?? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CircleDashed aria-hidden="true" className="size-4" />
                          {NOT_READ}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {field.confidenceBand === null ? null : (
                        <ConfidenceBandDisplay band={field.confidenceBand} />
                      )}
                      {field.value === null ? null : (
                        <FieldSourceBadge source={field.source} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <p className="text-caption text-muted-foreground">{WHO_CONFIRMS}</p>

            <div className="flex flex-col gap-2 sm:flex-row">
              {canOpenRecord ? (
                <Button asChild size="lg" className={ACTION_BUTTON_CLASS}>
                  <Link
                    href={`/batteries/${summary.recordId}`}
                    data-summary-open-record="true"
                  >
                    {OPEN_RECORD}
                  </Link>
                </Button>
              ) : null}
              {canOpenContainer && summary.containerId !== null ? (
                <Button asChild size="lg" className={ACTION_BUTTON_CLASS}>
                  <Link
                    href={`/containers/${summary.containerId}`}
                    data-summary-open-container="true"
                  >
                    {OPEN_CONTAINER}
                  </Link>
                </Button>
              ) : null}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
