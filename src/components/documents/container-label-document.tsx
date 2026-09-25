import type { ReactElement, ReactNode } from "react";

/**
 * A `container_label` render, as its page — `UX_SPEC.md` §3.10, §3.14;
 * Rules 4.18–4.22.
 *
 * **Every value is the label row's own, frozen when it was printed**: the
 * required regulatory phrase, the contents description and the accumulation
 * start date (Rule 4.18). None is re-read from the container, because a render
 * is immutable (Rule 4.20) and a label that re-read today's container would
 * hide the one fact Rule 4.19 exists to catch — a printed date that no longer
 * matches.
 *
 * **The regulatory phrase is reproduced verbatim, including its own casing.**
 * It is rule-version data, never a display label: nothing here sentence-cases,
 * truncates or "improves" it (`TAXONOMY.md` §4.5; Rule 1.23). No phrase is
 * written in this file.
 */

export interface ContainerLabelDocumentProps {
  /** `container_label.label_text` — rule-version data, verbatim. */
  readonly labelText: string;
  readonly contentsDescription: string;
  /** The printed start, already formatted in the site's zone. */
  readonly accumulationStartDate: string;
  readonly timeZone: string;
  readonly containerCode: string;
  readonly handlerIdentifier: string | null;
  /** Printed on the page; the content hash cannot be (`ERD.md` §7.5). */
  readonly verificationCode: string;
  /** A void, supersession or draft marking — it prints with the page. */
  readonly marking?: ReactNode;
}

export function ContainerLabelDocument({
  labelText,
  contentsDescription,
  accumulationStartDate,
  timeZone,
  containerCode,
  handlerIdentifier,
  verificationCode,
  marking,
}: ContainerLabelDocumentProps): ReactElement {
  return (
    <div data-container-label-document="true" className="flex flex-col gap-6">
      {marking}
      <p data-label-phrase="true" className="text-display">
        {labelText}
      </p>
      <dl className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-label">Accumulation start date</dt>
          <dd data-label-start-date="true" className="text-h1">
            {accumulationStartDate}
          </dd>
          <dd className="text-caption">{`Site time, ${timeZone}`}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label">Contents</dt>
          <dd data-label-contents="true" className="text-h2">
            {contentsDescription}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label">Container</dt>
          <dd className="text-mono">{containerCode}</dd>
        </div>
        {handlerIdentifier === null ? null : (
          <div className="flex flex-col gap-1">
            <dt className="text-label">Handler</dt>
            <dd className="text-mono">{handlerIdentifier}</dd>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <dt className="text-label">Verification code</dt>
          <dd className="text-mono">{verificationCode}</dd>
        </div>
      </dl>
    </div>
  );
}
