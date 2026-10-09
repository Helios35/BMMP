import type { Decimal, IsoTimestamp, PostalAddress } from "@/types/common";
import { type RuleOutcome, ruleOutcome } from "@/domain/rules/outcome";
import type { ResolvedRule } from "@/domain/rules/resolve";
import type { ContainerLabelFlags } from "@/domain/storage/container-label-flags";
import {
  CLASSIFICATION_DECISION_STATUSES,
  CLASSIFICATION_DECISION_STATUS_LABELS,
} from "@/domain/taxonomy/classification-decision-status";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import { isTaxonomyValue, readTaxonomyValue } from "@/domain/taxonomy/lookup";
import {
  PACKING_GROUPS,
  type PackingGroup,
} from "@/domain/taxonomy/packing-group";
import { ROLE_LABELS, type RoleCode } from "@/domain/taxonomy/role";
import type { TransportMode } from "@/domain/taxonomy/transport-mode";
import {
  UN_TRANSPORT_IDENTIFIERS,
  type UnTransportIdentifier,
} from "@/domain/taxonomy/un-transport-identifier";
import {
  WASTE_CLASSIFICATIONS,
  type WasteClassification,
} from "@/domain/taxonomy/waste-classification";
import { addDecimal } from "@/domain/units";

import {
  airBlockIndicatorText,
  assessAirTransport,
  type AirTransportAssessment,
} from "./air-transport";
import { buildBasicDescription, type LineIdentity } from "./basic-description";
import {
  emergencyVerification,
  type EmergencyVerificationInput,
} from "./emergency-verification";
import {
  determinePackagingException,
  type PackagingExceptionDetermination,
} from "./packaging-exception";
import {
  appliedVersion,
  BASIC_DESCRIPTION_RULE_KEY,
  readBasicDescriptionRule,
  readShipperCertificationRule,
  SHIPPER_CERTIFICATION_RULE_KEY,
} from "./rule-data";

/**
 * The shipping paper's content, and the checklist that decides whether it may
 * exist — `BUSINESS_RULES.md` Rules 5.3–5.9, 5.28; D-32, D-36;
 * `TECHNICAL_SPEC.md` §11.2.
 *
 * **The one hard idea: a shipping paper is either right or it does not
 * exist.** {@link buildShippingPaperPayload} is the one builder. Step 3's
 * checklist, the watermarked draft and the issued paper all read its output —
 * there is no second assembly anywhere that could say something different, so
 * what the checklist calls complete is exactly what the paper says.
 *
 * **Every unmet precondition is named** (Rule 5.3): which record, which
 * missing identifier, which rule — never a single "cannot generate". A
 * complete build is the only one that returns a `RuleOutcome`; an incomplete
 * one returns the draft, which is never a document (Rule 5.28).
 *
 * Pure. The rows, the resolved rule versions and the instant arrive as
 * arguments; identifiers come from the matched catalog entry and are never
 * typed or guessed (Rule 5.9); every regulatory string is a rule version's
 * payload (Rule 1.23). No probability of anything (Rule 1.25).
 */

// --- inputs ----------------------------------------------------------------------------

/** A matched catalog entry's transport identity, as stored (Rule 5.9; `ERD.md` §5.2). */
export interface ShippingIdentityInput {
  /** "Northvale NV-TP400" — names the entry in a finding. */
  readonly catalogEntryTitle: string;
  /** T-17 as stored. */
  readonly unIdentifier: string | null;
  readonly properShippingName: string | null;
  readonly hazardClass: string | null;
  /** T-19 as stored. */
  readonly packingGroup: string;
}

/** The record's governing classification decision, as stored (T-45, T-13). */
export interface ClassificationInput {
  readonly status: string;
  readonly wasteClassification: string;
  readonly reasoning: string;
}

