import type { PostalAddress } from "@/types/common";
import { type RuleOutcome, ruleOutcome } from "@/domain/rules/outcome";
import {
  TRANSPORT_MODE_LABELS,
  type TransportMode,
} from "@/domain/taxonomy/transport-mode";
import type {
  ShippingPaperAddress,
  ShippingPaperDraft,
  ShippingPaperDraftLine,
  ShippingPaperPayload,
} from "@/domain/transport/shipping-paper";

import type { DocumentIdentity } from "./document-identity";

/**
 * The shipping paper's **render payload** — `TECHNICAL_SPEC.md` §8.1, §8.3;
 * Rules 5.5–5.9, 5.28.
 *
 * `buildShippingPaperPayload` (`src/domain/transport`) decides what the paper
 * says. This module adds what the render needs beside it — the shipper's name
 * as it signs, the display label of the mode, and the render's own identity —
 * and **validates the result before any renderer is invoked**: a payload with
 * no 24-hour number, no certification or no line is refused here, by name,
 * and never reaches a template (Rule 5.7). The template prints these fields
 * and nothing else.
 *
 * The issued payload keeps the transport payload's fields **at the top level**,
 * so every reader of a stored paper's input (`readStoredPaperHeader`,
 * departure's record check) reads an issued render exactly as it read unit
 * 05's.
 *
 * A **draft** (Rule 5.28) is a separate shape: everything the builder could
 * assemble, every gap left as a gap and stated in words, never a value that
 * looks like one. It is watermarked, it is never a document, and nothing here
 * can turn it into an issued payload.
 */

export type ShippingPaperShipper = {
  /** The organization's legal name, as it signs. */
  readonly name: string;
};

/** An issued paper's render payload — and its render's input snapshot. */
export type ShippingPaperDocumentPayload = ShippingPaperPayload & {
  readonly transportModeLabel: string;
  readonly shipper: ShippingPaperShipper;
  readonly document: DocumentIdentity;
};

/** A draft's render payload. Every nullable field is a gap, stated. */
export type ShippingPaperDraftDocumentPayload = {
  readonly shipmentNumber: string;
  readonly transportMode: TransportMode;
  readonly transportModeLabel: string;
  readonly origin: ShippingPaperAddress | null;
  readonly destination: {
    readonly facilityName: string | null;
    readonly address: ShippingPaperAddress | null;
    readonly identifier: string | null;
  };
  readonly carrier: {
    readonly name: string | null;
    readonly identifier: string | null;
  };
  readonly lines: readonly ShippingPaperDraftLine[];
  readonly recordsWithoutLine: readonly string[];
  readonly emergencyResponse: {
    /** Only a verified number, never the unverified one (Rule 5.7). */
    readonly phone: string | null;
    readonly contractRef: string | null;
  };
  readonly shipperCertification: string | null;
  readonly shipper: ShippingPaperShipper;
  /** The words printed where a value is missing. */
  readonly gap: string;
  readonly document: DocumentIdentity;
};

/** A payload that may be rendered, or the named fields that stop it. */
export type DocumentPayloadBuild<T> =
  | { readonly ok: true; readonly outcome: RuleOutcome<T> }
  | { readonly ok: false; readonly missing: readonly string[] };

/**
 * A draft's build. **Not a `RuleOutcome`**: a draft decides nothing and may
 * stand on no rule version at all — the rule data may be the very thing it is
 * missing — so it carries no envelope that claims otherwise.
 */
export type DraftPayloadBuild<T> =
  | { readonly ok: true; readonly payload: T }
  | { readonly ok: false; readonly missing: readonly string[] };

function blank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

/**
 * The issued paper's payload. **Refuses, naming every missing field**, where
 * the transport outcome lacks anything an issued paper must carry — the
 * 24-hour number above all (Rules 5.6, 5.7) — or the identity is not an
 * issued shipping paper's.
 */
