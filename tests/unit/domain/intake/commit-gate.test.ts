import { describe, expect, it } from "vitest";

import {
  canContinueFromReview,
  outstandingCommitItems,
  type CommitFieldState,
  type CommitGateInput,
} from "@/domain/intake/commit-gate";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  LABEL_FIELD_CODE_LABELS,
  LABEL_FIELD_CODES,
} from "@/domain/taxonomy/label-field-code";

/**
 * The commit checklist — `UX_SPEC.md` §2.1.4(6), Rules 2.15, 2.21, 6.2.
 *
 * The same function backs the card's disabled primary and the server's refusal,
 * so what is proven here is proven for both.
 */

function field(patch: Partial<CommitFieldState> = {}): CommitFieldState {
  return {
    fieldCode: "manufacturer",
    status: "confirmed",
    value: "Northvale Cell Systems",
    confidenceBand: "high",
    isHardGated: false,
    isRequired: false,
    ...patch,
  };
}

/** Every field confirmed at high confidence — the state with nothing outstanding. */
function allConfirmed(): readonly CommitFieldState[] {
  return LABEL_FIELD_CODES.map((code) =>
    field({
      fieldCode: code,
      isHardGated: (HARD_GATED_LABEL_FIELD_CODES as readonly string[]).includes(
        code,
      ),
      isRequired: code === "model" || code === "chemistry_code",
      value: `value for ${code}`,
    }),
  );
}

function input(patch: Partial<CommitGateInput> = {}): CommitGateInput {
  return {
    fields: allConfirmed(),
    conditionConfirmed: true,
    ownsCondition: true,
    containerChosen: true,
    requiresContainer: true,
    isOffline: false,
    ...patch,
  };
}

function withField(
  fields: readonly CommitFieldState[],
  code: CommitFieldState["fieldCode"],
  patch: Partial<CommitFieldState>,
): readonly CommitFieldState[] {
  return fields.map((entry) =>
    entry.fieldCode === code ? { ...entry, ...patch } : entry,
  );
}

