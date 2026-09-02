import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import * as ID from "@/data/mock/fixtures/ids";

/**
 * The intake Server Actions and the upload route, assembled — `TECHNICAL_SPEC.md`
 * §7.1, §7.2, §11.1; `UX_SPEC.md` §3.6; Rules 2.10, 2.15, 2.21, 7.1, 7.2, 7.21.
 *
 * The session resolver and the denial writer are the two things that need a
 * live request — `next/headers` has none here — so the guard, the denial
 * writer and Next's own `redirect`, `revalidatePath` and `headers` are
 * replaced. Everything else is real: the actions, the pipeline, the fixture
 * label reader, the builder, the adapter and its policy matrix.
 *
 * What is proven: a whole intake from `startIntakeSession` to the redirect
 * `confirmIntake` issues, with every row it leaves behind under one
 * correlation id; the commit refusing without the three confirmations; the
 * Terms of Service gate refusing a blocked organization; and the upload route
 * stripping, hashing, measuring and stamping a photo before it lands.
 */

const guardState: { ctx: RequestContext | null } = { ctx: null };

vi.mock("@/lib/auth/guard", () => ({
  requireWrite: () =>
    Promise.resolve(
      guardState.ctx === null
        ? {
            ok: false,
            error: {
              code: "UNAUTHENTICATED",
              message:
                "You were signed out. Sign in again and try that once more.",
              correlationId: "anonymous",
            },
          }
        : { ok: true, ctx: guardState.ctx },
    ),
}));

const recordNotFound = vi.fn(() => Promise.resolve());
vi.mock("@/lib/auth/record-denial", () => ({
  recordNotFound: (...args: readonly unknown[]) =>
    recordNotFound(...(args as [])),
  recordRouteDenial: () => Promise.resolve(),
  recordWriteDenial: () => Promise.resolve(),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

class RedirectSignal extends Error {
  constructor(readonly destination: string) {
    super(`redirect:${destination}`);
    this.name = "RedirectSignal";
  }
}
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new RedirectSignal(destination);
  },
}));

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers({
        "user-agent": "vitest",
        "x-request-id": "req-intake-0001",
      }),
    ),
}));

const actions = await import("@/features/intake/actions");
const { POST } = await import("@/app/api/intake/photos/route");
const { data } = await import("@/data");
const { mockStore, resetMockStore } = await import("@/data/mock");
const { PHOTO_ALREADY_ON_INTAKE } = await import("@/features/intake/copy");

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-corr-actions-0001",
    ...overrides,
  };
}

const HANDLER = ctx();
/** P1 at Olympic — the one organization with no acceptance in force (E-12). */
const OLYMPIC = ctx({
  userId: ID.USER.tomOlympicHandler,
  organizationId: ID.ORG.olympic,
  correlationId: "test-corr-actions-olympic",
});
/** P2 — may read the audit log (Rule 12.8). */
const MANAGER = ctx({ userId: ID.USER.martaManager, role: "facility_manager" });

/**
 * The smallest PNG the dimension reader accepts: the signature and an IHDR
 * chunk stating 640 × 480. No pixel data — nothing here decodes it.
 */
const PNG_640_480 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x02, 0x80, 0x00, 0x00, 0x01, 0xe0,
]);

function uploadRequest(
  sessionId: string,
  fileName: string,
  options: {
    readonly type?: string;
    readonly bytes?: Uint8Array;
    readonly photoType?: string;
  } = {},
): Request {
  const form = new FormData();
  form.append(
    "file",
    new File([new Uint8Array(options.bytes ?? PNG_640_480)], fileName, {
      type: options.type ?? "image/png",
    }),
  );
  form.append("intakeSessionId", sessionId);
  form.append("photoType", options.photoType ?? "label");
  return new Request("https://bmmp.test/api/intake/photos", {
    method: "POST",
    body: form,
    headers: { "user-agent": "vitest", "x-request-id": "req-upload-0001" },
  });
}

