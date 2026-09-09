import { beforeEach, describe, expect, it } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { LABEL_FIELD_CODES } from "@/domain/taxonomy/label-field-code";
import {
  INTAKE_PHOTO_BUCKET,
  intakeObjectPath,
  runIntakePipeline,
  type PipelineOutcome,
} from "@/features/intake/server/intake-pipeline";
import { IntegrationError, PermissionError } from "@/lib/errors";

/**
 * The pipeline against the mock adapter and the fixture label reader —
 * `TECHNICAL_SPEC.md` §11.1 steps 2–5; Rules 2.4, 2.7, 2.11, 2.14, 2.16,
 * 2.19; EC-14.
 *
 * One scenario per fixture label. What is proven for each: the eleven rows a
 * run writes (T-09), the band each field lands in, the reason codes the gate
 * records (T-52), the draft the session is seeded with, and that every step
 * wrote its row as the system actor under the request's correlation id.
 *
 * No threshold value appears here: the reason codes are the configuration's
 * answer read back, and the cutoffs stamped on the rows are compared to the
 * set the adapter serves — fixture-to-read, never literal-to-read.
 */

const PAGE = { limit: 100 } as const;
const BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NOW = "2026-09-02T15:00:00.000Z";

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-corr-pipeline-0001",
    ...overrides,
  };
}

const HANDLER = ctx();
const MANAGER = ctx({ userId: ID.USER.martaManager, role: "facility_manager" });
const SESSION = ID.INTAKE_SESSION.spreadInReview;

/** A label photo on the fixture session, with its bytes in the store. */
async function labelPhoto(caller: RequestContext = HANDLER) {
  const path = intakeObjectPath(
    caller.organizationId,
    SESSION,
    `test-${crypto.randomUUID()}.png`,
  );
  await mockAdapter.objects.put(caller, {
    bucket: INTAKE_PHOTO_BUCKET,
    path,
    bytes: BYTES,
    contentType: "image/png",
    immutable: true,
  });
  return mockAdapter.intakePhotos.append(caller, {
    intakeSessionId: SESSION,
    parentIntakePhotoId: null,
    photoType: "label",
    storageObjectPath: path,
    contentHash: "0".repeat(64),
    byteSize: BYTES.byteLength,
    mimeType: "image/png",
    widthPx: 640,
    heightPx: 480,
    cropGeometry: null,
    cropMethod: null,
    capturedAt: NOW,
    dataUseEligibility: "training_eligible",
    isExifStripped: true,
    takenBy: caller.userId,
  });
}

async function run(
  fileName: string,
  cropGeometry:
    null | Parameters<typeof runIntakePipeline>[1]["cropGeometry"] = null,
) {
  const photo = await labelPhoto();
  const outcome = await runIntakePipeline(HANDLER, {
    sessionId: SESSION,
    labelPhotoId: photo.id,
    labelFileName: fileName,
    cropGeometry,
    now: NOW,
  });
  return { photo, outcome };
}

function reviewed(outcome: PipelineOutcome) {
  if (outcome.kind !== "reviewed")
    throw new Error(`expected reviewed, got ${outcome.kind}`);
  return outcome;
}

async function rowsOfRun(runId: string) {
  const page = await mockAdapter.labelExtractions.list(HANDLER, {
    ...PAGE,
    extractionRunId: runId,
  });
  return page.items;
}

function auditRows() {
  return mockStore()
    .auditEvents.all()
    .filter((row) => row.correlationId === HANDLER.correlationId);
}

beforeEach(() => {
  resetMockStore();
});

