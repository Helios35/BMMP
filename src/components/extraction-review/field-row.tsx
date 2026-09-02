"use client";

import {
  useId,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { CircleCheck } from "lucide-react";

import {
  ConfidenceBandDisplay,
  ConfidenceBandDisplaySkeleton,
} from "@/components/confidence/confidence-band-display";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import {
  FieldSourceBadge,
  FieldSourceBadgeSkeleton,
} from "@/components/provenance/field-source-badge";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TRANSPORT_TEST_MARKING_VALUES } from "@/domain/intake/field-validation";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import {
  CONFIDENCE_BAND_LABELS,
  CONFIDENCE_BANDS,
  type ConfidenceBand,
} from "@/domain/taxonomy/confidence-band";
import { optionsFor, readTaxonomyValue } from "@/domain/taxonomy/lookup";
import { cn } from "@/lib/utils";
import type { TimeZone } from "@/types/common";
import {
  CANCEL_EDIT,
  CHANGE,
  CHEMISTRY_HOW_TO_SET,
  CHEMISTRY_REJECT_NOTE,
  CHEMISTRY_SELECT_LABEL,
  CHEMISTRY_SELECT_PLACEHOLDER,
  CHEMISTRY_UNSET,
  CONFIDENCE_PREFIX,
  CONFIRM,
  CONFIRM_CORRECTED,
  CONFIRMING,
  CORRECT,
  DECODED_PREFIX,
  ENTER_VALUE,
  ENTERED_BY_YOU,
  formatInstant,
  labelCharactersCaption,
  LEAVE_EMPTY,
  modelReportedCaption,
  NO_SOURCE_YET,
  NOT_READ,
  readAsCaption,
  REJECT,
  REJECTED_NEEDS_VALUE,
  REJECTED_NEEDS_VALUE_REQUIRED,
  REJECTING,
  ROW_STATUS_TEXT,
  SAVE_ENTERED,
  SAVING_ENTERED,
  TRANSPORT_TEST_MARKING_LABELS,
  UNDECODABLE,
} from "./review-copy";
import {
  InlineActionError,
  ReviewButton,
  useActionCall,
  useReviewDisabled,
} from "./review-controls";
import type {
  ChemistryFieldSource,
  ExtractionReviewActions,
  ReviewFieldView,
} from "./types";

/**
 * `FieldRow` — the atomic unit of the extraction review card
 * (`UX_SPEC.md` §2.1.2, §2.1.4, §2.1.5, §2.1.7).
 *
 * Four things, always, in this order: **field name · value · where it came
 * from · confidence.** Then the confirm control. The name is `label` at full
 * foreground and never muted; the value is `body-strong`, or `mono` for an
 * identifier; the source is a `FieldSourceBadge`; the band is a
 * `ConfidenceBandDisplay` and **never a raw score** (D-22).
 *
 * ## What a person confirming looks like
 *
 * A confirmation is a call to the route's action and a wait. **The row shows
 * *confirmed* only when the props say so** — the server has written it and
 * re-rendered the card. Nothing in this file flips a status on its own (§6.4).
 * Editing state is the one thing held locally: whether the row is open for
 * correction, and what has been typed so far.
 *
 * Entering and confirming are two acts (Rule 2.21, `draft.ts`). A row that
 * already has a value confirms a correction in one step — *Confirm corrected
 * value* — because the person is standing on a read and attesting to it. A row
 * with no value (not read, or rejected) **saves the entry as pending first**,
 * and the row's ordinary *Confirm* is then the attributable act.
 *
 * ## Chemistry
 *
 * The chemistry row can render exactly two sources — *Matched from catalog*
 * or *Entered by you* — and {@link chemistryRowSource} is typed so a third is
 * unrepresentable. The characters the label printed are shown as characters,
 * as a caption, because that is what they are (T-09): they set nothing.
 * Chemistry on the record comes from a catalog candidate or a person
 * (Rules 2.9, 2.10; `_ANCHORS.md` §7.2).
 */

