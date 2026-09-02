// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ClassificationResult } from "@/domain/classification/waste-stream";
import type { CommitFieldState } from "@/domain/intake/commit-gate";
import { INTAKE_STEP_LABELS } from "@/domain/taxonomy/intake-step";
import { ConfirmAndPlaceStep } from "@/features/intake/components/confirm-and-place-step";
import type { ConfirmAndPlaceStepProps } from "@/features/intake/components/confirm-and-place-step";
import {
  ExtractionReviewStep,
  type ExtractionReviewStepProps,
} from "@/features/intake/components/extraction-review-step";
import {
  IntakeStart,
  type IntakeStartProps,
} from "@/features/intake/components/intake-start";
import type { StorageClock } from "@/types/storage";

import {
  CANDIDATES,
  cleanFields,
  FORBIDDEN_WORDS,
} from "../../../components/extraction-review/fixtures";

/**
 * The three step compositions of `/batteries/new` — `UX_SPEC.md` §2.12,
 * §2.15, §3.6, §3.9; design §9.
 *
 * Each step renders inside `StepFrame`: breadcrumbs and notices as given,
 * the stepper at its index, and — on steps 2 and 3 — the page's action bar
 * carrying the primary with the gate's checklist. The views are hand-built;
 * every Server Action is mocked so nothing here reaches past the component.
 * **Nothing is asserted as confirmed before the props say so**, and no
 * forbidden word renders on any step.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// jsdom implements no `scrollIntoView`; cmdk scrolls the selected row on
// mount and the frame scrolls to a checklist item's row.
Element.prototype.scrollIntoView = vi.fn();

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/batteries/new",
  useSearchParams: () => new URLSearchParams(""),
}));

const actions = vi.hoisted(() => {
  const ok = () =>
    vi.fn(async () => ({ ok: true as const, data: { sessionId: "s-1" } }));
  return {
    startIntakeSession: vi.fn(async () => ({
      ok: true as const,
      data: { sessionId: "s-new", batteryRecordId: "br-new" },
    })),
    runLabelExtraction: vi.fn(async () => ({
      ok: true as const,
      data: {
        kind: "reviewed" as const,
        isReviewRequired: true,
        reasonCodes: [],
        extractionRunId: "run-1",
      },
    })),
    setLabelCropRegion: ok(),
    confirmField: ok(),
    rejectField: ok(),
    enterFieldValue: ok(),
    selectCatalogCandidate: ok(),
    enterChemistry: ok(),
    rejectExtraction: ok(),
    saveToReviewQueue: vi.fn(async () => ({
      ok: true as const,
      data: { sessionId: "s-1", batteryRecordId: "br-1" },
    })),
    voidIntakeSession: ok(),
    advanceToStep: vi.fn(async () => ({
      ok: true as const,
      data: { sessionId: "s-1", step: "confirm_and_place" as const },
    })),
    proposeCatalogEntry: ok(),
    setCondition: ok(),
    confirmCondition: ok(),
    setStateOfCharge: ok(),
    setSourceDevice: ok(),
    choosePlacement: ok(),
    createContainerForIntake: vi.fn(async () => ({
      ok: true as const,
      data: { sessionId: "s-1", draft: {}, containerId: "c-new" },
    })),
    confirmIntake: vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "VALIDATION" as const,
        message: "This battery can't be logged yet: Confirm Chemistry code.",
        correlationId: "corr-1",
      },
    })),
  };
});
vi.mock("@/features/intake/actions", () => actions);

let online = true;
beforeEach(() => {
  online = true;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
  vi.clearAllMocks();
});

const FRAME = {
  title: "Log a battery",
  breadcrumbs: <nav data-test-breadcrumbs="true">Batteries</nav>,
  notice: <p data-test-notice="true">A notice</p>,
};

/* ------------------------------------------------------------- step 1 */

