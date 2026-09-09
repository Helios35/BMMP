"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactElement } from "react";
import { CircleAlert, CircleOff } from "lucide-react";

import { ClassificationOutcome } from "@/components/classification/classification-outcome";
import { InlineActionError } from "@/components/extraction-review";
import { useOnlineStatus } from "@/components/offline/use-online-status";
import { Field, FieldList, SectionCard } from "@/components/page";
import {
  FieldSourceBadge,
  type FieldSource,
} from "@/components/provenance/field-source-badge";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { StorageClockMeter } from "@/components/storage/storage-clock-meter";
import { Alert, AlertTitle } from "@/components/ui/alert";
import type { ClassificationResult } from "@/domain/classification/waste-stream";
import {
  outstandingCommitItems,
  type CommitGateInput,
  type OutstandingItem,
} from "@/domain/intake/commit-gate";
import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import { cn } from "@/lib/utils";
import type { IsoTimestamp } from "@/types/common";
import type { DraftSourceDevice, DraftStateOfCharge } from "@/types/intake";
import type { StorageClock } from "@/types/storage";

import { NEW_CLOCK_ON_PLACEMENT } from "../copy";
import { bindPlacementActions } from "./bind-actions";
import { ConditionForm } from "./condition-form";
import { ContainerPicker, type ContainerPickerRow } from "./container-picker";
import { intakeStepHref } from "./intake-hrefs";
import type { UploadTransport } from "./photo-capture-step";
import { SourceDeviceForm } from "./source-device-form";
import { StateOfChargeForm } from "./state-of-charge-form";
import { StepFrame, type StepFrameProps } from "./step-frame";

/**
 * `ConfirmAndPlaceStep` — step 3 of `/batteries/new` (`UX_SPEC.md` §3.9,
 * §2.1.4(6), §6.2; Rules 3.7, 4.4, 6.2).
 *
 * Top to bottom: the assessed condition (the third attributable
 * confirmation — Rule 6.2), the state of charge, the source device, the
 * container picker with the storage-clock preview beside it, the
 * classification outcome as a preview with its reasoning shown, the summary
 * of every confirmed field with its source, and the primary **Confirm and
 * log battery**.
 *
 * ## What this component decides
 *
 * Nothing about the record. Admission to each container, the required
 * container type, the classification and the clock arrive computed by the
 * server from the draft; this component renders them and sends every change
 * back through `bindPlacementActions`, then re-reads. The primary's
 * checklist is `outstandingCommitItems` over the server's own inputs, with
 * *offline* joined here because only the browser knows it — the same list
 * `confirmIntake` refuses with, so the reason on screen is the reason the
 * server would give.
 *
 * ## The commit
 *
 * Never optimistic (§6.4). The primary enters *Logging battery…* and waits;
 * on success the action redirects to the record, where the toast fires
 * (§6.2); on refusal the message renders above the primary and nothing on
 * this screen changes. A field-level item in the checklist — a chemistry not
 * confirmed, say — returns the person to step 2, where the row is.
 *
 * `canCreate` is true for every role that reaches this page: P1 and P6 both
 * hold `container.insert`, and no other role holds `write` on this route.
 */

export interface ConditionView {
  readonly findings: readonly DamageFindingType[];
  readonly isDefective: boolean;
  /** Server state — who confirmed, and when, in the site's zone. */
  readonly confirmed: { readonly byName: string; readonly at: string } | null;
}

export interface PlacementView {
  readonly containers: readonly ContainerPickerRow[];
  readonly selectedId: string | null;
  /** From `CONTAINER_TYPE_LABELS`; `null` while undetermined. */
  readonly requiredTypeLabel: string | null;
  readonly whoCanCreate: string;
}

