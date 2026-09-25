import type { ReactElement } from "react";

import { ContainerLabelDocument } from "@/components/documents/container-label-document";
import { DocumentStatusMarking } from "@/components/documents/document-viewer";
import { snapshotEntries } from "@/features/battery-record/json-text";

import type { DocumentView } from "./server/read-document";

/**
 * The page a `DocumentViewer` shows for one render — composed from the
 * render's own frozen rows (Rules 4.20, 5.12).
 *
 * A `container_label` is its label: the phrase, the contents and the start
 * date as printed. **Every other type's page arrives with the unit that
 * generates it** (unit 06); until then the page is the render's own record —
 * what it was rendered from, under which rule versions, and its verification
 * code — never an invented document.
 *
 * A render that is not the live document carries its marking **on the page**,
 * so it prints (§3.14).
 */

function civilDate(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(instant));
}

export function DocumentPageContent({
  view,
}: {
  readonly view: DocumentView;
}): ReactElement {
  const { render } = view;
  const marking = (
    <DocumentStatusMarking
      status={render.status}
      statusLabel={view.statusLabel}
      detail={
        render.status === "superseded" && render.supersededAt !== null
          ? `Superseded on ${civilDate(render.supersededAt, view.timeZone)}.`
          : null
      }
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

  const inputs = snapshotEntries(render.inputSnapshot);
  return (
    <div data-render-record="true" className="flex flex-col gap-6">
      {marking}
      <p className="text-h1">{view.typeLabel}</p>
      <p className="max-w-[72ch] text-body">
        This document type&apos;s page arrives with document generation. What
        follows is the render&apos;s own record: what it was rendered from, and
        under which rule versions.
      </p>
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
      <p className="text-mono">{`Verification code ${render.verificationCode}`}</p>
    </div>
  );
}