describe("a clean read (label-clean.png)", () => {
  it("writes eleven rows, one per T-09 code, banded from the configuration and stamped with its cutoffs", async () => {
    const { outcome } = await run("label-clean.png");
    const result = reviewed(outcome);
    const rows = await rowsOfRun(result.extractionRunId);
    expect(rows).toHaveLength(LABEL_FIELD_CODES.length);
    expect(new Set(rows.map((row) => row.fieldCode))).toEqual(
      new Set(LABEL_FIELD_CODES),
    );

    const configuration =
      await mockAdapter.platformConfiguration.readIntakeGateConfiguration(
        HANDLER,
      );
    for (const row of rows) {
      expect(row.bandCutoffsApplied, row.fieldCode).toEqual(
        configuration.bandCutoffs,
      );
      expect(row.provider).toBe("fixture");
      expect(row.errorCode).toBeNull();
      expect(row.extractionRunId).toBe(result.extractionRunId);
      expect(row.intakePhotoId).toBe(result.labelCropId);
    }

    const model = rows.find((row) => row.fieldCode === "model");
    expect(model?.fieldValue).toBe("NV-TP400-96S");
    expect(model?.confidenceBand).toBe("high");
    expect(model?.isHardGated).toBe(true);
    expect(typeof model?.rawConfidence).toBe("string");

    // The fixture never proposes a condition: unread, no score, no band.
    const condition = rows.find(
      (row) => row.fieldCode === "assessed_condition",
    );
    expect(condition?.fieldValue).toBeNull();
    expect(condition?.rawConfidence).toBeNull();
    expect(condition?.confidenceBand).toBe("not_extracted");
    expect(condition?.isHardGated).toBe(true);

    // chemistry_code is the label's characters, stored as such — never a chemistry.
    const chemistryCode = rows.find(
      (row) => row.fieldCode === "chemistry_code",
    );
    expect(chemistryCode?.fieldValue).toBe("Li-ion NMC");
  });

  it("ranks the exact catalog match, decodes the date code under its format, and hands a person a draft with nothing selected", async () => {
    const { photo, outcome } = await run("label-clean.png");
    const result = reviewed(outcome);
    expect(result.isReviewRequired).toBe(false);
    expect(result.reasonCodes).toEqual([]);
    // The gate never auto-commits the three hard-gated fields, pass path included.
    expect(result.verdict.hardGatedFields).toEqual([
      "model",
      "chemistry_code",
      "assessed_condition",
    ]);

    const session = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    expect(session?.status).toBe("awaiting_confirmation");
    expect(session?.currentStep).toBe("extraction_review");
    expect(session?.isReviewRequired).toBe(false);
    expect(session?.reviewReasonCodes).toEqual([]);

    const draft = session?.draft ?? null;
    expect(draft).not.toBeNull();
    expect(draft?.fields).toHaveLength(LABEL_FIELD_CODES.length);
    expect(draft?.fields.every((field) => field.status === "pending")).toBe(
      true,
    );
    expect(draft?.candidates).toHaveLength(1);
    expect(draft?.candidates[0]?.catalogEntryId).toBe(
      ID.CATALOG.vehicleTractionNmc,
    );
    expect(draft?.candidates[0]?.matchMethodCode).toBe("exact_part_number");
    expect(draft?.selectedCatalogEntryId).toBeNull();
    expect(draft?.chemistry).toBeNull();
    expect(draft?.chemistrySource).toBeNull();
    expect(draft?.formFactorProposal).toBeNull();
    expect(draft?.dateCodeDecode?.formatKey).toBe("northvale_yyww");
    expect(draft?.dateCodeDecode?.decodedManufacturedOn).toBe("2021-11-01");
    expect(draft?.labelPhotoId).toBe(photo.id);
    expect(draft?.labelCropId).toBe(result.labelCropId);
    expect(draft?.extractionRunId).toBe(result.extractionRunId);
  });

  it("appends the crop as a child photo with the detected geometry and inherits the original's eligibility", async () => {
    const { photo, outcome } = await run("label-clean.png");
    const result = reviewed(outcome);
    const crop = await mockAdapter.intakePhotos.get(
      HANDLER,
      result.labelCropId,
    );
    expect(crop?.parentIntakePhotoId).toBe(photo.id);
    expect(crop?.photoType).toBe("label_crop");
    expect(crop?.cropMethod).toBe("auto_detected");
    expect(crop?.cropGeometry?.sourceWidth).toBe(640);
    expect(crop?.cropGeometry?.sourceHeight).toBe(480);
    expect(crop?.widthPx).toBe(crop?.cropGeometry?.width);
    expect(crop?.dataUseEligibility).toBe(photo.dataUseEligibility);
    expect(crop?.isExifStripped).toBe(true);
  });

  it("writes the extraction and match rows as the system actor under the request's correlation id, and nothing routed the record", async () => {
    const before = auditRows().length;
    await run("label-clean.png");
    const written = auditRows().slice(before);
    expect(written.map((row) => row.eventType)).toEqual([
      "label_extraction.completed",
      "catalog_entry.matched",
    ]);
    for (const row of written) {
      expect(row.actorType).toBe("system");
      expect(row.actorUserId).toBeNull();
      expect(row.actorLabel).toMatch(
        /^intake_pipeline:(extract|match):fixture$/,
      );
      expect(row.correlationId).toBe(HANDLER.correlationId);
      expect(row.organizationId).toBe(ID.ORG.cascade);
    }
  });
});