function renderStart(overrides: Partial<IntakeStartProps> = {}) {
  return render(
    <IntakeStart
      frame={FRAME}
      sessionId={null}
      sessionStatus={null}
      containerContext={null}
      existingPhotos={[]}
      labelPhoto={null}
      resumeSessions={[]}
      uploadUrl="/api/intake/photos"
      transport={() =>
        Promise.resolve({
          ok: true,
          photo: {
            intakePhotoId: "photo-1",
            storagePath: "org/o/s/h.png",
            width: 1600,
            height: 1200,
            contentHash: "h",
            fileName: "label-manualcrop.png",
          },
        })
      }
      readImageSize={() => Promise.resolve({ width: 1600, height: 1200 })}
      {...overrides}
    />,
  );
}

describe("IntakeStart — step 1", () => {
  it("frames the capture step: breadcrumbs, notice, stepper at step 1, and only the capture step's own action bar", () => {
    const { container } = renderStart({
      resumeSessions: [
        {
          id: "s-old",
          startedAt: "2026-08-21T14:22:00.000Z",
          stepLabel: INTAKE_STEP_LABELS.extraction_review,
          href: "/batteries/new?session=s-old&step=2",
        },
      ],
    });
    expect(container.querySelector("[data-test-breadcrumbs]")).not.toBeNull();
    expect(container.querySelector("[data-test-notice]")).not.toBeNull();
    expect(container.querySelector("[data-stepper]")).toHaveAttribute(
      "data-stepper-current",
      "0",
    );
    expect(container.querySelector("[data-intake-step]")).toHaveAttribute(
      "data-intake-step",
      "capture",
    );
    expect(container.querySelector("[data-resume-notice]")).not.toBeNull();
    expect(container.querySelector("[data-photo-capture-step]")).not.toBeNull();
    expect(container.querySelectorAll("[data-mobile-action-bar]")).toHaveLength(
      1,
    );
    expect(screen.getByRole("button", { name: "Read label" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("reads the label with the stored photo's id and file name, and moves to step 2", async () => {
    const { container } = renderStart({ sessionId: "s-1" });
    const input = container.querySelector(
      "[data-capture-variant='shutter'] input[type='file']",
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array([1])], "label-manualcrop.png", {
            type: "image/png",
          }),
        ],
      },
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Read label" }),
      ).not.toHaveAttribute("aria-disabled");
    });

    fireEvent.click(screen.getByRole("button", { name: "Read label" }));
    await waitFor(() => {
      expect(actions.runLabelExtraction).toHaveBeenCalledWith({
        sessionId: "s-1",
        labelPhotoId: "photo-1",
        labelFileName: "label-manualcrop.png",
      });
    });
    expect(push).toHaveBeenCalledWith("/batteries/new?session=s-1&step=2");
  });

  it("offers the whole photo as the label region when the provider finds none, with the photo's own geometry", async () => {
    actions.runLabelExtraction.mockResolvedValueOnce({
      ok: true,
      data: {
        kind: "needs_manual_crop",
        labelPhotoId: "photo-1",
        message: "The label could not be found in the photo.",
      },
    } as never);
    const { container } = renderStart({ sessionId: "s-1" });
    const input = container.querySelector(
      "[data-capture-variant='shutter'] input[type='file']",
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array([1])], "label-manualcrop.png")],
      },
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Read label" }),
      ).not.toHaveAttribute("aria-disabled");
    });
    fireEvent.click(screen.getByRole("button", { name: "Read label" }));
    await waitFor(() => {
      expect(container.querySelector("[data-crop-needed]")).not.toBeNull();
    });
    expect(
      screen.getByText(
        "We couldn't find the label automatically. Choose the label region.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Use the whole photo as the label" }),
    );
    await waitFor(() => {
      expect(actions.setLabelCropRegion).toHaveBeenCalledWith({
        sessionId: "s-1",
        labelPhotoId: "photo-1",
        labelFileName: "label-manualcrop.png",
        geometry: {
          x: 0,
          y: 0,
          width: 1600,
          height: 1200,
          sourceWidth: 1600,
          sourceHeight: 1200,
        },
      });
    });
    expect(push).toHaveBeenCalledWith("/batteries/new?session=s-1&step=2");
  });

  it("states a failed read from the session's status, with Try again on the stored photo", () => {
    const { container } = renderStart({
      sessionId: "s-1",
      sessionStatus: "failed",
      labelPhoto: {
        id: "photo-stored",
        width: 800,
        height: 600,
        fileName: null,
      },
      existingPhotos: [
        {
          id: "photo-stored",
          photoType: "label",
          width: 800,
          height: 600,
          state: "sent",
        },
      ],
    });
    expect(container.querySelector("[data-read-label-error]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(actions.runLabelExtraction).toHaveBeenCalledWith({
      sessionId: "s-1",
      labelPhotoId: "photo-stored",
      labelFileName: null,
    });
  });
});

