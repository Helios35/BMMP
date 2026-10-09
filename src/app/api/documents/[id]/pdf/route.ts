import { data } from "@/data";
import { recordDocumentAccess } from "@/features/documents/server/document-events";
import {
  attributionFrom,
  documentProblemFor,
  openDocument,
} from "@/features/documents/server/document-routes";
import type { DocumentRender } from "@/types/documents";

/**
 * `GET /api/documents/[id]/pdf` — the stored bytes, for view, print or
 * reprint (`TECHNICAL_SPEC.md` §7.2, §8.4).
 *
 * **It never re-renders.** There is no code path here, or anywhere, that
 * makes a PDF for an existing render id: this streams what was stored at
 * issue. `readBytes` re-hashes the stored bytes on every read and refuses —
 * `DOCUMENT_INTEGRITY`, alerted — rather than serve a document whose bytes no
 * longer hash to their `content_hash`. The content hash is the `ETag`, so two
 * downloads of one id are byte-identical or the platform says it is broken.
 *
 * **Every stream is recorded before a byte is sent**: `?reprint=1` (Print) is
 * `document.reprinted`; any other read — the viewer's canvas, Download — is
 * `document.viewed`. A route handler rather than a Server Action because the
 * response is not JSON (§7.1).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fileNameOf(render: DocumentRender): string {
  const status = render.status === "issued" ? "" : `${render.status}-`;
  return `${render.documentType}-${status}${render.verificationCode}.pdf`;
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/documents/[id]/pdf">,
): Promise<Response> {
  const { id } = await params;
  const instance = `/api/documents/${id}/pdf`;
  const opened = await openDocument(id, instance);
  if (!opened.ok) return opened.response;
  const { ctx, render } = opened;

  const url = new URL(request.url);
  const reprint = url.searchParams.get("reprint") === "1";
  const download = url.searchParams.get("download") === "1";

  try {
    const stored = await data.documentRenders.readBytes(ctx, render.id);
    await recordDocumentAccess(
      ctx,
      render,
      reprint ? "document.reprinted" : "document.viewed",
      attributionFrom(request),
    );
    return new Response(new Uint8Array(stored.bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(stored.byteSize),
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${fileNameOf(render)}"`,
        etag: `"${stored.contentHash}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return documentProblemFor(error, ctx, instance);
  }
}
