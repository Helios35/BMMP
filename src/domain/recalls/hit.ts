import type { RecallSource } from "@/domain/taxonomy/recall-source";
import type { IsoDate } from "@/types/common";

/**
 * What a recall source is asked and what it answers — `TECHNICAL_SPEC.md`
 * §12.3; Rules 10.11, 10.12.
 *
 * **One normalized shape for both sources**, so matching is written once and
 * the source behind the seam can change without touching it. It carries
 * everything the two real sources return that a match needs or a person
 * reads (unit 19 maps them):
 *
 * - the consumer source (the CPSC Recalls web service): `RecallNumber`,
 *   `RecallDate`, `Title`, `URL`, `Products[].Model`, `Manufacturers[].Name`,
 *   `Remedies[].Name`;
 * - the vehicle source (NHTSA `recallsByVehicle`, by make, model and model
 *   year): campaign number, component, summary, remedy, report date.
 *
 * Nothing here is a score. A hit is what the source published; whether it is
 * a candidate is `candidateFor`'s question, and a candidate is only ever a
 * possible match (Rule 10.13).
 */

/** The two T-36 sources a check queries. The other two are entered by a person. */
export const RECALL_SEARCH_SOURCES = [
  "consumer_product_agency",
  "vehicle_safety_agency",
] as const satisfies readonly RecallSource[];

export type RecallSearchSource = (typeof RECALL_SEARCH_SOURCES)[number];

/** The two T-36 sources a person records a recall from (Rule 10.15). */
export const RECALL_RECORDING_SOURCES = [
  "manufacturer_notice",
  "manual_entry",
] as const satisfies readonly RecallSource[];

export type RecallRecordingSource = (typeof RECALL_RECORDING_SOURCES)[number];

export type RecallQuery =
  | {
      readonly source: "consumer_product_agency";
      /** The maker names the record carries — manufacturer, brand or device make. */
      readonly makers: readonly string[];
      /** The model names and part numbers the record carries. */
      readonly models: readonly string[];
    }
  | {
      readonly source: "vehicle_safety_agency";
      readonly make: string;
      readonly model: string;
      readonly modelYear: number;
    };

export interface RecallHit {
  readonly source: RecallSearchSource;
  /** The source's own identifier for the recall — one match row per record, source and this. */
  readonly providerRecordId: string;
  /** As the source prints it — a CPSC recall number or an NHTSA campaign number. */
  readonly recallNumber: string;
  readonly title: string | null;
  readonly url: string | null;
  readonly publishedOn: IsoDate | null;
  readonly remedy: string | null;
  readonly summary: string | null;
  /** Consumer: every `Manufacturers[].Name`. Vehicle: the make. */
  readonly makers: readonly string[];
  /** Consumer: every `Products[].Model`. Vehicle: the model. */
  readonly models: readonly string[];
  /** Vehicle only. */
  readonly modelYear: number | null;
  /** Vehicle only — the recall's component, as the source words it. */
  readonly component: string | null;
}