describe("a scuffed read (label-low.png)", () => {
  it("routes the record to review for a field below threshold, as the system", async () => {
    const before = auditRows().length;
    const { outcome } = await run("label-low.png");
    const result = reviewed(outcome);
    expect(result.isReviewRequired).toBe(true);
    expect(result.reasonCodes).toContain("field_confidence_below_threshold");
    expect(result.verdict.fieldsBelowThreshold).toContain("model");

    const record = await mockAdapter.batteryRecords.get(
      HANDLER,
      ID.BATTERY.midReviewSpread,
    );
    expect(record?.status).toBe("pending_review");
    const session = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    expect(session?.isReviewRequired).toBe(true);
    expect(session?.reviewReasonCodes).toContain(
      "field_confidence_below_threshold",
    );

    const routed = auditRows()
      .slice(before)
      .find((row) => row.eventType === "battery_record.routed_to_review");
    expect(routed?.actorType).toBe("system");
    expect(routed?.entityId).toBe(ID.BATTERY.midReviewSpread);
    expect(routed?.reason).toContain("field_confidence_below_threshold");
  });
});

describe("a pack the catalog does not describe (label-nomatch.png)", () => {
  it("records no candidate, the reason, and still writes the match step's row (Rule 2.4)", async () => {
    const before = auditRows().length;
    const { outcome } = await run("label-nomatch.png");
    const result = reviewed(outcome);
    expect(result.reasonCodes).toContain("no_catalog_match");
    const session = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    expect(session?.draft?.candidates).toEqual([]);
    // No format key without a match: the decode is honest about it.
    expect(session?.draft?.dateCodeDecode?.formatKey).toBe("unknown");
    expect(session?.draft?.dateCodeDecode?.decodedManufacturedOn).toBeNull();

    const matched = auditRows()
      .slice(before)
      .find((row) => row.eventType === "catalog_entry.matched");
    expect(matched?.afterState).toMatchObject({ rankedCatalogEntryIds: [] });
    expect(matched?.reason).toBe("no_catalog_match");
  });
});

describe("nothing legible (label-unreadable.png)", () => {
  it("writes eleven unread rows, keeps the characters the model reported, and records that nothing was extracted", async () => {
    const { outcome } = await run("label-unreadable.png");
    const result = reviewed(outcome);
    expect(result.reasonCodes).toContain("no_fields_extracted");
    expect(result.reasonCodes).toContain("field_confidence_below_threshold");

    const rows = await rowsOfRun(result.extractionRunId);
    expect(rows).toHaveLength(LABEL_FIELD_CODES.length);
    expect(rows.every((row) => row.fieldValue === null)).toBe(true);
    expect(rows.every((row) => row.confidenceBand === "not_extracted")).toBe(
      true,
    );
    expect(rows.every((row) => row.rawConfidence === null)).toBe(true);
    expect(rows.find((row) => row.fieldCode === "model")?.rawText).toBe("▮▮▮");
  });
});

describe("the reader is unavailable (label-fail.png) — EC-14", () => {
  it("records the failure on every row and the session, seeds an unread draft, and throws at the seam naming no vendor", async () => {
    const { photo } = await run("label-clean.png");
    const attempt = runIntakePipeline(HANDLER, {
      sessionId: SESSION,
      labelPhotoId: photo.id,
      labelFileName: "label-fail.png",
      cropGeometry: null,
      now: NOW,
    });
    await expect(attempt).rejects.toThrow(IntegrationError);
    await expect(
      runIntakePipeline(HANDLER, {
        sessionId: SESSION,
        labelPhotoId: photo.id,
        labelFileName: "label-fail.png",
        cropGeometry: null,
        now: NOW,
      }),
    ).rejects.toThrow(/could not be read right now/);

    const session = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    expect(session?.status).toBe("failed");
    expect(session?.reviewReasonCodes).toContain("extraction_failed");
    expect(session?.draft?.fields).toHaveLength(LABEL_FIELD_CODES.length);
    expect(session?.draft?.fields.every((field) => field.value === null)).toBe(
      true,
    );

    const runId = session?.draft?.extractionRunId ?? "";
    const rows = await rowsOfRun(runId);
    expect(rows).toHaveLength(LABEL_FIELD_CODES.length);
    for (const row of rows) {
      expect(row.errorCode).toBe("unavailable");
      expect(row.fieldValue).toBeNull();
      expect(row.confidenceBand).toBe("not_extracted");
    }
  });

  it("leaves the session recoverable: a retry on the same photo reads cleanly", async () => {
    const { photo } = await run("label-clean.png");
    await expect(
      runIntakePipeline(HANDLER, {
        sessionId: SESSION,
        labelPhotoId: photo.id,
        labelFileName: "label-fail.png",
        cropGeometry: null,
        now: NOW,
      }),
    ).rejects.toThrow(IntegrationError);

    const outcome = await runIntakePipeline(HANDLER, {
      sessionId: SESSION,
      labelPhotoId: photo.id,
      labelFileName: "label-clean.png",
      cropGeometry: null,
      now: NOW,
    });
    expect(reviewed(outcome).isReviewRequired).toBe(false);
    const session = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    expect(session?.status).toBe("awaiting_confirmation");
    // Every run's rows stay: a re-read appends, it never overwrites (T-10).
    const all = await mockAdapter.labelExtractions.list(HANDLER, {
      ...PAGE,
      intakePhotoId: reviewed(outcome).labelCropId,
    });
    expect(all.items.length).toBe(LABEL_FIELD_CODES.length);
  });
});

