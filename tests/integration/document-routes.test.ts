import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import * as ID from "@/data/mock/fixtures/ids";

/**
 * `GET /api/documents/[id]/pdf` and `GET /api/documents/[id]/verify`,
 * assembled — `TECHNICAL_SPEC.md` §7.2, §8.4.
 *
 * What is being proven, each a rule rather than a nicety:
 *
 * 1. **A reprint streams the stored bytes** — byte for byte what was issued,
 *    with the content hash as the `ETag` — and **a tampered byte is refused**
 *    as `DOCUMENT_INTEGRITY`, never served.
 * 2. **Every stream is audited before a byte is sent**: `?reprint=1` is
 *    `document.reprinted`, any other read `document.viewed`.
 * 3. **`/verify` answers the proof fields**, and a typed code matches only
 *    when it is the render's.
 * 4. **Access is the document page's** — P5 included, another tenant's id is
 *    not found.
 *
 * The session and the not-found recorder need a live request — `next/headers`
 * has none here — so they are replaced. Everything else is the real handler,
 * the real features and the real adapter.
 */

const sessionState: { current: RequestContext | null } = { current: null };

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    resolveRequestContext: () =>
      Promise.resolve(
        sessionState.current === null
          ? { kind: "anonymous", hadSessionCookie: false }
          : {
              kind: "resolved",
              session: {
                ctx: sessionState.current,
                identity: {},
                membership: {},
              },
            },
      ),
  };
});

const recordNotFound = vi.fn(() => Promise.resolve());
vi.mock("@/lib/auth/record-denial", () => ({
  recordWriteDenial: () => Promise.resolve(),
  recordRouteDenial: () => Promise.resolve(),
  recordNotFound: (...args: readonly unknown[]) =>
    recordNotFound(...(args as [])),
}));

const { GET: getPdf } = await import("@/app/api/documents/[id]/pdf/route");
const { GET: getVerify } =
  await import("@/app/api/documents/[id]/verify/route");
const { mockStore, resetMockStore } = await import("@/data/mock");
const { generateContainerLabel } =
  await import("@/features/containers/server/label");
const support = await import("./document-support");
const { AT, HANDLER, LATER, NO_ATTRIBUTION, auditRows, ctx, storedBytes } =
  support;

