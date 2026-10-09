import {
  PACKING_GROUP_LABELS,
  type PackingGroup,
} from "@/domain/taxonomy/packing-group";
import {
  UN_TRANSPORT_IDENTIFIER_LABELS,
  type UnTransportIdentifier,
} from "@/domain/taxonomy/un-transport-identifier";

import type { BasicDescriptionField } from "./rule-data";

/**
 * The basic description of one shipping paper line — `BUSINESS_RULES.md`
 * Rules 5.8, 5.9; T-17, T-19; `ERD.md` §7.3.
 *
 * **The sequence is the rule version's**, handed in; this function only
 * fills it. The identifiers come from the matched catalog entry and are never
 * typed by a handler (Rule 5.9). Display forms are the taxonomy's labels —
 * `UN3480`, never `un3480` (T-17's fixed casing), and the packing group by
 * T-19's label — and a line with no packing group prints none rather than
 * the words "not applicable".
 */

export interface LineIdentity {
  /** Never `not_assigned` — a line with an unassigned identifier is not a line (T-17). */
  readonly unIdentifier: Exclude<UnTransportIdentifier, "not_assigned">;
  readonly properShippingName: string;
  readonly hazardClass: string;
  readonly packingGroup: PackingGroup;
}

function fieldText(
  field: BasicDescriptionField,
  identity: LineIdentity,
): string | null {
  switch (field) {
    case "un_identifier":
      return UN_TRANSPORT_IDENTIFIER_LABELS[identity.unIdentifier];
    case "proper_shipping_name":
      return identity.properShippingName;
    case "hazard_class":
      return identity.hazardClass;
    case "packing_group":
      return identity.packingGroup === "not_applicable"
        ? null
        : PACKING_GROUP_LABELS[identity.packingGroup];
  }
}

export function buildBasicDescription(
  identity: LineIdentity,
  sequence: readonly BasicDescriptionField[],
): string {
  return sequence
    .map((field) => fieldText(field, identity))
    .filter((text): text is string => text !== null)
    .join(", ");
}
