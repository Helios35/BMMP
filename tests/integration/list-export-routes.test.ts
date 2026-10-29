import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import * as ID from "@/data/mock/fixtures/ids";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * `GET /api/exports/batteries`, `/shipments` and `/review`, assembled — D-50;
 * `UX_SPEC.md` §3.5, §3.8b, §3.11; Rules 12.17–12.19; `SITE_ARCHITECTURE.md`
 * §5.2.
 *
 * The same four proofs the audit export carries, for every list:
 *
 * 1. **Export is P2's, P5's and P6's** — P1 is refused, and the refusal is
 *    recorded before it is a response (Rules 1.16, 12.6). `/review` is read by
 *    P2 and P6 only, so P5 is refused there (§5.2).
 * 2. **The file is tenant-scoped** by the adapter the screen reads
 *    (Rule 12.17): no other organization's record appears in it.
 * 3. **Every file writes `export.generated`** with who, what and in what scope
 *    (Rule 12.18), and a lapsed grant produces nothing (Rule 12.19).
 * 4. **No score or probability** appears in any file (Rule 1.25).
 *
 * The session and the denial writer need a live request, so they are
 * replaced; everything else is the real handler, feature and adapter.
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
          membership: { grantScope: null },
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

const batteries = await import("@/app/api/exports/batteries/route");
const shipments = await import("@/app/api/exports/shipments/route");
const review = await import("@/app/api/exports/review/route");
const { data } = await import("@/data");
const { resetMockStore } = await import("@/data/mock");

const AS: Readonly<Record<string, { userId: string; role: RoleCode }>> = {
  P1: { userId: ID.USER.danaHandler, role: "compliance_handler" },
  P2: { userId: ID.USER.martaManager, role: "facility_manager" },
  P5: { userId: ID.USER.samAuditor, role: "auditor" },
  P6: { userId: ID.USER.platformAdmin, role: "platform_admin" },
};

function as(persona: keyof typeof AS): RequestContext {
  const who = AS[persona];
  if (who === undefined) throw new Error(`no persona ${String(persona)}`);
  return {
    userId: who.userId,
    organizationId: ID.ORG.cascade,
    role: who.role,
    isPlatformAdmin: persona === "P6",
    correlationId: `test-corr-${String(persona)}`,
  };
}

const ROUTES = {
  batteries: { GET: batteries.GET, path: "batteries" },
  shipments: { GET: shipments.GET, path: "shipments" },
  review: { GET: review.GET, path: "review" },
} as const;

function request(path: string, search = "?format=csv"): Request {
  return new Request(`https://bmmp.test/api/exports/${path}${search}`, {
    headers: { "user-agent": "vitest", "x-request-id": "req-0001" },
  });
}

async function exportsWritten(): Promise<number> {
  const page = await data.auditEvents.list(as("P2"), {
    eventType: "export.generated",
    limit: 100,
  });
  return page.total;
}

beforeEach(() => {
  resetMockStore();
  recordWriteDenial.mockClear();
  sessionState.current = as("P2");
  sessionState.lapsed = false;
});

describe.each(Object.entries(ROUTES))("GET /api/exports/%s", (name, route) => {
  it("refuses P1 and records the attempt (SITE §5.2; Rules 1.16, 12.6)", async () => {
    sessionState.current = as("P1");
    const response = await route.GET(request(route.path));
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(recordWriteDenial).toHaveBeenCalledTimes(1);
  });

  it("refuses a signed-out caller, and a lapsed grant produces nothing (Rule 12.19)", async () => {
    sessionState.current = null;
    expect((await route.GET(request(route.path))).status).toBe(401);
    sessionState.lapsed = true;
    expect((await route.GET(request(route.path))).status).toBe(401);
  });

  it.each(["P2", "P6"] as const)(
    "exports for %s as an uncached CSV download and writes export.generated (Rule 12.18)",
    async (persona) => {
      sessionState.current = as(persona);
      const before = await exportsWritten();
      const response = await route.GET(request(route.path));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-disposition")).toContain(
        "attachment",
      );
      const body = await response.text();
      expect(body).not.toMatch(/probab|likelihood|percent|score|chance/i);
      expect(await exportsWritten()).toBe(before + 1);
      const written = (
        await data.auditEvents.list(as("P2"), {
          eventType: "export.generated",
          limit: 100,
        })
      ).items.find((event) => event.actorUserId === AS[persona]?.userId);
      expect(written?.afterState).toMatchObject({
        export: name,
        format: "csv",
      });
    },
  );

  it("refuses a format it does not produce", async () => {
    const response = await route.GET(request(route.path, "?format=xlsx"));
    expect(response.status).toBe(400);
  });
});

describe("P5 and the grant", () => {
  it("exports /batteries and /shipments for the auditor — never disabled (E-8a)", async () => {
    sessionState.current = as("P5");
    expect((await batteries.GET(request("batteries"))).status).toBe(200);
    expect((await shipments.GET(request("shipments"))).status).toBe(200);
  });

  it("refuses /review for the auditor, who cannot reach it (SITE §5.2; Rule 12.17)", async () => {
    sessionState.current = as("P5");
    const response = await review.GET(request("review"));
    expect(response.status).toBe(403);
    expect(recordWriteDenial).toHaveBeenCalledTimes(1);
  });
});

describe("what the files hold", () => {
  it("/batteries holds exactly this organization's list and no other's (Rule 12.17)", async () => {
    const body = await (await batteries.GET(request("batteries"))).text();
    const own = await data.batteryRecords.list(as("P2"), {
      excludeVoided: true,
      excludeDrafts: true,
      limit: 500,
    });
    const lines = body.split("\r\n").filter((line) => line !== "");
    expect(lines[0]).toContain("Record ID");
    // Header plus one line per record the screen lists — record numbers are
    // per-organization sequences, so the count is the tenancy proof.
    expect(lines.length - 1).toBe(own.total);
  });

  it("/batteries carries every recall association, the recall filter included (Rules 10.16, 10.18)", async () => {
    const body = await (await batteries.GET(request("batteries"))).text();
    expect(body.split("\r\n")[0]).toContain("Recall associations");
    expect(body).toContain("HM-SN-2026-114 (Confirmed match)");
    const recalled = await (
      await batteries.GET(
        request("batteries", "?recall=confirmed_match&format=csv"),
      )
    ).text();
    const rows = recalled.split("\r\n").filter((line) => line !== "");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("BR-0011");
  });

  it("/batteries honours the filters the screen was showing", async () => {
    const all = await (await batteries.GET(request("batteries"))).text();
    const narrowed = await (
      await batteries.GET(request("batteries", "?chemistry=li_lco&format=csv"))
    ).text();
    expect(narrowed.split("\r\n").length).toBeLessThan(
      all.split("\r\n").length,
    );
  });

  it("/review lists the unidentified batteries by container, with the roll-up", async () => {
    const body = await (await review.GET(request("review"))).text();
    expect(body.split("\r\n")[0]).toContain("Unidentified in container");
  });
});
