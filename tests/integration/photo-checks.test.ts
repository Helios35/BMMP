import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import * as ID from "@/data/mock/fixtures/ids";

/**
 * The photo checks end to end on the mock — b2-10; Rules 2.36, 2.37, 6.25,
 * 6.26, 7.25; D-75. Driven through the real upload route, the real pipeline
 * and the real Server Actions, as `intake-actions.test.ts` drives intake.
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
              message: "Signed out.",
              correlationId: "anonymous",
            },
          }
        : { ok: true, ctx: guardState.ctx },
    ),
}));
vi.mock("@/lib/auth/record-denial", () => ({
  recordNotFound: () => Promise.resolve(),
  recordRouteDenial: () => Promise.resolve(),
  recordWriteDenial: () => Promise.resolve(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
class RedirectSignal extends Error {
  constructor(readonly destination: string) {
    super(`redirect:${destination}`);
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
      new Headers({ "user-agent": "vitest", "x-request-id": "req-photo-0001" }),
    ),
}));

const actions = await import("@/features/intake/actions");
const { POST } = await import("@/app/api/intake/photos/route");
const { POST: POST_REFERENCE } =
  await import("@/app/api/catalog/reference-photos/route");
const { data } = await import("@/data");
const { mockStore, resetMockStore } = await import("@/data/mock");
const { readIntakeStepView } =
  await import("@/features/intake/server/read-intake");
const { reviewCardView } = await import("@/features/intake/server/step-views");
const { recordDamageAssessmentFor } =
  await import("@/features/battery-record/server/condition");
const { SUGGESTIONS_UNDECIDED } = await import("@/features/intake/copy");
const { FIXTURE_RESAVED_FINGERPRINT } =
  await import("@/lib/vision/providers/fixture");

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-corr-photo-checks",
    ...overrides,
  };
}

const HANDLER = ctx();
const MANAGER = ctx({ userId: ID.USER.martaManager, role: "facility_manager" });
const AUDITOR = ctx({ userId: ID.USER.samAuditor, role: "auditor" });
const ADMIN = ctx({
  userId: ID.USER.platformAdmin,
  role: "platform_admin",
  isPlatformAdmin: true,
  correlationId: "test-corr-photo-admin",
});

/** A 640×480 PNG header, made byte-unique per upload so no two hash alike. */
let uniqueByte = 0;
function png(): Uint8Array {
  uniqueByte += 1;
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52,
    0x00,
    0x00,
    0x02,
    0x80,
    0x00,
    0x00,
    0x01,
    0xe0,
    uniqueByte & 0xff,
    (uniqueByte >> 8) & 0xff,
  ]);
}

function uploadRequest(
  sessionId: string,
  fileName: string,
  photoType = "label",
): Request {
  const form = new FormData();
  form.append(
    "file",
    new File([new Uint8Array(png())], fileName, { type: "image/png" }),
  );
  form.append("intakeSessionId", sessionId);
  form.append("photoType", photoType);
  return new Request("https://bmmp.test/api/intake/photos", {
    method: "POST",
    body: form,
  });
}

async function upload(
  sessionId: string,
  fileName: string,
  photoType = "label",
): Promise<string> {
  const response = await POST(uploadRequest(sessionId, fileName, photoType));
  expect(response.status).toBe(201);
  return ((await response.json()) as { intakePhotoId: string }).intakePhotoId;
}

function ok<T>(
  result: { ok: true; data: T } | { ok: false; error: { message: string } },
): T {
  if (!result.ok) throw new Error(`expected success: ${result.error.message}`);
  return result.data;
}

async function checksOn(intakePhotoId: string) {
  return (await data.photoChecks.list(HANDLER, { intakePhotoId, limit: 20 }))
    .items;
}

/** Start an intake and read a label through the real pipeline. */
async function readLabel(fileName: string) {
  const { sessionId, batteryRecordId } = ok(
    await actions.startIntakeSession({}),
  );
  const labelPhotoId = await upload(sessionId, fileName);
  const read = ok(
    await actions.runLabelExtraction({
      sessionId,
      labelPhotoId,
      labelFileName: fileName,
    }),
  );
  return { sessionId, batteryRecordId, labelPhotoId, read };
}

beforeEach(() => {
  resetMockStore();
  guardState.ctx = HANDLER;
});