describe("no label region found (label-manualcrop.png)", () => {
  it("asks for a box, then resumes from a manual crop", async () => {
    const { photo, outcome } = await run("label-manualcrop.png");
    expect(outcome).toEqual({
      kind: "needs_manual_crop",
      labelPhotoId: photo.id,
    });
    const photosBefore = await mockAdapter.intakePhotos.list(HANDLER, {
      ...PAGE,
      intakeSessionId: SESSION,
      isCrop: true,
    });

    const resumed = await runIntakePipeline(HANDLER, {
      sessionId: SESSION,
      labelPhotoId: photo.id,
      labelFileName: "label-manualcrop.png",
      cropGeometry: {
        x: 100,
        y: 120,
        width: 300,
        height: 140,
        sourceWidth: 640,
        sourceHeight: 480,
        cropMethod: "manual",
      },
      now: NOW,
    });
    const result = reviewed(resumed);
    const crop = await mockAdapter.intakePhotos.get(
      HANDLER,
      result.labelCropId,
    );
    expect(crop?.cropMethod).toBe("manual");
    expect(crop?.cropGeometry).toEqual({
      x: 100,
      y: 120,
      width: 300,
      height: 140,
      sourceWidth: 640,
      sourceHeight: 480,
    });
    const photosAfter = await mockAdapter.intakePhotos.list(HANDLER, {
      ...PAGE,
      intakeSessionId: SESSION,
      isCrop: true,
    });
    expect(photosAfter.total).toBe(photosBefore.total + 1);
  });
});

describe("a small mobility pack (label-scooter.png)", () => {
  it("matches the scooter entry exactly and decodes under its own format — one record type, no special case", async () => {
    const { outcome } = await run("label-scooter.png");
    const result = reviewed(outcome);
    expect(result.isReviewRequired).toBe(false);
    const session = await mockAdapter.intakeSessions.get(HANDLER, SESSION);
    expect(session?.draft?.candidates[0]?.catalogEntryId).toBe(
      ID.CATALOG.mobilityScooterSla,
    );
    expect(session?.draft?.candidates[0]?.matchMethodCode).toBe(
      "exact_part_number",
    );
    expect(session?.draft?.dateCodeDecode?.formatKey).toBe("ridgeline_mmyy");
    expect(session?.draft?.dateCodeDecode?.decodedManufacturedOn).toBe(
      "2022-03-01",
    );
    const rows = await rowsOfRun(result.extractionRunId);
    expect(
      rows.find((row) => row.fieldCode === "transport_test_marking")
        ?.fieldValue,
    ).toBe("not_present");
  });
});

describe("policy and scope", () => {
  it("refuses a P2 caller before any extraction row is written — facility_manager is not in W_INTAKE", async () => {
    const photo = await labelPhoto();
    await expect(
      runIntakePipeline(MANAGER, {
        sessionId: SESSION,
        labelPhotoId: photo.id,
        labelFileName: "label-clean.png",
        cropGeometry: null,
        now: NOW,
      }),
    ).rejects.toThrow(PermissionError);
    const rows = await mockAdapter.labelExtractions.list(HANDLER, {
      ...PAGE,
      intakeSessionId: SESSION,
    });
    // Only the fixture run's rows exist; nothing of ours landed.
    expect(
      rows.items.every(
        (row) => row.extractionRunId === ID.EXTRACTION_RUN.spread,
      ),
    ).toBe(true);
  });

  it("refuses a photo that is not on the session, and a closed session", async () => {
    const photo = await labelPhoto();
    await expect(
      runIntakePipeline(HANDLER, {
        sessionId: ID.INTAKE_SESSION.scuffedInReview,
        labelPhotoId: photo.id,
        labelFileName: null,
        cropGeometry: null,
        now: NOW,
      }),
    ).rejects.toThrow(/not on this intake/);
    await expect(
      runIntakePipeline(HANDLER, {
        sessionId: ID.INTAKE_SESSION.vehicleCompleted,
        labelPhotoId: photo.id,
        labelFileName: null,
        cropGeometry: null,
        now: NOW,
      }),
    ).rejects.toThrow(/already been closed/);
  });
});