function ok<T>(
  result: { ok: true; data: T } | { ok: false; error: { message: string } },
): T {
  if (!result.ok)
    throw new Error(`expected success, got: ${result.error.message}`);
  return result.data;
}

async function upload(sessionId: string, fileName: string): Promise<string> {
  const response = await POST(uploadRequest(sessionId, fileName));
  expect(response.status).toBe(201);
  const body = (await response.json()) as {
    intakePhotoId: string;
    fileName: string;
  };
  expect(body.fileName).toBe(fileName);
  return body.intakePhotoId;
}

function auditRows(correlationId: string) {
  return mockStore()
    .auditEvents.all()
    .filter((row) => row.correlationId === correlationId);
}

beforeEach(() => {
  resetMockStore();
  recordNotFound.mockClear();
  guardState.ctx = HANDLER;
});

describe("the guard and the gate, before anything", () => {
  it("returns UNAUTHENTICATED when signed out", async () => {
    guardState.ctx = null;
    const result = await actions.startIntakeSession({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("refuses a blocked organization with the block sentence on every action (Rules 7.1, 7.2)", async () => {
    guardState.ctx = OLYMPIC;
    const result = await actions.startIntakeSession({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
    expect(result.error.message).toMatch(/can't be logged yet/);

    const response = await POST(
      uploadRequest(ID.INTAKE_SESSION.spreadInReview, "label-clean.png"),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
  });

  it("returns VALIDATION with the field for a malformed input, before any read", async () => {
    const result = await actions.confirmField({
      sessionId: "nope",
      fieldCode: "model",
      value: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
    expect(result.error.field).toBe("sessionId");
  });

  it("reads another tenant's session as not found, and records the attempt (Rule 1.2)", async () => {
    const rainier = ctx({
      userId: ID.USER.joRainierHandler,
      organizationId: ID.ORG.rainier,
    });
    guardState.ctx = rainier;
    const result = await actions.confirmField({
      sessionId: ID.INTAKE_SESSION.spreadInReview,
      fieldCode: "model",
      value: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
    expect(recordNotFound).toHaveBeenCalledWith(
      rainier,
      "intake_session",
      ID.INTAKE_SESSION.spreadInReview,
    );
  });
});

describe("the upload route", () => {
  it("strips, hashes, measures and stamps the photo, and writes the captured row", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    const photoId = await upload(sessionId, "label-clean.png");

    const photo = await data.intakePhotos.get(HANDLER, photoId);
    expect(photo?.intakeSessionId).toBe(sessionId);
    expect(photo?.photoType).toBe("label");
    expect(photo?.widthPx).toBe(640);
    expect(photo?.heightPx).toBe(480);
    expect(photo?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(photo?.isExifStripped).toBe(true);
    // Cascade's acceptance is in force: eligible, stamped once (T-12).
    expect(photo?.dataUseEligibility).toBe("training_eligible");
    expect(photo?.takenBy).toBe(HANDLER.userId);
    expect(photo?.storageObjectPath).toContain(
      `org/${ID.ORG.cascade}/${sessionId}/`,
    );

    const captured = auditRows(HANDLER.correlationId).find(
      (row) => row.eventType === "intake_photo.captured",
    );
    expect(captured?.actorType).toBe("user");
    expect(captured?.entityId).toBe(photoId);
    expect(captured?.requestId).toBe("req-upload-0001");
  });

  it("answers 409 problem+json when the same bytes are sent twice", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    await upload(sessionId, "label-clean.png");
    const again = await POST(uploadRequest(sessionId, "label-clean.png"));
    expect(again.status).toBe(409);
    const body = (await again.json()) as {
      code: string;
      detail: string;
      correlationId: string;
    };
    expect(body.code).toBe("CONFLICT");
    expect(body.detail).toBe(PHOTO_ALREADY_ON_INTAKE);
    expect(body.correlationId).toBe(HANDLER.correlationId);
  });

  it("refuses an unsupported type, unreadable bytes, and a crop as an upload", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    expect(
      (
        await POST(
          uploadRequest(sessionId, "notes.txt", { type: "text/plain" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          uploadRequest(sessionId, "label.png", {
            bytes: Uint8Array.from([1, 2, 3]),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          uploadRequest(sessionId, "label.png", { photoType: "label_crop" }),
        )
      ).status,
    ).toBe(400);
  });

  it("refuses a closed session", async () => {
    const response = await POST(
      uploadRequest(ID.INTAKE_SESSION.vehicleCompleted, "label-clean.png"),
    );
    expect(response.status).toBe(409);
  });
});

describe("a whole intake, start to redirect", () => {
  it("opens a session with a draft record, stamped with the thresholds in force", async () => {
    const { sessionId, batteryRecordId } = ok(
      await actions.startIntakeSession({}),
    );
    const session = await data.intakeSessions.get(HANDLER, sessionId);
    const record = await data.batteryRecords.get(HANDLER, batteryRecordId);
    const configuration =
      await data.platformConfiguration.readIntakeGateConfiguration(HANDLER);

    expect(session?.status).toBe("open");
    expect(session?.currentStep).toBe("capture");
    expect(session?.batteryRecordId).toBe(batteryRecordId);
    expect(session?.gateThresholdsApplied).toEqual(configuration.thresholds);
    expect(session?.deviceContext).toEqual({ userAgent: "vitest" });
    expect(record?.status).toBe("draft");
    expect(record?.intakeSessionId).toBe(sessionId);
    expect(record?.chemistry).toBeNull();
    expect(record?.applicationClass).toBe("unknown");
    expect(record?.stateOfChargeBand).toBe("not_captured");

    // T-22 — a draft is visible only inside its session.
    const listed = await data.batteryRecords.list(HANDLER, {
      excludeDrafts: true,
      limit: 50,
    });
    expect(listed.items.some((row) => row.id === batteryRecordId)).toBe(false);

    const started = auditRows(HANDLER.correlationId).find(
      (row) => row.eventType === "intake_session.started",
    );
    expect(started?.actorType).toBe("user");
    expect(started?.actorUserId).toBe(HANDLER.userId);
    expect(started?.entityId).toBe(sessionId);
  });

  it("refuses to commit until the three hard-gated fields are confirmed by a person (Rules 2.15, 2.21)", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    const labelPhotoId = await upload(sessionId, "label-clean.png");
    const read = ok(
      await actions.runLabelExtraction({
        sessionId,
        labelPhotoId,
        labelFileName: "label-clean.png",
      }),
    );
    expect(read.kind).toBe("reviewed");

    const refused = await actions.confirmIntake({ sessionId });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("VALIDATION");
    expect(refused.error.message).toMatch(/Chemistry code/);
    expect(refused.error.message).toMatch(/Model \/ part number/);
    const record = await data.batteryRecords.get(
      HANDLER,
      (await data.intakeSessions.get(HANDLER, sessionId))?.batteryRecordId ??
        "",
    );
    expect(record?.status).toBe("draft");
  });

  it("refuses to confirm chemistry code before a chemistry has a source (Rule 2.10)", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    const labelPhotoId = await upload(sessionId, "label-clean.png");
    ok(
      await actions.runLabelExtraction({
        sessionId,
        labelPhotoId,
        labelFileName: "label-clean.png",
      }),
    );
    const refused = await actions.confirmField({
      sessionId,
      fieldCode: "chemistry_code",
      value: null,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("VALIDATION");
    expect(refused.error.message).toMatch(/not a chemistry on their own/);
  });

  it("logs a battery: confirmations, catalog chemistry, condition, charge, placement, commit, redirect", async () => {
    const { sessionId, batteryRecordId } = ok(
      await actions.startIntakeSession({ containerId: ID.CONTAINER.soundDrum }),
    );
    const labelPhotoId = await upload(sessionId, "label-clean.png");
    const read = ok(
      await actions.runLabelExtraction({
        sessionId,
        labelPhotoId,
        labelFileName: "label-clean.png",
      }),
    );
    if (read.kind !== "reviewed") throw new Error("expected a review");
    expect(read.isReviewRequired).toBe(false);

    const afterModel = ok(
      await actions.confirmField({
        sessionId,
        fieldCode: "model",
        value: null,
      }),
    );
    expect(
      afterModel.draft.fields.find((field) => field.fieldCode === "model")
        ?.status,
    ).toBe("confirmed");
    expect(
      afterModel.draft.fields.find((field) => field.fieldCode === "model")
        ?.confirmedBy,
    ).toBe(HANDLER.userId);

    const picked = ok(
      await actions.selectCatalogCandidate({
        sessionId,
        catalogEntryId: ID.CATALOG.vehicleTractionNmc,
      }),
    );
    expect(picked.draft.chemistry).toBe("li_nmc");
    expect(picked.draft.chemistrySource).toBe("catalog_match");
    expect(
      picked.draft.fields.find((field) => field.fieldCode === "chemistry_code")
        ?.source,
    ).toBe("matched_from_catalog");

    ok(
      await actions.confirmField({
        sessionId,
        fieldCode: "chemistry_code",
        value: null,
      }),
    );
    for (const fieldCode of [
      "manufacturer",
      "voltage",
      "capacity_ah",
      "energy_wh",
      "date_code",
      "serial_number",
    ] as const) {
      ok(await actions.confirmField({ sessionId, fieldCode, value: null }));
    }
    // The draft survived every action on the server, not in the browser.
    const persisted = await data.intakeSessions.get(HANDLER, sessionId);
    expect(
      persisted?.draft?.fields.filter((field) => field.status === "confirmed"),
    ).toHaveLength(8);

    const advanced = ok(
      await actions.advanceToStep({ sessionId, step: "confirm_and_place" }),
    );
    expect(advanced.step).toBe("confirm_and_place");

    ok(
      await actions.setCondition({
        sessionId,
        findingTypes: ["none_observed"],
        isDefective: false,
      }),
    );
    ok(await actions.confirmCondition({ sessionId }));
    ok(
      await actions.setStateOfCharge({
        sessionId,
        band: "at_or_below_storage_limit",
        percent: "30",
        source: "handheld_meter",
      }),
    );
    const placed = ok(
      await actions.choosePlacement({
        sessionId,
        containerId: ID.CONTAINER.soundDrum,
      }),
    );
    expect(placed.draft.containerId).toBe(ID.CONTAINER.soundDrum);

    const massBefore = (
      await data.containers.get(HANDLER, ID.CONTAINER.soundDrum)
    )?.currentNetMassKg;
    // The redirect is control flow, thrown outside the action's own `try`.
    const redirected = await actions
      .confirmIntake({ sessionId })
      .catch((error: unknown) => error);
    expect(redirected).toBeInstanceOf(RedirectSignal);
    expect((redirected as RedirectSignal).destination).toBe(
      `/batteries/${batteryRecordId}?logged=1&container=${ID.CONTAINER.soundDrum}`,
    );

    const record = await data.batteryRecords.get(HANDLER, batteryRecordId);
    expect(record?.status).toBe("stored");
    expect(record?.containerId).toBe(ID.CONTAINER.soundDrum);
    expect(record?.chemistry).toBe("li_nmc");
    expect(record?.chemistrySource).toBe("catalog_match");
    expect(record?.chemistryConfirmedBy).toBe(HANDLER.userId);
    expect(record?.catalogEntryId).toBe(ID.CATALOG.vehicleTractionNmc);
    expect(record?.manufacturerName).toBe("Northvale Cell Systems");
    expect(record?.partNumber).toBe("NV-TP400-96S");
    expect(record?.nominalVoltageV).toBe("355.2");
    expect(record?.ratedCapacityAh).toBe("220");
    expect(record?.ratedEnergyWh).toBe("78100");
    expect(record?.manufacturedOn).toBe("2021-11-01");
    expect(record?.assessedCondition).toBe("sound");
    expect(record?.conditionConfirmedBy).toBe(HANDLER.userId);
    expect(record?.stateOfChargePercentAtIntake).toBe("30");
    expect(record?.applicationClass).toBe("vehicle");
    expect(record?.dateCodeDecodeId).not.toBeNull();

    const session = await data.intakeSessions.get(HANDLER, sessionId);
    expect(session?.status).toBe("completed");
    expect(session?.currentStep).toBe("complete");
    expect(session?.draft).toBeNull();

    const decisions = await data.classificationDecisions.list(HANDLER, {
      batteryRecordId,
      limit: 5,
    });
    expect(decisions.items[0]?.wasteClassification).toBe("light_category");
    // TODO(T-16) — no activity type describes a placement, so no storage
    // event is written; the record's container and its status row carry it.
    const events = await data.storageEvents.list(HANDLER, {
      batteryRecordId,
      limit: 5,
    });
    expect(events.items).toHaveLength(0);
    const landed = await data.batteryRecords.get(HANDLER, batteryRecordId);
    expect(landed?.containerId).toBe(ID.CONTAINER.soundDrum);
    expect(landed?.status).toBe("stored");
    const container = await data.containers.get(
      HANDLER,
      ID.CONTAINER.soundDrum,
    );
    expect(container?.currentNetMassKg).not.toBe(massBefore);

    // Every row of the intake, from the first photo to the placement, under one id.
    const log = await data.auditEvents.list(MANAGER, {
      correlationId: HANDLER.correlationId,
      limit: 50,
    });
    const types = log.items.map((row) => row.eventType);
    for (const expected of [
      "intake_session.started",
      "intake_photo.captured",
      "label_extraction.completed",
      "catalog_entry.matched",
      "battery_record.confirmed",
      "damage_assessment.recorded",
      "classification_decision.recorded",
      "battery_record.status_changed",
    ]) {
      expect(types, expected).toContain(expected);
    }
    expect(
      log.items.every((row) => row.correlationId === HANDLER.correlationId),
    ).toBe(true);
    const confirmed = log.items.find(
      (row) => row.eventType === "battery_record.confirmed",
    );
    expect(confirmed?.actorType).toBe("user");
    expect(confirmed?.actorUserId).toBe(HANDLER.userId);
    const classified = log.items.find(
      (row) => row.eventType === "classification_decision.recorded",
    );
    expect(classified?.actorType).toBe("system");
  });

  it("takes the manual path when nothing matches: hand-entered chemistry, no container, classified", async () => {
    const { sessionId, batteryRecordId } = ok(
      await actions.startIntakeSession({}),
    );
    const labelPhotoId = await upload(sessionId, "label-nomatch.png");
    const read = ok(
      await actions.runLabelExtraction({
        sessionId,
        labelPhotoId,
        labelFileName: "label-nomatch.png",
      }),
    );
    if (read.kind !== "reviewed") throw new Error("expected a review");
    expect(read.reasonCodes).toContain("no_catalog_match");

    ok(
      await actions.selectCatalogCandidate({ sessionId, catalogEntryId: null }),
    );
    const entered = ok(
      await actions.enterChemistry({ sessionId, chemistry: "li_lfp" }),
    );
    expect(entered.draft.chemistrySource).toBe("human_entry");
    expect(
      entered.draft.fields.find((field) => field.fieldCode === "chemistry_code")
        ?.source,
    ).toBe("entered_by");
    ok(
      await actions.confirmField({
        sessionId,
        fieldCode: "chemistry_code",
        value: null,
      }),
    );
    ok(
      await actions.confirmField({
        sessionId,
        fieldCode: "model",
        value: null,
      }),
    );
    ok(
      await actions.setCondition({
        sessionId,
        findingTypes: ["surface_marking"],
        isDefective: false,
      }),
    );
    ok(await actions.confirmCondition({ sessionId }));

    await expect(actions.confirmIntake({ sessionId })).rejects.toThrow(
      RedirectSignal,
    );
    const record = await data.batteryRecords.get(HANDLER, batteryRecordId);
    expect(record?.status).toBe("classified");
    expect(record?.chemistry).toBe("li_lfp");
    expect(record?.chemistrySource).toBe("human_entry");
    expect(record?.catalogEntryId).toBeNull();
    expect(record?.assessedCondition).toBe("cosmetic_wear_only");
    expect(record?.containerId).toBeNull();
  });

  it("refuses a corrected value that fails shape validation, naming the field (Rule 2.12)", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    const labelPhotoId = await upload(sessionId, "label-clean.png");
    ok(
      await actions.runLabelExtraction({
        sessionId,
        labelPhotoId,
        labelFileName: "label-clean.png",
      }),
    );
    const refused = await actions.confirmField({
      sessionId,
      fieldCode: "voltage",
      value: "three fifty five",
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("VALIDATION");
    expect(refused.error.field).toBe("value");
    expect(refused.error.message).toMatch(/^Voltage was not accepted/);
  });

  it("saves to the review queue as a person's routing, and voids with a stated reason (Rule 2.23)", async () => {
    const { sessionId, batteryRecordId } = ok(
      await actions.startIntakeSession({}),
    );
    // A clean read routes nothing to review on its own, so the routing row
    // below is the person's act and nothing else's.
    const labelPhotoId = await upload(sessionId, "label-clean.png");
    ok(
      await actions.runLabelExtraction({
        sessionId,
        labelPhotoId,
        labelFileName: "label-clean.png",
      }),
    );
    expect(
      (await data.batteryRecords.get(HANDLER, batteryRecordId))?.status,
    ).not.toBe("pending_review");

    ok(await actions.saveToReviewQueue({ sessionId }));
    const routed = auditRows(HANDLER.correlationId).filter(
      (row) => row.eventType === "battery_record.routed_to_review",
    );
    expect(
      routed.some(
        (row) =>
          row.actorType === "user" && row.reason === "session_saved_to_queue",
      ),
    ).toBe(true);
    expect(
      (await data.batteryRecords.get(HANDLER, batteryRecordId))?.status,
    ).toBe("pending_review");

    // Already in the queue: a second save changes nothing and writes no
    // routing row that routed nothing (the TODO(T-43) in saveToReviewQueue).
    ok(await actions.saveToReviewQueue({ sessionId }));
    expect(
      auditRows(HANDLER.correlationId).filter(
        (row) =>
          row.eventType === "battery_record.routed_to_review" &&
          row.reason === "session_saved_to_queue",
      ),
    ).toHaveLength(1);

    ok(
      await actions.voidIntakeSession({
        sessionId,
        reason: "Duplicate of an earlier intake",
      }),
    );
    expect(
      (await data.batteryRecords.get(HANDLER, batteryRecordId))?.status,
    ).toBe("voided");
    expect((await data.intakeSessions.get(HANDLER, sessionId))?.status).toBe(
      "abandoned",
    );
    const voided = auditRows(HANDLER.correlationId).find(
      (row) => row.eventType === "battery_record.status_changed",
    );
    expect(voided?.reason).toBe("Duplicate of an earlier intake");

    // Closed is closed: nothing further is accepted.
    const afterwards = await actions.confirmField({
      sessionId,
      fieldCode: "model",
      value: null,
    });
    expect(afterwards.ok).toBe(false);
    if (!afterwards.ok) expect(afterwards.error.code).toBe("CONFLICT");
  });

  it("surfaces a reader failure as INTEGRATION and leaves the session recoverable (EC-14)", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    const labelPhotoId = await upload(sessionId, "label-fail.png");
    const failed = await actions.runLabelExtraction({
      sessionId,
      labelPhotoId,
      labelFileName: "label-fail.png",
    });
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error.code).toBe("INTEGRATION");
    expect(failed.error.message).not.toMatch(/fixture/);
    expect((await data.intakeSessions.get(HANDLER, sessionId))?.status).toBe(
      "failed",
    );

    const retried = ok(
      await actions.runLabelExtraction({
        sessionId,
        labelPhotoId,
        labelFileName: "label-clean.png",
      }),
    );
    expect(retried.kind).toBe("reviewed");
  });
});
