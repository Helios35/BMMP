import { describe, expect, it } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import * as fixtures from "@/data/mock/fixtures";
import * as ID from "@/data/mock/fixtures/ids";
import {
  confirmDraftCondition,
  confirmDraftField,
  enterDraftChemistry,
  seedDraftFromExtraction,
  selectDraftCandidate,
  setDraftCondition,
  setDraftManufacturedOn,
  setDraftPlacement,
  setDraftSourceDevice,
  setDraftStateOfCharge,
  type DraftActor,
  type ExtractionSeedRow,
} from "@/domain/intake/draft";
import type {
  ResolvedRule,
  RuleVersionCandidate,
} from "@/domain/rules/resolve";
import { NO_ATTRIBUTION } from "@/features/intake/server/audit";
import type { IntakeRuleContext } from "@/features/intake/server/classification-preview";
import {
  buildIntakeConfirmation,
  mapDraftToRecordUpdate,
  type ConfirmationInput,
} from "@/features/intake/server/confirmation";
import { RuleResolutionError } from "@/lib/errors";
import type { IntakeDraft } from "@/types/intake";

/**
 * The confirmation builder against a hand-built draft — `TECHNICAL_SPEC.md`
 * §11.1 step 6; Rules 2.10, 2.15, 2.21, 2.24, 3.6, 4.4, 4.28, 6.4.
 *
 * Every mapped column, every decimal conversion, the two chemistry sources
 * and no third, and the audit rows all under the request's correlation id —
 * proven without a database, because the builder takes everything as an
 * argument. The rule versions come from the fixtures; no period, threshold
 * or citation is written here.
 */

const DANA: DraftActor = {
  userId: ID.USER.danaHandler,
  at: "2026-09-02T14:00:00.000Z",
};
const AT = "2026-09-02T14:05:00.000Z";
const TODAY = "2026-09-02";

