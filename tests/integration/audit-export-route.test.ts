import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import * as ID from "@/data/mock/fixtures/ids";

/**
 * `GET /api/exports/audit`, assembled — `TECHNICAL_SPEC.md` §7.2,
 * `UX_SPEC.md` §3.20, Rules 12.17–12.19.
 *
 * Four things are being proven, and each of them is a rule rather than a nicety:
 *
 * 1. **The export is scoped by the same adapter the screen reads**, so a
 *    hand-written filter cannot reach another tenant's rows (Rule 12.17).
 * 2. **The export is itself an audited act** (Rule 12.18) — and the row lands
 *    through the `security definer` door, because `audit_event` INSERT belongs to
 *    no tenant role.
 * 3. **A refused export is recorded before it is refused** (Rules 1.16, 12.6).
 * 4. **P5 is not refused** (E-8a, Rule 5.27).
 *
 * The session and the denial writer are the two things that need a live request
 * — `next/headers` has none here — so they are replaced. Everything else is the
 * real handler, the real feature modules and the real adapter.
 */

const sessionState: { current: RequestContext | null; lapsed: boolean } = {
  current: null,
  lapsed: false,
};

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    resolveRequestContext: () => {
      if (sessionState.lapsed) return Promise.resolve({ kind: "lapsed" });
      if (sessionState.current === null) {
        return Promise.resolve({ kind: "anonymous", hadSessionCookie: false });
      }
      return Promise.resolve({
        kind: "resolved",
        session: {
          ctx: sessionState.current,
          identity: {},
          membership: {},
        },
      });
    },
  };
});

const recordWriteDenial = vi.fn(() => Promise.resolve());
vi.mock("@/lib/auth/record-denial", () => ({
  recordWriteDenial: (...args: readonly unknown[]) =>
    recordWriteDenial(...(args as [])),
  recordRouteDenial: () => Promise.resolve(),
  recordNotFound: () => Promise.resolve(),
}));

const { GET } = await import("@/app/api/exports/audit/route");
const { data } = await import("@/data");
const { resetMockStore } = await import("@/data/mock");

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.martaManager,
    organizationId: ID.ORG.cascade,
    role: "facility_manager",
    isPlatformAdmin: false,
    correlationId: "test-corr-export",
    ...overrides,
  };
}

function request(search = "?format=csv"): Request {
  return new Request(`https://bmmp.test/api/exports/audit${search}`, {
    headers: { "user-agent": "vitest", "x-request-id": "req-0001" },
  });
}

async function auditEventsFor(caller: RequestContext) {
  return data.auditEvents.list(caller, { limit: 100 });
}

beforeEach(() => {
  resetMockStore();
  recordWriteDenial.mockClear();
  sessionState.current = ctx();
  sessionState.lapsed = false;
});

describe("who may take a copy", () => {
  it("refuses a signed-out caller without disclosing anything", async () => {
    sessionState.current = null;
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    // §10.3 rule 2 — no correlation id on a 4xx; there is nothing to look up.
    expect(await response.text()).not.toContain("correlationId");
  });

  it("refuses a caller whose access has ended", async () => {
    // Rule 1.28 ends access inside an open session; Rule 12.19 ends the ability
    // to produce another export with it.
    sessionState.lapsed = true;
    expect((await GET(request())).status).toBe(401);
  });

  it("refuses P1 and records the attempt", async () => {
    // Rule 12.8 — P1 cannot read the audit log, so P1 cannot export it. The
    // refusal is a row before it is a response (Rules 1.16, 12.6).
    sessionState.current = ctx({
      userId: ID.USER.danaHandler,
      role: "compliance_handler",
    });
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(recordWriteDenial).toHaveBeenCalledWith(
      expect.anything(),
      "/audit",
      "export.audit",
    );
  });

  it("does not refuse the auditor", async () => {
    // E-8a and Rule 5.27 — export is never disabled for P5, and the endpoint
    // behind the control has to agree with the control.
    sessionState.current = ctx({ userId: ID.USER.samAuditor, role: "auditor" });
    const response = await GET(request());
    expect(response.status).toBe(200);
  });
});

describe("the file", () => {
  it("is CSV, is not cached, and is offered as a download", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });

  it("carries the organization's rows and no other tenant's", async () => {
    // Rule 12.17 — scope is enforced on the export, not on the screen that
    // requested it.
    const body = await (await GET(request())).text();
    expect(body).toContain("storage-clock-alerts");
    expect(body).not.toContain(ID.ORG.rainier);
  });

  it("honours the filters the screen was showing", async () => {
    const body = await (
      await GET(request("?actionCode=document_render.issued&format=csv"))
    ).text();
    expect(body).toContain("Document issued");
    expect(body).not.toContain("Identification confirmed");
  });

  it("refuses a format it does not produce, rather than guessing", async () => {
    const response = await GET(request("?format=pdf"));
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
  });
});

describe("the export is itself an audited act", () => {
  it("writes export.generated with who, what, when and in what scope", async () => {
    // Rule 12.18. The row goes through the `security definer` door, because
    // `audit_event` INSERT belongs to no tenant role (Rules 12.3, 12.4).
    const before = await auditEventsFor(ctx());
    await GET(request("?actionCode=document_render.issued&format=csv"));
    const after = await auditEventsFor(ctx());

    expect(after.total).toBe(before.total + 1);

    const written = after.items.find(
      (event) => event.eventType === "export.generated",
    );
    expect(written).toBeDefined();
    expect(written?.actorUserId).toBe(ID.USER.martaManager);
    expect(written?.actorType).toBe("user");
    expect(written?.afterState).toMatchObject({
      export: "audit",
      format: "csv",
      scope: { type: "document_render.issued" },
    });
  });

  it("marks a platform admin's export as a platform action", async () => {
    // Rule 12.7 — a support grant that is invisible in the log is not a recorded
    // support grant, and taking a copy of the log is exactly the act that has to
    // be visible.
    sessionState.current = ctx({
      userId: ID.USER.platformAdmin,
      isPlatformAdmin: true,
    });
    await GET(request());

    const events = await auditEventsFor(ctx());
    const written = events.items.find(
      (event) => event.eventType === "export.generated",
    );
    expect(written?.actorType).toBe("platform_admin");
  });
});