function pdfRequest(id: string, search = ""): Promise<Response> {
  return getPdf(
    new Request(`https://bmmp.test/api/documents/${id}/pdf${search}`, {
      headers: { "user-agent": "vitest" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

function verifyRequest(id: string, search = ""): Promise<Response> {
  return getVerify(
    new Request(`https://bmmp.test/api/documents/${id}/verify${search}`),
    { params: Promise.resolve({ id }) },
  );
}

async function issuedLabel() {
  const container = await support.newContainerHolding(
    [ID.BATTERY.vehicleTraction],
    "Route bay",
  );
  return generateContainerLabel(HANDLER, container.id, AT, NO_ATTRIBUTION);
}

beforeEach(() => {
  resetMockStore();
  recordNotFound.mockClear();
  sessionState.current = HANDLER;
});

describe("GET /api/documents/[id]/pdf", () => {
  it("streams the stored bytes, byte for byte, with the content hash as the ETag — twice the same", async () => {
    const { documentRender } = await issuedLabel();
    const stored = storedBytes(documentRender.storageObjectPath);

    const first = await pdfRequest(documentRender.id, "?download=1");
    const second = await pdfRequest(documentRender.id, "?download=1");
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("application/pdf");
    expect(first.headers.get("etag")).toBe(`"${documentRender.contentHash}"`);
    expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(first.headers.get("content-disposition")).toBe(
      `attachment; filename="container_label-${documentRender.verificationCode}.pdf"`,
    );
    const a = new Uint8Array(await first.arrayBuffer());
    const b = new Uint8Array(await second.arrayBuffer());
    expect(Buffer.from(a).equals(Buffer.from(stored))).toBe(true);
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
    expect(auditRows("document.viewed", documentRender.id)).toHaveLength(2);
  });

  it("records a print as document.reprinted, and serves it inline", async () => {
    const { documentRender } = await issuedLabel();
    const response = await pdfRequest(documentRender.id, "?reprint=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
    const [reprint] = auditRows("document.reprinted", documentRender.id);
    expect(reprint).toMatchObject({
      actorUserId: ID.USER.danaHandler,
      entityTable: "document_render",
      userAgent: "vitest",
    });
    expect(reprint?.afterState).toMatchObject({
      contentHash: documentRender.contentHash,
    });
  });

  it("refuses a tampered byte with DOCUMENT_INTEGRITY, serving nothing and recording no read", async () => {
    const { documentRender } = await issuedLabel();
    const stored = mockStore().objects.get(
      `documents:${documentRender.storageObjectPath}`,
    );
    if (stored === undefined) throw new Error("no stored bytes");
    stored.bytes[100] = (stored.bytes[100] ?? 0) ^ 0x01;

    const response = await pdfRequest(documentRender.id);
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    const problem = (await response.json()) as Record<string, unknown>;
    expect(problem).toMatchObject({
      code: "DOCUMENT_INTEGRITY",
      detail:
        "This document failed its integrity check and will not be served.",
    });
    expect(auditRows("document.viewed", documentRender.id)).toHaveLength(0);
  });

  it("says a render with no stored file has none — the fixtures that predate generation", async () => {
    const response = await pdfRequest(ID.DOCUMENT_RENDER.soundDrumLabel);
    expect(response.status).toBe(404);
    const problem = (await response.json()) as Record<string, unknown>;
    expect(problem.detail).toContain("stored file");
  });

  it("serves the auditor (Rule 5.27), refuses no session, and treats another tenant's id as absent", async () => {
    const { documentRender } = await issuedLabel();
    sessionState.current = ctx({ userId: ID.USER.samAuditor, role: "auditor" });
    expect((await pdfRequest(documentRender.id)).status).toBe(200);

    sessionState.current = null;
    expect((await pdfRequest(documentRender.id)).status).toBe(401);

    sessionState.current = ctx({
      userId: ID.USER.joRainierHandler,
      organizationId: ID.ORG.rainier,
    });
    expect((await pdfRequest(documentRender.id)).status).toBe(404);
    expect(recordNotFound).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/documents/[id]/verify", () => {
  it("returns §8.4's proof fields for an issued render, both comparisons true", async () => {
    const { documentRender } = await issuedLabel();
    const response = await verifyRequest(documentRender.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: documentRender.id,
      status: "issued",
      contentHash: documentRender.contentHash,
      byteSize: documentRender.byteSize,
      renderedAt: AT,
      inputSnapshotHash: documentRender.inputSnapshotHash,
      verificationCode: documentRender.verificationCode,
      supersededByDocumentRenderId: null,
      bytesMatch: true,
      inputSnapshotMatches: true,
      codeMatches: null,
    });
  });

  it("matches the footer code as printed, and no other — one changed character is no match", async () => {
    const { documentRender } = await issuedLabel();
    const code = documentRender.verificationCode;
    const typed = ` ${code.slice(0, 4).toUpperCase()} ${code.slice(4)} `;
    const match = (await (
      await verifyRequest(
        documentRender.id,
        `?code=${encodeURIComponent(typed)}`,
      )
    ).json()) as Record<string, unknown>;
    expect(match.codeMatches).toBe(true);

    const last = code.at(-1) === "0" ? "1" : "0";
    const wrong = `${code.slice(0, -1)}${last}`;
    const noMatch = (await (
      await verifyRequest(documentRender.id, `?code=${wrong}`)
    ).json()) as Record<string, unknown>;
    expect(noMatch.codeMatches).toBe(false);
  });

  it("says when a render has been superseded, and by which", async () => {
    const first = await issuedLabel();
    const second = await generateContainerLabel(
      HANDLER,
      first.container.id,
      LATER,
      NO_ATTRIBUTION,
    );
    const body = (await (
      await verifyRequest(first.documentRender.id)
    ).json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "superseded",
      supersededByDocumentRenderId: second.documentRender.id,
      bytesMatch: true,
    });
  });
});
