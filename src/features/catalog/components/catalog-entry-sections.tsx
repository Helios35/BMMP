import type { ReactElement } from "react";

import { StatusBadge } from "@/components";
import { APPLICATION_CLASS_LABELS } from "@/domain/taxonomy/application-class";
import { CELL_FORM_FACTOR_LABELS } from "@/domain/taxonomy/cell-form-factor";
import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { labelFor } from "@/domain/taxonomy/lookup";
import { PACKING_GROUP_LABELS } from "@/domain/taxonomy/packing-group";
import { REMOVABILITY_LABELS } from "@/domain/taxonomy/removability";
import { UN_TRANSPORT_IDENTIFIER_LABELS } from "@/domain/taxonomy/un-transport-identifier";
import type { CatalogEntry } from "@/types/catalog";
import {
  catalogDateLabel,
  measurement,
} from "@/features/catalog/catalog-entry-display";
import { CatalogSourceType } from "./catalog-source-type";
import { DetailField, DetailSection } from "./detail-section";

/**
 * The body of `/catalog/[id]` — `UX_SPEC.md` §3.16.
 *
 * Every taxonomy value is read through its own module's lookup and **no label is
 * written inline** (`TAXONOMY.md` §5.3). Every measurement carries the unit its
 * column carries and **never one inferred from another** — these are the
 * product's own rated attributes off `catalog_entry`. **No jurisdiction data
 * reaches this screen at all**, so Rule 1.23 has nothing here to bite on.
 *
 * A small mobility pack renders through this component with no special case. So
 * does a vehicle traction pack. **There is no branch on `applicationClass`
 * anywhere below** (`SITE_ARCHITECTURE.md` §7.8).
 */

export interface CatalogEntrySectionsProps {
  readonly entry: CatalogEntry;
  /**
   * The verifier's display name, resolved by the route.
   *
   * `null` where the entry is unverified **or** where the verifier is not a name
   * this caller can resolve. Both render as *"Not verified"* rather than as a
   * half-attribution: a verification that cannot name who made it is not a
   * verification (Rule 12.9's principle, applied to display).
   */
  readonly verifiedByName: string | null;
}

export function CatalogEntrySections({
  entry,
  verifiedByName,
}: CatalogEntrySectionsProps): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <DetailSection title="Manufacturer and model">
        <DetailField label="Manufacturer" value={entry.manufacturerName} />
        <DetailField label="Brand" value={entry.brandName} />
        <DetailField label="Model" value={entry.modelName} />
        <DetailField label="Part number" value={entry.partNumber} mono />
        <DetailField label="GTIN" value={entry.gtin} mono />
        <DetailField
          // T-02. `small_mobility` is a first-class value here, beside
          // `vehicle`, and nothing on this page treats it differently.
          label="Battery class"
          value={labelFor(APPLICATION_CLASS_LABELS, entry.applicationClass)}
        />
        <DetailField
          label="Catalog status"
          value={
            <StatusBadge system="catalog_entry_status" value={entry.status} />
          }
        />
      </DetailSection>

      <DetailSection title="Chemistry and form factor">
        <DetailField
          // T-01. Chemistry comes from the catalog and is confirmed by a person;
          // it is never seen in an image (Rules 2.10, 2.18).
          label="Chemistry"
          value={labelFor(CHEMISTRY_LABELS, entry.chemistry)}
        />
        <DetailField
          // T-04, the physical cell shape. **Not T-06** — no format band renders
          // on this page, and §3.5.3 says why.
          label="Form factor"
          value={
            entry.cellFormFactor === null
              ? null
              : labelFor(CELL_FORM_FACTOR_LABELS, entry.cellFormFactor)
          }
        />
      </DetailSection>

      <DetailSection title="Specification">
        <DetailField
          label="Nominal voltage"
          value={measurement(entry.nominalVoltageV, "V")}
        />
        <DetailField
          label="Rated capacity"
          value={measurement(entry.ratedCapacityAh, "Ah")}
        />
        <DetailField
          // Rendered beside capacity, never derived from it: Ah and Wh are
          // different quantities and inferring one asserts a voltage.
          label="Rated energy"
          value={measurement(entry.ratedEnergyWh, "Wh")}
        />
        <DetailField label="Mass" value={measurement(entry.massKg, "kg")} />
        <DetailField
          // T-05. A product attribute the B1b format engine reads (Rule 8.2).
          label="Removability"
          value={labelFor(REMOVABILITY_LABELS, entry.removability)}
        />
      </DetailSection>

      <DetailSection title="Transport identity">
        <DetailField
          // T-17. Carried onto the shipping paper (Rule 5.9).
          label="UN identifier"
          value={
            entry.unIdentifier === null
              ? null
              : labelFor(UN_TRANSPORT_IDENTIFIER_LABELS, entry.unIdentifier)
          }
        />
        <DetailField
          label="Proper shipping name"
          value={entry.properShippingName}
        />
        <DetailField label="Hazard class" value={entry.hazardClass} />
        <DetailField
          // T-19.
          label="Packing group"
          value={labelFor(PACKING_GROUP_LABELS, entry.packingGroup)}
        />
      </DetailSection>

      <DetailSection title="Certification">
        {/* `catalog_entry` carries the UN 38.3 test summary reference and no
            certification-marks column; §3.16 names "certification marks" and the
            gap is reported rather than filled with an invented field. */}
        <DetailField
          label="UN 38.3 test summary"
          value={
            entry.un383SummaryUrl === null ? null : (
              <ExternalReference href={entry.un383SummaryUrl} />
            )
          }
          wide
        />
      </DetailSection>

      <DetailSection title="Source and last updated">
        <DetailField
          // T-61, and the field is still `string`. See `CatalogSourceType`.
          label="Source type"
          value={<CatalogSourceType sourceType={entry.sourceType} />}
        />
        <DetailField
          label="Source"
          value={
            entry.sourceUrl === null ? null : (
              <ExternalReference href={entry.sourceUrl} />
            )
          }
        />
        <DetailField
          label="Verification"
          value={verificationLabel(entry, verifiedByName)}
          wide
        />
        <DetailField
          label="Last updated"
          value={catalogDateLabel(entry.updatedAt)}
        />
      </DetailSection>

      {/* [B1b] format_classification. Reserved as a LIST, not a field: the band
          is keyed on (battery_record, jurisdiction, rule_version) because the
          same battery classifies differently in different states (Rule 3.5;
          `_ANCHORS.md` §3). B1a renders none — and renders no single
          organisation-wide size or format value either, because doing so bakes
          in exactly the assumption format_classification exists to prevent. */}
    </div>
  );
}

/**
 * *"Verified by `<name>` on `<date>`"*, or *"Not verified"*.
 *
 * **Never an em dash** (§3.16): an unverified entry is a fact a handler weighs
 * when confirming a match, and a dash says nothing about it either way.
 */
function verificationLabel(
  entry: CatalogEntry,
  verifiedByName: string | null,
): string {
  if (entry.verifiedAt === null || verifiedByName === null) {
    return "Not verified";
  }
  return `Verified by ${verifiedByName} on ${catalogDateLabel(entry.verifiedAt)}`;
}

/**
 * A stored external reference, rendered whole.
 *
 * It wraps rather than truncates: E-15 requires a long value to stay copyable in
 * full, so no character is dropped from the DOM and nothing here sets a fixed
 * height that 200% zoom would break.
 */
function ExternalReference({ href }: { readonly href: string }) {
  return (
    <a
      href={href}
      rel="noreferrer noopener"
      target="_blank"
      className="inline-flex min-h-11 items-center break-all underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      {href}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
