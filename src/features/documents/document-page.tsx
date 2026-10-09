import Link from "next/link";
import type { ReactElement } from "react";

import { ContainerLabelDocument } from "@/components/documents/container-label-document";
import { ShippingPaperDocument } from "@/components/documents/shipping-paper-document";
import {
  DocumentStatusMarking,
  DocumentStatusStamp,
} from "@/components/documents/document-viewer";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { snapshotEntries } from "@/features/battery-record/json-text";
import { issuedPaperProps } from "@/features/shipments/paper-view";
import { PAPER_GAP } from "@/features/shipments/shipment-copy";
import { cn } from "@/lib/utils";

import { RenderViewer } from "./components/render-viewer";
import {
  DRAFT_RENDER_DETAIL,
  INTEGRITY_FAILED_BODY,
  INTEGRITY_FAILED_TITLE,
  NO_STORED_FILE,
  OPEN_SOURCE_RECORD,
  VOIDED_DETAIL_ELSEWHERE,
  voidedDetail,
} from "./document-copy";
import type { DocumentView } from "./server/read-document";

/**
 * One render, as every surface shows it — `/documents/[id]`, the Label tab
 * and the shipment's Paper tab (`UX_SPEC.md` §2.8, §3.14).
 *
 * **A render with stored bytes shows the issued PDF itself.** A voided or
 * superseded one carries its marking above the pages and its stamp over
 * every page, and both print — the reason and the actor of a void are on
 * the marking for a role that reads the audit log (Rules 5.13–5.15). **A
 * render whose bytes fail their integrity check is not shown at all**, and
 * the record it belongs to stays one click away. A render with no stored
 * file — the fixtures that predate document generation — shows the page
 * composed from its own frozen rows, and says that it is not the issued
 * file.
 */

function civilDate(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(instant));
}

function markingDetail(view: DocumentView): string | null {
  const { render } = view;
  if (render.status === "voided") {
    return view.voidRecord === null
      ? VOIDED_DETAIL_ELSEWHERE
      : voidedDetail(view.voidRecord);
  }
  if (render.status === "superseded" && render.supersededAt !== null) {
    return `Superseded on ${civilDate(render.supersededAt, view.timeZone)}.`;
  }
  if (render.status === "draft") return DRAFT_RENDER_DETAIL;
  return null;
}

function DocumentMarking({
  view,
}: {
  readonly view: DocumentView;
}): ReactElement {
  return (
    <DocumentStatusMarking
      status={view.render.status}
      statusLabel={view.statusLabel}
      detail={markingDetail(view)}
      {...(view.supersededBy === null
        ? {}
        : {
            supersededBy: {
              href: `/documents/${view.supersededBy.id}`,
              label: "Open the render that replaced it",
            },
          })}
    />
  );
}

/** The page composed from the render's rows — for a render with no stored file. */
export function DocumentPageContent({
  view,
}: {
  readonly view: DocumentView;
}): ReactElement {
  const { render } = view;
  const marking = <DocumentMarking view={view} />;

  if (view.page.kind === "container_label") {
    const { label, container } = view.page;
    return (
      <ContainerLabelDocument
        labelText={label.labelText}
        contentsDescription={label.contentsDescription}
        accumulationStartDate={civilDate(
          label.accumulationStartedAt,
          view.timeZone,
        )}
        timeZone={view.timeZone}
        containerCode={container?.containerCode ?? "Not recorded"}
        handlerIdentifier={label.handlerIdentifier}
        verificationCode={render.verificationCode}
        marking={marking}
      />
    );
  }

  if (view.page.kind === "shipping_paper") {
    const { paper, header, shipment, shipper } = view.page;
    return (
      <ShippingPaperDocument
        {...issuedPaperProps({
          paper,
          header,
          shipment,
          shipper,
          gap: PAPER_GAP,
        })}
        marking={marking}
      />
    );
  }

  const inputs = snapshotEntries(render.inputSnapshot);
  return (
    <div data-render-record="true" className="flex flex-col gap-6">
      {marking}
      <p className="text-h1">{view.typeLabel}</p>
      <dl className="grid grid-cols-1 gap-2">
        {inputs.map((entry) => (
          <div key={entry.key} className="flex flex-col gap-1">
            <dt className="text-label">{entry.key}</dt>
            <dd className="text-body">{entry.text}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <p className="text-label">Rule versions applied</p>
        <ul className="grid gap-1">
          {render.ruleVersionsApplied.map((applied) => (
            <li key={applied.ruleVersionId} className="text-body">
              {`${applied.citation} — version ${applied.versionLabel}`}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The viewer for one render, in the state its stored file is in. */
export function DocumentPanel({
  view,
  embedded = false,
}: {
  readonly view: DocumentView;
  readonly embedded?: boolean;
}): ReactElement {
  const { render, storedFile } = view;

  if (storedFile.state === "integrity_failed") {
    return (
      <Alert
        role="alert"
        data-document-integrity="failed"
        className={cn(INTENT_SURFACE_CLASSES.critical, "gap-2 px-4 py-4")}
      >
        <AlertTitle className="text-body-strong">
          {INTEGRITY_FAILED_TITLE}
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-2 text-body text-current">
          <span>{INTEGRITY_FAILED_BODY}</span>
          {view.source.href === null ? null : (
            <Link
              href={view.source.href}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              {OPEN_SOURCE_RECORD}
            </Link>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const metadata = {
    typeLabel: view.typeLabel,
    generatedAt: view.generatedAt,
    generatedBy: view.generatedBy,
    source: view.source,
    renderId: render.id,
    verificationCode: render.verificationCode,
    statusLabel: view.statusLabel,
  };

  if (storedFile.state === "stored") {
    return (
      <RenderViewer
        renderId={render.id}
        pageCount={render.pageCount}
        storedContentHash={storedFile.contentHash}
        embedded={embedded}
        metadata={metadata}
        marking={
          render.status === "issued" ? undefined : (
            <DocumentMarking view={view} />
          )
        }
        stamp={
          <DocumentStatusStamp
            status={render.status}
            statusLabel={view.statusLabel}
          />
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p
        role="note"
        data-document-no-stored-file="true"
        className="max-w-[72ch] text-body"
      >
        {NO_STORED_FILE}
      </p>
      <RenderViewer
        renderId={render.id}
        pageCount={render.pageCount}
        storedContentHash={null}
        embedded={embedded}
        metadata={metadata}
      >
        <DocumentPageContent view={view} />
      </RenderViewer>
    </div>
  );
}