describe("on upload (Rules 2.37, 6.25, 6.26)", () => {
  it("sets a look-alike fingerprint beside the content hash, from the bytes", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    const photoId = await upload(sessionId, "label-clean.png");
    const photo = await data.intakePhotos.get(HANDLER, photoId);
    expect(photo?.lookFingerprint).toMatch(/^fixture64:[0-9a-f]{16}$/);
    const resaved = await data.intakePhotos.get(
      HANDLER,
      await upload(sessionId, "label-resaved.png"),
    );
    expect(resaved?.lookFingerprint).toBe(FIXTURE_RESAVED_FINGERPRINT);
  });

  it("asks for damage suggestions on a damage photo and records the run as the system's", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    const photoId = await upload(sessionId, "damage-swelling.png", "damage");
    const [run] = await checksOn(photoId);
    expect(run?.checkKind).toBe("damage_proposal");
    expect(run?.outcome).toBe("proposed");
    expect(run?.proposedFindings).toEqual(["swelling", "surface_marking"]);
    const audit = mockStore()
      .auditEvents.all()
      .find((row) => row.entityId === run?.id);
    expect(audit?.eventType).toBe("photo_check.completed");
    expect(audit?.actorType).toBe("system");
    expect(audit?.actorUserId).toBeNull();
    // No number about the photo anywhere on the run or its row.
    expect(run?.errorCode).toBeNull();
    expect(JSON.stringify(audit?.afterState)).not.toMatch(
      /confidence|score|similar/i,
    );
  });

  it("stores the photo when the check fails, and records the failure with its reason (Rule 6.26)", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    const photoId = await upload(sessionId, "damage-unavailable.png", "damage");
    const [run] = await checksOn(photoId);
    expect(run?.outcome).toBe("failed");
    expect(run?.errorCode).toBe("unavailable");
    const audit = mockStore()
      .auditEvents.all()
      .find((row) => row.entityId === run?.id);
    expect(audit?.eventType).toBe("photo_check.failed");
    expect(audit?.reason).toBe("unavailable");
  });

  it("never asks about a label photo", async () => {
    const { sessionId } = ok(await actions.startIntakeSession({}));
    const photoId = await upload(sessionId, "label-clean.png");
    expect(
      (await checksOn(photoId)).filter(
        (run) => run.checkKind === "damage_proposal",
      ),
    ).toEqual([]);
  });
});

describe("the label look check (Rule 2.36)", () => {
  it("routes a label that looks different to review, with both photos and no number", async () => {
    const { sessionId, read } = await readLabel("label-different.png");
    if (read.kind !== "reviewed") throw new Error("expected a review");
    expect(read.reasonCodes).toContain("label_look_differs");

    const view = await readIntakeStepView(HANDLER, sessionId);
    if (view === null) throw new Error("no view");
    expect(view.labelLook?.check.outcome).toBe("looks_different");
    expect(view.labelLook?.reference?.id).toBe(
      ID.REFERENCE_PHOTO.vehicleTractionNmc,
    );
    const card = reviewCardView(view);
    expect(card.gate.labelLook?.entryHref).toBe(
      `/catalog/${ID.CATALOG.vehicleTractionNmc}`,
    );
    expect(card.gate.labelLook?.thisLabel).not.toBeNull();
    expect(card.gate.labelLook?.reference).not.toBeNull();
    expect(JSON.stringify(card.gate.labelLook)).not.toMatch(
      /score|similar|percent/i,
    );
  });

  it("looks like the reference for a clean label, and routes nothing", async () => {
    const { sessionId, read } = await readLabel("label-clean.png");
    if (read.kind !== "reviewed") throw new Error("expected a review");
    expect(read.reasonCodes).not.toContain("label_look_differs");
    const view = await readIntakeStepView(HANDLER, sessionId);
    expect(view?.labelLook?.check.outcome).toBe("looks_consistent");
  });

  it("records no reference on file, compares nothing and flags nothing for an entry without one", async () => {
    const { sessionId, read } = await readLabel("label-scooter.png");
    if (read.kind !== "reviewed") throw new Error("expected a review");
    expect(read.reasonCodes).not.toContain("label_look_differs");
    const view = await readIntakeStepView(HANDLER, sessionId);
    expect(view?.labelLook?.check.outcome).toBe("no_reference");
    expect(view?.labelLook?.check.catalogReferencePhotoId).toBeNull();
  });
});