export interface ShippingPaperRecordInput {
  readonly recordId: string;
  readonly recordNumber: string;
  readonly containerId: string;
  readonly containerCode: string;
  /** T-22 as stored. */
  readonly status: string;
  /** A person confirmed the chemistry (Rules 2.15, 2.34). */
  readonly chemistryConfirmed: boolean;
  readonly batteryMassKg: Decimal | null;
  readonly ddrFlags: readonly DdrFlag[];
  readonly isAirTransportProhibited: boolean;
  /** The current damage assessment's findings, as stored. */
  readonly currentFindings: readonly string[];
  /** The citation of `condition_rule_version_id`, where one is recorded. */
  readonly conditionCitation: string | null;
  /** Null where no catalog entry is matched. */
  readonly shippingIdentity: ShippingIdentityInput | null;
  /** Null where the record has no decision at all. */
  readonly classification: ClassificationInput | null;
}

export interface ShippingPaperContainerInput {
  readonly id: string;
  readonly containerCode: string;
  readonly labelFlags: ContainerLabelFlags;
}

export interface ShippingPaperShipmentInput {
  readonly shipmentNumber: string;
  readonly transportMode: TransportMode;
  readonly originAddress: PostalAddress | null;
  readonly destinationFacilityName: string | null;
  readonly destinationAddress: PostalAddress | null;
  readonly destinationIdentifier: string | null;
  readonly carrierName: string | null;
  readonly transporterIdentifier: string | null;
}

export interface ShippingPaperRuleInput {
  readonly basicDescription: ResolvedRule | null;
  readonly shipperCertification: ResolvedRule | null;
  readonly packagingException: ResolvedRule | null;
}

export interface ShippingPaperBuildInput {
  readonly shipment: ShippingPaperShipmentInput;
  readonly containers: readonly ShippingPaperContainerInput[];
  readonly records: readonly ShippingPaperRecordInput[];
  readonly emergencyContact: EmergencyVerificationInput & {
    /** `organization.emergency_response_contract_ref`. */
    readonly contractRef: string | null;
  };
  readonly rules: ShippingPaperRuleInput;
  /** The instant the build is evaluated at — what decides whether a verification still stands. */
  readonly at: IsoTimestamp;
}

// --- outputs: plain-data shapes, because they are stored --------------------------------

export type ShippingPaperAddress = {
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
};

export type ShippingPaperLineRecord = {
  readonly recordId: string;
  readonly recordNumber: string;
  readonly containerCode: string;
  readonly wasteClassification: WasteClassification;
  readonly classificationReasoning: string;
  readonly ddrFlags: readonly DdrFlag[];
};

/** One line of the paper: one identity, every record that carries it. */
export type ShippingPaperLine = {
  readonly unIdentifier: Exclude<UnTransportIdentifier, "not_assigned">;
  readonly properShippingName: string;
  readonly hazardClass: string;
  readonly packingGroup: PackingGroup;
  /** In the rule version's sequence (Rule 5.8). */
  readonly basicDescription: string;
  readonly numberAndTypeOfPackages: string;
  readonly totalQuantityDescription: string;
  readonly totalMassKg: Decimal;
  readonly containerCodes: readonly string[];
  readonly records: readonly ShippingPaperLineRecord[];
};

export type ShippingPaperEmergencyResponse = {
  /** **The verified 24-hour number. Never absent, never a placeholder** (Rules 5.6, 5.7). */
  readonly phone: string;
  readonly contractRef: string;
  /** No source carries a guide number yet. Nullable on `shipping_paper`. */
  readonly guideNumber: null;
  readonly verifiedAt: IsoTimestamp;
  readonly lapsesAt: IsoTimestamp;
};

