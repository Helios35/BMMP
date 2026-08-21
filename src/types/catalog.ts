import type {
  Attributed,
  Decimal,
  IsoTimestamp,
  JsonValue,
  Timestamped,
  Uuid,
} from "@/types/common";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import type { CatalogEntryStatus } from "@/domain/taxonomy/catalog-entry-status";
import type { CellFormFactor } from "@/domain/taxonomy/cell-form-factor";
import type { Chemistry } from "@/domain/taxonomy/chemistry";
import type { PackingGroup } from "@/domain/taxonomy/packing-group";
import type { Removability } from "@/domain/taxonomy/removability";
import type { UnTransportIdentifier } from "@/domain/taxonomy/un-transport-identifier";

/**
 * Known battery products — `ERD.md` §5.2.
 *
 * **Platform-owned when `organizationId` is null; tenant-proposed when set.**
 * This is the thing a label read resolves *to*, and it is **where chemistry
 * comes from** — chemistry is matched here and confirmed by a person, never seen
 * in an image (`PRD.md` §6.4, Rules 2.10, 2.18).
 *
 * A catalog entry must describe a small mobility pack as completely as a vehicle
 * module — same fields, same completeness expectations (FR-4.4).
 */
export interface CatalogEntry extends Timestamped, Attributed {
  readonly id: Uuid;
  /** **Null = a global platform entry.** Set = proposed by that tenant. */
  readonly organizationId: Uuid | null;
  readonly manufacturerName: string;
  readonly brandName: string | null;
  readonly modelName: string | null;
  readonly partNumber: string | null;
  /**
   * Generated: upper-cased with separators stripped. **Matching reads this.**
   *
   * Retrieval is the adapter's job and ranking is the domain's
   * (`TECHNICAL_SPEC.md` §11.1 step 4) — one pure scorer means the mock and
   * Supabase adapters produce identical rankings, which is what makes "the same
   * suite passes both ways" a real test.
   */
  readonly partNumberNormalized: string | null;
  readonly gtin: string | null;
  /** T-02. Same value set as `battery_record`. */
  readonly applicationClass: ApplicationClass;
  /**
   * T-05. A product attribute, so it lives here — a statutory input the B1b
   * format engine reads (Rule 8.2).
   */
  readonly removability: Removability;
  /** T-01. What a match proposes; **a human confirms it onto the record** (Rules 2.10, 2.18). */
  readonly chemistry: Chemistry;
  /** T-04. */
  readonly cellFormFactor: CellFormFactor | null;
  /** Numeric agreement inputs for scoring. */
  readonly nominalVoltageV: Decimal | null;
  readonly ratedCapacityAh: Decimal | null;
  readonly ratedEnergyWh: Decimal | null;
  readonly massKg: Decimal | null;
  /** T-17. Transport identity carried onto the shipping paper (Rule 5.9). */
  readonly unIdentifier: UnTransportIdentifier | null;
  readonly properShippingName: string | null;
  readonly hazardClass: string | null;
  /** T-19. */
  readonly packingGroup: PackingGroup;
  readonly un383SummaryUrl: string | null;
  /** Known label phrasings, used as scoring hints. */
  readonly labelTextPatterns: JsonValue | null;
  /** Which deterministic decoder applies. A machine key, not a taxonomy value. */
  readonly dateCodeFormatKey: string | null;
  /**
   * Where the entry came from.
   *
   * T-61 governs this column (D-38), and its module is
   * `src/domain/taxonomy/catalog-entry-source-type`. **The field stays `string`
   * pending a fixture migration** — the fixtures store `manufacturer_datasheet`
   * where T-61 authors `manufacturer_published`. Reported in this unit's
   * build-notes.
   */
  readonly sourceType: string;
  readonly sourceUrl: string | null;
  /** T-07. **Only a published entry is available for intake matching.** */
  readonly status: CatalogEntryStatus;
  /** P6 for global entries. */
  readonly verifiedBy: Uuid | null;
  readonly verifiedAt: IsoTimestamp | null;
}