export type ClockPreview =
  | {
      readonly kind: "running";
      readonly clock: StorageClock;
      readonly label: string;
      readonly asOf: IsoTimestamp;
    }
  /** No clock yet — a new one starts when this battery is placed. */
  | { readonly kind: "none" }
  /** E-13 — the rule or the profile the clock needs is not on file. */
  | { readonly kind: "unresolved"; readonly message: string };

export interface SummaryField {
  readonly fieldCode: LabelFieldCode;
  readonly label: string;
  readonly value: string;
  readonly source: FieldSource;
  readonly enteredByName: string | null;
}

export interface ConfirmAndPlaceStepProps {
  readonly frame: Pick<StepFrameProps, "title" | "breadcrumbs" | "notice">;
  readonly sessionId: string;
  readonly uploadUrl: string;
  readonly condition: ConditionView;
  readonly stateOfCharge: DraftStateOfCharge | null;
  readonly sourceDevice: DraftSourceDevice | null;
  readonly placement: PlacementView;
  readonly classification: {
    readonly preview: ClassificationResult;
    readonly jurisdictionLabel: string;
  };
  readonly clock: ClockPreview;
  readonly summary: readonly SummaryField[];
  /** The server's gate inputs; `isOffline` is joined here. */
  readonly commitGate: Omit<CommitGateInput, "isOffline">;
  /** Tests inject a transport for the damage photo; the default is the browser's. */
  readonly transport?: UploadTransport;
}

const PRIMARY_LABEL = "Confirm and log battery";
const PRIMARY_PENDING = "Logging battery…";

const SUMMARY_EMPTY =
  "No field has been confirmed yet. Confirm the label fields on the previous step.";

export function ConfirmAndPlaceStep({
  frame,
  sessionId,
  uploadUrl,
  condition,
  stateOfCharge,
  sourceDevice,
  placement,
  classification,
  clock,
  summary,
  commitGate,
  transport,
}: ConfirmAndPlaceStepProps): ReactElement {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [notice, setNotice] = useState<string | null>(null);

  const actions = useMemo(
    () =>
      bindPlacementActions({
        sessionId,
        refresh: () => router.refresh(),
      }),
    [sessionId, router],
  );

  const outstanding = outstandingCommitItems({
    ...commitGate,
    isOffline: !isOnline,
  });

  async function onConfirm(): Promise<void> {
    setNotice(null);
    const result = await actions.confirmIntake();
    // Success is a redirect the action performs; only a refusal comes back.
    if (result !== undefined && !result.ok) setNotice(result.error.message);
  }

  function onOutstandingItem(item: OutstandingItem): void {
    switch (item.kind) {
      case "confirm_condition":
        scrollTo("[data-condition-form]");
        return;
      case "choose_container":
        scrollTo("[data-container-picker]");
        return;
      case "classification_blocked":
        scrollTo("[data-classification-outcome]");
        return;
      case "offline":
        return;
      default:
        // A label field still outstanding lives on the review step.
        router.push(intakeStepHref(sessionId, "extraction_review"));
    }
  }

  return (
    <StepFrame
      {...frame}
      sessionId={sessionId}
      currentStep="confirm_and_place"
      reachedStep="confirm_and_place"
      actionBar={{
        primary: {
          label: PRIMARY_LABEL,
          pendingLabel: PRIMARY_PENDING,
          onClick: onConfirm,
          disabled: outstanding.length > 0,
        },
        outstanding,
        onOutstandingItem,
        notice:
          notice === null ? null : (
            <InlineActionError
              dataAttribute="data-commit-error"
              message={notice}
            />
          ),
      }}
    >
      <SectionCard title="Assessed condition" headingLevel={2}>
        <ConditionForm
          findings={condition.findings}
          isDefective={condition.isDefective}
          confirmed={condition.confirmed}
          onChange={actions.setCondition}
          onConfirm={actions.confirmCondition}
          damagePhoto={{ sessionId, uploadUrl }}
          {...(transport === undefined ? {} : { transport })}
        />
      </SectionCard>

      <SectionCard title="State of charge" headingLevel={2}>
        <StateOfChargeForm
          value={stateOfCharge}
          onChange={actions.setStateOfCharge}
        />
      </SectionCard>

      <SectionCard
        title="Source device"
        description="Optional. What the battery came out of, as told to you."
        headingLevel={2}
      >
        <SourceDeviceForm
          value={sourceDevice}
          onChange={actions.setSourceDevice}
        />
      </SectionCard>

      <SectionCard title="Place into a container" headingLevel={2}>
        <ContainerPicker
          containers={placement.containers}
          selectedId={placement.selectedId}
          onSelect={(id) =>
            // `createContainerForIntake` has already named the new container
            // on the draft, and the picker calls back with the same id; a
            // second write would be a no-op the server still has to make.
            id !== null && id === placement.selectedId
              ? Promise.resolve({ ok: true, data: null })
              : actions.choosePlacement(id)
          }
          canCreate
          whoCanCreate={placement.whoCanCreate}
          onCreate={actions.createContainer}
          requiredTypeLabel={placement.requiredTypeLabel}
        />
        <ClockPreviewBlock preview={clock} />
      </SectionCard>

      <ClassificationOutcome
        preview={classification.preview}
        jurisdictionLabel={classification.jurisdictionLabel}
      />

      <SectionCard
        title="Summary"
        description="Every field confirmed so far, with where its value came from."
        headingLevel={2}
        dataAttributes={{ "data-summary-strip": "true" }}
      >
        {summary.length === 0 ? (
          <p role="status" className="max-w-[72ch] text-body">
            {SUMMARY_EMPTY}
          </p>
        ) : (
          <FieldList>
            {summary.map((field) => (
              <Field
                key={field.fieldCode}
                label={field.label}
                value={field.value}
                mono={
                  field.fieldCode === "model" ||
                  field.fieldCode === "serial_number" ||
                  field.fieldCode === "date_code"
                }
                source={
                  <FieldSourceBadge
                    source={field.source}
                    {...(field.enteredByName === null
                      ? {}
                      : { enteredByName: field.enteredByName })}
                  />
                }
              />
            ))}
          </FieldList>
        )}
      </SectionCard>
    </StepFrame>
  );
}