/** What the issued paper says — stored on `shipping_paper` and as the render's input. */
export type ShippingPaperPayload = {
  readonly shipmentNumber: string;
  readonly transportMode: TransportMode;
  readonly origin: ShippingPaperAddress;
  readonly destination: {
    readonly facilityName: string;
    readonly address: ShippingPaperAddress;
    readonly identifier: string | null;
  };
  readonly carrier: {
    readonly name: string;
    readonly identifier: string | null;
  };
  readonly lines: readonly ShippingPaperLine[];
  readonly emergencyResponse: ShippingPaperEmergencyResponse;
  /** The rule version's statement, verbatim. */
  readonly shipperCertification: string;
  readonly packagingException: PackagingExceptionDetermination;
  /**
   * D-36 — a fully-regulated line is documented in full and the manifest gap
   * is stated. **The shipment is never presented as fully documented** while
   * this is required.
   */
  readonly manifestObligation: {
    readonly required: boolean;
    readonly recordNumbers: readonly string[];
  };
  /** Records on the damaged/defective path (Rules 6.15, 6.16). */
  readonly ddrRecordNumbers: readonly string[];
  /** Exactly the contents the paper describes — a changed set voids it (Rule 5.13). */
  readonly recordIds: readonly string[];
  readonly containerIds: readonly string[];
};

/** A line on the draft — the same line, where the mass may not be known yet. */
export type ShippingPaperDraftLine = Omit<
  ShippingPaperLine,
  "totalMassKg" | "totalQuantityDescription"
> & {
  readonly totalMassKg: Decimal | null;
  readonly totalQuantityDescription: string | null;
};

/**
 * **The watermarked draft — never a document** (Rule 5.28). Everything the
 * builder could assemble, with every gap left as a gap: an unverified number
 * is absent here, never shown, and nothing on it closes a precondition.
 */
export type ShippingPaperDraft = {
  readonly shipmentNumber: string;
  readonly transportMode: TransportMode;
  readonly destinationFacilityName: string | null;
  readonly carrierName: string | null;
  readonly lines: readonly ShippingPaperDraftLine[];
  /** Records no line can carry yet — no shipping identifiers on their entry. */
  readonly recordsWithoutLine: readonly string[];
  readonly emergencyResponse: {
    /** Only a verified number. Null otherwise — never the unverified one. */
    readonly phone: string | null;
    readonly contractRef: string | null;
  };
  readonly shipperCertification: string | null;
  readonly packagingException: PackagingExceptionDetermination;
  readonly manifestObligation: {
    readonly required: boolean;
    readonly recordNumbers: readonly string[];
  };
  readonly ddrRecordNumbers: readonly string[];
};

// --- the checklist -----------------------------------------------------------------------

/** Every precondition step 3 lists, in the order it lists them. */
export const SHIPPING_PAPER_PRECONDITIONS = [
  "contents",
  "identification",
  "classification",
  "transport_mode",
  "emergency_contact",
  "destination_and_carrier",
  "shipping_identifiers",
  "quantity",
  "container_labels",
  "rule_data",
] as const;

export type ShippingPaperPrecondition =
  (typeof SHIPPING_PAPER_PRECONDITIONS)[number];

export type PreconditionItem = {
  readonly id: ShippingPaperPrecondition;
  /** The rules that make it a precondition. */
  readonly rules: readonly string[];
  readonly met: boolean;
  /** One sentence per unmet fact, naming the record, container or rule. Empty when met. */
  readonly findings: readonly string[];
  /** Who can clear it (Rule 5.7's pointer, generalised). Empty when met. */
  readonly whoCanFix: readonly RoleCode[];
};

export type ShippingPaperChecklist = {
  readonly items: readonly PreconditionItem[];
  readonly unmet: readonly ShippingPaperPrecondition[];
  readonly isComplete: boolean;
};

export type ShippingPaperBuild =
  | {
      readonly kind: "complete";
      readonly checklist: ShippingPaperChecklist;
      readonly draft: ShippingPaperDraft;
      readonly air: AirTransportAssessment;
      readonly outcome: RuleOutcome<ShippingPaperPayload>;
    }
  | {
      readonly kind: "incomplete";
      readonly checklist: ShippingPaperChecklist;
      readonly draft: ShippingPaperDraft;
      readonly air: AirTransportAssessment;
    };

// --- the pieces ---------------------------------------------------------------------------

