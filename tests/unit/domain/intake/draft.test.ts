import { describe, expect, it } from "vitest";

import { outstandingCommitItems } from "@/domain/intake/commit-gate";
import { decodeDateCode } from "@/domain/intake/date-code";
import {
  commitFieldStates,
  confirmDraftCondition,
  confirmDraftField,
  enterDraftChemistry,
  enterDraftFieldValue,
  hardGatedFieldsConfirmed,
  markDraftExtractionRejected,
  markDraftManualEntry,
  rejectDraftField,
  seedDraftFromExtraction,
  selectDraftCandidate,
  setDraftCondition,
  setDraftManufacturedOn,
  setDraftPlacement,
  setDraftSourceDevice,
  setDraftStateOfCharge,
  type CandidateSeedRow,
  type DraftActor,
  type ExtractionSeedRow,
} from "@/domain/intake/draft";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  LABEL_FIELD_CODES,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";
import type { IntakeDraft } from "@/types/intake";

/**
 * The draft reducers — `UX_SPEC.md` §2.1.4, §6.4; Rules 2.10, 2.15, 2.21,
 * 2.24; D-7.
 *
 * Two properties run through every test: **no reducer mutates its input**, and
 * **chemistry has exactly two sources**. The first is asserted after every
 * call by freezing the draft; the second by checking `chemistrySource` and the
 * chemistry field's `source` after each path.
 */

const DANA: DraftActor = {
  userId: "user-dana",
  at: "2026-09-02T14:00:00.000Z",
};

const TODAY = "2026-09-02";

const ROWS: readonly ExtractionSeedRow[] = [
  {
    fieldCode: "manufacturer",
    fieldValue: "Northvale Cell Systems",
    confidenceBand: "high",
    isHardGated: false,
    rawText: "NORTHVALE CELL SYSTEMS",
  },
  {
    fieldCode: "model",
    fieldValue: "NV-TP400-96S",
    confidenceBand: "low",
    isHardGated: true,
    rawText: "NV-TP4OO-96S",
  },
  {
    fieldCode: "chemistry_code",
    fieldValue: "Li-ion NMC",
    confidenceBand: "high",
    isHardGated: true,
    rawText: "Li-ion NMC",
  },
  {
    fieldCode: "date_code",
    fieldValue: "2144",
    confidenceBand: "high",
    isHardGated: false,
    rawText: "2144",
  },
];

const CANDIDATES: readonly CandidateSeedRow[] = [
  {
    catalogEntryId: "entry-a",
    matchScore: 0.9,
    matchMethodCode: "exact_part_number",
    matchedOn: ["manufacturer", "model"],
  },
  {
    catalogEntryId: "entry-b",
    matchScore: 0.4,
    matchMethodCode: "similarity",
    matchedOn: ["manufacturer"],
  },
];

