import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CircleAlert } from "lucide-react";

import { FilingPacketSummary } from "@/components/documents/filing-packet-summary";
import { PageHeader, PageSection, PageShell } from "@/components/page";
import { ReadOnlyBanner } from "@/components/access/read-only-banner";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { data } from "@/data";
import { showsReadOnlyBanner } from "@/domain/access/control-treatment";
import {
  FILING_DOCUMENT_REFUSAL,
  FILING_DOCUMENT_RULE,
  mayOpenDocumentType,
} from "@/domain/access/document-access";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { VerifyCodeForm } from "@/features/documents/components/verify-code-form";
import { FILING_CONTENT_HEADING } from "@/features/documents/document-copy";
import { DocumentPanel } from "@/features/documents/document-page";
import { readDocument } from "@/features/documents/server/read-document";
import { Breadcrumbs } from "@/features/shell/chrome/breadcrumbs";
import { breadcrumbTrail } from "@/features/shell/navigation/breadcrumb-ancestors";
import { requireRoute } from "@/lib/auth/guard";
import { recordDocumentDenial, recordNotFound } from "@/lib/auth/record-denial";
import { cn } from "@/lib/utils";

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
 *
 * **A filing packet or an annual report follows `/obligations` access**
 * (Rule 8.22; `SITE_ARCHITECTURE.md` §5.2): P1 and P4 are refused, citing
 * the rule, and the refusal is audited. A packet's content is also shown as
 * text, from the input it was issued with — "a packet is not the filing"
 * and where to send it first (Rule 8.19).
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

  if (!mayOpenDocumentType(ctx.role, render.documentType)) {
    await recordDocumentDenial(
      ctx,
      render.id,
      render.documentType,
      FILING_DOCUMENT_RULE,
    );
    return (
      <PageShell>
        <PageHeader title={APP_ROUTE_NAMES["/documents/[id]"]} />
        <Alert
          role="alert"
          data-document-refused={FILING_DOCUMENT_RULE}
          className={cn(INTENT_SURFACE_CLASSES.critical, "gap-2 px-4 py-4")}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">
            {FILING_DOCUMENT_REFUSAL}
          </AlertTitle>
        </Alert>
      </PageShell>
    );
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
      {view.page.kind === "filing_packet" &&
      view.storedFile.state === "stored" ? (
        <PageSection
          title={FILING_CONTENT_HEADING}
          dataAttributes={{ "data-filing-content": "true" }}
        >
          <FilingPacketSummary content={view.page.content} />
        </PageSection>
      ) : null}
      <DocumentPanel view={view} />
      {view.storedFile.state === "stored" ? (
        <VerifyCodeForm renderId={render.id} statusLabel={view.statusLabel} />
      ) : null}
    </PageShell>
  );
}