const HANDLER_OR_ADMIN: readonly RoleCode[] = [
  "compliance_handler",
  "platform_admin",
];
const MANAGER_OR_ADMIN: readonly RoleCode[] = [
  "facility_manager",
  "platform_admin",
];
const ADMIN_ONLY: readonly RoleCode[] = ["platform_admin"];

function item(
  id: ShippingPaperPrecondition,
  rules: readonly string[],
  findings: readonly string[],
  whoCanFix: readonly RoleCode[],
): PreconditionItem {
  const met = findings.length === 0;
  return { id, rules, met, findings, whoCanFix: met ? [] : whoCanFix };
}

function address(value: PostalAddress): ShippingPaperAddress {
  return {
    line1: value.line1,
    line2: value.line2 ?? null,
    city: value.city,
    region: value.region,
    postalCode: value.postalCode,
    country: value.country,
  };
}

function isCompleteAddress(
  value: PostalAddress | null,
): value is PostalAddress {
  return (
    value !== null &&
    [
      value.line1,
      value.city,
      value.region,
      value.postalCode,
      value.country,
    ].every((part) => part.trim() !== "")
  );
}

/** T-22 values whose identification a person has not finished confirming. */
const UNCONFIRMED_RECORD_STATUSES: readonly string[] = [
  "draft",
  "pending_review",
];

function identificationFindings(
  records: readonly ShippingPaperRecordInput[],
): string[] {
  return records
    .filter(
      (record) =>
        UNCONFIRMED_RECORD_STATUSES.includes(record.status) ||
        !record.chemistryConfirmed,
    )
    .map(
      (record) =>
        `${record.recordNumber} has no confirmed identification. Its chemistry and model are confirmed on the review queue.`,
    );
}

function classificationFinding(
  record: ShippingPaperRecordInput,
): string | null {
  // EC-42 — a record being re-classified cannot be documented until the
  // classification settles.
  if (record.status === "reclassifying") {
    return `${record.recordNumber} is being re-classified. It cannot be documented until its classification settles.`;
  }
  const decision = record.classification;
  if (decision === null) {
    return `${record.recordNumber} has no classification decision on record.`;
  }
  const status = readTaxonomyValue(
    CLASSIFICATION_DECISION_STATUSES,
    CLASSIFICATION_DECISION_STATUS_LABELS,
    decision.status,
  );
  const decided =
    status.recognised &&
    status.storedValue === "active" &&
    isTaxonomyValue(WASTE_CLASSIFICATIONS, decision.wasteClassification) &&
    decision.wasteClassification !== "undetermined";
  if (decided) return null;
  const statusText = status.recognised ? status.label : status.storedValue;
  return `${record.recordNumber} has no active classification (its decision is ${statusText}). ${decision.reasoning}`;
}

function modeFindings(
  mode: TransportMode,
  air: AirTransportAssessment,
): string[] {
  if (mode !== "air" || air.available) return [];
  return air.blockingRecords.map(
    (record) =>
      `Air transport is not available: ${record.recordNumber} is on the damaged, defective or recalled path (${record.indicators.map(airBlockIndicatorText).join(", ")}).`,
  );
}

/** A complete transport identity, or the names of what is missing from it. */
type IdentityRead =
  | { readonly complete: true; readonly identity: LineIdentity }
  | { readonly complete: false; readonly finding: string };

const IDENTIFIER_NAMES = {
  unIdentifier: "identification number",
  properShippingName: "proper shipping name",
  hazardClass: "hazard class",
  packingGroup: "recognised packing group",
} as const;