const ctx: RequestContext = {
  userId: ID.USER.danaHandler,
  organizationId: ID.ORG.cascade,
  role: "compliance_handler",
  isPlatformAdmin: false,
  correlationId: "test-corr-confirmation-0001",
};

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture missing: ${what}`);
  return value;
}

const organization = must(
  fixtures.organizations.find((row) => row.id === ID.ORG.cascade),
  "organization",
);
const washington = must(
  fixtures.jurisdictions.find((row) => row.id === ID.JURISDICTION.washington),
  "jurisdiction",
);
const catalogEntry = must(
  fixtures.catalogEntries.find(
    (row) => row.id === ID.CATALOG.vehicleTractionNmc,
  ),
  "catalog entry",
);
const session = must(
  fixtures.intakeSessions.find(
    (row) => row.id === ID.INTAKE_SESSION.spreadInReview,
  ),
  "session",
);
const record = must(
  fixtures.batteryRecords.find((row) => row.id === ID.BATTERY.midReviewSpread),
  "record",
);
const soundDrum = must(
  fixtures.containers.find((row) => row.id === ID.CONTAINER.soundDrum),
  "container",
);
const soundClock = must(
  fixtures.storageClocks.find((row) => row.id === ID.CLOCK.soundDrum),
  "clock",
);
const quarantineDrum = must(
  fixtures.containers.find((row) => row.id === ID.CONTAINER.quarantineDrum),
  "quarantine",
);

/** A fixture rule version, resolved the way `resolveRules` would resolve it. */
function fixtureRule(ruleVersionId: string): ResolvedRule {
  const row = must(
    fixtures.ruleVersions.find((candidate) => candidate.id === ruleVersionId),
    "rule version",
  );
  const rule = must(
    fixtures.jurisdictionRules.find(
      (candidate) => candidate.id === row.jurisdictionRuleId,
    ),
    "rule",
  );
  const version: RuleVersionCandidate = {
    ruleVersionId: row.id,
    jurisdictionRuleId: rule.id,
    jurisdictionId: rule.jurisdictionId,
    ruleKey: rule.ruleKey,
    domain: rule.domain,
    title: rule.title,
    versionLabel: row.versionLabel,
    effectiveOn: row.effectiveOn,
    expiresOn: row.expiresOn,
    citation: row.citation,
    citationUrl: row.citationUrl,
    payload: row.payload,
    payloadSchemaKey: row.payloadSchemaKey,
    appliesToApplicationClasses: rule.appliesToApplicationClasses,
    publishedAt: row.publishedAt,
    isRuleActive: rule.isActive,
  };
  return {
    ruleKey: rule.ruleKey,
    version,
    jurisdiction: {
      id: washington.id,
      code: washington.code,
      name: washington.name,
      level: washington.level,
    },
    level: washington.level,
  };
}

const RULES: IntakeRuleContext = {
  site: {
    key: "cascade",
    address: organization.primaryAddress,
    timeZone: organization.timeZone,
    jurisdictionId: washington.id,
    containerCount: 0,
    isOrganizationAddress: true,
  },
  jurisdiction: washington,
  chain: [washington],
  asOf: "2026-08-19",
  wasteStream: {
    kind: "resolved",
    rule: fixtureRule(ID.RULE_VERSION.waWasteClassification2026),
  },
  accumulation: {
    kind: "resolved",
    rule: fixtureRule(ID.RULE_VERSION.waAccumulationPeriod2026),
  },
};

/** The clean read of the fixture vehicle pack, as the pipeline seeds it. */
const ROWS: readonly ExtractionSeedRow[] = [
  ["manufacturer", "Northvale Cell Systems"],
  ["model", "NV-TP400-96S"],
  ["chemistry_code", "Li-ion NMC"],
  ["voltage", "355.2 V"],
  ["capacity_ah", "220 Ah"],
  ["energy_wh", "78100 Wh"],
  ["date_code", "2144"],
  ["serial_number", "NVTP4000000091447"],
  ["certification_marks", "UN38.3, CE"],
  ["transport_test_marking", "present"],
].map(([fieldCode, fieldValue]) => ({
  fieldCode: fieldCode as ExtractionSeedRow["fieldCode"],
  fieldValue: fieldValue as string,
  confidenceBand: "high" as const,
  isHardGated: fieldCode === "model" || fieldCode === "chemistry_code",
  rawText: fieldValue as string,
}));

/** Every field confirmed as read, chemistry from the catalog, findings none observed and confirmed. */
function completeDraft(): IntakeDraft {
  let draft = seedDraftFromExtraction(
    ROWS,
    [
      {
        catalogEntryId: catalogEntry.id,
        matchScore: 1,
        matchMethodCode: "exact_part_number",
        matchedOn: ["model"],
      },
    ],
    null,
    null,
  );
  draft = selectDraftCandidate(draft, catalogEntry.id, catalogEntry.chemistry);
  for (const row of ROWS) {
    const value =
      row.fieldCode === "chemistry_code" ? draft.chemistry : row.fieldValue;
    draft = confirmDraftField(draft, row.fieldCode, value, DANA);
  }
  draft = setDraftCondition(draft, ["none_observed"], null, false);
  draft = confirmDraftCondition(draft, DANA);
  return draft;
}

function input(overrides: Partial<ConfirmationInput> = {}): ConfirmationInput {
  return {
    ctx,
    session,
    record,
    draft: completeDraft(),
    catalogEntry,
    container: null,
    runningClock: null,
    rules: RULES,
    organization,
    dateCodeExtractionId: null,
    damagePhotoId: null,
    today: TODAY,
    at: AT,
    attribution: NO_ATTRIBUTION,
    ...overrides,
  };
}

function built(overrides: Partial<ConfirmationInput> = {}) {
  const result = buildIntakeConfirmation(input(overrides));
  if (!result.ok) throw new Error(`expected a commit, got: ${result.message}`);
  return result;
}

describe("the record columns (mapDraftToRecordUpdate)", () => {
  const update = mapDraftToRecordUpdate(completeDraft(), catalogEntry, AT);

  it("maps every confirmed field to its column, in the column's unit, as digits", () => {
    expect(update.manufacturerName).toBe("Northvale Cell Systems");
    expect(update.modelName).toBe(catalogEntry.modelName);
    expect(update.partNumber).toBe("NV-TP400-96S");
    expect(update.nominalVoltageV).toBe("355.2");
    expect(update.ratedCapacityAh).toBe("220");
    expect(update.ratedEnergyWh).toBe("78100");
    expect(update.serialNumber).toBe("NVTP4000000091447");
    expect(update.dateCodeRaw).toBe("2144");
    expect(update.certificationMarks).toEqual(["UN38.3", "CE"]);
    expect(update.hasUn383Summary).toBe(true);
    for (const value of [
      update.nominalVoltageV,
      update.ratedCapacityAh,
      update.ratedEnergyWh,
    ]) {
      expect(typeof value).toBe("string");
    }
  });

  it("takes chemistry from the catalog match with its source and the person who confirmed it", () => {
    expect(update.chemistry).toBe(catalogEntry.chemistry);
    expect(update.chemistrySource).toBe("catalog_match");
    expect(update.chemistryConfirmedBy).toBe(DANA.userId);
    expect(update.chemistryConfirmedAt).toBe(DANA.at);
  });

  it("copies the product attributes the entry supplies", () => {
    expect(update.applicationClass).toBe(catalogEntry.applicationClass);
    expect(update.batteryMassKg).toBe(catalogEntry.massKg);
    expect(update.brandName).toBe(catalogEntry.brandName);
  });

  it("derives energy only when the label did not print it and both inputs are present", () => {
    let draft = completeDraft();
    draft = {
      ...draft,
      fields: draft.fields.map((field) =>
        field.fieldCode === "energy_wh"
          ? { ...field, status: "rejected", value: null }
          : field,
      ),
    };
    const derived = mapDraftToRecordUpdate(draft, catalogEntry, AT);
    expect(derived.ratedEnergyWh).toBe("78144.000");
    const noVoltage = mapDraftToRecordUpdate(
      {
        ...draft,
        fields: draft.fields.map((field) =>
          field.fieldCode === "voltage"
            ? { ...field, status: "rejected", value: null }
            : field,
        ),
      },
      catalogEntry,
      AT,
    );
    expect(noVoltage.ratedEnergyWh).toBeNull();
  });

  it("maps the transport-test tri-state to the record's nullable boolean", () => {
    const withValue = (value: string | null) => {
      const draft = completeDraft();
      return mapDraftToRecordUpdate(
        {
          ...draft,
          fields: draft.fields.map((field) =>
            field.fieldCode === "transport_test_marking"
              ? { ...field, value }
              : field,
          ),
        },
        catalogEntry,
        AT,
      ).hasUn383Summary;
    };
    expect(withValue("present")).toBe(true);
    expect(withValue("not_present")).toBe(false);
    expect(withValue("could_not_tell")).toBeNull();
    expect(withValue(null)).toBeNull();
  });

  it("writes nothing for a field a person did not confirm", () => {
    const draft = seedDraftFromExtraction(ROWS, [], null, null);
    const pending = mapDraftToRecordUpdate(draft, null, AT);
    expect(pending.manufacturerName).toBeNull();
    expect(pending.nominalVoltageV).toBeNull();
    expect(pending.chemistry).toBeNull();
    expect(pending.chemistrySource).toBeNull();
    expect(pending.serialNumber).toBeNull();
  });

  it("prefers a person's manufacture date over the decode (Rule 2.24)", () => {
    const decoded = {
      formatKey: "northvale_yyww",
      decodedManufacturedOn: "2021-11-01",
      decodedPrecision: "month" as const,
      decoderVersion: "1.0.0",
    };
    const fromDecode = mapDraftToRecordUpdate(
      { ...completeDraft(), dateCodeDecode: decoded },
      catalogEntry,
      AT,
    );
    expect(fromDecode.manufacturedOn).toBe("2021-11-01");
    const entered = mapDraftToRecordUpdate(
      setDraftManufacturedOn(
        { ...completeDraft(), dateCodeDecode: decoded },
        "2021-11-15",
      ),
      catalogEntry,
      AT,
    );
    expect(entered.manufacturedOn).toBe("2021-11-15");
  });

  it("stamps state of charge and provenance with the commit instant", () => {
    let draft = completeDraft();
    draft = setDraftStateOfCharge(draft, {
      band: "at_or_below_storage_limit",
      percent: "27.5",
      source: "handheld_meter",
    });
    draft = setDraftSourceDevice(draft, {
      type: "power_wheelchair",
      identifier: "WC-0091",
      make: "Ridgeline",
      model: "Trailmate",
      modelYear: 2019,
      provenanceSourceType: "device_serial",
    });
    const update = mapDraftToRecordUpdate(draft, catalogEntry, AT);
    expect(update.stateOfChargeBand).toBe("at_or_below_storage_limit");
    expect(update.stateOfChargePercentAtIntake).toBe("27.5");
    expect(update.socSource).toBe("handheld_meter");
    expect(update.socAssessedAt).toBe(AT);
    expect(update.sourceDeviceIdentifier).toBe("WC-0091");
    expect(update.provenanceSourceType).toBe("device_serial");
    expect(update.provenanceRecordedAt).toBe(AT);
  });

  it("carries a hand-entered chemistry as human_entry — and nothing can say a photograph supplied it", () => {
    let draft = completeDraft();
    draft = enterDraftChemistry(draft, "li_lfp");
    draft = confirmDraftField(draft, "chemistry_code", "li_lfp", DANA);
    const update = mapDraftToRecordUpdate(draft, catalogEntry, AT);
    expect(update.chemistry).toBe("li_lfp");
    expect(update.chemistrySource).toBe("human_entry");
    expect(["catalog_match", "human_entry"]).toContain(update.chemistrySource);
  });
});

describe("an unplaced commit", () => {
  it("builds the whole payload: three confirmations, a sound assessment, a decision, a decode, no placement", () => {
    const result = built();
    const { confirmation } = result;
    expect(confirmation.intakeSessionId).toBe(session.id);
    expect(confirmation.batteryRecordId).toBe(record.id);
    expect(confirmation.catalogEntryId).toBe(catalogEntry.id);
    expect(confirmation.containerId).toBeNull();
    expect(confirmation.storageClock).toBeNull();
    expect(confirmation.joinStorageClockId).toBeNull();
    expect(confirmation.storageEvent).toBeNull();
    expect(confirmation.containerAccumulationStartedAt).toBeNull();

    const codes = confirmation.confirmedFields.map((field) => field.fieldCode);
    expect(codes).toContain("model");
    expect(codes).toContain("chemistry_code");
    expect(codes).toContain("assessed_condition");
    for (const field of confirmation.confirmedFields) {
      expect(field.confirmedBy).toBe(DANA.userId);
    }

    expect(confirmation.damageAssessment.status).toBe("assessed_sound");
    expect(confirmation.damageAssessment.assessedCondition).toBe("sound");
    expect(confirmation.damageAssessment.findingTypes).toEqual([
      "none_observed",
    ]);
    expect(confirmation.damageAssessment.assessmentMethod).toBe(
      "visual_inspection",
    );
    expect(confirmation.damageAssessment.confirmedBy).toBe(DANA.userId);
    expect(confirmation.conditionOutcome.assessedCondition).toBe("sound");
    expect(confirmation.conditionOutcome.ddrFlags).toEqual([]);
    expect(confirmation.conditionOutcome.isAirTransportProhibited).toBe(false);

    expect(confirmation.classificationDecision?.status).toBe("active");
    expect(confirmation.classificationDecision?.wasteClassification).toBe(
      "light_category",
    );
    expect(confirmation.classificationDecision?.jurisdictionId).toBe(
      washington.id,
    );
    expect(confirmation.classificationDecision?.governingRuleVersionId).toBe(
      ID.RULE_VERSION.waWasteClassification2026,
    );
    expect(
      confirmation.classificationDecision?.evaluationTrace[0]?.citation,
    ).toBe(
      RULES.wasteStream.kind === "resolved"
        ? RULES.wasteStream.rule.version.citation
        : "",
    );
    expect(confirmation.damageAssessment.governingRuleVersionId).toBe(
      ID.RULE_VERSION.waWasteClassification2026,
    );

    expect(confirmation.dateCodeDecode?.rawCode).toBe("2144");
    expect(confirmation.dateCodeDecode?.formatKey).toBe("northvale_yyww");
    expect(confirmation.dateCodeDecode?.decodedManufacturedOn).toBe(
      "2021-11-01",
    );
    expect(confirmation.dateCodeDecode?.decodedByMethod).toBe(
      "deterministic_decoder",
    );
    expect(confirmation.batteryRecord.manufacturedOn).toBe("2021-11-01");
  });

  it("writes the two user rows and the system classification row, all under ctx.correlationId", () => {
    const { confirmation } = built();
    const types = confirmation.auditEvents.map((event) => event.eventType);
    expect(types).toEqual([
      "battery_record.confirmed",
      "damage_assessment.recorded",
      "classification_decision.recorded",
    ]);
    for (const event of confirmation.auditEvents) {
      expect(event.correlationId).toBe(ctx.correlationId);
    }
    const [confirmed, assessed, classified] = confirmation.auditEvents;
    expect(confirmed?.actorType).toBe("user");
    expect(confirmed?.actorUserId).toBe(ctx.userId);
    expect(assessed?.actorType).toBe("user");
    expect(classified?.actorType).toBe("system");
    expect(classified?.actorUserId).toBeNull();
    expect(classified?.actorLabel).toBe(
      "intake_pipeline:classify:classification.waste_stream",
    );
    expect(classified?.governingRuleVersionId).toBe(
      ID.RULE_VERSION.waWasteClassification2026,
    );
  });

  it("commits unplaced with no decision when no jurisdiction profile exists (Rule 3.10, E-13)", () => {
    const result = built({
      rules: {
        ...RULES,
        jurisdiction: null,
        chain: [],
        wasteStream: { kind: "no_jurisdiction" },
        accumulation: { kind: "no_jurisdiction" },
      },
    });
    expect(result.classification.kind).toBe("unresolved");
    expect(result.confirmation.classificationDecision).toBeNull();
    expect(
      result.confirmation.damageAssessment.governingRuleVersionId,
    ).toBeNull();
    expect(
      result.confirmation.auditEvents.map((event) => event.eventType),
    ).toEqual(["battery_record.confirmed", "damage_assessment.recorded"]);
  });
});

describe("what the commit refuses", () => {
  it("refuses without the chemistry confirmation and names it", () => {
    let draft = completeDraft();
    draft = {
      ...draft,
      fields: draft.fields.map((field) =>
        field.fieldCode === "chemistry_code"
          ? {
              ...field,
              status: "pending",
              confirmedBy: null,
              confirmedAt: null,
            }
          : field,
      ),
    };
    const result = buildIntakeConfirmation(input({ draft }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("VALIDATION");
    expect(result.message).toMatch(/Chemistry code/);
    expect(result.outstanding.map((item) => item.kind)).toContain(
      "confirm_hard_gated",
    );
  });

  it("refuses without a confirmed condition", () => {
    const draft = setDraftCondition(
      completeDraft(),
      ["none_observed"],
      null,
      false,
    );
    const result = buildIntakeConfirmation(input({ draft }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.outstanding.map((item) => item.kind)).toContain(
      "confirm_condition",
    );
  });

  it("refuses a container of the wrong segregation class with the stated reason (Rule 4.28)", () => {
    let draft = completeDraft();
    draft = setDraftCondition(draft, ["swelling"], null, false);
    draft = confirmDraftCondition(draft, DANA);
    draft = setDraftPlacement(draft, soundDrum.id);
    const result = buildIntakeConfirmation(
      input({ draft, container: soundDrum, runningClock: soundClock }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/holds .* This record needs/);
  });

  it("refuses to start a clock without an accumulation rule in force (Rule 4.5)", () => {
    const draft = setDraftPlacement(completeDraft(), soundDrum.id);
    expect(() =>
      buildIntakeConfirmation(
        input({
          draft,
          container: { ...soundDrum, accumulationStartedAt: null },
          runningClock: null,
          rules: {
            ...RULES,
            accumulation: { kind: "no_version", reason: "no_version_in_force" },
          },
        }),
      ),
    ).toThrow(RuleResolutionError);
  });
});

describe("a placed commit", () => {
  it("joins the container's running clock and writes no new clock (Rule 4.4)", () => {
    const draft = setDraftPlacement(completeDraft(), soundDrum.id);
    const result = built({
      draft,
      container: soundDrum,
      runningClock: soundClock,
    });
    const { confirmation } = result;
    expect(confirmation.containerId).toBe(soundDrum.id);
    expect(confirmation.storageClock).toBeNull();
    expect(confirmation.joinStorageClockId).toBe(soundClock.id);
    expect(confirmation.containerAccumulationStartedAt).toBeNull();
    expect(confirmation.storageEvent?.activityType).toBe("repackage");
    expect(confirmation.storageEvent?.payload).toEqual({ placement: "joined" });
    expect(confirmation.storageEvent?.governingRuleVersionId).toBe(
      soundClock.governingRuleVersionId,
    );
    expect(result.clockStart?.joinsExistingClock).toBe(true);
    expect(result.clockStart?.clockStartAt).toBe(soundClock.clockStartAt);
    expect(result.clockStart?.dueAt).toBe(soundClock.dueAt);

    const types = confirmation.auditEvents.map((event) => event.eventType);
    expect(types).toContain("storage_event.recorded");
    expect(types).not.toContain("storage_clock.status_changed");
  });

  it("starts a new clock on a container's first placement and stamps its accumulation start", () => {
    const fresh = {
      ...soundDrum,
      id: "0a00000d-0000-4000-8000-0000000000ff",
      accumulationStartedAt: null,
      currentNetMassKg: null,
    };
    const draft = setDraftPlacement(completeDraft(), fresh.id);
    const result = built({ draft, container: fresh, runningClock: null });
    const { confirmation } = result;
    expect(confirmation.joinStorageClockId).toBeNull();
    expect(confirmation.storageClock?.containerId).toBe(fresh.id);
    expect(confirmation.storageClock?.clockStartAt).toBe(AT);
    expect(confirmation.storageClock?.governingRuleVersionId).toBe(
      ID.RULE_VERSION.waAccumulationPeriod2026,
    );
    // Every figure on the clock came out of the fixture rule version, never
    // from this file: the same period the running fixture clock carries.
    expect(confirmation.storageClock?.maxDurationDays).toBe(
      soundClock.maxDurationDays,
    );
    expect(confirmation.storageClock?.status).toBe("running");
    expect(confirmation.containerAccumulationStartedAt).toBe(AT);
    expect(confirmation.storageEvent?.payload).toEqual({ placement: "first" });
    const types = confirmation.auditEvents.map((event) => event.eventType);
    expect(types).toContain("storage_clock.status_changed");
    expect(types).toContain("storage_event.recorded");
    for (const event of confirmation.auditEvents) {
      expect(event.correlationId).toBe(ctx.correlationId);
    }
  });

  it("sets the DDR flags from the findings and writes the flag row (Rules 6.4, 6.5)", () => {
    let draft = completeDraft();
    draft = setDraftCondition(draft, ["swelling"], null, true);
    draft = confirmDraftCondition(draft, DANA);
    draft = setDraftPlacement(draft, quarantineDrum.id);
    const quarantineClock = must(
      fixtures.storageClocks.find((row) => row.id === ID.CLOCK.quarantineDrum),
      "quarantine clock",
    );
    const result = built({
      draft,
      container: quarantineDrum,
      runningClock: quarantineClock,
    });
    expect(result.determination.assessedCondition).toBe("damaged_or_defective");
    expect(result.confirmation.conditionOutcome.ddrFlags).toEqual([
      "damaged",
      "defective",
    ]);
    expect(result.confirmation.conditionOutcome.isAirTransportProhibited).toBe(
      true,
    );
    expect(result.confirmation.damageAssessment.status).toBe(
      "assessed_damaged",
    );
    const flagRow = result.confirmation.auditEvents.find(
      (event) => event.eventType === "battery_record.ddr_flag_set",
    );
    expect(flagRow?.actorType).toBe("system");
    expect(flagRow?.afterState).toEqual({
      ddrFlags: ["damaged", "defective"],
      isAirTransportProhibited: true,
    });
  });
});