function scrollTo(selector: string): void {
  const target = document.querySelector<HTMLElement>(selector);
  target?.scrollIntoView({ block: "start" });
}

/**
 * The storage clock this placement would join, start, or cannot start.
 *
 * A running clock renders the meter itself — the record joins it (Rule 4.4).
 * No clock is a neutral line, never an empty bar. A missing rule or profile
 * is stated with who can supply it (E-13), never defaulted.
 */
function ClockPreviewBlock({
  preview,
}: {
  readonly preview: ClockPreview;
}): ReactElement {
  if (preview.kind === "running") {
    return (
      <div data-clock-preview="running" className="flex flex-col gap-2">
        <h3 className="text-label">Storage clock</h3>
        <StorageClockMeter
          clock={preview.clock}
          label={preview.label}
          asOf={preview.asOf}
        />
      </div>
    );
  }
  if (preview.kind === "unresolved") {
    return (
      <Alert
        role="status"
        data-clock-preview="unresolved"
        className={cn("gap-2 border", INTENT_SURFACE_CLASSES.attention)}
      >
        <CircleAlert aria-hidden="true" />
        <AlertTitle className="text-body-strong text-balance">
          {preview.message}
        </AlertTitle>
      </Alert>
    );
  }
  return (
    <p
      role="status"
      data-clock-preview="none"
      className={cn(
        "flex items-center gap-2 rounded-lg border p-3 text-body",
        INTENT_SURFACE_CLASSES.neutral,
      )}
    >
      <CircleOff aria-hidden="true" className="size-4 shrink-0" />
      <span>{NEW_CLOCK_ON_PLACEMENT}</span>
    </p>
  );
}
