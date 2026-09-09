// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { CatalogCandidateView } from "@/components/extraction-review/types";
import { AttachPhotoDialog } from "@/features/battery-record/components/attach-photo-dialog";
import {
  CLEARING_PHOTO_REQUIRED,
  CONDITION_GATE_NOTICE,
  EditConditionDialog,
  NO_SESSION_FOR_PHOTO,
} from "@/features/battery-record/components/edit-condition-dialog";
import {
  NO_CANDIDATES_NOTICE,
  REMATCH_GATE_NOTICE,
  RematchDialog,
} from "@/features/battery-record/components/rematch-dialog";
import {
  VOID_REASON_REQUIRED,
  VoidRecordDialog,
} from "@/features/battery-record/components/void-record-dialog";
import type {
  ApplyCatalogRematchResult,
  RecordDamageAssessmentResult,
} from "@/features/battery-record/actions";
import { actionSucceeded, type ActionResult } from "@/lib/action-result";

/**
 * The four record dialogs, in isolation, with stubbed actions.
 *
 * What each has to say **before** the save is asserted verbatim — `UX_SPEC.md`
 * §3.7: *"The edit `Dialog` says so before the change is saved, not after."*
 * The sentence sits in the DOM ahead of the primary action, and the primary
 * is `aria-disabled` with a stated reason until the dialog is ready, never
 * the `disabled` attribute.
 *
 * Nothing here is optimistic: a stub that never resolves leaves the dialog
 * open and pending.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const RECORD_ID = "0a000009-0000-4000-8000-000000000001";
const SESSION_ID = "0a00000a-0000-4000-8000-000000000001";

/** DOM order: the notice must precede the primary action. */
function precedes(first: Element | null, second: Element | null): boolean {
  if (first === null || second === null) return false;
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

function pending<T>(): () => Promise<ActionResult<T>> {
  return () => new Promise<ActionResult<T>>(() => {});
}

describe("Edit assessed condition", () => {
  it("states that the gate re-opens and a re-classification check runs, before the save", () => {
    render(
      <EditConditionDialog
        open
        onOpenChange={() => {}}
        facts={{
          recordId: RECORD_ID,
          intakeSessionId: SESSION_ID,
          currentStatus: "assessed_sound",
          currentFindings: ["none_observed"],
          currentIsDefective: false,
        }}
        action={pending()}
      />,
    );

    const notice = document.querySelector('[data-gate-notice="condition"]');
    expect(notice?.textContent).toBe(CONDITION_GATE_NOTICE);
    const save = document.querySelector(
      '[data-primary-action="save-condition"]',
    );
    expect(precedes(notice, save)).toBe(true);
    expect(save).toHaveAttribute(
      "aria-describedby",
      notice?.getAttribute("id"),
    );
  });

  it("requires a reason when a prior assessment exists, as a stated reason on the inert primary", () => {
    const action = vi.fn(pending<RecordDamageAssessmentResult>());
    render(
      <EditConditionDialog
        open
        onOpenChange={() => {}}
        facts={{
          recordId: RECORD_ID,
          intakeSessionId: SESSION_ID,
          currentStatus: "assessed_sound",
          currentFindings: ["none_observed"],
          currentIsDefective: false,
        }}
        action={action}
      />,
    );

    const save = document.querySelector(
      '[data-primary-action="save-condition"]',
    ) as HTMLElement;
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(save).not.toHaveAttribute("disabled");
    expect(
      document.querySelector('[data-outstanding="condition"]')?.textContent,
    ).toContain("State why the assessed condition is changing.");

    fireEvent.click(save);
    expect(action).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Re-inspected." },
    });
    expect(save).not.toHaveAttribute("aria-disabled");
  });

  it("requires a photo to clear a damaged finding, and blocks the path with the record's reason when it has no session", () => {
    render(
      <EditConditionDialog
        open
        onOpenChange={() => {}}
        facts={{
          recordId: RECORD_ID,
          intakeSessionId: null,
          currentStatus: "assessed_damaged",
          currentFindings: ["swelling"],
          currentIsDefective: false,
        }}
        action={pending()}
      />,
    );

    // Not clearing yet — swelling is still ticked.
    expect(
      document.querySelector('[data-clearing-evidence="true"]'),
    ).toBeNull();

    fireEvent.click(document.querySelector('[data-finding="none_observed"]')!);

    const evidence = document.querySelector('[data-clearing-evidence="true"]');
    expect(evidence?.textContent).toContain(CLEARING_PHOTO_REQUIRED);
    expect(evidence?.textContent).toContain(NO_SESSION_FOR_PHOTO);
    expect(
      document.querySelector('[data-outstanding="condition"]')?.textContent,
    ).toContain(NO_SESSION_FOR_PHOTO);
    expect(
      document.querySelector('[data-primary-action="save-condition"]'),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps none_observed exclusive and derives the condition live", () => {
    render(
      <EditConditionDialog
        open
        onOpenChange={() => {}}
        facts={{
          recordId: RECORD_ID,
          intakeSessionId: SESSION_ID,
          currentStatus: null,
          currentFindings: [],
          currentIsDefective: false,
        }}
        action={pending()}
      />,
    );

    fireEvent.click(document.querySelector('[data-finding="swelling"]')!);
    expect(
      document.querySelector('[data-status-system="assessed_condition"]')
        ?.textContent ?? document.querySelector("[data-intent]")?.textContent,
    ).toContain("Damaged or defective");

    fireEvent.click(document.querySelector('[data-finding="none_observed"]')!);
    expect(document.querySelector('[data-finding="swelling"]')).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    expect(document.body.textContent).toContain("Sound");
  });

  it("sends exactly what the person confirmed and closes on success", async () => {
    const action = vi.fn(async () =>
      actionSucceeded({
        assessmentId: "a-1",
        status: "stored" as const,
        classification: "decided" as const,
        missingInput: null,
      }),
    );
    const onOpenChange = vi.fn();
    render(
      <EditConditionDialog
        open
        onOpenChange={onOpenChange}
        facts={{
          recordId: RECORD_ID,
          intakeSessionId: SESSION_ID,
          currentStatus: null,
          currentFindings: [],
          currentIsDefective: false,
        }}
        action={action}
      />,
    );

    fireEvent.click(document.querySelector('[data-finding="corrosion"]')!);
    fireEvent.click(
      document.querySelector('[data-primary-action="save-condition"]')!,
    );

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(action).toHaveBeenCalledWith({
      recordId: RECORD_ID,
      findingTypes: ["corrosion"],
      isDefective: false,
      reason: null,
      clearingPhotoIntakePhotoId: null,
    });
  });
});

