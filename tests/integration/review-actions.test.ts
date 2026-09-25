import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import * as ID from "@/data/mock/fixtures/ids";

/**
 * `/review` and Flow F, assembled — `UX_SPEC.md` §3.8a, §3.8b, §3.19, E-8b;
 * `SITE_ARCHITECTURE.md` Flow F; Rules 2.22, 2.23, 12.6; D-42, D-45.
 *
 * **The guard here is the real one.** Only the session lookup — which reads a
 * cookie `next/headers` does not have under vitest — is replaced, along with
 * Next's own `redirect`, `revalidatePath` and `headers`. `requireWrite`, the
 * denial writer, every action, the builder, the adapter and its policy matrix
 * are the code that ships, so a Facility Manager's refusal below is the
 * server's refusal and the audit row is the row the server writes.
 *
 * What is proven:
 *
 * - **A P2 confirm or void posted straight to the server is refused**, with
 *   the stated reason naming Rule 2.22, and audited as `denial.recorded`; the
 *   item is untouched (Rules 2.22, 12.6; E-8b).
 * - **P1 resolves a queued item through the intake's one commit**, and it
 *   leaves the queue; a void leaves it too, with the reason (Rule 2.23).
 * - **D-42: no photoless commit**, from either door, manual entry included.
 * - **Flow F closes**: a proposal is audited `catalog_entry.proposed`; P6's
 *   approval publishes it, raises the unmatched record and **changes nothing
 *   on it** — the hand-confirmed chemistry stands until a person confirms the
 *   match, audited `battery_record.confirmed`.
 * - **One derivation**: the count the badge and the card read equals the
 *   list the route renders, for both framings.
 */

const sessionState: { ctx: RequestContext | null } = { ctx: null };

vi.mock("@/lib/auth/session", () => ({
  nowIso: () => new Date().toISOString(),
  publicContext: () => Promise.resolve({ correlationId: "anonymous" }),
  requestPathAndQuery: () => Promise.resolve("/review"),
  requestPathname: () => Promise.resolve("/review"),
  resolveRequestContext: () =>
    Promise.resolve(
      sessionState.ctx === null
        ? { kind: "anonymous", hadSessionCookie: false }
        : {
            kind: "resolved",
            session: {
              ctx: sessionState.ctx,
              identity: {
                userId: sessionState.ctx.userId,
                email: "vitest@example.test",
                fullName: null,
                isPlatformAdmin: sessionState.ctx.isPlatformAdmin,
                memberships: [],
              },
              membership: {
                membershipId: "m-vitest",
                organizationId: sessionState.ctx.organizationId,
                organizationName: "Cascade Auto Recyclers",
                role: sessionState.ctx.role,
                holdsBindingAuthority: false,
                grantExpiresAt: null,
                grantScope: null,
                grantReason: null,
              },
            },
          },
    ),
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
      new Headers({ "user-agent": "vitest", "x-request-id": "req-review" }),
    ),
}));

const intake = await import("@/features/intake/actions");
const review = await import("@/features/review/actions");
const catalogAdmin = await import("@/features/catalog-admin/actions");
const { POST } = await import("@/app/api/intake/photos/route");
const { data } = await import("@/data");
const { mockStore, resetMockStore } = await import("@/data/mock");
const { readReviewQueue, readReviewQueueCount } =
  await import("@/features/review/server/queue");
const { readWorkQueue } = await import("@/features/review/server/work-queue");
const { readUnidentifiedInventory } =
  await import("@/features/review/server/inventory");
const { PHOTO_REQUIRED_ITEM } = await import("@/domain/intake/commit-gate");
const { commitOutstanding } = await import("@/features/intake/copy");

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-corr-review-0001",
    ...overrides,
  };
}