export function buildShippingPaperDocumentPayload(input: {
  readonly paper: RuleOutcome<ShippingPaperPayload>;
  readonly shipperName: string;
  readonly document: DocumentIdentity;
}): DocumentPayloadBuild<ShippingPaperDocumentPayload> {
  const { paper, document } = input;
  const payload = paper.result;
  const missing: string[] = [];
  if (blank(payload.emergencyResponse.phone)) {
    missing.push("emergency_response_phone");
  }
  if (blank(payload.emergencyResponse.contractRef)) {
    missing.push("emergency_response_contract_ref");
  }
  if (blank(payload.shipperCertification)) {
    missing.push("shipper_certification_text");
  }
  if (payload.lines.length === 0) missing.push("lines");
  payload.lines.forEach((line, index) => {
    if (blank(line.basicDescription)) {
      missing.push(`lines[${index}].basic_description`);
    }
    if (blank(line.numberAndTypeOfPackages)) {
      missing.push(`lines[${index}].number_and_type_of_packages`);
    }
    if (blank(line.totalQuantityDescription)) {
      missing.push(`lines[${index}].total_quantity_description`);
    }
  });
  if (blank(input.shipperName)) missing.push("shipper_name");
  if (
    document.status !== "issued" ||
    document.documentType !== "shipping_paper"
  ) {
    missing.push("document.issued_shipping_paper");
  }
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    outcome: ruleOutcome({
      result: {
        ...payload,
        transportModeLabel: TRANSPORT_MODE_LABELS[payload.transportMode],
        shipper: { name: input.shipperName.trim() },
        document,
      },
      reasoning: paper.reasoning,
      ruleVersionsApplied: paper.ruleVersionsApplied,
      inputsSnapshot: paper.inputsSnapshot,
      context: "shipping_paper.render_payload",
    }),
  };
}

function address(value: PostalAddress | null): ShippingPaperAddress | null {
  if (value === null) return null;
  return {
    line1: value.line1,
    line2: value.line2 ?? null,
    city: value.city,
    region: value.region,
    postalCode: value.postalCode,
    country: value.country,
  };
}

/**
 * A draft's payload — the builder's draft as it stands, with the shipment's
 * addresses beside it. **A draft identity only**: an issued identity here is
 * a defect, refused.
 */
export function buildShippingPaperDraftPayload(input: {
  readonly draft: ShippingPaperDraft;
  readonly origin: PostalAddress | null;
  readonly destinationAddress: PostalAddress | null;
  readonly destinationIdentifier: string | null;
  readonly carrierIdentifier: string | null;
  readonly shipperName: string;
  readonly gap: string;
  readonly document: DocumentIdentity;
}): DraftPayloadBuild<ShippingPaperDraftDocumentPayload> {
  const { draft, document } = input;
  const missing: string[] = [];
  if (
    document.status !== "draft" ||
    document.documentType !== "shipping_paper" ||
    document.watermark === null
  ) {
    missing.push("document.draft_shipping_paper");
  }
  if (blank(input.gap)) missing.push("gap");
  if (missing.length > 0) return { ok: false, missing };

  const payload: ShippingPaperDraftDocumentPayload = {
    shipmentNumber: draft.shipmentNumber,
    transportMode: draft.transportMode,
    transportModeLabel: TRANSPORT_MODE_LABELS[draft.transportMode],
    origin: address(input.origin),
    destination: {
      facilityName: draft.destinationFacilityName,
      address: address(input.destinationAddress),
      identifier: input.destinationIdentifier,
    },
    carrier: {
      name: draft.carrierName,
      identifier: input.carrierIdentifier,
    },
    lines: draft.lines,
    recordsWithoutLine: draft.recordsWithoutLine,
    emergencyResponse: draft.emergencyResponse,
    shipperCertification: draft.shipperCertification,
    shipper: { name: input.shipperName.trim() },
    gap: input.gap,
    document,
  };
  return { ok: true, payload };
}