function readIdentity(record: ShippingPaperRecordInput): IdentityRead {
  const entry = record.shippingIdentity;
  if (entry === null) {
    return {
      complete: false,
      finding: `${record.recordNumber} has no matched catalog entry, so it has no shipping identifiers. Identifiers are never guessed from a similar entry (Rule 5.9).`,
    };
  }
  const missing: string[] = [];
  const un = entry.unIdentifier;
  const unIdentifier =
    un !== null &&
    isTaxonomyValue(UN_TRANSPORT_IDENTIFIERS, un) &&
    un !== "not_assigned"
      ? un
      : null;
  if (unIdentifier === null) missing.push(IDENTIFIER_NAMES.unIdentifier);
  const psn = entry.properShippingName?.trim() ?? "";
  if (psn === "") missing.push(IDENTIFIER_NAMES.properShippingName);
  const hazardClass = entry.hazardClass?.trim() ?? "";
  if (hazardClass === "") missing.push(IDENTIFIER_NAMES.hazardClass);
  const packingGroup = isTaxonomyValue(PACKING_GROUPS, entry.packingGroup)
    ? entry.packingGroup
    : null;
  if (packingGroup === null) missing.push(IDENTIFIER_NAMES.packingGroup);

  if (unIdentifier === null || packingGroup === null || missing.length > 0) {
    return {
      complete: false,
      finding:
        `${record.recordNumber}'s catalog entry (${entry.catalogEntryTitle}) has no ${missing.join(", ")}. ` +
        `Only a ${ROLE_LABELS.platform_admin} edits a catalog entry's shipping identity.`,
    };
  }
  return {
    complete: true,
    identity: {
      unIdentifier,
      properShippingName: psn,
      hazardClass,
      packingGroup,
    },
  };
}

function wasteClassificationOf(
  record: ShippingPaperRecordInput,
): WasteClassification {
  const stored = record.classification?.wasteClassification ?? "undetermined";
  return isTaxonomyValue(WASTE_CLASSIFICATIONS, stored)
    ? stored
    : "undetermined";
}

function packagesText(containerCodes: readonly string[]): string {
  const count = containerCodes.length;
  return `${count} ${count === 1 ? "container" : "containers"} (${containerCodes.join(", ")})`;
}