const CHEMISTRY_FIELD = "chemistry_code";

/** T-01 without `unknown`: a person enters a chemistry; unknown is the absence of one. */
const ENTERABLE_CHEMISTRIES = optionsFor(CHEMISTRIES, CHEMISTRY_LABELS).filter(
  (option) => option.value !== "unknown",
);

/**
 * The chemistry row's source, or `null` when nothing has set a chemistry yet.
 *
 * `null` renders **no badge** and a line saying how to set one — the same
 * answer `/batteries/[id]` gives an unrecognised stored source. Guessing a
 * chemistry provenance is precisely the failure `_ANCHORS.md` §7.2 exists to
 * stop.
 */
export function chemistryRowSource(
  field: Pick<ReviewFieldView, "source" | "value">,
): ChemistryFieldSource | null {
  if (field.value === null) return null;
  if (field.source === "matched_from_catalog") return "matched_from_catalog";
  if (field.source === "entered_by") return "entered_by";
  return null;
}

function isConfidenceBand(value: string): value is ConfidenceBand {
  return (CONFIDENCE_BANDS as readonly string[]).includes(value);
}

/** The band half of the accessible name, from T-10's own labels. */
function bandText(band: ConfidenceBand | null): string {
  if (band === null) return `${CONFIDENCE_PREFIX} not evaluated`;
  return `${CONFIDENCE_PREFIX} ${isConfidenceBand(band) ? CONFIDENCE_BAND_LABELS[band] : band}`;
}

export interface FieldRowProps {
  readonly field: ReviewFieldView;
  readonly timeZone: TimeZone;
  readonly actions: ExtractionReviewActions;
}