describe("the copy check (Rule 2.37)", () => {
  it("routes a re-saved copy to review, naming the other record", async () => {
    const { sessionId, read } = await readLabel("label-resaved.png");
    if (read.kind !== "reviewed") throw new Error("expected a review");
    expect(read.reasonCodes).toContain("photo_looks_reused");
    expect(read.reasonCodes).not.toContain("duplicate_photo");
    const view = await readIntakeStepView(HANDLER, sessionId);
    if (view === null) throw new Error("no view");
    expect(
      view.lookAlikes.records.map((record) => record.recordNumber),
    ).toEqual(["BR-0015"]);
    const card = reviewCardView(view);
    expect(card.gate.photoReuse?.[0]?.recordNumber).toBe("BR-0015");
    expect(card.gate.photoReuse?.[0]?.href).toBe(
      `/batteries/${ID.BATTERY.photoCopyTarget}`,
    );
    const copyRuns = (
      await data.photoChecks.list(HANDLER, {
        intakeSessionId: sessionId,
        checkKind: "look_alike",
        limit: 10,
      })
    ).items;
    expect(copyRuns.some((run) => run.outcome === "copy_found")).toBe(true);
    expect(copyRuns[0]?.configurationVersion).toBe("look-alike-2026-11");
  });

  it("finds no copy for an ordinary upload", async () => {
    const { read } = await readLabel("label-clean.png");
    if (read.kind !== "reviewed") throw new Error("expected a review");
    expect(read.reasonCodes).not.toContain("photo_looks_reused");
  });
});

describe("suggestions on the condition step, and the commit (Rules 6.25, 7.25)", () => {
  async function toStepThree() {
    const { sessionId, batteryRecordId, labelPhotoId } =
      await readLabel("label-clean.png");
    const damagePhotoId = await upload(
      sessionId,
      "damage-swelling.png",
      "damage",
    );
    ok(
      await actions.confirmField({
        sessionId,
        fieldCode: "model",
        value: null,
      }),
    );
    ok(
      await actions.selectCatalogCandidate({
        sessionId,
        catalogEntryId: ID.CATALOG.vehicleTractionNmc,
      }),
    );
    for (const fieldCode of [
      "chemistry_code",
      "manufacturer",
      "voltage",
      "capacity_ah",
      "energy_wh",
      "date_code",
      "serial_number",
    ] as const) {
      ok(await actions.confirmField({ sessionId, fieldCode, value: null }));
    }
    ok(await actions.advanceToStep({ sessionId, step: "confirm_and_place" }));
    const run = (await checksOn(damagePhotoId))[0];
    if (run === undefined) throw new Error("no damage check ran");
    return { sessionId, batteryRecordId, labelPhotoId, damagePhotoId, run };
  }

  it("shows two suggestions, nothing ticked, and refuses Confirm until each is decided", async () => {
    const { sessionId } = await toStepThree();
    const view = await readIntakeStepView(HANDLER, sessionId);
    expect(view?.suggestions.rows.map((row) => row.findingLabel)).toEqual([
      "Swelling",
      "Surface marking",
    ]);
    expect(view?.suggestions.undecided).toHaveLength(2);
    expect(view?.draft.condition?.findingTypes ?? []).toEqual([]);

    ok(
      await actions.setCondition({
        sessionId,
        findingTypes: ["none_observed"],
        isDefective: false,
      }),
    );
    const refused = await actions.confirmCondition({ sessionId });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.message).toBe(SUGGESTIONS_UNDECIDED);
  });

  it("keeps each decision, writes model_assisted_visual, and puts the proposals on the assessment and its event", async () => {
    const { sessionId, batteryRecordId, run } = await toStepThree();
    const accepted = ok(
      await actions.decideDamageSuggestion({
        sessionId,
        photoCheckId: run.id,
        findingType: "surface_marking",
        decision: "accepted",
      }),
    );
    expect(accepted.draft.condition?.findingTypes).toEqual(["surface_marking"]);
    ok(
      await actions.decideDamageSuggestion({
        sessionId,
        photoCheckId: run.id,
        findingType: "swelling",
        decision: "rejected",
      }),
    );
    ok(await actions.confirmCondition({ sessionId }));
    ok(
      await actions.choosePlacement({
        sessionId,
        containerId: ID.CONTAINER.soundDrum,
      }),
    );
    const committed = await actions
      .confirmIntake({ sessionId })
      .catch((error: unknown) => error);
    expect(committed).toBeInstanceOf(RedirectSignal);

    const assessments = await data.damageAssessments.list(HANDLER, {
      batteryRecordId,
      limit: 5,
    });
    const [assessment] = assessments.items;
    expect(assessment?.assessmentMethod).toBe("model_assisted_visual");
    expect(assessment?.findingTypes).toEqual(["surface_marking"]);
    expect(assessment?.modelIdentifier).toBe("fixture-photo-checker");
    expect(assessment?.modelConfidence).toBeNull();
    expect(
      (assessment?.proposalDecisions ?? []).map((row) => [
        row.findingType,
        row.decision,
        row.decidedBy,
      ]),
    ).toEqual([
      ["surface_marking", "accepted", HANDLER.userId],
      ["swelling", "rejected", HANDLER.userId],
    ]);
    const event = mockStore()
      .auditEvents.all()
      .find(
        (row) =>
          row.eventType === "damage_assessment.recorded" &&
          row.entityId === batteryRecordId,
      );
    expect(event?.afterState?.assessmentMethod).toBe("model_assisted_visual");
    expect(event?.afterState?.proposals).toHaveLength(2);
  });

  it("refuses a decision on a suggestion this intake never showed", async () => {
    const { sessionId } = await toStepThree();
    const refused = await actions.decideDamageSuggestion({
      sessionId,
      photoCheckId: ID.PHOTO_CHECK.modelAssistedProposal,
      findingType: "dent",
      decision: "accepted",
    });
    expect(refused.ok).toBe(false);
  });

  it("reads a failed check as unavailable, blocks nothing, and commits as a visual inspection", async () => {
    const { sessionId, batteryRecordId } = await readLabel("label-clean.png");
    await upload(sessionId, "damage-unavailable.png", "damage");
    const view = await readIntakeStepView(HANDLER, sessionId);
    expect(view?.suggestions.unavailable).toBe(true);
    expect(view?.suggestions.rows).toEqual([]);
    expect(view?.suggestions.undecided).toEqual([]);
    ok(
      await actions.setCondition({
        sessionId,
        findingTypes: ["none_observed"],
        isDefective: false,
      }),
    );
    ok(await actions.confirmCondition({ sessionId }));
    expect(batteryRecordId).toBeTruthy();
  });
});