const HANDLER = ctx();
const MANAGER = ctx({
  userId: ID.USER.martaManager,
  role: "facility_manager",
  correlationId: "test-corr-review-p2",
});
const ADMIN = ctx({
  userId: ID.USER.platformAdmin,
  role: "platform_admin",
  isPlatformAdmin: true,
  correlationId: "test-corr-review-p6",
});

const AS_OF = "2026-09-25T12:00:00.000Z";

/** The smallest PNG the dimension reader accepts — signature and IHDR, 640 × 480. */
const PNG_640_480 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x02, 0x80, 0x00, 0x00, 0x01, 0xe0,
]);

function ok<T>(
  result: { ok: true; data: T } | { ok: false; error: { message: string } },
): T {
  if (!result.ok)
    throw new Error(`expected success, got: ${result.error.message}`);
  return result.data;
}

async function upload(sessionId: string, fileName: string): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new File([new Uint8Array(PNG_640_480)], fileName, { type: "image/png" }),
  );
  form.append("intakeSessionId", sessionId);
  form.append("photoType", "label");
  const response = await POST(
    new Request("https://bmmp.test/api/intake/photos", {
      method: "POST",
      body: form,
    }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { intakePhotoId: string }).intakePhotoId;
}

/** A low-confidence read, saved to the queue — an item P1 will work on `/review`. */
async function queueLowRead(): Promise<{
  sessionId: string;
  batteryRecordId: string;
}> {
  sessionState.ctx = HANDLER;
  const started = ok(await intake.startIntakeSession({}));
  const labelPhotoId = await upload(started.sessionId, "label-low.png");
  ok(
    await intake.runLabelExtraction({
      sessionId: started.sessionId,
      labelPhotoId,
      labelFileName: "label-low.png",
    }),
  );
  ok(await intake.saveToReviewQueue({ sessionId: started.sessionId }));
  return started;
}

/** Confirm everything a commit needs on a queued low read, the way the card and the condition form do. */
async function resolveFields(sessionId: string): Promise<void> {
  ok(
    await intake.confirmField({
      sessionId,
      fieldCode: "model",
      value: "NV-TP400-96S",
    }),
  );
  const view = ok(
    await intake.selectCatalogCandidate({
      sessionId,
      catalogEntryId: ID.CATALOG.vehicleTractionNmc,
    }),
  );
  expect(view.draft.chemistrySource).toBe("catalog_match");
  ok(
    await intake.confirmField({
      sessionId,
      fieldCode: "chemistry_code",
      value: null,
    }),
  );
  // The low read's serial number is flagged; a person confirms what they see.
  ok(
    await intake.confirmField({
      sessionId,
      fieldCode: "serial_number",
      value: "NVTP4000000091447",
    }),
  );
  ok(
    await intake.setCondition({
      sessionId,
      findingTypes: ["none_observed"],
      isDefective: false,
    }),
  );
  ok(await intake.confirmCondition({ sessionId }));
}

/** T-43 `alert.resolved` rows for one raise — who resolved it, and why (D-48). */
function resolutionsOf(raiseId: string) {
  return mockStore()
    .auditEvents.all()
    .filter(
      (row) => row.eventType === "alert.resolved" && row.entityId === raiseId,
    )
    .map((row) => ({ reason: row.reason, actorUserId: row.actorUserId }));
}

function denials(correlationId: string) {
  return mockStore()
    .auditEvents.all()
    .filter(
      (row) =>
        row.eventType === "denial.recorded" &&
        row.correlationId === correlationId,
    );
}

beforeEach(() => {
  resetMockStore();
  sessionState.ctx = HANDLER;
});

// --- E-8b: the server refuses P2 independently ------------------------------------------