export function FieldRow({
  field,
  timeZone,
  actions,
}: FieldRowProps): ReactElement {
  const ids = {
    label: useId(),
    source: useId(),
    band: useId(),
    status: useId(),
    editor: useId(),
  };
  const disabled = useReviewDisabled();
  const confirmCall = useActionCall();
  const rejectCall = useActionCall();
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");

  const isChemistry = field.fieldCode === CHEMISTRY_FIELD;
  const isReadonly = field.input.kind === "readonly";
  // The chemistry row "has a value" only once a catalog candidate or a person
  // has set one; the label's printed characters are not a chemistry (T-09).
  const hasValue = isChemistry
    ? chemistryRowSource(field) !== null
    : field.value !== null;
  const canLeaveEmpty = !field.isRequired && !isChemistry;
  const isMono =
    field.input.kind === "mono" ||
    field.fieldCode === "serial_number" ||
    field.fieldCode === "date_code";

  const chemistrySource = isChemistry ? chemistryRowSource(field) : null;
  const sourceBadge = isChemistry ? (
    chemistrySource === null ? null : (
      <FieldSourceBadge
        source={chemistrySource}
        enteredByName={
          chemistrySource === "entered_by" ? ENTERED_BY_YOU : undefined
        }
      />
    )
  ) : (
    <FieldSourceBadge
      source={field.source}
      enteredByName={field.source === "entered_by" ? ENTERED_BY_YOU : undefined}
    />
  );

  const rowIntent =
    field.status === "confirmed"
      ? "ok"
      : field.status === "rejected"
        ? "critical"
        : null;

  function openEditor(): void {
    if (disabled.reason !== null || isReadonly) return;
    setDraftValue(field.value ?? "");
    setEditing(true);
  }

  function closeEditor(): void {
    setEditing(false);
  }

  /** §6.6 — `E` edits the focused row. Typing inside an input is not a shortcut. */
  function onRowKeyDown(event: KeyboardEvent<HTMLFieldSetElement>): void {
    if (event.key !== "e" && event.key !== "E") return;
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (target.isContentEditable) return;
    if (editing) return;
    event.preventDefault();
    openEditor();
  }

  async function confirm(value: string | null): Promise<void> {
    const result = await confirmCall.run(() =>
      actions.confirmField(field.fieldCode, value),
    );
    if (result?.ok === true) closeEditor();
  }

  async function saveEntered(value: string): Promise<void> {
    const result = await confirmCall.run(() =>
      actions.enterValue(field.fieldCode, value),
    );
    if (result?.ok === true) closeEditor();
  }

  async function enterChemistry(value: string): Promise<void> {
    const read = readTaxonomyValue(CHEMISTRIES, CHEMISTRY_LABELS, value);
    // The Select only offers T-01 values, so this branch is a guard, not a path.
    if (!read.recognised || read.storedValue === "unknown") return;
    const result = await confirmCall.run(() =>
      actions.enterChemistry(read.storedValue),
    );
    if (result?.ok === true) closeEditor();
  }

  async function reject(): Promise<void> {
    const result = await rejectCall.run(() =>
      actions.rejectField(field.fieldCode),
    );
    // §2.1.5 — rejecting the catalog-matched chemistry also clears the match
    // and reopens the panel.
    if (
      result?.ok === true &&
      isChemistry &&
      field.source === "matched_from_catalog"
    ) {
      await rejectCall.run(() => actions.selectCandidate(null));
    }
    closeEditor();
  }

  const statusText = ROW_STATUS_TEXT[field.status];
  const inFlight = confirmCall.pending || rejectCall.pending;

  return (
    <fieldset
      data-field-row={field.fieldCode}
      data-field-status={field.status}
      data-field-band={field.confidenceBand ?? undefined}
      data-hard-gated={field.isHardGated ? "true" : undefined}
      data-intent={rowIntent ?? undefined}
      data-editing={editing ? "true" : undefined}
      aria-labelledby={`${ids.label} ${ids.source} ${ids.band} ${ids.status}`}
      aria-busy={inFlight ? "true" : undefined}
      onKeyDown={onRowKeyDown}
      className={cn(
        // §2.1.6 Focus — a 2px left bar identifies the focused row at a glance.
        // Hover — a wash, desktop only, revealing nothing not already visible.
        "flex min-w-0 flex-col gap-3 rounded-md border-l-2 border-l-transparent p-3 transition-colors duration-100 focus-within:border-l-ring motion-reduce:transition-none md:hover:bg-muted/50",
        "md:grid md:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)_auto_auto] md:items-start md:gap-x-6",
        disabled.reason !== null && "opacity-60",
      )}
    >
      {/* Floated so the legend is an ordinary flow child rather than the
          fieldset's rendered legend, and the row can lay out as a grid. Never
          muted (§1.2 Rule 3). */}
      <legend id={ids.label} className="float-left text-label text-foreground">
        {field.label}
        <span className="sr-only">,</span>
      </legend>

      {/* Value */}
      <div className="flex min-w-0 flex-col gap-2">
        {editing ? (
          <Editor
            field={field}
            editorId={ids.editor}
            draftValue={draftValue}
            onDraftChange={setDraftValue}
            onEnterChemistry={enterChemistry}
          />
        ) : (
          <ValueLine
            field={field}
            isMono={isMono}
            timeZone={timeZone}
            onTap={
              isReadonly || disabled.reason !== null ? undefined : openEditor
            }
          />
        )}
        <Captions field={field} editing={editing} isChemistry={isChemistry} />
      </div>

      {/* Source, then confidence — in that order, always. The accessible
          name (§2.1.7) is assembled from the source badge's own text and two
          sr-only spans, so the band's secondary lines never enter it. */}
      <div className="flex flex-wrap items-start gap-2 md:flex-col">
        <span id={ids.source} className="inline-flex">
          {sourceBadge ?? <span className="sr-only">{NO_SOURCE_YET}</span>}
          <span className="sr-only">,</span>
        </span>
        <span className="inline-flex flex-col">
          <ConfidenceBandDisplay
            band={field.confidenceBand}
            rawConfidence={field.rawConfidence}
            isHardGated={field.isHardGated}
          />
        </span>
        <span id={ids.band} className="sr-only">
          {`${bandText(field.confidenceBand)},`}
        </span>
        <span id={ids.status} className="sr-only">
          {statusText}
        </span>
      </div>

      {/* Controls */}
      {isReadonly ? (
        <div className="md:col-span-1" />
      ) : (
        <div className="flex flex-col gap-2 md:items-end">
          <Controls
            field={field}
            editing={editing}
            draftValue={draftValue}
            hasValue={hasValue}
            isChemistry={isChemistry}
            canLeaveEmpty={canLeaveEmpty}
            confirmPending={confirmCall.pending}
            rejectPending={rejectCall.pending}
            onConfirm={confirm}
            onSaveEntered={saveEntered}
            onReject={reject}
            onOpenEditor={openEditor}
            onCancelEdit={closeEditor}
          />
        </div>
      )}

      {confirmCall.error !== null || rejectCall.error !== null ? (
        <div className="md:col-span-4">
          <InlineActionError
            dataAttribute="data-row-error"
            message={confirmCall.error ?? rejectCall.error ?? ""}
          />
        </div>
      ) : null}
    </fieldset>
  );
}