describe("Re-run catalog matching", () => {
  const candidates: readonly CatalogCandidateView[] = [
    {
      catalogEntryId: "c-1",
      title: "Northvale Cell Systems NV-TP400",
      chemistryLabel: "Lithium-ion NMC",
      specs: ["Part number NV-TP400-96S"],
      matchedOnLabel: "Matched on part number",
      matchScore: 1,
    },
    {
      catalogEntryId: "c-2",
      title: "Halden Micro HM-L58",
      chemistryLabel: "Lithium cobalt oxide",
      specs: [],
      matchedOnLabel: "Matched on manufacturer",
      matchScore: 0.5,
    },
  ];

  it("states that the gate re-opens for chemistry and model, before the confirm", async () => {
    render(
      <RematchDialog
        open
        onOpenChange={() => {}}
        recordId={RECORD_ID}
        currentCatalogEntryId="c-1"
        findCandidates={async () => actionSucceeded(candidates)}
        applyRematch={pending()}
      />,
    );

    const notice = document.querySelector('[data-gate-notice="rematch"]');
    expect(notice?.textContent).toBe(REMATCH_GATE_NOTICE);
    const confirm = document.querySelector(
      '[data-primary-action="apply-rematch"]',
    );
    expect(precedes(notice, confirm)).toBe(true);

    await waitFor(() =>
      expect(
        document.querySelector('[data-catalog-match-state="ready"]'),
      ).not.toBeNull(),
    );
  });

  it("highlights the top candidate without selecting it, and confirms only a person's pick", async () => {
    const applyRematch = vi.fn(pending<ApplyCatalogRematchResult>());
    render(
      <RematchDialog
        open
        onOpenChange={() => {}}
        recordId={RECORD_ID}
        currentCatalogEntryId={null}
        findCandidates={async () => actionSucceeded(candidates)}
        applyRematch={applyRematch}
      />,
    );

    await waitFor(() =>
      expect(
        document.querySelectorAll("[data-catalog-candidate]"),
      ).toHaveLength(2),
    );
    expect(
      document.querySelector('[data-top-candidate="true"]'),
    ).toHaveAttribute("data-catalog-candidate", "c-1");
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }

    const confirm = document.querySelector(
      '[data-primary-action="apply-rematch"]',
    ) as HTMLElement;
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(confirm);
    expect(applyRematch).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("radio")[1]!);
    expect(confirm).not.toHaveAttribute("aria-disabled");
    fireEvent.click(confirm);
    expect(applyRematch).toHaveBeenCalledWith({
      recordId: RECORD_ID,
      catalogEntryId: "c-2",
    });
  });

  it("says so when nothing matches, and never renders a score as a number", async () => {
    render(
      <RematchDialog
        open
        onOpenChange={() => {}}
        recordId={RECORD_ID}
        currentCatalogEntryId={null}
        findCandidates={async () => actionSucceeded([])}
        applyRematch={pending()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(NO_CANDIDATES_NOTICE),
    );
    expect(document.body.textContent).not.toMatch(/\b0\.\d+\b/);
  });
});

