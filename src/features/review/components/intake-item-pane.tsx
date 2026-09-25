"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactElement } from "react";

import { ConditionForm } from "@/components/condition/condition-form";
import {
  ExtractionReviewCard,
  ReviewActionBar,
  VoidItemDialog,
  type ReviewCardState,
} from "@/components/extraction-review";
import { useOnlineStatus } from "@/components/offline/use-online-status";
import { SectionCard } from "@/components/page";
import { ContainerPicker } from "@/components/storage/container-picker";
import {
  outstandingCommitItems,
  type OutstandingItem,
} from "@/domain/intake/commit-gate";
import { bindPlacementActions } from "@/features/intake/components/bind-actions";
import { intakeStepHref } from "@/features/intake/components/intake-hrefs";

import {
  COMMITTING,
  CONDITION_SECTION,
  CONFIRM_AND_COMMIT,
  PLACEMENT_DESCRIPTION,
  PLACEMENT_SECTION,
} from "../review-copy";
import type { IntakeItemView } from "../server/work-queue";
import { bindQueueActions } from "./bind-queue-actions";

/**
 * One intake the gate held, worked on `/review` — `UX_SPEC.md` §3.8a,
 * §2.1, E-4, E-5; Rules 2.15, 2.22, 2.23; D-42.
 *
 * **The same `ExtractionReviewCard` as `/batteries/new` step 2**, in `review`
 * mode — not a second implementation. Beneath it, the two pieces of step 3 a
 * commit cannot do without: the assessed condition (the third attributable
 * confirmation, Rule 6.2) and, optionally, the container. Then the action
 * bar the card itself exports, whose primary on this route is **Confirm and
 * commit** — `confirmReviewItem`, the queue's door onto the intake's one
 * commit. Its checklist is `outstandingCommitItems` over the server's own
 * inputs, the list the commit refuses with, D-42's photo included.
 *
 * **Exactly two ways out**: the commit, or **Void this item** with a reason.
 * Where the card has no rows to act on — nothing read (E-4) or a failed read
 * (EC-14) — the void is offered beside it, because an item must never sit on
 * the queue with no way out a person can take (Rule 2.23).
 *
 * Nothing here is optimistic (§6.4): every write goes to the server and the
 * pane re-reads. Offline, the card is disabled with the reason and the
 * checklist says to reconnect.
 */

const OFFLINE_REASON =
  "You're offline. Confirmations can't be saved until you reconnect; values stay readable.";

export interface IntakeItemPaneProps {
  readonly item: IntakeItemView;
  /** What opens once this item has left the queue. */
  readonly nextItemId: string | null;
  readonly uploadUrl: string;
}

function scrollTo(selector: string): void {
  const target = document.querySelector<HTMLElement>(selector);
  target?.scrollIntoView({ block: "center" });
  target
    ?.querySelector<HTMLElement>(
      "button:not([aria-disabled='true']), input, [role='combobox']",
    )
    ?.focus({ preventScroll: true });
}

export function IntakeItemPane({
  item,
  nextItemId,
  uploadUrl,
}: IntakeItemPaneProps): ReactElement {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [manual, setManual] = useState(false);

  const actions = useMemo(
    () =>
      bindQueueActions({
        sessionId: item.sessionId,
        batteryRecordId: item.recordId,
        correlationId: item.correlationId,
        labelPhotoId: item.labelPhotoId,
        labelFileName: null,
        proposal: item.proposal,
        catalogQuery: item.catalogQuery,
        nextItemId,
        navigate: (href) => router.push(href),
        refresh: () => router.refresh(),
        enterManually: () => setManual(true),
        readFailed: item.card.state === "error",
      }),
    [item, nextItemId, router],
  );
  const placement = useMemo(
    () =>
      bindPlacementActions({
        sessionId: item.sessionId,
        refresh: () => router.refresh(),
      }),
    [item.sessionId, router],
  );

  const state: ReviewCardState = !isOnline
    ? "disabled"
    : manual && (item.card.state === "empty" || item.card.state === "error")
      ? "default"
      : item.card.state;
  const showsRows = state === "default" || state === "disabled";

  const outstanding = outstandingCommitItems({
    ...item.commitGate,
    isOffline: !isOnline,
  });

  function onOutstandingItem(entry: OutstandingItem): void {
    switch (entry.kind) {
      case "confirm_condition":
        scrollTo("[data-condition-form]");
        return;
      case "choose_container":
        scrollTo("[data-container-picker]");
        return;
      case "photo_required":
        // D-42 — the camera is on the capture step; the item stays queued.
        router.push(intakeStepHref(item.sessionId, "capture"));
        return;
      case "offline":
      case "classification_blocked":
        return;
      default:
        if (entry.fieldCode !== undefined) {
          scrollTo(`[data-field-row="${entry.fieldCode}"]`);
        }
    }
  }

  return (
    <div
      data-queue-item-pane="intake"
      data-session-id={item.sessionId}
      className="flex min-w-0 flex-col gap-6"
    >
      <ExtractionReviewCard
        {...item.card}
        state={state}
        {...(state === "disabled" ? { disabledReason: OFFLINE_REASON } : {})}
        outstanding={outstanding}
        primaryLabel={CONFIRM_AND_COMMIT}
        primaryPendingLabel={COMMITTING}
        mode="review"
        renderActionBar={false}
        actions={actions}
      />

      {showsRows ? (
        <>
          <SectionCard title={CONDITION_SECTION} headingLevel={2}>
            <ConditionForm
              findings={item.condition.findings}
              isDefective={item.condition.isDefective}
              confirmed={item.condition.confirmed}
              onChange={placement.setCondition}
              onConfirm={placement.confirmCondition}
              damagePhoto={{ sessionId: item.sessionId, uploadUrl }}
              {...(state === "disabled"
                ? { disabledReason: OFFLINE_REASON }
                : {})}
            />
          </SectionCard>

          <SectionCard
            title={PLACEMENT_SECTION}
            description={PLACEMENT_DESCRIPTION}
            headingLevel={2}
          >
            <ContainerPicker
              containers={item.placement.containers}
              selectedId={item.placement.selectedId}
              onSelect={(id) =>
                id !== null && id === item.placement.selectedId
                  ? Promise.resolve({ ok: true, data: null })
                  : placement.choosePlacement(id)
              }
              canCreate
              whoCanCreate={item.placement.whoCanCreate}
              onCreate={placement.createContainer}
              requiredTypeLabel={item.placement.requiredTypeLabel}
            />
          </SectionCard>

          <ReviewActionBar
            primaryLabel={CONFIRM_AND_COMMIT}
            primaryPendingLabel={COMMITTING}
            outstanding={outstanding}
            showVoid
            actions={actions}
            onOutstandingItem={onOutstandingItem}
          />
        </>
      ) : (
        <div
          data-review-secondary-actions="true"
          className="flex flex-wrap items-center gap-2"
        >
          {actions.voidItem === undefined ? null : (
            <VoidItemDialog onVoid={actions.voidItem} />
          )}
        </div>
      )}
    </div>
  );
}