describe("re-assessment on the record (Rule 6.25, on attach)", () => {
  it("shows suggestions for a photo attached to a committed record, and holds every one decided", async () => {
    // BR-0001's intake is completed; Attach a photo now reaches the route.
    const photoId = await upload(
      ID.INTAKE_SESSION.vehicleCompleted,
      "damage-swelling.png",
      "damage",
    );
    const [run] = await checksOn(photoId);
    if (run === undefined) throw new Error("no damage check ran");

    await expect(
      recordDamageAssessmentFor(
        HANDLER,
        {
          recordId: ID.BATTERY.vehicleTraction,
          findingTypes: ["surface_marking"],
          isDefective: false,
          reason: "Scuffing seen on a new photo.",
          clearingPhotoIntakePhotoId: null,
        },
        "2026-11-10T12:00:00.000Z",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const outcome = await recordDamageAssessmentFor(
      HANDLER,
      {
        recordId: ID.BATTERY.vehicleTraction,
        findingTypes: ["surface_marking"],
        isDefective: false,
        reason: "Scuffing seen on a new photo.",
        clearingPhotoIntakePhotoId: null,
        proposalDecisions: [
          {
            photoCheckId: run.id,
            findingType: "surface_marking",
            decision: "accepted",
          },
          {
            photoCheckId: run.id,
            findingType: "swelling",
            decision: "rejected",
          },
        ],
      },
      "2026-11-10T12:00:00.000Z",
    );
    expect(outcome.assessment.assessmentMethod).toBe("model_assisted_visual");
    expect(outcome.assessment.proposalDecisions).toHaveLength(2);
    expect(outcome.record.ddrFlags).toEqual([]);
  });

  it("refuses an accepted suggestion the findings leave out", async () => {
    const photoId = await upload(
      ID.INTAKE_SESSION.vehicleCompleted,
      "damage-swelling.png",
      "damage",
    );
    const [run] = await checksOn(photoId);
    if (run === undefined) throw new Error("no damage check ran");
    await expect(
      recordDamageAssessmentFor(
        HANDLER,
        {
          recordId: ID.BATTERY.vehicleTraction,
          findingTypes: ["none_observed"],
          isDefective: false,
          reason: "Checked again.",
          clearingPhotoIntakePhotoId: null,
          proposalDecisions: [
            {
              photoCheckId: run.id,
              findingType: "surface_marking",
              decision: "accepted",
            },
            {
              photoCheckId: run.id,
              findingType: "swelling",
              decision: "rejected",
            },
          ],
        },
        "2026-11-10T12:00:00.000Z",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("the writers behind src/data", () => {
  it("refuses a run from a role that cannot set one running, and an incoherent run", async () => {
    const base = {
      intakePhotoId: ID.PHOTO.vehicleOriginal,
      checkKind: "look_alike" as const,
      outcome: "no_copy_found" as const,
      proposedFindings: [],
      catalogEntryId: null,
      catalogReferencePhotoId: null,
      matchedPhotoIds: [],
      matchedBatteryRecordIds: [],
      errorCode: null,
      provider: null,
      modelIdentifier: null,
      promptVersion: null,
      costUsd: null,
      latencyMs: null,
      configurationVersion: "look-alike-2026-11",
      at: "2026-11-10T12:00:00.000Z",
      attribution: { requestId: null, ipAddress: null, userAgent: null },
    };
    await expect(data.photoChecks.record(AUDITOR, base)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(data.photoChecks.record(MANAGER, base)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // A damage outcome on a copy check; a failure with no reason.
    await expect(
      data.photoChecks.record(HANDLER, { ...base, outcome: "proposed" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      data.photoChecks.record(HANDLER, { ...base, outcome: "failed" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const stored = await data.photoChecks.record(HANDLER, base);
    expect(stored.batteryRecordId).toBe(ID.BATTERY.vehicleTraction);
  });

  it("lets only P6 set a reference photo, under the platform prefix, keeping the one it replaces", async () => {
    const before = await data.catalogReferencePhotos.current(
      HANDLER,
      ID.CATALOG.vehicleTractionNmc,
    );
    expect(before?.id).toBe(ID.REFERENCE_PHOTO.vehicleTractionNmc);
    const setting = {
      catalogEntryId: ID.CATALOG.vehicleTractionNmc,
      bytes: png(),
      mimeType: "image/png",
      widthPx: 640,
      heightPx: 480,
      fileName: "maker-spec-sheet.png",
      at: "2026-11-10T12:00:00.000Z",
      attribution: { requestId: null, ipAddress: null, userAgent: null },
    };
    await expect(
      data.catalogReferencePhotos.set(HANDLER, setting),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const replaced = await data.catalogReferencePhotos.set(ADMIN, setting);
    expect(replaced.storageObjectPath).toMatch(/^platform\/catalog\//);
    expect(replaced.storageObjectPath).not.toContain("org/");
    expect(replaced.supersedesCatalogReferencePhotoId).toBe(before?.id);
    expect(
      (
        await data.catalogReferencePhotos.current(
          HANDLER,
          ID.CATALOG.vehicleTractionNmc,
        )
      )?.id,
    ).toBe(replaced.id);
    const history = await data.catalogReferencePhotos.list(HANDLER, {
      catalogEntryId: ID.CATALOG.vehicleTractionNmc,
      limit: 10,
    });
    expect(history.items.map((row) => row.id).sort()).toEqual(
      [before?.id, replaced.id].sort(),
    );
    const event = mockStore()
      .auditEvents.all()
      .find((row) => row.eventType === "catalog_entry.reference_photo_set");
    expect(event?.beforeState?.catalogReferencePhotoId).toBe(before?.id);
    expect(event?.afterState?.catalogReferencePhotoId).toBe(replaced.id);
    // Every member reads it; no tenant writes the platform bucket.
    await expect(
      data.objects.get(HANDLER, {
        bucket: "catalog-reference-photos",
        path: replaced.storageObjectPath,
      }),
    ).resolves.toBeInstanceOf(Uint8Array);
    await expect(
      data.objects.put(HANDLER, {
        bucket: "catalog-reference-photos",
        path: "platform/catalog/forged.png",
        bytes: png(),
        contentType: "image/png",
        immutable: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("takes a reference photo through its route, as P6, and refuses anyone else", async () => {
    const request = () => {
      const form = new FormData();
      form.append(
        "file",
        new File([new Uint8Array(png())], "spec.png", { type: "image/png" }),
      );
      form.append("catalogEntryId", ID.CATALOG.mobilityScooterSla);
      return new Request("https://bmmp.test/api/catalog/reference-photos", {
        method: "POST",
        body: form,
      });
    };
    guardState.ctx = HANDLER;
    expect((await POST_REFERENCE(request())).status).toBe(403);
    guardState.ctx = ADMIN;
    const response = await POST_REFERENCE(request());
    expect(response.status).toBe(201);
    const body = (await response.json()) as { catalogReferencePhotoId: string };
    const current = await data.catalogReferencePhotos.current(
      HANDLER,
      ID.CATALOG.mobilityScooterSla,
    );
    expect(current?.id).toBe(body.catalogReferencePhotoId);
    expect(current?.isExifStripped).toBe(true);
  });
});