/* --------------------------------------------------------------- value */

function ValueLine({
  field,
  isMono,
  timeZone,
  onTap,
}: {
  readonly field: ReviewFieldView;
  readonly isMono: boolean;
  readonly timeZone: TimeZone;
  /** §2.1.4(2) — tapping a resting value opens the editor. Absent when it cannot. */
  readonly onTap?: () => void;
}): ReactElement {
  const isChemistry = field.fieldCode === CHEMISTRY_FIELD;

  if (field.status === "confirmed") {
    return (
      <div
        data-confirmed-line="true"
        className="flex flex-wrap items-center gap-2"
      >
        <CircleCheck
          aria-hidden="true"
          className={cn("size-4 shrink-0", INTENT_TEXT_CLASSES.ok)}
        />
        <span className={isMono ? "text-mono" : "text-body-strong"}>
          {field.value === null ? (
            <span data-left-empty="true">Left empty</span>
          ) : (
            <DisplayValue field={field} />
          )}
        </span>
        {field.confirmedByName === null ? null : (
          <span className="text-caption text-muted-foreground">
            {field.confirmedByName}
          </span>
        )}
        {field.confirmedAt === null ? null : (
          <span className="text-caption text-muted-foreground">
            {formatInstant(field.confirmedAt, timeZone)}
          </span>
        )}
      </div>
    );
  }

  if (field.status === "rejected") {
    return (
      <p
        data-rejected-line="true"
        className={cn("text-body-strong", INTENT_TEXT_CLASSES.critical)}
      >
        {field.isRequired
          ? REJECTED_NEEDS_VALUE_REQUIRED
          : REJECTED_NEEDS_VALUE}
      </p>
    );
  }

  if (isChemistry && chemistryRowSource(field) === null) {
    return (
      <p data-chemistry-unset="true" className="text-body-strong">
        {CHEMISTRY_UNSET}
      </p>
    );
  }

  if (field.value === null) {
    // §2.1.2 — the literal text, attention intent; never a blank, never a
    // dash, never a guess (Rule 2.11).
    return (
      <p
        data-not-read="true"
        className={cn("text-body-strong", INTENT_TEXT_CLASSES.attention)}
      >
        {NOT_READ}
      </p>
    );
  }

  if (onTap !== undefined) {
    return (
      <ValueTapTarget onOpen={onTap} label={field.label}>
        <span className={isMono ? "text-mono break-all" : "text-body-strong"}>
          <DisplayValue field={field} />
        </span>
      </ValueTapTarget>
    );
  }

  return (
    <p className={isMono ? "text-mono break-all" : "text-body-strong"}>
      <DisplayValue field={field} />
    </p>
  );
}