/** Deep-freeze so any in-place mutation throws under strict mode. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function seeded(): IntakeDraft {
  return deepFreeze(
    seedDraftFromExtraction(
      ROWS,
      CANDIDATES,
      decodeDateCode("2144", "northvale_yyww", TODAY),
      "prismatic",
    ),
  );
}

function fieldOf(draft: IntakeDraft, code: LabelFieldCode) {
  const field = draft.fields.find((entry) => entry.fieldCode === code);
  if (field === undefined) throw new Error(`no field ${code}`);
  return field;
}

describe("seedDraftFromExtraction", () => {
  it("T-09 — seeds every code in taxonomy order, pending and read from the label", () => {
    const draft = seeded();
    expect(draft.fields.map((field) => field.fieldCode)).toEqual(
      LABEL_FIELD_CODES,
    );
    for (const field of draft.fields) {
      expect(field.status).toBe("pending");
      expect(field.source).toBe("read_from_label");
      expect(field.confirmedBy).toBeNull();
      expect(field.confirmedAt).toBeNull();
    }
  });

  it("Rule 2.11 — a field the run did not read is null at not_extracted", () => {
    const voltage = fieldOf(seeded(), "voltage");
    expect(voltage.value).toBeNull();
    expect(voltage.originalValue).toBeNull();
    expect(voltage.confidenceBand).toBe("not_extracted");
    expect(voltage.rawText).toBeNull();
  });

  it("D-7 — a read field carries its value as both value and original, with raw text", () => {
    const model = fieldOf(seeded(), "model");
    expect(model.value).toBe("NV-TP400-96S");
    expect(model.originalValue).toBe("NV-TP400-96S");
    expect(model.rawText).toBe("NV-TP4OO-96S");
    expect(model.confidenceBand).toBe("low");
  });

  it("Rule 2.15 — hard-gated fields are hard-gated whether or not the run said so", () => {
    const draft = seeded();
    for (const code of HARD_GATED_LABEL_FIELD_CODES) {
      expect(fieldOf(draft, code).isHardGated).toBe(true);
    }
    expect(fieldOf(draft, "manufacturer").isHardGated).toBe(false);
  });

  it("Rule 2.19 — candidates are carried ranked and none is selected", () => {
    const draft = seeded();
    expect(
      draft.candidates.map((candidate) => candidate.catalogEntryId),
    ).toEqual(["entry-a", "entry-b"]);
    expect(draft.selectedCatalogEntryId).toBeNull();
    expect(draft.catalogMatchRejected).toBe(false);
  });

  it("Rule 2.10 — nothing is a chemistry yet: the code is characters on the label", () => {
    const draft = seeded();
    expect(draft.chemistry).toBeNull();
    expect(draft.chemistrySource).toBeNull();
    expect(fieldOf(draft, "chemistry_code").value).toBe("Li-ion NMC");
  });

  it("Rules 2.24, 2.25 — the decode and the form-factor proposal ride along as proposals", () => {
    const draft = seeded();
    expect(draft.dateCodeDecode).toEqual({
      formatKey: "northvale_yyww",
      decodedManufacturedOn: "2021-11-01",
      decodedPrecision: "month",
      decoderVersion: "1.0.0",
    });
    expect(draft.manufacturedOnEntered).toBeNull();
    expect(draft.formFactorProposal).toBe("prismatic");
    expect(
      seedDraftFromExtraction([], [], null, null).dateCodeDecode,
    ).toBeNull();
  });

  it("starts with nothing from step 3 and no manual path taken", () => {
    const draft = seeded();
    expect(draft.condition).toBeNull();
    expect(draft.stateOfCharge).toBeNull();
    expect(draft.containerId).toBeNull();
    expect(draft.sourceDevice).toBeNull();
    expect(draft.manualEntry).toBe(false);
    expect(draft.extractionRejected).toBe(false);
  });
});

describe("confirmDraftField", () => {
  it("Rule 2.21 — confirms as read, attributed to a person, keeping the source", () => {
    const before = seeded();
    const after = confirmDraftField(
      before,
      "manufacturer",
      "Northvale Cell Systems",
      DANA,
    );
    const field = fieldOf(after, "manufacturer");
    expect(field.status).toBe("confirmed");
    expect(field.value).toBe("Northvale Cell Systems");
    expect(field.originalValue).toBe("Northvale Cell Systems");
    expect(field.source).toBe("read_from_label");
    expect(field.confirmedBy).toBe(DANA.userId);
    expect(field.confirmedAt).toBe(DANA.at);
    expect(after).not.toBe(before);
    expect(fieldOf(before, "manufacturer").status).toBe("pending");
  });

  it("D-7 — a correction keeps the original and marks the value as entered", () => {
    const after = confirmDraftField(seeded(), "model", "NV-TP400-96S-R2", DANA);
    const field = fieldOf(after, "model");
    expect(field.value).toBe("NV-TP400-96S-R2");
    expect(field.originalValue).toBe("NV-TP400-96S");
    expect(field.source).toBe("entered_by");
  });

  it("D-7 — a field with no original records the value it replaces as the original", () => {
    const entered = enterDraftFieldValue(seeded(), "voltage", "355 V");
    const corrected = confirmDraftField(entered, "voltage", "355.2 V", DANA);
    expect(fieldOf(corrected, "voltage").originalValue).toBe("355 V");
  });

  it("Rule 2.21 — refuses an unattributed confirmation", () => {
    expect(() =>
      confirmDraftField(seeded(), "model", "NV-TP400-96S", {
        userId: "",
        at: DANA.at,
      }),
    ).toThrow(RangeError);
    expect(() =>
      confirmDraftField(seeded(), "model", "NV-TP400-96S", {
        userId: DANA.userId,
        at: " ",
      }),
    ).toThrow(RangeError);
  });

  it("refuses a field the draft does not have", () => {
    const draft = deepFreeze(seedDraftFromExtraction([], [], null, null));
    const missing = {
      ...draft,
      fields: draft.fields.filter((f) => f.fieldCode !== "model"),
    };
    expect(() => confirmDraftField(missing, "model", "x", DANA)).toThrow(
      RangeError,
    );
  });
});

describe("rejectDraftField", () => {
  it("§2.1.5 — rejects a read, keeps the original and raw text, and attributes the rejection", () => {
    const after = rejectDraftField(seeded(), "model", DANA);
    const field = fieldOf(after, "model");
    expect(field.status).toBe("rejected");
    expect(field.value).toBeNull();
    expect(field.originalValue).toBe("NV-TP400-96S");
    expect(field.rawText).toBe("NV-TP4OO-96S");
    expect(field.confirmedBy).toBe(DANA.userId);
  });
});

describe("enterDraftFieldValue", () => {
  it("Rule 2.21 — an entered value is pending and unattributed until confirmed", () => {
    const after = enterDraftFieldValue(
      seeded(),
      "serial_number",
      "NVTP4000000091447",
    );
    const field = fieldOf(after, "serial_number");
    expect(field.status).toBe("pending");
    expect(field.value).toBe("NVTP4000000091447");
    expect(field.source).toBe("entered_by");
    expect(field.confirmedBy).toBeNull();
  });
});

describe("selectDraftCandidate", () => {
  it("Rule 2.10 — a selected entry supplies the chemistry as matched from the catalog, pending", () => {
    const after = selectDraftCandidate(seeded(), "entry-a", "li_nmc");
    expect(after.selectedCatalogEntryId).toBe("entry-a");
    expect(after.catalogMatchRejected).toBe(false);
    expect(after.chemistry).toBe("li_nmc");
    expect(after.chemistrySource).toBe("catalog_match");
    const field = fieldOf(after, "chemistry_code");
    expect(field.value).toBe("li_nmc");
    expect(field.originalValue).toBe("Li-ion NMC");
    expect(field.source).toBe("matched_from_catalog");
    expect(field.status).toBe("pending");
    expect(field.confirmedBy).toBeNull();
  });

  it("Rule 2.15 — selecting a candidate confirms nothing; a person still confirms the field", () => {
    const after = selectDraftCandidate(seeded(), "entry-a", "li_nmc");
    expect(hardGatedFieldsConfirmed(after)).toBe(false);
    const confirmed = confirmDraftField(
      after,
      "chemistry_code",
      "li_nmc",
      DANA,
    );
    expect(fieldOf(confirmed, "chemistry_code").source).toBe(
      "matched_from_catalog",
    );
    expect(fieldOf(confirmed, "chemistry_code").status).toBe("confirmed");
  });

  it("Rule 2.20 — declining every candidate withdraws the catalog's chemistry and restores the read", () => {
    const picked = selectDraftCandidate(seeded(), "entry-a", "li_nmc");
    const declined = selectDraftCandidate(deepFreeze(picked), null, null);
    expect(declined.selectedCatalogEntryId).toBeNull();
    expect(declined.catalogMatchRejected).toBe(true);
    expect(declined.chemistry).toBeNull();
    expect(declined.chemistrySource).toBeNull();
    const field = fieldOf(declined, "chemistry_code");
    expect(field.value).toBe("Li-ion NMC");
    expect(field.source).toBe("read_from_label");
    expect(field.status).toBe("pending");
  });

  it("Rule 2.10 — an entry with no chemistry of its own supplies none", () => {
    const after = selectDraftCandidate(seeded(), "entry-b", null);
    expect(after.selectedCatalogEntryId).toBe("entry-b");
    expect(after.chemistry).toBeNull();
    expect(after.chemistrySource).toBeNull();
    expect(fieldOf(after, "chemistry_code").source).toBe("read_from_label");
  });

  it("Rule 2.10 — a hand-entered chemistry survives a later deselection", () => {
    const entered = enterDraftChemistry(seeded(), "li_lfp");
    const declined = selectDraftCandidate(deepFreeze(entered), null, null);
    expect(declined.chemistry).toBe("li_lfp");
    expect(declined.chemistrySource).toBe("human_entry");
    expect(fieldOf(declined, "chemistry_code").source).toBe("entered_by");
  });
});

describe("enterDraftChemistry", () => {
  it("Rule 2.10 — a hand-entered chemistry is human_entry and entered by the person, pending", () => {
    const after = enterDraftChemistry(seeded(), "lead_acid_sealed");
    expect(after.chemistry).toBe("lead_acid_sealed");
    expect(after.chemistrySource).toBe("human_entry");
    const field = fieldOf(after, "chemistry_code");
    expect(field.value).toBe("lead_acid_sealed");
    expect(field.source).toBe("entered_by");
    expect(field.status).toBe("pending");
    expect(field.originalValue).toBe("Li-ion NMC");
  });

  it("Rule 2.10 — overrides a catalog chemistry without dropping the selected entry", () => {
    const picked = selectDraftCandidate(seeded(), "entry-a", "li_nmc");
    const entered = enterDraftChemistry(deepFreeze(picked), "li_nca");
    expect(entered.selectedCatalogEntryId).toBe("entry-a");
    expect(entered.chemistry).toBe("li_nca");
    expect(entered.chemistrySource).toBe("human_entry");
  });

  it("T-03 — refuses unknown: that is the absence of a chemistry, not one", () => {
    expect(() => enterDraftChemistry(seeded(), "unknown")).toThrow(RangeError);
  });

  it("Rule 2.10 — no path through the reducers yields a third chemistry source", () => {
    const paths = [
      selectDraftCandidate(seeded(), "entry-a", "li_nmc"),
      enterDraftChemistry(seeded(), "li_lfp"),
      selectDraftCandidate(seeded(), null, null),
      markDraftExtractionRejected(seeded()),
    ];
    for (const draft of paths) {
      expect([null, "catalog_match", "human_entry"]).toContain(
        draft.chemistrySource,
      );
      expect([
        "read_from_label",
        "matched_from_catalog",
        "entered_by",
      ]).toContain(fieldOf(draft, "chemistry_code").source);
    }
  });
});

describe("setDraftCondition and confirmDraftCondition", () => {
  it("Rule 6.2 — records findings and defective, attributed when an actor is given", () => {
    const after = setDraftCondition(seeded(), ["swelling", "dent"], DANA, true);
    expect(after.condition).toEqual({
      findingTypes: ["swelling", "dent"],
      isDefective: true,
      confirmedBy: DANA.userId,
      confirmedAt: DANA.at,
    });
  });

  it("Rule 6.2 — records without an actor, then confirms in a second act", () => {
    const recorded = setDraftCondition(seeded(), ["none_observed"], null);
    expect(recorded.condition?.confirmedBy).toBeNull();
    expect(recorded.condition?.isDefective).toBe(false);
    const confirmed = confirmDraftCondition(deepFreeze(recorded), DANA);
    expect(confirmed.condition?.confirmedBy).toBe(DANA.userId);
    expect(confirmed.condition?.findingTypes).toEqual(["none_observed"]);
  });

  it("Rule 6.3 — refuses an empty finding list; none_observed is the honest empty", () => {
    expect(() => setDraftCondition(seeded(), [], DANA)).toThrow(RangeError);
  });

  it("Rule 6.2 — refuses to confirm findings that were never recorded", () => {
    expect(() => confirmDraftCondition(seeded(), DANA)).toThrow(RangeError);
  });

  it("T-30 — keeps a previously recorded defective flag when findings change", () => {
    const first = setDraftCondition(seeded(), ["swelling"], null, true);
    const second = setDraftCondition(
      deepFreeze(first),
      ["swelling", "leakage"],
      null,
    );
    expect(second.condition?.isDefective).toBe(true);
  });
});

describe("step 3 setters", () => {
  it("T-21, T-55 — state of charge is a band, a decimal string or nothing, and a source", () => {
    const after = setDraftStateOfCharge(seeded(), {
      band: "at_or_below_storage_limit",
      percent: "25.0",
      source: "handheld_meter",
    });
    expect(after.stateOfCharge).toEqual({
      band: "at_or_below_storage_limit",
      percent: "25.0",
      source: "handheld_meter",
    });
    expect(
      setDraftStateOfCharge(seeded(), {
        band: "not_captured",
        percent: null,
        source: null,
      }).stateOfCharge?.percent,
    ).toBeNull();
  });

  it("ERD §2.3 — refuses a state-of-charge figure that is not decimal digits", () => {
    expect(() =>
      setDraftStateOfCharge(seeded(), {
        band: "above_storage_limit",
        percent: "80%",
        source: "device_indicator",
      }),
    ).toThrow(RangeError);
  });

  it("sets and clears the placement container", () => {
    const placed = setDraftPlacement(seeded(), "container-1");
    expect(placed.containerId).toBe("container-1");
    expect(setDraftPlacement(deepFreeze(placed), null).containerId).toBeNull();
  });

  it("Rule 2.24 — a person's date is recorded beside the decode, and the decode stays", () => {
    const after = setDraftManufacturedOn(seeded(), "2021-10-15");
    expect(after.manufacturedOnEntered).toBe("2021-10-15");
    expect(after.dateCodeDecode?.decodedManufacturedOn).toBe("2021-11-01");
  });

  it("T-11 — records the source device as told, unverified", () => {
    const device = {
      type: "power_wheelchair",
      identifier: null,
      make: "Ridgeline",
      model: "RM-24",
      modelYear: 2022,
      provenanceSourceType: "device_serial" as const,
    };
    const after = setDraftSourceDevice(seeded(), device);
    expect(after.sourceDevice).toEqual(device);
    expect(
      setDraftSourceDevice(deepFreeze(after), null).sourceDevice,
    ).toBeNull();
  });
});

describe("manual entry and whole-read reject", () => {
  it("E-4, E-5 — the manual path is marked and the extraction is untouched", () => {
    const after = markDraftManualEntry(seeded());
    expect(after.manualEntry).toBe(true);
    expect(fieldOf(after, "model").value).toBe("NV-TP400-96S");
  });

  it("§2.1.5 — rejecting the whole read clears every proposed value but keeps originals and raw text", () => {
    const confirmed = confirmDraftField(
      seeded(),
      "manufacturer",
      "Northvale Cell Systems",
      DANA,
    );
    const after = markDraftExtractionRejected(deepFreeze(confirmed));
    expect(after.extractionRejected).toBe(true);
    for (const field of after.fields) {
      expect(field.status).toBe("pending");
      expect(field.value).toBeNull();
      expect(field.confirmedBy).toBeNull();
    }
    expect(fieldOf(after, "model").originalValue).toBe("NV-TP400-96S");
    expect(fieldOf(after, "model").rawText).toBe("NV-TP4OO-96S");
  });
});

describe("commitFieldStates and hardGatedFieldsConfirmed", () => {
  function readyDraft(): IntakeDraft {
    let draft = seeded();
    draft = confirmDraftField(draft, "model", "NV-TP400-96S", DANA);
    draft = selectDraftCandidate(draft, "entry-a", "li_nmc");
    draft = confirmDraftField(draft, "chemistry_code", "li_nmc", DANA);
    draft = setDraftCondition(draft, ["none_observed"], DANA);
    // §2.1.4 — every unread field is acknowledged: a rejection says a person
    // looked and the label did not print it.
    for (const field of draft.fields) {
      if (
        field.status === "pending" &&
        field.confidenceBand === "not_extracted"
      ) {
        draft = rejectDraftField(draft, field.fieldCode, DANA);
      }
    }
    return deepFreeze(draft);
  }

  it("§2.1.4(6) — maps every field for the commit gate, model and chemistry required", () => {
    const states = commitFieldStates(seeded());
    expect(states.map((state) => state.fieldCode)).toEqual(LABEL_FIELD_CODES);
    expect(
      states
        .filter((state) => state.isRequired)
        .map((state) => state.fieldCode),
    ).toEqual(["model", "chemistry_code"]);
    expect(
      states.find((state) => state.fieldCode === "model")?.isHardGated,
    ).toBe(true);
  });

  it("Rule 6.2 — the assessed condition's status comes from the confirmed condition, not the field", () => {
    const unconfirmed = commitFieldStates(seeded()).find(
      (state) => state.fieldCode === "assessed_condition",
    );
    expect(unconfirmed?.status).toBe("pending");
    const confirmed = commitFieldStates(readyDraft()).find(
      (state) => state.fieldCode === "assessed_condition",
    );
    expect(confirmed?.status).toBe("confirmed");
  });

  it("Rule 2.21 — three attributable confirmations, and nothing less, satisfy the hard gate", () => {
    expect(hardGatedFieldsConfirmed(seeded())).toBe(false);
    expect(hardGatedFieldsConfirmed(readyDraft())).toBe(true);

    const noCondition = { ...readyDraft(), condition: null };
    expect(hardGatedFieldsConfirmed(noCondition)).toBe(false);

    const chemistryPending = rejectDraftField(
      readyDraft(),
      "chemistry_code",
      DANA,
    );
    expect(hardGatedFieldsConfirmed(chemistryPending)).toBe(false);
  });

  it("Rule 2.15 — the commit gate and the hard gate agree on a ready draft, and on one that is not", () => {
    const ready = readyDraft();
    expect(
      outstandingCommitItems({
        fields: commitFieldStates(ready),
        conditionConfirmed: ready.condition?.confirmedBy !== null,
        ownsCondition: true,
        containerChosen: true,
        requiresContainer: true,
        isOffline: false,
      }),
    ).toEqual([]);

    const notReady = seeded();
    const items = outstandingCommitItems({
      fields: commitFieldStates(notReady),
      conditionConfirmed: false,
      ownsCondition: true,
      containerChosen: false,
      requiresContainer: true,
      isOffline: false,
    });
    expect(items.map((item) => item.kind)).toEqual([
      "confirm_hard_gated",
      "confirm_hard_gated",
      "resolve_low_confidence",
      "resolve_low_confidence",
      "resolve_low_confidence",
      "resolve_low_confidence",
      "resolve_low_confidence",
      "resolve_low_confidence",
      "confirm_condition",
      "choose_container",
    ]);
  });
});
