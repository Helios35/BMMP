import { vi } from "vitest";
import { render } from "@testing-library/react";

import {
  ExtractionReviewCard,
  type CatalogCandidateView,
  type ExtractionReviewActions,
  type ExtractionReviewCardProps,
  type ReviewFieldView,
} from "@/components/extraction-review";
import { LABEL_FIELD_CODE_LABELS } from "@/domain/taxonomy/label-field-code";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import { actionSucceeded, type ActionResult } from "@/lib/action-result";

/**
 * Shared builders for the extraction review tests.
 *
 * Every value here is a test's own — a band, a status, a made-up model
 * number. **No threshold and no score appears as "the" value** (D-22): the
 * card renders bands, and a raw score, when one is passed, is the provider's
 * digits and never a percentage.
 */

/**
 * jsdom implements no `ResizeObserver`, and Radix's popper measures its anchor
 * with one the moment a `TooltipTrigger` mounts (`GatedControl`). A no-op
 * keeps the trigger mountable without a dependency.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

export const OK: ActionResult<unknown> = actionSucceeded(null);

export function failed(message: string): ActionResult<unknown> {
  return {
    ok: false,
    error: { code: "VALIDATION", message, correlationId: "corr-test" },
  };
}

export function okActions(): ExtractionReviewActions & {
  readonly [K in keyof ExtractionReviewActions]-?: ReturnType<typeof vi.fn>;
} {
  const ok = () => vi.fn(async () => OK);
  return {
    confirmField: ok(),
    rejectField: ok(),
    enterValue: ok(),
    selectCandidate: ok(),
    enterChemistry: ok(),
    rejectRead: ok(),
    saveToQueue: ok(),
    voidItem: ok(),
    continue: ok(),
    confirmAllHighConfidence: ok(),
    retryExtraction: ok(),
    enterManually: ok(),
    retakePhoto: ok(),
    searchCatalog: ok(),
    proposeEntry: ok(),
  };
}

export function field(
  fieldCode: LabelFieldCode,
  overrides: Partial<ReviewFieldView> = {},
): ReviewFieldView {
  const value = "value" in overrides ? (overrides.value ?? null) : "value";
  return {
    fieldCode,
    label: LABEL_FIELD_CODE_LABELS[fieldCode],
    value,
    // The read and the value agree unless a test says otherwise.
    originalValue: value,
    rawText: null,
    source: "read_from_label",
    confidenceBand: "high",
    rawConfidence: null,
    isHardGated: false,
    isRequired: false,
    status: "pending",
    confirmedByName: null,
    confirmedAt: null,
    input: { kind: "text" },
    ...overrides,
  };
}

/** A clean read: every row High and pending, the three hard-gated rows marked. */
export function cleanFields(): readonly ReviewFieldView[] {
  return [
    field("manufacturer", { value: "Northvale Cell Systems" }),
    field("model", {
      value: "NV-TP400-96S",
      originalValue: "NV-TP400-96S",
      isHardGated: true,
      isRequired: true,
      input: { kind: "mono" },
    }),
    field("chemistry_code", {
      value: "Li-ion NMC",
      originalValue: "Li-ion NMC",
      isHardGated: true,
      isRequired: true,
    }),
    field("voltage", { value: "355.2 V" }),
    field("capacity_ah", { value: "220 Ah" }),
    field("energy_wh", { value: "78100 Wh" }),
    field("date_code", {
      value: "2144",
      input: { kind: "mono" },
      decoded: {
        date: "2021-11-01",
        precisionLabel: "Month",
        undecodable: false,
      },
    }),
    field("serial_number", {
      value: "NVTP4000000091447",
      input: { kind: "mono" },
    }),
    field("certification_marks", { value: "UN38.3, CE" }),
    field("transport_test_marking", {
      value: "present",
      input: { kind: "tristate" },
    }),
    field("assessed_condition", {
      value: null,
      originalValue: null,
      confidenceBand: "not_extracted",
      isHardGated: true,
      input: { kind: "readonly", note: "Assessed on the next step." },
    }),
  ];
}

export const CANDIDATES: readonly CatalogCandidateView[] = [
  {
    catalogEntryId: "cat-1",
    title: "Northvale Cell Systems NV-TP400-96S",
    chemistryLabel: "Lithium-ion — NMC",
    specs: ["355.2 V", "220 Ah"],
    matchedOnLabel: "manufacturer + part number",
    matchScore: 1,
  },
  {
    catalogEntryId: "cat-2",
    title: "Northvale Cell Systems NV-TP400-48S",
    chemistryLabel: "Lithium-ion — NMC",
    specs: ["177.6 V", "220 Ah"],
    matchedOnLabel: "manufacturer",
    matchScore: 0,
  },
];

export function baseProps(
  overrides: Partial<ExtractionReviewCardProps> = {},
): ExtractionReviewCardProps {
  return {
    sessionId: "session-1",
    readAt: "2026-08-11T21:22:00.000Z",
    timeZone: "America/Los_Angeles",
    state: "default",
    gate: { isReviewRequired: false, fieldsBelowThreshold: 0, reasonCodes: [] },
    fields: cleanFields(),
    candidates: CANDIDATES,
    selectedCatalogEntryId: null,
    catalogMatchState: "default",
    cannotShipNote: false,
    cropThumbnail: {
      src: "data:image/png;base64,",
      alt: "Label crop",
      width: 812,
      height: 384,
    },
    originalPhoto: null,
    ownsCondition: true,
    outstanding: [
      {
        kind: "confirm_hard_gated",
        fieldCode: "model",
        label: "Confirm Model / part number",
      },
      {
        kind: "confirm_hard_gated",
        fieldCode: "chemistry_code",
        label: "Confirm Chemistry code",
      },
    ],
    bulkConfirmAvailable: true,
    primaryLabel: "Confirm and continue",
    mode: "intake",
    actions: okActions(),
    ...overrides,
  };
}

export function renderCard(overrides: Partial<ExtractionReviewCardProps> = {}) {
  const props = baseProps(overrides);
  const utils = render(<ExtractionReviewCard {...props} />);
  return {
    ...utils,
    props,
    actions: props.actions,
    rerenderWith(next: Partial<ExtractionReviewCardProps>) {
      const merged = { ...props, ...next };
      utils.rerender(<ExtractionReviewCard {...merged} />);
      return merged;
    },
  };
}

export const FORBIDDEN_WORDS =
  /probabilit|likelihood|risk of|read chemistry|detected chemistry|chemistry (was )?(read|detected)/i;