/* ------------------------------------------------------------- step 2 */

function fieldStatesFrom(
  overrides: Partial<Record<string, CommitFieldState["status"]>> = {},
): readonly CommitFieldState[] {
  return cleanFields().map((field) => ({
    fieldCode: field.fieldCode,
    status: overrides[field.fieldCode] ?? field.status,
    value: field.value,
    confidenceBand: field.confidenceBand,
    isHardGated: field.isHardGated,
    isRequired: field.isRequired,
  }));
}

function renderReview(overrides: Partial<ExtractionReviewStepProps> = {}) {
  const props: ExtractionReviewStepProps = {
    frame: FRAME,
    sessionId: "s-1",
    batteryRecordId: "br-1",
    correlationId: "corr-1",
    labelPhotoId: "photo-1",
    card: {
      sessionId: "s-1",
      readAt: "2026-08-11T21:22:00.000Z",
      timeZone: "America/Los_Angeles",
      state: "default",
      gate: {
        isReviewRequired: true,
        fieldsBelowThreshold: 2,
        reasonCodes: [],
      },
      fields: cleanFields(),
      candidates: CANDIDATES,
      selectedCatalogEntryId: null,
      catalogMatchState: "default",
      cannotShipNote: false,
      cropThumbnail: { src: null, alt: "Label crop", width: 812, height: 384 },
      originalPhoto: null,
      ownsCondition: true,
      bulkConfirmAvailable: true,
      loadingSince: null,
    },
    fieldStates: fieldStatesFrom(),
    images: {
      crop: { label: "Label crop", width: 812, height: 384 },
      original: { label: "Label", width: 1600, height: 1200 },
    },
    proposal: null,
    catalogQuery: "Northvale Cell Systems NV-TP400-96S",
    ...overrides,
  };
  return render(<ExtractionReviewStep {...props} />);
}