/** A chemistry renders through T-01's labels; anything else is its own text. */
function DisplayValue({
  field,
}: {
  readonly field: ReviewFieldView;
}): ReactElement {
  if (field.value === null) return <></>;
  if (
    field.fieldCode === CHEMISTRY_FIELD &&
    chemistryRowSource(field) !== null
  ) {
    const read = readTaxonomyValue(CHEMISTRIES, CHEMISTRY_LABELS, field.value);
    return read.recognised ? (
      <span data-taxonomy-state="recognised">{read.label}</span>
    ) : (
      <span data-taxonomy-state="unrecognised" className="text-mono">
        {read.storedValue}
      </span>
    );
  }
  if (field.input.kind === "tristate") {
    const match = TRANSPORT_TEST_MARKING_VALUES.find(
      (value) => value === field.value,
    );
    return (
      <>
        {match === undefined
          ? field.value
          : TRANSPORT_TEST_MARKING_LABELS[match]}
      </>
    );
  }
  if (field.input.kind === "select") {
    const option = field.input.options.find(
      (candidate) => candidate.value === field.value,
    );
    return <>{option?.label ?? field.value}</>;
  }
  return <>{field.value}</>;
}

/* ------------------------------------------------------------ captions */

function Captions({
  field,
  editing,
  isChemistry,
}: {
  readonly field: ReviewFieldView;
  readonly editing: boolean;
  readonly isChemistry: boolean;
}): ReactElement | null {
  const lines: ReactNode[] = [];

  if (isChemistry) {
    if (field.originalValue !== null) {
      lines.push(
        <span key="chars" data-label-characters="true">
          {labelCharactersCaption(field.originalValue)}
        </span>,
      );
    }
    if (chemistryRowSource(field) === null && field.status !== "rejected") {
      lines.push(<span key="how">{CHEMISTRY_HOW_TO_SET}</span>);
    }
  } else {
    // §2.1.4(2) — the original stays visible beneath a correction, and beneath
    // a rejection: the read is retained, never deleted (D-7).
    const showOriginal =
      field.originalValue !== null &&
      (editing ||
        field.status === "rejected" ||
        (field.status === "confirmed" && field.value !== field.originalValue) ||
        (field.status === "pending" && field.value !== field.originalValue));
    if (showOriginal && field.originalValue !== null) {
      lines.push(
        <span key="orig" data-read-as="true">
          {readAsCaption(field.originalValue)}
        </span>,
      );
    }
    // Rule 2.12 — a read that failed validation is not-read with the raw
    // characters shown for the reviewer to judge.
    if (
      field.value === null &&
      field.rawText !== null &&
      field.status === "pending"
    ) {
      lines.push(
        <span key="raw" data-raw-text="true">
          {modelReportedCaption(field.rawText)}
        </span>,
      );
    }
  }

  if (field.decoded !== undefined) {
    lines.push(
      <span
        key="decode"
        data-decode-state={
          field.decoded.undecodable ? "undecodable" : "decoded"
        }
        className="inline-flex flex-wrap items-center gap-2"
      >
        <FieldSourceBadge source="decoded" />
        {field.decoded.undecodable || field.decoded.date === null ? (
          <span>{UNDECODABLE}</span>
        ) : (
          <span>
            {`${DECODED_PREFIX} ${field.decoded.date}`}
            {field.decoded.precisionLabel === null
              ? null
              : ` · ${field.decoded.precisionLabel}`}
          </span>
        )}
      </span>,
    );
  }

  if (field.input.kind === "readonly") {
    lines.push(<span key="note">{field.input.note}</span>);
  }

  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 text-caption text-muted-foreground">
      {lines}
    </div>
  );
}

/* -------------------------------------------------------------- editor */

