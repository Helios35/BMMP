import type { ShippingPaperDocumentProps } from "@/components/documents/shipping-paper-document";
import { TRANSPORT_MODE_LABELS } from "@/domain/taxonomy/transport-mode";
import type { ShippingPaperDraft } from "@/domain/transport/shipping-paper";
import type { StoredPaperHeader } from "@/domain/transport/stored-paper";
import { formatAddressLine } from "@/features/settings/sites";
import type { PostalAddress } from "@/types/common";
import type { Shipment, ShippingPaper } from "@/types/documents";
import type { Organization } from "@/types/tenancy";

/**
 * The shipping paper's page props — for step 3's draft, and for an issued or
 * voided paper on `/shipments/[id]` and `/documents/[id]`.
 *
 * **An issued paper reads its own rows**: its lines from `shipping_paper`, its
 * header from the render's stored input — never today's shipment, whose
 * transport details a void reopens (Rules 5.12, 5.14). A render written before
 * this unit carries no stored header; its page then reads the shipment, which
 * cannot have moved since it closed, and says nothing it does not know.
 */

function addressText(address: PostalAddress | null): string | null {
  return address === null ? null : formatAddressLine(address);
}

export function shipperName(organization: Organization): string {
  return organization.legalName ?? organization.name;
}

export function draftPaperProps(input: {
  readonly draft: ShippingPaperDraft;
  readonly shipment: Shipment;
  readonly organization: Organization;
  readonly gap: string;
}): ShippingPaperDocumentProps {
  const { draft, shipment } = input;
  return {
    shipmentNumber: draft.shipmentNumber,
    shipper: shipperName(input.organization),
    origin: addressText(shipment.originAddress),
    transportModeLabel: TRANSPORT_MODE_LABELS[draft.transportMode],
    destinationName: draft.destinationFacilityName,
    destinationAddress: addressText(shipment.destinationAddress),
    destinationIdentifier: shipment.destinationIdentifier,
    carrierName: draft.carrierName,
    carrierIdentifier: shipment.transporterIdentifier,
    lines: draft.lines.map((line) => ({
      key: `${line.unIdentifier}|${line.properShippingName}|${line.hazardClass}|${line.packingGroup}`,
      basicDescription:
        line.basicDescription === "" ? null : line.basicDescription,
      numberAndTypeOfPackages: line.numberAndTypeOfPackages,
      totalQuantity: line.totalQuantityDescription,
      recordNumbers: line.records.map((record) => record.recordNumber),
    })),
    recordsWithoutLine: draft.recordsWithoutLine,
    emergencyPhone: draft.emergencyResponse.phone,
    emergencyReference: draft.emergencyResponse.contractRef,
    certification: draft.shipperCertification,
    gap: input.gap,
  };
}

export function issuedPaperProps(input: {
  readonly paper: ShippingPaper;
  readonly header: StoredPaperHeader | null;
  readonly shipment: Shipment | null;
  readonly shipper: string;
  readonly gap: string;
}): ShippingPaperDocumentProps {
  const { paper, header, shipment } = input;
  const lines =
    paper.lines === undefined
      ? [
          {
            key: paper.id,
            basicDescription: paper.basicDescription,
            numberAndTypeOfPackages: paper.numberAndTypeOfPackages,
            totalQuantity: paper.totalQuantityDescription,
            recordNumbers: [],
          },
        ]
      : paper.lines.map((line) => ({
          key: `${line.unIdentifier}|${line.properShippingName}|${line.hazardClass}|${line.packingGroup}`,
          basicDescription: line.basicDescription,
          numberAndTypeOfPackages: line.numberAndTypeOfPackages,
          totalQuantity: line.totalQuantityDescription,
          recordNumbers: line.records.map((record) => record.recordNumber),
        }));
  const mode = header?.transportMode ?? shipment?.transportMode ?? null;
  return {
    shipmentNumber:
      header?.shipmentNumber ?? shipment?.shipmentNumber ?? paper.shipmentId,
    shipper: input.shipper,
    origin:
      header !== null
        ? formatAddressLine(header.origin)
        : addressText(shipment?.originAddress ?? null),
    transportModeLabel: mode === null ? input.gap : TRANSPORT_MODE_LABELS[mode],
    destinationName:
      header?.destination.facilityName ??
      shipment?.destinationFacilityName ??
      null,
    destinationAddress:
      header !== null
        ? formatAddressLine(header.destination.address)
        : addressText(shipment?.destinationAddress ?? null),
    destinationIdentifier:
      header?.destination.identifier ?? shipment?.destinationIdentifier ?? null,
    carrierName: header?.carrier.name ?? shipment?.carrierName ?? null,
    carrierIdentifier:
      header?.carrier.identifier ?? shipment?.transporterIdentifier ?? null,
    lines,
    emergencyPhone: paper.emergencyResponsePhone,
    emergencyReference: paper.emergencyResponseContractRef,
    certification: paper.shipperCertificationText,
    gap: input.gap,
  };
}