function buildLines(
  records: readonly ShippingPaperRecordInput[],
  sequence: Parameters<typeof buildBasicDescription>[1] | null,
): {
  readonly lines: ShippingPaperDraftLine[];
  readonly withoutLine: string[];
  readonly identityFindings: string[];
} {
  const groups = new Map<
    string,
    { identity: LineIdentity; records: ShippingPaperRecordInput[] }
  >();
  const withoutLine: string[] = [];
  const identityFindings: string[] = [];

  for (const record of records) {
    const read = readIdentity(record);
    if (!read.complete) {
      withoutLine.push(record.recordNumber);
      identityFindings.push(read.finding);
      continue;
    }
    const { identity } = read;
    const key = [
      identity.unIdentifier,
      identity.properShippingName,
      identity.hazardClass,
      identity.packingGroup,
    ].join("|");
    const group = groups.get(key) ?? { identity, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }

  const lines: ShippingPaperDraftLine[] = [];
  for (const { identity, records: lineRecords } of groups.values()) {
    const sorted = [...lineRecords].sort((a, b) =>
      a.recordNumber.localeCompare(b.recordNumber),
    );
    const containerCodes = [
      ...new Set(sorted.map((record) => record.containerCode)),
    ].sort((a, b) => a.localeCompare(b));
    const masses = sorted.map((record) => record.batteryMassKg);
    const totalMassKg = masses.every((mass): mass is Decimal => mass !== null)
      ? masses.reduce((total, mass) => addDecimal(total, mass), "0")
      : null;
    lines.push({
      ...identity,
      // With no readable sequence there is no basic description to give; the
      // rule-data precondition names why, and the draft says so.
      basicDescription:
        sequence === null ? "" : buildBasicDescription(identity, sequence),
      numberAndTypeOfPackages: packagesText(containerCodes),
      totalMassKg,
      totalQuantityDescription:
        totalMassKg === null ? null : `${totalMassKg} kg`,
      containerCodes,
      records: sorted.map((record) => ({
        recordId: record.recordId,
        recordNumber: record.recordNumber,
        containerCode: record.containerCode,
        wasteClassification: wasteClassificationOf(record),
        classificationReasoning: record.classification?.reasoning ?? "",
        ddrFlags: [...record.ddrFlags],
      })),
    });
  }
  lines.sort(
    (a, b) =>
      a.unIdentifier.localeCompare(b.unIdentifier) ||
      a.properShippingName.localeCompare(b.properShippingName) ||
      a.hazardClass.localeCompare(b.hazardClass) ||
      a.packingGroup.localeCompare(b.packingGroup),
  );
  return { lines, withoutLine, identityFindings };
}

function quantityFindings(
  records: readonly ShippingPaperRecordInput[],
): string[] {
  return records
    .filter((record) => record.batteryMassKg === null)
    .map(
      (record) =>
        `${record.recordNumber} has no recorded mass, so its line's total quantity cannot be stated. A paper never states a quantity it cannot account for.`,
    );
}

function labelFindings(
  containers: readonly ShippingPaperContainerInput[],
): string[] {
  const findings: string[] = [];
  for (const container of containers) {
    if (container.labelFlags.noCurrentLabel) {
      findings.push(
        `${container.containerCode} holds batteries but has no label in force (Rule 4.22).`,
      );
    }
    if (container.labelFlags.mislabelled !== null) {
      findings.push(
        `${container.containerCode}'s printed accumulation start date no longer matches its current one. It must be relabelled (Rule 4.19).`,
      );
    }
  }
  return findings;
}

function destinationFindings(shipment: ShippingPaperShipmentInput): string[] {
  const findings: string[] = [];
  if ((shipment.destinationFacilityName?.trim() ?? "") === "") {
    findings.push("The destination facility is not recorded.");
  }
  if (!isCompleteAddress(shipment.destinationAddress)) {
    findings.push("The destination address is not recorded in full.");
  }
  if ((shipment.carrierName?.trim() ?? "") === "") {
    findings.push("The carrier is not recorded.");
  }
  if (!isCompleteAddress(shipment.originAddress)) {
    findings.push(
      "The origin site's address is not on record for this shipment.",
    );
  }
  return findings;
}

// --- the builder ---------------------------------------------------------------------------

/**
 * Build the shipping paper — its checklist, its draft, and, only when every
 * precondition is met, the payload the issued paper stores.
 */
export function buildShippingPaperPayload(
  input: ShippingPaperBuildInput,
): ShippingPaperBuild {
  const { shipment, records, containers, rules } = input;

  const air = assessAirTransport(
    records.map((record) => ({
      recordId: record.recordId,
      recordNumber: record.recordNumber,
      ddrFlags: record.ddrFlags,
      isAirTransportProhibited: record.isAirTransportProhibited,
      currentFindings: record.currentFindings,
      citation: record.conditionCitation,
    })),
  );

  const basicDescriptionRule =
    rules.basicDescription === null
      ? null
      : readBasicDescriptionRule(rules.basicDescription);
  const certificationRule =
    rules.shipperCertification === null
      ? null
      : readShipperCertificationRule(rules.shipperCertification);
  const packagingException = determinePackagingException(
    rules.packagingException,
  );

  const { lines, withoutLine, identityFindings } = buildLines(
    records,
    basicDescriptionRule?.sequence ?? null,
  );

  const verification = emergencyVerification(input.emergencyContact, input.at);
  const contractRef = input.emergencyContact.contractRef?.trim() ?? "";
  const emergencyFindings: string[] = [];
  if (!verification.isInForce) {
    // D-32 — one not-in-force state, whatever the entry point: missing,
    // never verified, interval unknown or lapsed read the same.
    emergencyFindings.push(
      "This organization has no verified 24-hour emergency contact number on file. A number that is missing, unverified or past its re-verification date never goes on a shipping paper, and is never replaced with a placeholder.",
    );
  }
  if (contractRef === "") {
    emergencyFindings.push(
      "No emergency response information reference is on file for this organization.",
    );
  }

  const ruleFindings: string[] = [];
  if (rules.basicDescription === null) {
    ruleFindings.push(
      `No basic-description rule (${BASIC_DESCRIPTION_RULE_KEY}) is on file for this site's jurisdiction on this date.`,
    );
  } else if (basicDescriptionRule === null) {
    ruleFindings.push(
      `The basic-description rule on file (${BASIC_DESCRIPTION_RULE_KEY}) is not in a form this version can read.`,
    );
  }
  if (rules.shipperCertification === null) {
    ruleFindings.push(
      `No shipper certification wording (${SHIPPER_CERTIFICATION_RULE_KEY}) is on file for this site's jurisdiction on this date.`,
    );
  } else if (certificationRule === null) {
    ruleFindings.push(
      `The shipper certification rule on file (${SHIPPER_CERTIFICATION_RULE_KEY}) is not in a form this version can read.`,
    );
  }

  const classificationFindings = records
    .map(classificationFinding)
    .filter((finding): finding is string => finding !== null);

  const items: PreconditionItem[] = [
    item(
      "contents",
      ["5.1"],
      records.length === 0 ? ["This shipment holds no batteries."] : [],
      HANDLER_OR_ADMIN,
    ),
    item(
      "identification",
      ["5.3"],
      identificationFindings(records),
      HANDLER_OR_ADMIN,
    ),
    item("classification", ["5.3"], classificationFindings, HANDLER_OR_ADMIN),
    item(
      "transport_mode",
      ["5.3", "6.7"],
      modeFindings(shipment.transportMode, air),
      HANDLER_OR_ADMIN,
    ),
    item(
      "emergency_contact",
      ["5.3", "5.6", "5.7"],
      emergencyFindings,
      MANAGER_OR_ADMIN,
    ),
    item(
      "destination_and_carrier",
      ["5.3", "5.16"],
      destinationFindings(shipment),
      HANDLER_OR_ADMIN,
    ),
    item("shipping_identifiers", ["5.9"], identityFindings, ADMIN_ONLY),
    item("quantity", ["5.8"], quantityFindings(records), HANDLER_OR_ADMIN),
    item(
      "container_labels",
      ["4.19", "4.22"],
      labelFindings(containers),
      HANDLER_OR_ADMIN,
    ),
    item("rule_data", ["1.23", "5.5", "5.8"], ruleFindings, ADMIN_ONLY),
  ];
  const unmet = items.filter((entry) => !entry.met).map((entry) => entry.id);
  const checklist: ShippingPaperChecklist = {
    items,
    unmet,
    isComplete: unmet.length === 0,
  };

  const fullyRegulated = records
    .filter((record) => wasteClassificationOf(record) === "fully_regulated")
    .map((record) => record.recordNumber)
    .sort((a, b) => a.localeCompare(b));
  const manifestObligation = {
    required: fullyRegulated.length > 0,
    recordNumbers: fullyRegulated,
  };
  const ddrRecordNumbers = records
    .filter(
      (record) => record.ddrFlags.length > 0 || record.isAirTransportProhibited,
    )
    .map((record) => record.recordNumber)
    .sort((a, b) => a.localeCompare(b));

  const draft: ShippingPaperDraft = {
    shipmentNumber: shipment.shipmentNumber,
    transportMode: shipment.transportMode,
    destinationFacilityName: shipment.destinationFacilityName,
    carrierName: shipment.carrierName,
    lines,
    recordsWithoutLine: withoutLine.sort((a, b) => a.localeCompare(b)),
    emergencyResponse: {
      phone: verification.isInForce ? input.emergencyContact.phone : null,
      contractRef: contractRef === "" ? null : contractRef,
    },
    shipperCertification: certificationRule?.statement ?? null,
    packagingException,
    manifestObligation,
    ddrRecordNumbers,
  };

  if (!checklist.isComplete) {
    return { kind: "incomplete", checklist, draft, air };
  }

  // Every precondition is met, so every value below is present. The checks
  // are the type system's, and a failure here is a builder defect, not a
  // state a person can be in.
  const phone = input.emergencyContact.phone;
  if (
    rules.basicDescription === null ||
    rules.shipperCertification === null ||
    certificationRule === null ||
    phone === null ||
    verification.verifiedAt === null ||
    verification.lapsesAt === null ||
    shipment.originAddress === null ||
    shipment.destinationAddress === null ||
    shipment.destinationFacilityName === null ||
    shipment.carrierName === null
  ) {
    throw new Error(
      "A complete checklist reached the payload with a missing value. buildShippingPaperPayload is inconsistent.",
    );
  }
  const issuedLines: ShippingPaperLine[] = lines.map((line) => {
    if (line.totalMassKg === null || line.totalQuantityDescription === null) {
      throw new Error(
        "A complete checklist reached the payload with an unknown line mass.",
      );
    }
    return {
      ...line,
      totalMassKg: line.totalMassKg,
      totalQuantityDescription: line.totalQuantityDescription,
    };
  });

  const payload: ShippingPaperPayload = {
    shipmentNumber: shipment.shipmentNumber,
    transportMode: shipment.transportMode,
    origin: address(shipment.originAddress),
    destination: {
      facilityName: shipment.destinationFacilityName.trim(),
      address: address(shipment.destinationAddress),
      identifier: shipment.destinationIdentifier,
    },
    carrier: {
      name: shipment.carrierName.trim(),
      identifier: shipment.transporterIdentifier,
    },
    lines: issuedLines,
    emergencyResponse: {
      phone,
      contractRef,
      guideNumber: null,
      verifiedAt: verification.verifiedAt,
      lapsesAt: verification.lapsesAt,
    },
    shipperCertification: certificationRule.statement,
    packagingException,
    manifestObligation,
    ddrRecordNumbers,
    recordIds: records.map((record) => record.recordId).sort(),
    containerIds: containers.map((container) => container.id).sort(),
  };

  const lineCount = issuedLines.length;
  const reasoning =
    `Shipping paper for ${shipment.shipmentNumber}: ${lineCount} ${lineCount === 1 ? "line" : "lines"} described in the sequence the governing rule version carries, ` +
    "with the organization's verified 24-hour emergency contact number and the shipper certification the rule version carries. " +
    "No packaging exception was applied." +
    (manifestObligation.required
      ? ` ${fullyRegulated.length} ${fullyRegulated.length === 1 ? "record is" : "records are"} classified fully regulated; ` +
        "the hazardous waste manifest is not produced by BMMP and remains outstanding."
      : "");

  const ruleVersionsApplied = [
    appliedVersion(
      rules.basicDescription,
      { lineCount },
      "basic_description_sequence",
    ),
    appliedVersion(rules.shipperCertification, {}, "shipper_certification"),
    ...(rules.packagingException === null
      ? []
      : [
          appliedVersion(
            rules.packagingException,
            { transportMode: shipment.transportMode },
            packagingException.basis,
          ),
        ]),
  ];

  return {
    kind: "complete",
    checklist,
    draft,
    air,
    outcome: ruleOutcome({
      result: payload,
      reasoning,
      ruleVersionsApplied,
      inputsSnapshot: {
        shipmentNumber: shipment.shipmentNumber,
        transportMode: shipment.transportMode,
        recordIds: payload.recordIds,
        containerIds: payload.containerIds,
        emergencyVerifiedAt: verification.verifiedAt,
      },
      context: BASIC_DESCRIPTION_RULE_KEY,
    }),
  };
}

/**
 * T-28 — **`ready` is derived, never set by hand**: the state of Rule 5.3's
 * precondition set, recomputed on every write. A shipment with documents
 * issued or departed is past both.
 */
export function preDocumentStatus(
  checklist: ShippingPaperChecklist,
): "draft" | "ready" {
  return checklist.isComplete ? "ready" : "draft";
}
