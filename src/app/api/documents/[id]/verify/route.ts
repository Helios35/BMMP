import { data } from "@/data";
import { verificationCodeMatches } from "@/domain/documents/snapshot";
import {
  documentProblemFor,
  openDocument,
} from "@/features/documents/server/document-routes";
import type { DocumentVerificationResponse } from "@/features/documents/verification";

/**
 * `GET /api/documents/[id]/verify` — proof that a copy is the document that
 * was issued (`TECHNICAL_SPEC.md` §7.2, §8.4). **The endpoint an auditor or
 * an underwriter is pointed at**; P5 included.
 *
 * It re-hashes the stored bytes and the stored input snapshot and reports
 * both comparisons beside §8.4's fields. With `?code=` it also answers
 * whether a code typed from a paper copy is this render's — a match needs the
 * code **and** a snapshot that still hashes to it. The render's status is
 * reported beside `supersededByDocumentRenderId`, because a voided paper whose
 * code matches is still a voided paper.
 *
 * Nothing here is written to the audit log: verifying reads no bytes out to
 * the caller, and T-43 has no type for it — a near neighbour would misname
 * the act.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUCCESSOR_LIMIT = 50;

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/documents/[id]/verify">,
): Promise<Response> {
  const { id } = await params;
  const instance = `/api/documents/${id}/verify`;
  const opened = await openDocument(id, instance);
  if (!opened.ok) return opened.response;
  const { ctx, render } = opened;
  const typed = new URL(request.url).searchParams.get("code");

  try {
    const [verification, siblings] = await Promise.all([
      data.documentRenders.verify(ctx, render.id),
      data.documentRenders.list(ctx, {
        documentType: render.documentType,
        ...(render.shipmentId === null
          ? {}
          : { shipmentId: render.shipmentId }),
        ...(render.containerId === null
          ? {}
          : { containerId: render.containerId }),
        limit: SUCCESSOR_LIMIT,
      }),
    ]);
    const successor = siblings.items.find(
      (candidate) => candidate.supersedesDocumentRenderId === render.id,
    );
    const body: DocumentVerificationResponse = {
      id: render.id,
      documentType: render.documentType,
      status: render.status,
      contentHash: render.contentHash,
      byteSize: render.byteSize,
      renderedAt: render.renderedAt,
      inputSnapshotHash: render.inputSnapshotHash,
      verificationCode: render.verificationCode,
      supersededByDocumentRenderId: successor?.id ?? null,
      bytesMatch: verification.bytesMatch,
      inputSnapshotMatches: verification.inputSnapshotMatches,
      codeMatches:
        typed === null
          ? null
          : verification.inputSnapshotMatches &&
            verificationCodeMatches(typed, verification.verificationCode),
      verifiedAt: verification.verifiedAt,
    };
    return Response.json(body, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return documentProblemFor(error, ctx, instance);
  }
}
