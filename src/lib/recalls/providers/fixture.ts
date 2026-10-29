import { normalizePartNumber } from "@/domain/catalog/match";

import {
  RecallProviderError,
  type RecallHit,
  type RecallProvider,
  type RecallQuery,
} from "../provider";

/**
 * The fixture recall source — the CI and `DATA_ADAPTER=mock` default
 * (`TECHNICAL_SPEC.md` §12.3; D-73 #6).
 *
 * A small, fixed set of recalls shaped like what the two real sources
 * publish, keyed on part number or make and model, so every check is
 * deterministic, offline and free. It answers a query the way the sources
 * do — the consumer source by maker or product model, the vehicle source by
 * make, model and model year, every component — and leaves deciding what is a
 * candidate to the domain, which is why the set carries hits that must
 * **not** become candidates:
 *
 * - a Ridgeline recall for a model no record carries (a maker agreeing on its
 *   own is never a candidate, Rule 10.12);
 * - a Corvane recall for seat belts on the same vehicle (the component must
 *   name the propulsion or traction battery).
 *
 * **One key always answers "source unavailable"**: any query whose maker or
 * make is `Kestrel`. It is how a failed check is exercised end to end — the
 * run is recorded as failed and the record reads "Not checked — source
 * unavailable", never "no match" (Rule 10.17).
 *
 * No title here says "risk of fire" or puts a chance on anything (Rule 10.3).
 * The real sources' wording arrives with unit 19 and is reported there.
 */

export const FIXTURE_RECALL_PROVIDER_CODE = "fixture";

/** The make or maker that always fails, normalized. */
export const FIXTURE_UNAVAILABLE_KEY = "KESTREL";

export const FIXTURE_RECALLS: readonly RecallHit[] = [
  {
    source: "consumer_product_agency",
    providerRecordId: "fixture-consumer-26-041",
    recallNumber: "26-041",
    title:
      "Ridgeline Mobility Recalls RM-24V50 Scooter Battery Packs Due to Overheating Connectors",
    url: "https://recalls.example/consumer/26-041",
    publishedOn: "2026-09-17",
    remedy: "Replace",
    summary:
      "An internal connector in the battery pack can overheat. Stop using the pack and contact Ridgeline for a free replacement.",
    makers: ["Ridgeline Mobility, LLC"],
    models: ["RM-24V50-AGM", "RM-24V50"],
    modelYear: null,
    component: null,
  },
  {
    source: "consumer_product_agency",
    providerRecordId: "fixture-consumer-26-087",
    recallNumber: "26-087",
    title: "Ridgeline Mobility Recalls RM-12V35 Wheelchair Battery Packs",
    url: "https://recalls.example/consumer/26-087",
    publishedOn: "2026-10-02",
    remedy: "Replace",
    summary: "The pack's case can crack at the terminal post.",
    makers: ["Ridgeline Mobility"],
    models: ["RM-12V35-AGM"],
    modelYear: null,
    component: null,
  },
  {
    source: "consumer_product_agency",
    providerRecordId: "fixture-consumer-26-112",
    recallNumber: "26-112",
    title: "Ridgeline Rover 6 Mobility Scooters Recalled",
    url: "https://recalls.example/consumer/26-112",
    publishedOn: "2026-10-09",
    remedy: "Repair",
    summary: "The scooter's battery tray can loosen and chafe the cables.",
    makers: ["Ridgeline"],
    models: ["Rover 6"],
    modelYear: null,
    component: null,
  },
  {
    source: "vehicle_safety_agency",
    providerRecordId: "fixture-vehicle-26V-118",
    recallNumber: "26V-118",
    title: "Corvane Ion LX high-voltage battery module",
    url: "https://recalls.example/vehicle/26V-118",
    publishedOn: "2026-08-21",
    remedy: "Dealers will replace the affected battery module, free of charge.",
    summary:
      "A cell module in the high-voltage battery may lose propulsion power while driving.",
    makers: ["CORVANE"],
    models: ["ION LX"],
    modelYear: 2022,
    component: "ELECTRICAL SYSTEM: PROPULSION SYSTEM: TRACTION BATTERY",
  },
  {
    source: "vehicle_safety_agency",
    providerRecordId: "fixture-vehicle-26V-131",
    recallNumber: "26V-131",
    title: "Corvane Ion LX front seat belt retractors",
    url: "https://recalls.example/vehicle/26V-131",
    publishedOn: "2026-09-04",
    remedy: "Dealers will replace the retractors, free of charge.",
    summary: "A front seat belt retractor may not lock.",
    makers: ["CORVANE"],
    models: ["ION LX"],
    modelYear: 2022,
    component: "SEAT BELTS: FRONT: RETRACTORS",
  },
];

function overlaps(a: string, b: string): boolean {
  return a !== "" && b !== "" && (a.startsWith(b) || b.startsWith(a));
}

function consumerHits(
  query: Extract<RecallQuery, { source: "consumer_product_agency" }>,
): RecallHit[] {
  const makers = query.makers.map(normalizePartNumber);
  const models = query.models.map(normalizePartNumber);
  return FIXTURE_RECALLS.filter(
    (hit) =>
      hit.source === "consumer_product_agency" &&
      (hit.makers.some((maker) =>
        makers.some((ours) => overlaps(normalizePartNumber(maker), ours)),
      ) ||
        hit.models.some((model) =>
          models.includes(normalizePartNumber(model)),
        )),
  );
}

function vehicleHits(
  query: Extract<RecallQuery, { source: "vehicle_safety_agency" }>,
): RecallHit[] {
  const make = normalizePartNumber(query.make);
  const model = normalizePartNumber(query.model);
  return FIXTURE_RECALLS.filter(
    (hit) =>
      hit.source === "vehicle_safety_agency" &&
      hit.modelYear === query.modelYear &&
      hit.makers.some((maker) => normalizePartNumber(maker) === make) &&
      hit.models.some((name) => normalizePartNumber(name) === model),
  );
}

function asksForUnavailableKey(query: RecallQuery): boolean {
  const names =
    query.source === "vehicle_safety_agency" ? [query.make] : query.makers;
  return names.some((name) =>
    normalizePartNumber(name).startsWith(FIXTURE_UNAVAILABLE_KEY),
  );
}

export const fixtureRecallProvider: RecallProvider = {
  code: FIXTURE_RECALL_PROVIDER_CODE,
  search(query) {
    if (asksForUnavailableKey(query)) {
      return Promise.reject(
        new RecallProviderError(
          "source_unavailable",
          "The recall source did not answer.",
        ),
      );
    }
    return Promise.resolve(
      query.source === "vehicle_safety_agency"
        ? vehicleHits(query)
        : consumerHits(query),
    );
  },
};
