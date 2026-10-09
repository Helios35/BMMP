import type { ReactElement, ReactNode } from "react";

import { DOCUMENT_TYPE_LABELS } from "@/domain/taxonomy/document-type";

/**
 * A `shipping_paper`, as its page — `UX_SPEC.md` §3.12–§3.14; Rules 5.5–5.9,
 * 5.28; `ERD.md` §7.3.
 *
 * **Every value is the payload's own.** An issued or voided paper is read from
 * its stored lines and its render's input, never from today's shipment, catalog
 * or organization — a render is immutable (Rule 5.12), and a paper that re-read
 * the catalog would quietly change after it was issued. The step 3 draft is
 * the same page over the builder's draft, with its marking.
 *
 * **No regulatory string is written here** (Rule 1.23): the basic description
 * is assembled in the rule version's sequence, and the certification is the
 * rule version's statement, verbatim. Where the draft lacks a value the gap is
 * stated where the value would be — **never a placeholder that looks like
 * one** (Rule 5.7). A draft is never a document (Rule 5.28): it carries its
 * marking inside the printed element, so the marking survives the paper.
 */

export interface ShippingPaperDocumentLine {
  readonly key: string;
  /** Null on a draft whose sequence rule cannot be read. */
  readonly basicDescription: string | null;
  readonly numberAndTypeOfPackages: string;
  /** Null on a draft where a mass is unknown. */
  readonly totalQuantity: string | null;
  readonly recordNumbers: readonly string[];
}

export interface ShippingPaperDocumentProps {
  readonly shipmentNumber: string;
  /** The organization's legal name, as it signs. */
  readonly shipper: string;
  readonly origin: string | null;
  readonly transportModeLabel: string;
  readonly destinationName: string | null;
  readonly destinationAddress: string | null;
  readonly destinationIdentifier: string | null;
  readonly carrierName: string | null;
  readonly carrierIdentifier: string | null;
  readonly lines: readonly ShippingPaperDocumentLine[];
  /** Draft only — records no line can carry yet, named. */
  readonly recordsWithoutLine?: readonly string[];
  /** The verified 24-hour number. Null on a draft — never the unverified one. */
  readonly emergencyPhone: string | null;
  readonly emergencyReference: string | null;
  /** The rule version's statement, verbatim. Null on a draft with no rule on file. */
  readonly certification: string | null;
  /** The stated gap in place of a missing value — a draft's, never an issued paper's. */
  readonly gap: string;
  /** Void, supersession or draft — inside the printed element. */
  readonly marking?: ReactNode;
}

function Value({
  value,
  gap,
  mono = false,
  attribute,
}: {
  readonly value: string | null;
  readonly gap: string;
  readonly mono?: boolean;
  readonly attribute: string;
}): ReactElement {
  if (value === null || value.trim() === "") {
    return (
      <dd data-paper-gap={attribute} className="text-body-strong">
        {gap}
      </dd>
    );
  }
  return (
    <dd
      data-paper-value={attribute}
      className={mono ? "text-mono break-all" : "text-body"}
    >
      {value}
    </dd>
  );
}

export function ShippingPaperDocument(
  props: ShippingPaperDocumentProps,
): ReactElement {
  const { gap } = props;
  return (
    <div data-shipping-paper-document="true" className="flex flex-col gap-6">
      {props.marking}
      <header className="flex flex-col gap-1">
        <p className="text-h1">{DOCUMENT_TYPE_LABELS.shipping_paper}</p>
        <p className="text-mono" data-paper-shipment-number="true">
          {props.shipmentNumber}
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-label">Shipper</dt>
          <dd className="text-body">{props.shipper}</dd>
          <Value value={props.origin} gap={gap} attribute="origin" />
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label">Consignee</dt>
          <Value
            value={props.destinationName}
            gap={gap}
            attribute="destination"
          />
          <Value
            value={props.destinationAddress}
            gap={gap}
            attribute="destination-address"
          />
          {props.destinationIdentifier === null ? null : (
            <dd className="text-mono">{props.destinationIdentifier}</dd>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label">Carrier</dt>
          <Value value={props.carrierName} gap={gap} attribute="carrier" />
          {props.carrierIdentifier === null ? null : (
            <dd className="text-mono">{props.carrierIdentifier}</dd>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label">Transport mode</dt>
          <dd className="text-body" data-paper-mode="true">
            {props.transportModeLabel}
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2" aria-label="Description">
        <p className="text-label">Basic description</p>
        <ol className="grid gap-3">
          {props.lines.map((line) => (
            <li
              key={line.key}
              data-paper-line={line.key}
              className="grid gap-1 border-b border-border pb-3"
            >
              <span
                data-paper-basic-description="true"
                className="text-body-strong"
              >
                {line.basicDescription ?? gap}
              </span>
              <span className="text-body">{line.numberAndTypeOfPackages}</span>
              <span className="text-body">{line.totalQuantity ?? gap}</span>
              <span className="text-caption">
                {line.recordNumbers.join(", ")}
              </span>
            </li>
          ))}
          {(props.recordsWithoutLine ?? []).map((recordNumber) => (
            <li
              key={recordNumber}
              data-paper-unlined={recordNumber}
              className="grid gap-1 border-b border-border pb-3"
            >
              <span className="font-mono text-body-strong">{recordNumber}</span>
              <span className="text-body-strong">{gap}</span>
            </li>
          ))}
        </ol>
      </section>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-label">24-hour emergency contact</dt>
          <Value
            value={props.emergencyPhone}
            gap={gap}
            mono
            attribute="emergency-phone"
          />
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label">Emergency response information</dt>
          <Value
            value={props.emergencyReference}
            gap={gap}
            mono
            attribute="emergency-reference"
          />
        </div>
      </dl>

      <section className="flex flex-col gap-1" aria-label="Certification">
        <p className="text-label">Shipper certification</p>
        {props.certification === null ? (
          <p data-paper-gap="certification" className="text-body-strong">
            {gap}
          </p>
        ) : (
          <p data-paper-certification="true" className="max-w-[72ch] text-body">
            {props.certification}
          </p>
        )}
      </section>
    </div>
  );
}