describe("a Facility Manager posting to /review — refused by the server, and audited (Rule 2.22)", () => {
  it("refuses a confirm with the stated reason naming Rule 2.22, writes the denial, and changes nothing", async () => {
    sessionState.ctx = MANAGER;
    const result = await review.confirmReviewItem({
      sessionId: ID.INTAKE_SESSION.spreadInReview,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
    expect(result.error.message).toContain("Facility Manager");
    expect(result.error.message).toContain("Review queue");
    expect(result.error.message).toContain("Rule 2.22");

    const rows = denials(MANAGER.correlationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorUserId).toBe(ID.USER.martaManager);
    expect(rows[0]?.reason).toBe("write_denied:/review:confirmReviewItem");
    expect(rows[0]?.afterState).toMatchObject({
      route: "/review",
      role: "facility_manager",
      attempted: "confirmReviewItem",
      outcome: "rejected",
    });

    const session = await data.intakeSessions.get(
      HANDLER,
      ID.INTAKE_SESSION.spreadInReview,
    );
    expect(session?.status).toBe("awaiting_confirmation");
    expect(session?.isReviewRequired).toBe(true);
  });

  it("refuses a void the same way — the item stays on the queue", async () => {
    sessionState.ctx = MANAGER;
    const result = await review.voidReviewItem({
      sessionId: ID.INTAKE_SESSION.scuffedInReview,
      reason: "Not mine to void",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.message).toContain("Rule 2.22");
    }
    expect(denials(MANAGER.correlationId)[0]?.reason).toBe(
      "write_denied:/review:voidReviewItem",
    );
    const record = await data.batteryRecords.get(
      HANDLER,
      ID.BATTERY.scuffedNoMatch,
    );
    expect(record?.status).toBe("pending_review");
  });

  it("refuses a re-match confirmation and a decline too", async () => {
    sessionState.ctx = MANAGER;
    const confirm = await review.confirmRematch({
      raiseId: ID.ALERT.reviewQueue,
    });
    const decline = await review.declineRematch({
      raiseId: ID.ALERT.reviewQueue,
      reason: "No",
    });
    expect(confirm.ok).toBe(false);
    expect(decline.ok).toBe(false);
    expect(denials(MANAGER.correlationId).map((row) => row.reason)).toEqual([
      "write_denied:/review:confirmRematch",
      "write_denied:/review:declineRematch",
    ]);
  });

  it("refuses an auditor, who holds nothing on /review at all", async () => {
    sessionState.ctx = ctx({
      userId: ID.USER.samAuditor,
      role: "auditor",
      correlationId: "test-corr-review-p5",
    });
    const result = await review.confirmReviewItem({
      sessionId: ID.INTAKE_SESSION.spreadInReview,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(denials("test-corr-review-p5")).toHaveLength(1);
  });
});

// --- §3.8a: P1 works an item through the intake's one commit ----------------------------

describe("P1 resolves a queued item on /review (§3.8a, Rule 2.23)", () => {
  it("commits through the intake's commit, and the item leaves the queue", async () => {
    const { sessionId, batteryRecordId } = await queueLowRead();
    const before = await readReviewQueueCount(HANDLER);

    await resolveFields(sessionId);
    const resolved = ok(await review.confirmReviewItem({ sessionId }));

    expect(resolved.batteryRecordId).toBe(batteryRecordId);
    const record = await data.batteryRecords.get(HANDLER, batteryRecordId);
    expect(record?.status).toBe("classified");
    expect(record?.catalogEntryId).toBe(ID.CATALOG.vehicleTractionNmc);
    expect(record?.chemistryConfirmedBy).toBe(ID.USER.danaHandler);
    expect((await data.intakeSessions.get(HANDLER, sessionId))?.status).toBe(
      "completed",
    );
    expect(await readReviewQueueCount(HANDLER)).toBe((before ?? 0) - 1);

    // The commit wrote the same rows the intake route writes, under the
    // session's thread (§11.1 step 6.8).
    const confirmed = mockStore()
      .auditEvents.all()
      .filter(
        (row) =>
          row.entityId === batteryRecordId &&
          row.eventType === "battery_record.confirmed",
      );
    expect(confirmed).toHaveLength(1);
  });

  it("refuses to commit while a hard-gated field waits on a person — the item stays", async () => {
    const { sessionId } = await queueLowRead();
    const refused = await review.confirmReviewItem({ sessionId });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("VALIDATION");
    const membership = await readReviewQueue(HANDLER);
    expect(membership.sessions.map((session) => session.id)).toContain(
      sessionId,
    );
  });

  it("voids with a stated reason — the record is retained as voided and the item leaves", async () => {
    const { sessionId, batteryRecordId } = await queueLowRead();
    const voided = ok(
      await review.voidReviewItem({
        sessionId,
        reason: "Logged twice — duplicate of BR-0001",
      }),
    );
    expect(voided.batteryRecordId).toBe(batteryRecordId);
    expect(
      (await data.batteryRecords.get(HANDLER, batteryRecordId))?.status,
    ).toBe("voided");
    const row = mockStore()
      .auditEvents.all()
      .find(
        (event) =>
          event.entityId === batteryRecordId &&
          event.eventType === "battery_record.status_changed",
      );
    expect(row?.reason).toBe("Logged twice — duplicate of BR-0001");
    expect(
      (await readReviewQueue(HANDLER)).sessions.some(
        (session) => session.id === sessionId,
      ),
    ).toBe(false);
  });

  it("refuses a void with no reason — the second way out needs one", async () => {
    const { sessionId } = await queueLowRead();
    const refused = await review.voidReviewItem({ sessionId, reason: "   " });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("VALIDATION");
  });
});

// --- D-42 ----------------------------------------------------------------------------

describe("D-42 — no battery record commits without a stored photo", () => {
  async function photolessManualIntake(): Promise<string> {
    sessionState.ctx = HANDLER;
    const { sessionId } = ok(await intake.startIntakeSession({}));
    ok(await intake.enterDetailsManually({ sessionId }));
    ok(
      await intake.enterFieldValue({
        sessionId,
        fieldCode: "manufacturer",
        value: "Kestrel Power",
      }),
    );
    ok(
      await intake.confirmField({
        sessionId,
        fieldCode: "manufacturer",
        value: null,
      }),
    );
    ok(
      await intake.enterFieldValue({
        sessionId,
        fieldCode: "model",
        value: "KP-48V30-LFP",
      }),
    );
    ok(
      await intake.confirmField({ sessionId, fieldCode: "model", value: null }),
    );
    ok(await intake.enterChemistry({ sessionId, chemistry: "li_lfp" }));
    ok(
      await intake.confirmField({
        sessionId,
        fieldCode: "chemistry_code",
        value: null,
      }),
    );
    ok(
      await intake.setCondition({
        sessionId,
        findingTypes: ["none_observed"],
        isDefective: false,
      }),
    );
    ok(await intake.confirmCondition({ sessionId }));
    // Everything else the label would have carried is left empty by the
    // person, explicitly (§2.1.5), so the photo is the only thing outstanding.
    for (const fieldCode of [
      "voltage",
      "capacity_ah",
      "energy_wh",
      "date_code",
      "serial_number",
      "certification_marks",
      "transport_test_marking",
    ] as const) {
      ok(await intake.rejectField({ sessionId, fieldCode }));
    }
    return sessionId;
  }

  /** The refusal names the photo and nothing else — D-42 is the only thing in the way. */
  const PHOTO_ONLY = commitOutstanding([PHOTO_REQUIRED_ITEM]);

  it("refuses the manual path's commit on /batteries/new, and says why", async () => {
    const sessionId = await photolessManualIntake();
    const refused = await intake.confirmIntake({ sessionId });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("VALIDATION");
    expect(refused.error.message).toBe(PHOTO_ONLY);
    expect(
      (await data.intakeSessions.get(HANDLER, sessionId))?.status,
    ).not.toBe("completed");
  });

  it("refuses the same commit from /review", async () => {
    const sessionId = await photolessManualIntake();
    const refused = await review.confirmReviewItem({ sessionId });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.message).toBe(PHOTO_ONLY);
  });

  it("commits once a photo is stored — the manual path is an alternative to extraction, not to photography (E-4)", async () => {
    const sessionId = await photolessManualIntake();
    await upload(sessionId, "whole-pack.png");
    await expect(intake.confirmIntake({ sessionId })).rejects.toThrow(
      RedirectSignal,
    );
    expect((await data.intakeSessions.get(HANDLER, sessionId))?.status).toBe(
      "completed",
    );
  });
});

// --- Flow F ---------------------------------------------------------------------------

describe("Flow F — a catalog miss, closed", () => {
  /** P1 logs a pack no entry describes, enters the chemistry by hand, proposes it, and commits unmatched (E-5). */
  async function logUnmatchedAndPropose(): Promise<{
    sessionId: string;
    batteryRecordId: string;
    catalogEntryId: string;
  }> {
    sessionState.ctx = HANDLER;
    const { sessionId, batteryRecordId } = ok(
      await intake.startIntakeSession({}),
    );
    const labelPhotoId = await upload(sessionId, "label-nomatch.png");
    ok(
      await intake.runLabelExtraction({
        sessionId,
        labelPhotoId,
        labelFileName: "label-nomatch.png",
      }),
    );
    ok(
      await intake.selectCatalogCandidate({ sessionId, catalogEntryId: null }),
    );
    ok(await intake.enterChemistry({ sessionId, chemistry: "li_lfp" }));
    ok(
      await intake.confirmField({
        sessionId,
        fieldCode: "chemistry_code",
        value: null,
      }),
    );
    ok(
      await intake.confirmField({ sessionId, fieldCode: "model", value: null }),
    );
    ok(
      await intake.confirmField({
        sessionId,
        fieldCode: "manufacturer",
        value: null,
      }),
    );
    const { catalogEntryId } = ok(
      await intake.proposeCatalogEntry({
        sessionId,
        manufacturerName: "Kestrel Power",
        modelName: "KP-48V30-LFP",
        partNumber: null,
        chemistry: "li_lfp",
        applicationClass: "small_mobility",
      }),
    );
    ok(
      await intake.setCondition({
        sessionId,
        findingTypes: ["none_observed"],
        isDefective: false,
      }),
    );
    ok(await intake.confirmCondition({ sessionId }));
    await expect(intake.confirmIntake({ sessionId })).rejects.toThrow(
      RedirectSignal,
    );
    return { sessionId, batteryRecordId, catalogEntryId };
  }

  it("audits the proposal as catalog_entry.proposed and links it to the intake it came from (D-45)", async () => {
    const { sessionId, catalogEntryId } = await logUnmatchedAndPropose();
    const entry = await data.catalogEntries.get(HANDLER, catalogEntryId);
    expect(entry?.status).toBe("proposed");
    expect(entry?.proposedFromIntakeSessionId).toBe(sessionId);
    const rows = mockStore()
      .auditEvents.all()
      .filter((row) => row.entityId === catalogEntryId);
    expect(rows.map((row) => row.eventType)).toEqual([
      "catalog_entry.proposed",
    ]);
    expect(rows[0]?.actorUserId).toBe(ID.USER.danaHandler);
  });

  it("approval publishes the entry and raises the record — and changes nothing on it without a person", async () => {
    const { batteryRecordId, catalogEntryId } = await logUnmatchedAndPropose();
    const before = await data.batteryRecords.get(HANDLER, batteryRecordId);
    expect(before?.chemistrySource).toBe("human_entry");
    expect(before?.catalogEntryId).toBeNull();

    sessionState.ctx = ADMIN;
    const approved = ok(
      await catalogAdmin.approveCatalogProposal({
        catalogEntryId,
        reason: "Matches the manufacturer datasheet",
      }),
    );
    expect(approved.raisedRecordIds).toEqual([batteryRecordId]);

    const entry = await data.catalogEntries.get(ADMIN, catalogEntryId);
    expect(entry?.status).toBe("published");
    expect(entry?.verifiedBy).toBe(ID.USER.platformAdmin);

    // Flow F step 4, EC-13 — the hand-confirmed chemistry stands, attributed
    // to the person who confirmed it, until a person confirms the match.
    const after = await data.batteryRecords.get(HANDLER, batteryRecordId);
    expect(after?.chemistry).toBe(before?.chemistry);
    expect(after?.chemistrySource).toBe("human_entry");
    expect(after?.chemistryConfirmedBy).toBe(ID.USER.danaHandler);
    expect(after?.chemistryConfirmedAt).toBe(before?.chemistryConfirmedAt);
    expect(after?.catalogEntryId).toBeNull();
    expect(after?.status).toBe(before?.status);
    expect(
      mockStore()
        .auditEvents.all()
        .filter(
          (row) =>
            row.entityId === batteryRecordId &&
            row.eventType === "battery_record.confirmed" &&
            row.occurredAt > (before?.updatedAt ?? ""),
        ),
    ).toHaveLength(0);

    const status = mockStore()
      .auditEvents.all()
      .find(
        (row) =>
          row.entityId === catalogEntryId &&
          row.eventType === "catalog_entry.status_changed",
      );
    expect(status?.reason).toBe("Matches the manufacturer datasheet");
    expect(status?.afterState).toMatchObject({
      status: "published",
      raisedRecordIds: [batteryRecordId],
    });

    // It is on P1's queue; it is not on P2's, whose question is identity.
    sessionState.ctx = HANDLER;
    const membership = await readReviewQueue(HANDLER);
    expect(membership.rematches.map((raise) => raise.batteryRecordId)).toEqual([
      batteryRecordId,
    ]);
    expect(await readReviewQueueCount(HANDLER)).toBe(
      membership.sessions.length + 1,
    );
    expect(await readReviewQueueCount(MANAGER)).toBe(
      membership.sessions.length,
    );
  });

  it("a person confirms the match — audited battery_record.confirmed — and the raise leaves the queue", async () => {
    const { batteryRecordId, catalogEntryId } = await logUnmatchedAndPropose();
    sessionState.ctx = ADMIN;
    ok(
      await catalogAdmin.approveCatalogProposal({
        catalogEntryId,
        reason: "Datasheet checked",
      }),
    );

    sessionState.ctx = HANDLER;
    const [raise] = (await readReviewQueue(HANDLER)).rematches;
    if (raise === undefined) throw new Error("expected a raise");
    ok(await review.confirmRematch({ raiseId: raise.id }));

    const record = await data.batteryRecords.get(HANDLER, batteryRecordId);
    expect(record?.catalogEntryId).toBe(catalogEntryId);
    expect(record?.chemistrySource).toBe("catalog_match");
    expect(record?.chemistryConfirmedBy).toBe(ID.USER.danaHandler);
    const confirmed = mockStore()
      .auditEvents.all()
      .filter(
        (row) =>
          row.entityId === batteryRecordId &&
          row.eventType === "battery_record.confirmed" &&
          row.reason === "catalog_rematch",
      );
    expect(confirmed).toHaveLength(1);
    // D-48 — the raise's own resolution is a row too, beside the record's.
    expect(resolutionsOf(raise.id)).toEqual([
      { reason: "rematch_confirmed", actorUserId: ID.USER.danaHandler },
    ]);
    expect((await readReviewQueue(HANDLER)).rematches).toHaveLength(0);
  });

  it("a person keeps the identification with a reason — the record is untouched and the raise resolves", async () => {
    const { batteryRecordId, catalogEntryId } = await logUnmatchedAndPropose();
    sessionState.ctx = ADMIN;
    ok(
      await catalogAdmin.approveCatalogProposal({
        catalogEntryId,
        reason: "Datasheet checked",
      }),
    );
    sessionState.ctx = HANDLER;
    const [raise] = (await readReviewQueue(HANDLER)).rematches;
    if (raise === undefined) throw new Error("expected a raise");

    const refused = await review.declineRematch({
      raiseId: raise.id,
      reason: "",
    });
    expect(refused.ok).toBe(false);
    expect(resolutionsOf(raise.id)).toEqual([]);

    ok(
      await review.declineRematch({
        raiseId: raise.id,
        reason: "Same model string, different cell supplier",
      }),
    );
    const record = await data.batteryRecords.get(HANDLER, batteryRecordId);
    expect(record?.catalogEntryId).toBeNull();
    expect(record?.chemistrySource).toBe("human_entry");
    const resolved = await data.alerts.get(HANDLER, raise.id);
    expect(resolved?.resolutionReason).toBe(
      "Same model string, different cell supplier",
    );
    // D-48 — keeping the identification is audited, never silent (Rule 12.1).
    expect(resolutionsOf(raise.id)).toEqual([
      {
        reason: "Same model string, different cell supplier",
        actorUserId: ID.USER.danaHandler,
      },
    ]);
    expect((await readReviewQueue(HANDLER)).rematches).toHaveLength(0);
  });

  it("rejection is terminal, audited with its reason, and raises nothing", async () => {
    const { catalogEntryId } = await logUnmatchedAndPropose();
    sessionState.ctx = ADMIN;
    ok(
      await catalogAdmin.rejectCatalogProposal({
        catalogEntryId,
        reason: "Duplicate of an entry already in review",
      }),
    );
    expect((await data.catalogEntries.get(ADMIN, catalogEntryId))?.status).toBe(
      "rejected",
    );
    expect((await readReviewQueue(ADMIN)).rematches).toHaveLength(0);

    const again = await catalogAdmin.approveCatalogProposal({
      catalogEntryId,
      reason: "Changed my mind",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("CONFLICT");
  });

  it("refuses a decision without a reason, and from anyone but P6", async () => {
    const { catalogEntryId } = await logUnmatchedAndPropose();
    sessionState.ctx = ADMIN;
    const unreasoned = await catalogAdmin.approveCatalogProposal({
      catalogEntryId,
      reason: " ",
    });
    expect(unreasoned.ok).toBe(false);
    if (!unreasoned.ok) expect(unreasoned.error.code).toBe("VALIDATION");

    sessionState.ctx = HANDLER;
    const handler = await catalogAdmin.approveCatalogProposal({
      catalogEntryId,
      reason: "I think it's fine",
    });
    expect(handler.ok).toBe(false);
    if (!handler.ok) expect(handler.error.code).toBe("FORBIDDEN");
    expect(denials(HANDLER.correlationId).at(-1)?.reason).toBe(
      "write_denied:/settings/catalog:approveCatalogProposal",
    );
  });
});

// --- one derivation ------------------------------------------------------------------

describe("one queue count, one derivation (§3.8a, §4.2, §3.4)", () => {
  it("the count the badge and the card read is the list the route renders — for P1", async () => {
    await queueLowRead();
    const count = await readReviewQueueCount(HANDLER);
    const entries = await readWorkQueue(HANDLER, AS_OF);
    expect(count).toBe(entries.length);
    expect(count).toBeGreaterThan(0);
  });

  it("and for P2, whose view lists the unidentified items", async () => {
    await queueLowRead();
    const count = await readReviewQueueCount(MANAGER);
    const inventory = await readUnidentifiedInventory(MANAGER, AS_OF, {});
    expect(count).toBe(inventory.total);
    expect(
      inventory.groups.reduce((sum, group) => sum + group.rows.length, 0),
    ).toBe(inventory.total);
  });

  it("tells a role that holds nothing on /review nothing at all", async () => {
    expect(
      await readReviewQueueCount(ctx({ role: "producer_compliance_officer" })),
    ).toBeNull();
  });
});