function Editor({
  field,
  editorId,
  draftValue,
  onDraftChange,
  onEnterChemistry,
}: {
  readonly field: ReviewFieldView;
  readonly editorId: string;
  readonly draftValue: string;
  readonly onDraftChange: (value: string) => void;
  readonly onEnterChemistry: (value: string) => Promise<void>;
}): ReactElement {
  const disabled = useReviewDisabled();
  const inert = disabled.reason !== null;

  if (field.fieldCode === CHEMISTRY_FIELD) {
    return (
      <div className="flex flex-col gap-1">
        <Label htmlFor={editorId} className="text-label text-foreground">
          {CHEMISTRY_SELECT_LABEL}
        </Label>
        <Select
          value={draftValue}
          onValueChange={(value) => {
            onDraftChange(value);
            void onEnterChemistry(value);
          }}
        >
          <SelectTrigger
            id={editorId}
            data-chemistry-select="true"
            aria-disabled={inert ? "true" : undefined}
            className="min-h-11 w-full rounded-md text-body"
          >
            <SelectValue placeholder={CHEMISTRY_SELECT_PLACEHOLDER} />
          </SelectTrigger>
          <SelectContent>
            {ENTERABLE_CHEMISTRIES.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="min-h-11 text-body"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.input.kind === "tristate") {
    return (
      <RadioGroup
        aria-label={field.label}
        value={draftValue}
        onValueChange={onDraftChange}
        aria-disabled={inert ? "true" : undefined}
        data-tristate="true"
      >
        {TRANSPORT_TEST_MARKING_VALUES.map((value) => {
          const itemId = `${editorId}-${value}`;
          return (
            <div key={value} className="flex min-h-11 items-center gap-3">
              <RadioGroupItem id={itemId} value={value} />
              <Label htmlFor={itemId} className="text-body">
                {TRANSPORT_TEST_MARKING_LABELS[value]}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    );
  }

  if (field.input.kind === "select") {
    const options = field.input.options;
    return (
      <Select value={draftValue} onValueChange={onDraftChange}>
        <SelectTrigger
          id={editorId}
          aria-label={field.label}
          aria-disabled={inert ? "true" : undefined}
          className="min-h-11 w-full rounded-md text-body"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="min-h-11 text-body"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Text and mono: pre-filled and fully selected (§2.1.4(2)).
  return (
    <Input
      id={editorId}
      aria-label={field.label}
      autoFocus
      value={draftValue}
      onChange={(event) => onDraftChange(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      readOnly={inert}
      className={cn(
        "min-h-11 rounded-md",
        field.input.kind === "mono" ||
          field.fieldCode === "serial_number" ||
          field.fieldCode === "date_code"
          ? "text-mono"
          : "text-body",
      )}
    />
  );
}

/* ------------------------------------------------------------ controls */

function Controls({
  field,
  editing,
  draftValue,
  hasValue,
  isChemistry,
  canLeaveEmpty,
  confirmPending,
  rejectPending,
  onConfirm,
  onSaveEntered,
  onReject,
  onOpenEditor,
  onCancelEdit,
}: {
  readonly field: ReviewFieldView;
  readonly editing: boolean;
  readonly draftValue: string;
  readonly hasValue: boolean;
  readonly isChemistry: boolean;
  readonly canLeaveEmpty: boolean;
  readonly confirmPending: boolean;
  readonly rejectPending: boolean;
  readonly onConfirm: (value: string | null) => Promise<void>;
  readonly onSaveEntered: (value: string) => Promise<void>;
  readonly onReject: () => Promise<void>;
  readonly onOpenEditor: () => void;
  readonly onCancelEdit: () => void;
}): ReactElement {
  // 48px on a phone, 44px from `md` (§2.1.4(1)).
  const primaryClass = "w-full min-h-12 md:w-auto md:min-h-11";

  if (editing) {
    // The chemistry Select saves on change (`enterChemistry`); its editor only
    // needs a way out. Every other editor confirms or saves what was typed.
    const trimmed = draftValue.trim();
    return (
      <>
        {isChemistry ? null : hasValue ? (
          <ReviewButton
            data-confirm-corrected="true"
            className={primaryClass}
            pending={confirmPending}
            pendingLabel={CONFIRMING}
            gatedReason={
              trimmed.length === 0 ? "Enter a value to confirm it" : null
            }
            onPress={() => void onConfirm(trimmed)}
          >
            {CONFIRM_CORRECTED}
          </ReviewButton>
        ) : (
          <ReviewButton
            data-save-entered="true"
            className={primaryClass}
            pending={confirmPending}
            pendingLabel={SAVING_ENTERED}
            gatedReason={
              trimmed.length === 0 ? "Enter a value to save it" : null
            }
            onPress={() => void onSaveEntered(trimmed)}
          >
            {SAVE_ENTERED}
          </ReviewButton>
        )}
        <ReviewButton
          variant="ghost"
          data-cancel-edit="true"
          className="w-full md:w-auto"
          onPress={onCancelEdit}
        >
          {CANCEL_EDIT}
        </ReviewButton>
      </>
    );
  }

  if (field.status === "confirmed") {
    return (
      <ReviewButton
        variant="ghost"
        data-change="true"
        className="w-full md:w-auto"
        onPress={onOpenEditor}
      >
        {CHANGE}
      </ReviewButton>
    );
  }

  if (field.status === "rejected" || !hasValue) {
    // Not read, or rejected: a manual entry, or — for an optional field — an
    // explicit *leave empty*. A required field has no leave-empty (§2.1.5).
    return (
      <>
        <ReviewButton
          data-enter-value="true"
          className={primaryClass}
          onPress={onOpenEditor}
        >
          {ENTER_VALUE}
        </ReviewButton>
        {canLeaveEmpty ? (
          <ReviewButton
            variant="ghost"
            data-leave-empty="true"
            className="w-full md:w-auto"
            pending={confirmPending}
            pendingLabel={CONFIRMING}
            onPress={() => void onConfirm(null)}
          >
            {LEAVE_EMPTY}
          </ReviewButton>
        ) : null}
      </>
    );
  }

  // Resting: Confirm, Correct, Reject (§2.1.4(1), §2.1.5).
  return (
    <>
      <ReviewButton
        data-confirm="true"
        className={primaryClass}
        pending={confirmPending}
        pendingLabel={CONFIRMING}
        onPress={() => void onConfirm(field.value)}
      >
        {CONFIRM}
      </ReviewButton>
      <div className="flex flex-wrap gap-2">
        <ReviewButton
          variant="outline"
          data-correct="true"
          onPress={onOpenEditor}
        >
          {CORRECT}
        </ReviewButton>
        <ReviewButton
          variant="ghost"
          data-reject="true"
          className={INTENT_TEXT_CLASSES.critical}
          pending={rejectPending}
          pendingLabel={REJECTING}
          title={
            isChemistry && field.source === "matched_from_catalog"
              ? CHEMISTRY_REJECT_NOTE
              : undefined
          }
          onPress={() => void onReject()}
        >
          {REJECT}
        </ReviewButton>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ skeleton */

/** §2.1.6 Loading — the row at its resting height, so nothing jumps. */
export function FieldRowSkeleton(): ReactElement {
  return (
    <div
      data-field-row-skeleton="true"
      className="flex flex-col gap-3 rounded-md p-3 md:grid md:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)_auto_auto] md:items-start md:gap-x-6"
    >
      <Skeleton className="h-5 w-32 rounded-md" />
      <Skeleton className="h-6 w-48 rounded-md" />
      <div className="flex flex-wrap gap-2 md:flex-col">
        <FieldSourceBadgeSkeleton />
        <ConfidenceBandDisplaySkeleton />
      </div>
      <Skeleton className={cn(ACTION_BUTTON_CLASS, "h-11 w-full md:w-24")} />
    </div>
  );
}

/** The value a row's editor tapped into being: the value, so the tap edits (§2.1.4(2)). */
export function ValueTapTarget({
  onOpen,
  children,
  label,
}: {
  readonly onOpen: () => void;
  readonly children: ReactNode;
  readonly label: string;
}): ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={`${CORRECT} ${label}`}
      className={cn(ACTION_BUTTON_CLASS, "h-auto justify-start px-0 text-left")}
      onClick={onOpen}
    >
      {children}
    </Button>
  );
}