describe("outstandingCommitItems", () => {
  it("§2.1.4(6) — nothing outstanding when every gate is satisfied", () => {
    expect(outstandingCommitItems(input())).toEqual([]);
  });

  it("Rule 2.15 — an unconfirmed hard-gated model is outstanding at any band", () => {
    for (const band of ["high", "medium", "low", "not_extracted"] as const) {
      const items = outstandingCommitItems(
        input({
          fields: withField(allConfirmed(), "model", {
            status: "pending",
            confidenceBand: band,
          }),
        }),
      );
      expect(items).toContainEqual({
        kind: "confirm_hard_gated",
        fieldCode: "model",
        label: `Confirm ${LABEL_FIELD_CODE_LABELS.model}`,
      });
    }
  });

  it("Rule 2.15 — a rejected hard-gated chemistry code is still unconfirmed", () => {
    const items = outstandingCommitItems(
      input({
        fields: withField(allConfirmed(), "chemistry_code", {
          status: "rejected",
          value: null,
        }),
      }),
    );
    expect(items.map((item) => item.kind)).toEqual([
      "confirm_hard_gated",
      "required_value",
    ]);
  });

  it("§2.1.4 — a low-confidence field left pending must be resolved", () => {
    const items = outstandingCommitItems(
      input({
        fields: withField(allConfirmed(), "serial_number", {
          status: "pending",
          confidenceBand: "low",
        }),
      }),
    );
    expect(items).toEqual([
      {
        kind: "resolve_low_confidence",
        fieldCode: "serial_number",
        label: `Resolve ${LABEL_FIELD_CODE_LABELS.serial_number}`,
      },
    ]);
  });

  it("§2.1.4 — an unread field left pending must be resolved; a rejected one is resolved", () => {
    const pending = outstandingCommitItems(
      input({
        fields: withField(allConfirmed(), "date_code", {
          status: "pending",
          confidenceBand: "not_extracted",
          value: null,
        }),
      }),
    );
    expect(pending.map((item) => item.kind)).toEqual([
      "resolve_low_confidence",
    ]);

    const rejected = outstandingCommitItems(
      input({
        fields: withField(allConfirmed(), "date_code", {
          status: "rejected",
          confidenceBand: "not_extracted",
          value: null,
        }),
      }),
    );
    expect(rejected).toEqual([]);
  });

  it("§2.1.4 — a medium or high field left pending is not a resolution item", () => {
    const items = outstandingCommitItems(
      input({
        fields: withField(allConfirmed(), "certification_marks", {
          status: "pending",
          confidenceBand: "medium",
        }),
      }),
    );
    expect(items).toEqual([]);
  });

  it("§2.1.4(6) — a required field with no value is outstanding however it got there", () => {
    const blank = outstandingCommitItems(
      input({
        fields: withField(allConfirmed(), "model", { value: "   " }),
      }),
    );
    expect(blank).toContainEqual({
      kind: "required_value",
      fieldCode: "model",
      label: `${LABEL_FIELD_CODE_LABELS.model} is required`,
    });
  });

  it("Rule 6.2 — the assessed condition is confirmed as a condition, not as a text field", () => {
    const items = outstandingCommitItems(
      input({
        conditionConfirmed: false,
        fields: withField(allConfirmed(), "assessed_condition", {
          status: "pending",
          value: null,
          confidenceBand: "not_extracted",
        }),
      }),
    );
    expect(items).toEqual([
      {
        kind: "confirm_condition",
        fieldCode: "assessed_condition",
        label: `Confirm ${LABEL_FIELD_CODE_LABELS.assessed_condition}`,
      },
    ]);
  });

  it("Rule 6.2 — a viewer who does not own condition is told what is missing, and it is still missing", () => {
    const items = outstandingCommitItems(
      input({ conditionConfirmed: false, ownsCondition: false }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("confirm_condition");
    expect(items[0]?.label).toBe(
      `${LABEL_FIELD_CODE_LABELS.assessed_condition} has not been confirmed`,
    );
  });

  it("§2.3 — a container is outstanding only when placement is expected", () => {
    expect(outstandingCommitItems(input({ containerChosen: false }))).toEqual([
      { kind: "choose_container", label: "Choose a container" },
    ]);
    expect(
      outstandingCommitItems(
        input({ containerChosen: false, requiresContainer: false }),
      ),
    ).toEqual([]);
  });

  it("E-13 — a blocked classification is listed when the caller says so", () => {
    expect(
      outstandingCommitItems(input({ classificationBlocked: true })).map(
        (item) => item.kind,
      ),
    ).toEqual(["classification_blocked"]);
    expect(
      outstandingCommitItems(input({ classificationBlocked: false })),
    ).toEqual([]);
  });

  it("§6.4 — offline is outstanding; a commit is never optimistic", () => {
    expect(outstandingCommitItems(input({ isOffline: true }))).toEqual([
      { kind: "offline", label: "Reconnect to log this battery" },
    ]);
  });

  it("§2.1.4(6) — every item names its field through T-09's labels, never inline", () => {
    const fields = LABEL_FIELD_CODES.map((code) =>
      field({
        fieldCode: code,
        status: "pending",
        confidenceBand: "low",
        isHardGated: (
          HARD_GATED_LABEL_FIELD_CODES as readonly string[]
        ).includes(code),
        value: null,
        isRequired: code === "model",
      }),
    );
    const items = outstandingCommitItems(input({ fields }));
    for (const item of items) {
      if (item.fieldCode === undefined) continue;
      expect(item.label).toContain(LABEL_FIELD_CODE_LABELS[item.fieldCode]);
    }
    // No bulk path: every hard-gated field appears on its own.
    const confirmItems = items.filter(
      (item) => item.kind === "confirm_hard_gated",
    );
    expect(confirmItems.map((item) => item.fieldCode)).toEqual([
      "model",
      "chemistry_code",
    ]);
  });
});

describe("canContinueFromReview", () => {
  it("§2.1.4 — continues when model and chemistry are confirmed and nothing low is pending", () => {
    expect(canContinueFromReview(allConfirmed(), false)).toEqual([]);
  });

  it("Rule 2.15 — does not continue with chemistry unconfirmed", () => {
    const items = canContinueFromReview(
      withField(allConfirmed(), "chemistry_code", { status: "pending" }),
      false,
    );
    expect(items.map((item) => item.kind)).toEqual(["confirm_hard_gated"]);
    expect(items[0]?.fieldCode).toBe("chemistry_code");
  });

  it("Rule 6.2 — does not wait for the assessed condition; that is step 3's", () => {
    const items = canContinueFromReview(
      withField(allConfirmed(), "assessed_condition", {
        status: "pending",
        value: null,
        confidenceBand: "not_extracted",
      }),
      false,
    );
    expect(items).toEqual([]);
  });

  it("§2.1.4 — does not continue with a low field pending", () => {
    const items = canContinueFromReview(
      withField(allConfirmed(), "voltage", {
        status: "pending",
        confidenceBand: "low",
      }),
      false,
    );
    expect(items.map((item) => item.kind)).toEqual(["resolve_low_confidence"]);
  });

  it("§2.1.4(6) — does not continue with a required value missing", () => {
    const items = canContinueFromReview(
      withField(allConfirmed(), "model", { value: null }),
      false,
    );
    expect(items.map((item) => item.kind)).toEqual(["required_value"]);
  });

  it("§6.4 — does not continue offline", () => {
    const items = canContinueFromReview(allConfirmed(), true);
    expect(items.map((item) => item.kind)).toEqual(["offline"]);
  });
});