describe("ExtractionReviewStep — step 2", () => {
  it("renders the card without its own bar, the page's primary gated by the checklist, and the photos in a sticky column", () => {
    const { container } = renderReview();
    expect(container.querySelector("[data-stepper]")).toHaveAttribute(
      "data-stepper-current",
      "1",
    );
    expect(container.querySelector("[data-review-card]")).toHaveAttribute(
      "data-review-state",
      "default",
    );
    expect(container.querySelector("[data-review-action-bar]")).toBeNull();

    const primary = screen.getByRole("button", {
      name: "Confirm and continue",
    });
    expect(primary).toHaveAttribute("aria-disabled", "true");
    expect(primary).not.toHaveAttribute("disabled");
    const items = [
      ...container.querySelectorAll("[data-outstanding-item]"),
    ].map((item) => item.getAttribute("data-outstanding-field"));
    expect(items).toContain("chemistry_code");
    expect(items).toContain("model");

    const placeholders = container.querySelectorAll(
      "[data-review-photos] [data-photo-placeholder]",
    );
    expect(placeholders).toHaveLength(2);
    expect(
      container.querySelector("[data-review-photos]")?.className,
    ).toContain("lg:sticky");
  });

  it("continues through advanceToStep only when the gate is satisfied, by tap or by Cmd/Ctrl+Enter", async () => {
    const { rerender } = renderReview();
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(actions.advanceToStep).not.toHaveBeenCalled();

    const confirmed = cleanFields().map((field) => ({
      ...field,
      status: "confirmed" as const,
    }));
    rerender(
      <ExtractionReviewStep
        frame={FRAME}
        sessionId="s-1"
        batteryRecordId="br-1"
        correlationId="corr-1"
        labelPhotoId="photo-1"
        card={{
          sessionId: "s-1",
          readAt: null,
          timeZone: "America/Los_Angeles",
          state: "default",
          gate: {
            isReviewRequired: false,
            fieldsBelowThreshold: 0,
            reasonCodes: [],
          },
          fields: confirmed,
          candidates: CANDIDATES,
          selectedCatalogEntryId: "cat-1",
          catalogMatchState: "default",
          cannotShipNote: false,
          cropThumbnail: null,
          originalPhoto: null,
          ownsCondition: true,
          bulkConfirmAvailable: false,
          loadingSince: null,
        }}
        fieldStates={fieldStatesFrom({
          manufacturer: "confirmed",
          model: "confirmed",
          chemistry_code: "confirmed",
          voltage: "confirmed",
          capacity_ah: "confirmed",
          energy_wh: "confirmed",
          date_code: "confirmed",
          serial_number: "confirmed",
          certification_marks: "confirmed",
          transport_test_marking: "confirmed",
        })}
        images={{ crop: null, original: null }}
        proposal={null}
        catalogQuery={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Confirm and continue" }),
    ).not.toHaveAttribute("aria-disabled");

    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    await waitFor(() => {
      expect(actions.advanceToStep).toHaveBeenCalledWith({
        sessionId: "s-1",
        step: "confirm_and_place",
      });
    });
    expect(push).toHaveBeenCalledWith("/batteries/new?session=s-1&step=3");
  });

  it("disables the whole card offline, with reconnecting on the checklist", () => {
    online = false;
    const { container } = renderReview();
    expect(container.querySelector("[data-review-card]")).toHaveAttribute(
      "data-review-state",
      "disabled",
    );
    expect(
      container.querySelector("[data-outstanding-item='offline']"),
    ).not.toBeNull();
  });

  it("shows the rows for hand entry after a read that produced nothing (E-4)", () => {
    const { container } = renderReview({
      card: {
        sessionId: "s-1",
        readAt: null,
        timeZone: "America/Los_Angeles",
        state: "empty",
        gate: {
          isReviewRequired: true,
          fieldsBelowThreshold: 10,
          reasonCodes: [],
        },
        fields: cleanFields().map((field) => ({
          ...field,
          value: null,
          originalValue: null,
          confidenceBand: "not_extracted" as const,
        })),
        candidates: [],
        selectedCatalogEntryId: null,
        catalogMatchState: "empty",
        cannotShipNote: true,
        cropThumbnail: null,
        originalPhoto: { src: null, alt: "Label", width: 1600, height: 1200 },
        ownsCondition: true,
        bulkConfirmAvailable: false,
        loadingSince: null,
      },
    });
    expect(container.querySelector("[data-review-card]")).toHaveAttribute(
      "data-review-state",
      "empty",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Enter the details by hand" }),
    );
    expect(container.querySelector("[data-review-card]")).toHaveAttribute(
      "data-review-state",
      "default",
    );
    expect(
      container.querySelectorAll("[data-field-row]").length,
    ).toBeGreaterThan(0);
  });

  it("binds the card's actions to the session's Server Actions", async () => {
    renderReview();
    const confirm = screen.getAllByRole("button", { name: "Confirm" })[0];
    fireEvent.click(confirm as Element);
    await waitFor(() => {
      expect(actions.confirmField).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "s-1",
          fieldCode: "manufacturer",
        }),
      );
    });
    expect(refresh).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------- step 3 */

const DECIDED: ClassificationResult = {
  kind: "decided",
  status: "active",
  basisCodes: ["federal_default"],
  outcome: {
    result: "light_category",
    reasoning: "A reasoning sentence the domain wrote.",
    ruleVersionsApplied: [
      {
        jurisdictionRuleId: "jr-1",
        ruleVersionId: "rv-1",
        ruleKey: "classification.waste_stream",
        versionLabel: "v1",
        citation: "A citation copied from the rule version row",
        inputs: { chemistry: "li_nmc" },
        outcome: "light_category",
      },
    ],
    inputsSnapshot: { chemistry: "li_nmc", jurisdiction: "US-WA" },
  },
};

const CLOCK: StorageClock = {
  id: "clock-1",
  organizationId: "org-1",
  subjectType: "container",
  batteryRecordId: null,
  containerId: "c-1",
  clockStartAt: "2026-07-28T07:00:00.000Z",
  clockStartBasis: "first_placement",
  timeZone: "America/Los_Angeles",
  // A test's own figure, not a rule's (D-40); the meter renders whatever the
  // clock row carries.
  maxDurationDays: 200,
  governingRuleVersionId: "rv-2",
  evaluationTrace: [],
  dueAt: "2027-02-13T07:59:59.999Z",
  alertSchedule: {},
  nextAlertAt: null,
  stoppedAt: null,
  stopReason: null,
  status: "running",
  alertBand: "none",
  createdAt: "2026-07-28T07:00:00.000Z",
  updatedAt: "2026-07-28T07:00:00.000Z",
};

function placeProps(
  overrides: Partial<ConfirmAndPlaceStepProps> = {},
): ConfirmAndPlaceStepProps {
  return {
    frame: FRAME,
    sessionId: "s-1",
    uploadUrl: "/api/intake/photos",
    condition: { findings: [], isDefective: false, confirmed: null },
    stateOfCharge: null,
    sourceDevice: null,
    placement: {
      containers: [
        {
          id: "c-1",
          code: "C-0001",
          typeLabel: "Light waste — sound",
          location: "Bay 3",
          fillText: null,
          clockTier: "No alert",
          status: "open",
          admission: { ok: true },
        },
        {
          id: "c-2",
          code: "C-0002",
          typeLabel: "Light waste — damaged / defective",
          location: "Quarantine",
          fillText: null,
          clockTier: null,
          status: "open",
          admission: {
            ok: false,
            reason: "segregation_class_mismatch",
            message: "This container holds a different class of material.",
          },
        },
      ],
      selectedId: "c-1",
      requiredTypeLabel: "Light waste — sound",
      whoCanCreate:
        "A Compliance Handler or a Facility Manager can create one.",
    },
    classification: { preview: DECIDED, jurisdictionLabel: "Washington" },
    clock: {
      kind: "running",
      clock: CLOCK,
      label: "Storage clock for container C-0001",
      asOf: "2026-08-11T21:22:00.000Z",
    },
    summary: [
      {
        fieldCode: "model",
        label: "Model / part number",
        value: "NV-TP400-96S",
        source: "read_from_label",
        enteredByName: null,
      },
      {
        fieldCode: "chemistry_code",
        label: "Chemistry code",
        value: "li_nmc",
        source: "matched_from_catalog",
        enteredByName: null,
      },
    ],
    commitGate: {
      fields: fieldStatesFrom({
        model: "confirmed",
        chemistry_code: "confirmed",
      }),
      conditionConfirmed: false,
      ownsCondition: true,
      containerChosen: true,
      requiresContainer: false,
      classificationBlocked: false,
    },
    ...overrides,
  };
}

describe("ConfirmAndPlaceStep — step 3", () => {
  it("assembles condition, charge, source device, the picker with the clock, the classification preview and the summary", () => {
    const { container } = render(<ConfirmAndPlaceStep {...placeProps()} />);
    expect(container.querySelector("[data-stepper]")).toHaveAttribute(
      "data-stepper-current",
      "2",
    );
    expect(container.querySelector("[data-condition-form]")).not.toBeNull();
    expect(
      container.querySelector("[data-state-of-charge-form]"),
    ).not.toBeNull();
    expect(container.querySelector("[data-source-device-form]")).not.toBeNull();
    expect(container.querySelector("[data-container-picker]")).toHaveAttribute(
      "data-selected-container",
      "c-1",
    );
    expect(
      container.querySelector("[data-container-row='c-2']"),
    ).toHaveAttribute("aria-disabled", "true");
    expect(container.querySelector("[data-clock-preview]")).toHaveAttribute(
      "data-clock-preview",
      "running",
    );
    expect(
      container.querySelector("[data-meter-state='default']"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-classification-outcome='preview']"),
    ).not.toBeNull();
    expect(screen.getByText("Washington")).toBeInTheDocument();

    const summary = container.querySelector("[data-summary-strip]");
    expect(summary?.querySelectorAll("[data-field]")).toHaveLength(2);
    expect(
      summary?.querySelector("[data-field-source='matched_from_catalog']"),
    ).not.toBeNull();
  });

  it("gates the primary on the commit checklist, naming the condition, and never optimistically", async () => {
    const { container } = render(<ConfirmAndPlaceStep {...placeProps()} />);
    const primary = screen.getByRole("button", {
      name: "Confirm and log battery",
    });
    expect(primary).toHaveAttribute("aria-disabled", "true");
    expect(
      container.querySelector("[data-outstanding-item='confirm_condition']"),
    ).not.toBeNull();
    fireEvent.click(primary);
    await Promise.resolve();
    expect(actions.confirmIntake).not.toHaveBeenCalled();
  });

  it("logs the battery through confirmIntake once nothing is outstanding, and renders a refusal above the primary", async () => {
    const { container } = render(
      <ConfirmAndPlaceStep
        {...placeProps({
          condition: {
            findings: ["none_observed"],
            isDefective: false,
            confirmed: { byName: "Dana Okafor", at: "Aug 11, 2026, 14:22 PDT" },
          },
          commitGate: {
            fields: fieldStatesFrom({
              model: "confirmed",
              chemistry_code: "confirmed",
            }),
            conditionConfirmed: true,
            ownsCondition: true,
            containerChosen: true,
            requiresContainer: false,
            classificationBlocked: false,
          },
        })}
      />,
    );
    const primary = screen.getByRole("button", {
      name: "Confirm and log battery",
    });
    expect(primary).not.toHaveAttribute("aria-disabled");
    fireEvent.click(primary);
    await waitFor(() => {
      expect(actions.confirmIntake).toHaveBeenCalledWith({ sessionId: "s-1" });
    });
    await waitFor(() => {
      expect(container.querySelector("[data-commit-error]")).not.toBeNull();
    });
  });

  it("does not re-send a placement the draft already holds, and renders the neutral line where no clock runs", async () => {
    const { container } = render(
      <ConfirmAndPlaceStep {...placeProps({ clock: { kind: "none" } })} />,
    );
    expect(container.querySelector("[data-clock-preview]")).toHaveAttribute(
      "data-clock-preview",
      "none",
    );
    fireEvent.click(
      container.querySelector("[data-container-row='c-1']") as Element,
    );
    await Promise.resolve();
    expect(actions.choosePlacement).not.toHaveBeenCalled();
  });

  it("offline joins the checklist", () => {
    online = false;
    const { container } = render(<ConfirmAndPlaceStep {...placeProps()} />);
    expect(
      container.querySelector("[data-outstanding-item='offline']"),
    ).not.toBeNull();
  });
});

describe("the three steps — Rules 1.25, 2.9", () => {
  it("render no probability, likelihood or detected chemistry", () => {
    const start = renderStart();
    expect(start.container.textContent ?? "").not.toMatch(FORBIDDEN_WORDS);
    start.unmount();
    const review = renderReview();
    expect(review.container.textContent ?? "").not.toMatch(FORBIDDEN_WORDS);
    review.unmount();
    const place = render(<ConfirmAndPlaceStep {...placeProps()} />);
    expect(place.container.textContent ?? "").not.toMatch(FORBIDDEN_WORDS);
  });
});
