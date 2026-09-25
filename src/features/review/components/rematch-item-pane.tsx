"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { BookOpen, TriangleAlert } from "lucide-react";

import {
  InlineActionError,
  ReviewButton,
  useActionCall,
  ReasonDialog,
  type ReasonDialogCopy,
} from "@/components/extraction-review";
import { Field, FieldList, SectionCard } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

import { confirmRematch, declineRematch } from "../actions";
import {
  CHEMISTRY_NOT_SET,
  CONFIRM_MATCH,
  CONFIRMING_MATCH,
  ENTRY_NOT_AVAILABLE,
  KEEP_BODY,
  KEEP_CANCEL,
  KEEP_CONFIRM,
  KEEP_IDENTIFICATION,
  KEEP_REASON_LABEL,
  KEEP_REASON_REQUIRED,
  KEEP_TITLE,
  KEEPING,
  matchedOnSentence,
  REMATCH_BODY,
  REMATCH_CURRENT,
  REMATCH_PROPOSED,
  REMATCH_TITLE,
} from "../review-copy";
import { afterResolvingHref, type ResolutionOutcome } from "../review-hrefs";
import type { RematchItemView } from "../server/work-queue";

/**
 * A record raised by an approved catalog entry — `SITE_ARCHITECTURE.md` Flow F
 * step 4; `UX_SPEC.md` E-5; EC-10, EC-13.
 *
 * **Nothing about the record changed when it was raised.** This pane shows
 * what the record says now beside what the approved entry says, and where the
 * chemistry would change it says so **before** the person acts (EC-13). The
 * two ways out are both a person's (Rule 2.23): confirm the match — the
 * record's own re-match path, audited as `battery_record.confirmed` — or keep
 * the record as it is identified, with a stated reason (a handler's rejection
 * of a match always wins, EC-10).
 *
 * Neither is optimistic. The pane waits for the server, then the next item
 * opens.
 */

const KEEP_COPY: ReasonDialogCopy = {
  trigger: KEEP_IDENTIFICATION,
  title: KEEP_TITLE,
  body: KEEP_BODY,
  reasonLabel: KEEP_REASON_LABEL,
  reasonRequired: KEEP_REASON_REQUIRED,
  confirm: KEEP_CONFIRM,
  confirming: KEEPING,
  cancel: KEEP_CANCEL,
};

export function RematchItemPane({
  item,
  nextItemId,
}: {
  readonly item: RematchItemView;
  readonly nextItemId: string | null;
}): ReactElement {
  const router = useRouter();
  const confirm = useActionCall();

  function afterResolving(
    batteryRecordId: string,
    outcome: ResolutionOutcome,
  ): void {
    router.push(afterResolvingHref(nextItemId, batteryRecordId, outcome));
  }

  async function onConfirm(): Promise<void> {
    // `run` owns the pending state and the inline error; the typed result is
    // kept here so the next item opens only once the server has written it.
    const resolved: { recordId: string | null } = { recordId: null };
    await confirm.run(async () => {
      const result = await confirmRematch({ raiseId: item.raiseId });
      if (result.ok) resolved.recordId = result.data.batteryRecordId;
      return result;
    });
    if (resolved.recordId !== null) {
      afterResolving(resolved.recordId, "matched");
    }
  }

  async function onKeep(reason: string) {
    const result = await declineRematch({ raiseId: item.raiseId, reason });
    if (result.ok) afterResolving(result.data.batteryRecordId, "kept");
    return result;
  }

  return (
    <div
      data-queue-item-pane="rematch"
      data-raise-id={item.raiseId}
      className="flex min-w-0 flex-col gap-6"
    >
      <SectionCard
        title={REMATCH_TITLE}
        description={REMATCH_BODY}
        headingLevel={2}
      >
        <p data-rematch-matched-on="true" className="text-caption">
          {matchedOnSentence(item.matchedOn)}
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <div data-rematch-current="true" className="flex flex-col gap-3">
            <h3 className="text-h3">{REMATCH_CURRENT}</h3>
            <FieldList>
              <Field label="Identified as" value={item.current.title} />
              <Field
                label="Chemistry"
                value={item.current.chemistryLabel ?? CHEMISTRY_NOT_SET}
                note={item.current.chemistrySourceLabel ?? undefined}
              />
              <Field
                label="Confirmed by"
                value={
                  item.current.confirmedByName === null
                    ? null
                    : [
                        item.current.confirmedByName,
                        item.current.confirmedAtLabel,
                      ]
                        .filter((part): part is string => part !== null)
                        .join(", ")
                }
              />
            </FieldList>
          </div>

          <div data-rematch-entry="true" className="flex flex-col gap-3">
            <h3 className="text-h3 flex items-center gap-2">
              <BookOpen aria-hidden="true" className="size-4" />
              {REMATCH_PROPOSED}
            </h3>
            {item.entry === null ? (
              <p className="text-body">{ENTRY_NOT_AVAILABLE}</p>
            ) : (
              <FieldList>
                <Field label="Catalog entry" value={item.entry.title} />
                <Field label="Chemistry" value={item.entry.chemistryLabel} />
                {item.entry.specs.map((spec) => (
                  <Field key={spec} label="Specification" value={spec} />
                ))}
              </FieldList>
            )}
          </div>
        </div>

        {item.chemistryChange === null ? null : (
          <Alert
            role="status"
            data-rematch-chemistry-change="true"
            data-intent="attention"
            className={cn("gap-2", INTENT_SURFACE_CLASSES.attention)}
          >
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className="text-body-strong text-balance">
              {item.chemistryChange}
            </AlertTitle>
            <AlertDescription className="sr-only">
              {item.chemistryChange}
            </AlertDescription>
          </Alert>
        )}
      </SectionCard>

      {confirm.error === null ? null : (
        <InlineActionError
          dataAttribute="data-rematch-error"
          message={confirm.error}
        />
      )}

      <div
        data-rematch-actions="true"
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <ReasonDialog
          copy={KEEP_COPY}
          onSubmit={onKeep}
          tone="destructive"
          attributes={{
            trigger: { "data-keep-identification": "true" },
            dialog: { "data-keep-dialog": "true" },
            reason: { "data-keep-reason": "true" },
            confirm: { "data-keep-confirm": "true" },
          }}
        />
        <ReviewButton
          data-confirm-rematch="true"
          className="min-h-12 w-full md:min-h-11 md:w-auto"
          pending={confirm.pending}
          pendingLabel={CONFIRMING_MATCH}
          gatedReason={item.entry === null ? ENTRY_NOT_AVAILABLE : null}
          onPress={() => void onConfirm()}
        >
          {CONFIRM_MATCH}
        </ReviewButton>
      </div>
    </div>
  );
}