describe("Attach a photo", () => {
  it("renders the record's reason and an inert primary when there is no intake session", () => {
    render(
      <AttachPhotoDialog open onOpenChange={() => {}} intakeSessionId={null} />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      NO_SESSION_FOR_PHOTO,
    );
    const attach = document.querySelector(
      '[data-primary-action="attach-photo"]',
    );
    expect(attach).toHaveAttribute("aria-disabled", "true");
    expect(attach).not.toHaveAttribute("disabled");
  });
});

describe("Void this record", () => {
  it("refuses an empty reason and calls nothing", () => {
    const action = vi.fn(async () => undefined);
    render(
      <VoidRecordDialog
        open
        onOpenChange={() => {}}
        recordId={RECORD_ID}
        recordNumber="BR-0001"
        action={action}
      />,
    );

    fireEvent.click(
      document.querySelector('[data-primary-action="void-record"]')!,
    );
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      VOID_REASON_REQUIRED,
    );
    // Still open: the dialog is what carries the message.
    expect(
      document.querySelector('[data-record-dialog="void-this-record"]'),
    ).not.toBeNull();
  });

  it("sends the typed reason with the record id", async () => {
    const action = vi.fn(async () => undefined);
    render(
      <VoidRecordDialog
        open
        onOpenChange={() => {}}
        recordId={RECORD_ID}
        recordNumber="BR-0001"
        action={action}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  Logged twice.  " },
    });
    fireEvent.click(
      document.querySelector('[data-primary-action="void-record"]')!,
    );
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        recordId: RECORD_ID,
        reason: "Logged twice.",
      }),
    );
  });

  it("carries the destructive attribute on its own action", () => {
    render(
      <VoidRecordDialog
        open
        onOpenChange={() => {}}
        recordId={RECORD_ID}
        recordNumber="BR-0001"
        action={async () => undefined}
      />,
    );
    expect(
      document.querySelector('[data-primary-action="void-record"]'),
    ).toHaveAttribute("data-destructive", "true");
  });
});

describe("every record dialog keeps its footer reachable (§2.6)", () => {
  // At 1280×720 the edit dialog's body alone is taller than the viewport, and
  // a footer below the fold with no scroll is a save nobody can reach. The
  // content is capped to the viewport and scrolls; the classes are asserted
  // because jsdom lays nothing out, and the e2e spec runs at the suite's
  // default viewport to prove the save is reached.
  const SCROLL_CAP = ["max-h-[calc(100dvh-2rem)]", "overflow-y-auto"] as const;

  function expectScrollCap(selector: string): void {
    const content = document.querySelector(selector);
    expect(content, selector).not.toBeNull();
    for (const className of SCROLL_CAP) {
      expect(content?.className, selector).toContain(className);
    }
  }

  it("edit assessed condition", () => {
    render(
      <EditConditionDialog
        open
        onOpenChange={() => {}}
        facts={{
          recordId: RECORD_ID,
          intakeSessionId: SESSION_ID,
          currentStatus: "assessed_sound",
          currentFindings: ["none_observed"],
          currentIsDefective: false,
        }}
        action={pending()}
      />,
    );
    expectScrollCap('[data-record-dialog="edit-assessed-condition"]');
  });

  it("attach a photo", () => {
    render(
      <AttachPhotoDialog open onOpenChange={() => {}} intakeSessionId={null} />,
    );
    expectScrollCap('[data-record-dialog="attach-a-photo"]');
  });

  it("re-run catalog matching", () => {
    render(
      <RematchDialog
        open
        onOpenChange={() => {}}
        recordId={RECORD_ID}
        currentCatalogEntryId={null}
        findCandidates={async () => actionSucceeded([])}
        applyRematch={pending()}
      />,
    );
    expectScrollCap('[data-record-dialog="rerun-catalog-matching"]');
  });

  it("void this record", () => {
    render(
      <VoidRecordDialog
        open
        onOpenChange={() => {}}
        recordId={RECORD_ID}
        recordNumber="BR-0001"
        action={async () => undefined}
      />,
    );
    expectScrollCap('[data-record-dialog="void-this-record"]');
  });
});
