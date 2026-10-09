import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/page";
import { ReadOnlyBanner } from "@/components/access/read-only-banner";
import { data } from "@/data";
import { showsReadOnlyBanner } from "@/domain/access/control-treatment";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { VerifyCodeForm } from "@/features/documents/components/verify-code-form";
import { DocumentPanel } from "@/features/documents/document-page";
import { readDocument } from "@/features/documents/server/read-document";
import { Breadcrumbs } from "@/features/shell/chrome/breadcrumbs";
import { breadcrumbTrail } from "@/features/shell/navigation/breadcrumb-ancestors";
import { requireRoute } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";

/**
 * `/documents/[id]` — `UX_SPEC.md` §3.14.
 *
 * View, print or download any generated document in a print-accurate layout.
 * **All six roles, P5 included; Print and Download are never disabled** for a
 * role that can reach the route (Rule 5.27). Authenticated only — there is no
 * public document URL in B1a (`SITE_ARCHITECTURE.md` §5.6).
 *
 * **Every render is immutable** (Rule 5.12): nothing here edits one, and
 * **nothing here renders one** — the canvas is the stored PDF, streamed from
 * `GET /api/documents/[id]/pdf` and drawn as it was issued. A render that is
 * superseded or voided is marked over its own pages, and the marking prints.
 * A paper copy's footer code can be checked against the render here
 * (`TECHNICAL_SPEC.md` §8.4). A fixture render with no stored file shows the
 * page composed from its rows, and says so.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/documents/[id]"],
};

export default async function DocumentPage({
  params,
}: PageProps<"/documents/[id]">) {
  const { ctx } = await requireRoute("/documents/[id]");
  const { id } = await params;

  const render = await data.documentRenders.get(ctx, id);
  if (render === null) {
    // Absent and another tenant's read the same, and the attempt is recorded
    // (Rules 1.2, 1.16).
    await recordNotFound(ctx, "document_render", id);
    notFound();
  }

  const view = await readDocument(ctx, render);

  return (
    <PageShell>
      <PageHeader
        title={view.typeLabel}
        breadcrumbs={
          <Breadcrumbs
            crumbs={breadcrumbTrail(
              "/documents/[id]",
              ctx.role,
              view.typeLabel,
            )}
          />
        }
        subtitle={view.source.label}
        notice={
          showsReadOnlyBanner({
            role: ctx.role,
            // Print and Download are the route's controls, and neither is
            // mutating — but the banner states the auditor's posture on every
            // evidence screen she reads (E-8a lists this route).
            routeHasMutatingControls: true,
          }) ? (
            <ReadOnlyBanner />
          ) : undefined
        }
      />
      <DocumentPanel view={view} />
      {view.storedFile.state === "stored" ? (
        <VerifyCodeForm renderId={render.id} statusLabel={view.statusLabel} />
      ) : null}
    </PageShell>
  );
}
