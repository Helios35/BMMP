import {
  recallIdentitiesForRecord,
  type RecallCatalogNames,
  type RecallRecordNames,
} from "@/domain/recalls/identity";
import { recallStanding, type StandingRun } from "@/domain/recalls/standing";
import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";
import type { ContainerStatus } from "@/domain/taxonomy/container-status";
import {
  HAZARD_FACTOR_CODE_LABELS,
  type HazardFactorCode,
} from "@/domain/taxonomy/hazard-factor-code";
import type { HazardRankingBand } from "@/domain/taxonomy/hazard-ranking-band";
import type { HazardRankingScope } from "@/domain/taxonomy/hazard-ranking-scope";
import type { LotStatus } from "@/domain/taxonomy/lot-status";
import type { RecallMatchStatus } from "@/domain/taxonomy/recall-match-status";
import type { IsoTimestamp, TimeZone, Uuid } from "@/types/common";

import {
  rankItems,
  type HazardRankingWhy,
  type RankableItem,
  type RankedItem,
} from "./order";
import {
  batteryReadings,
  groupReadings,
  type FactorReading,
  type GroupMember,
  type RankingAssessmentInput,
  type RankingBatteryInput,
  type ReadingContext,
} from "./readings";
import type { HazardRankingScheme } from "./scheme";
import { basisInstant } from "./words";

/**
 * One ranking run over one organization — Rules 10.19–10.26; D-77.
 *
 * **Three sets, each of its own kind** (Rule 10.19): the organization's held
 * batteries, held containers and held lots. A container takes each battery
 * factor at its batteries' highest level and adds storage aggregation; a lot
 * does the same over its containers' batteries (Rule 10.22). An empty
 * container or lot is not compared and gets no row — a ranking row needs at
 * least one factor (T-33, T-34) — and reads "Not ranked" where it is shown.
 *
 * Pure: the rows a run would write, computed from what the adapter read. The
 * adapter writes them, marks the previous rows not current and writes one
 * `audit_event` (Rule 10.26).
 */

/** T-22 — the held batteries (Rule 10.19, the Rule 10.10 list). */
export const HELD_BATTERY_STATUSES: readonly BatteryRecordStatus[] = [
  "confirmed",
  "classified",
  "reclassifying",
  "stored",
  "quarantined",
  "staged",
];

/** T-24 — the held containers (Rule 10.19). */
export const HELD_CONTAINER_STATUSES: readonly ContainerStatus[] = [
  "open",
  "full",
  "overdue",
  "closed",
  "staged",
];

/** T-25 — the held lots (Rule 10.19). */
export const HELD_LOT_STATUSES: readonly LotStatus[] = [
  "open",
  "closed",
  "allocated",
];

/**
 * What a ranking was computed against. One value until sites are an entity;
 * then the set becomes the site's held inventory (Rule 10.19).
 */
export const COMPARISON_SETS = ["organization_held"] as const;
export type ComparisonSet = (typeof COMPARISON_SETS)[number];

export interface RankingCatalogInput extends RecallCatalogNames {
  readonly id: Uuid;
}

export interface RankingRecordInput
  extends RankingBatteryInput, RecallRecordNames {}

export interface RankingRecallMatchInput {
  readonly id: Uuid;
  readonly batteryRecordId: Uuid;
  readonly status: RecallMatchStatus;
}

export interface RankingRecallRunInput extends StandingRun {
  readonly batteryRecordId: Uuid;
}

export interface RankingContainerInput {
  readonly id: Uuid;
  readonly containerCode: string;
  readonly status: string;
  readonly lotId: Uuid | null;
}

export interface RankingLotInput {
  readonly id: Uuid;
  readonly lotCode: string;
  readonly status: string;
}

/** Everything one organization's run reads — the adapter fetches it; this module decides. */
export interface HazardRankingInputs {
  readonly organizationName: string;
  readonly timeZone: TimeZone;
  readonly batteries: readonly RankingRecordInput[];
  readonly catalogEntries: readonly RankingCatalogInput[];
  readonly damageAssessments: readonly RankingAssessmentInput[];
  readonly recallMatches: readonly RankingRecallMatchInput[];
  readonly recallCheckRuns: readonly RankingRecallRunInput[];
  readonly containers: readonly RankingContainerInput[];
  readonly lots: readonly RankingLotInput[];
  /** Display names for the people the bases name — assessors and confirmers. */
  readonly people: readonly { readonly id: Uuid; readonly name: string }[];
}

/** One factor as a row stores it — `{ code, order, level, value, basis }`. `order` is not a weight. */
export interface HazardRankingFactorEntry {
  readonly code: HazardFactorCode;
  /** The factor's place in the scheme's order, from 1. */
  readonly order: number;
  /** The scheme level, or `not_recorded`. */
  readonly level: string;
  /** The level's label as it read at the as-of time. */
  readonly value: string;
  readonly basis: string;
}

/** One row a run writes. */
export interface HazardRankingDraft {
  readonly scopeType: HazardRankingScope;
  readonly itemId: Uuid;
  readonly itemLabel: string;
  readonly rankPosition: number;
  readonly rankedSetSize: number;
  readonly levelWithCount: number;
  readonly band: HazardRankingBand;
  readonly basisStatement: string;
  readonly factorCodes: readonly HazardFactorCode[];
  readonly factors: readonly HazardRankingFactorEntry[];
  readonly why: HazardRankingWhy;
  readonly comparisonSet: ComparisonSet;
  /** What the ranking read, so a later change reads "Changed since" (Rule 10.24). */
  readonly inputsSignature: string;
}

export interface HazardRankingComputation {
  readonly schemeVersion: string;
  readonly computedAt: IsoTimestamp;
  readonly rows: readonly HazardRankingDraft[];
  readonly counts: Readonly<Record<HazardRankingScope, number>>;
}

/** An item as it stands now — what "Changed since" and "Not ranked yet" are read against. */
export interface CurrentItemState {
  readonly isHeld: boolean;
  /** A held container or lot holding no held battery. */
  readonly isEmpty: boolean;
  /** `null` for an item that would not be ranked. */
  readonly inputsSignature: string | null;
}

interface ReadItem {
  readonly rankable: RankableItem;
  readonly inputsSignature: string;
}

interface ReadSets {
  readonly batteries: readonly ReadItem[];
  readonly containers: readonly ReadItem[];
  readonly lots: readonly ReadItem[];
  /** Keyed `<scope>:<id>`, every battery, container and lot in the inputs. */
  readonly states: ReadonlyMap<string, CurrentItemState>;
}

function signatureOf(
  scheme: HazardRankingScheme,
  readings: readonly FactorReading[],
): string {
  return [
    scheme.schemeVersion,
    ...readings.map((reading) => `${reading.code}=${reading.inputRef}`),
  ].join("|");
}

export function itemKey(scope: HazardRankingScope, id: Uuid): string {
  return `${scope}:${id}`;
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    grouped.set(k, [...(grouped.get(k) ?? []), row]);
  }
  return grouped;
}

/** Read every item's factors once — the run ranks them; "Changed since" compares them. */
function readSets(
  inputs: HazardRankingInputs,
  scheme: HazardRankingScheme,
  asOf: IsoTimestamp,
): ReadSets {
  const ctx: ReadingContext = {
    asOf,
    timeZone: inputs.timeZone,
    names: new Map(inputs.people.map((person) => [person.id, person.name])),
  };
  const catalog = new Map(
    inputs.catalogEntries.map((entry) => [entry.id, entry]),
  );
  const assessmentsBy = groupBy(
    inputs.damageAssessments,
    (row) => row.batteryRecordId,
  );
  const matchesBy = groupBy(inputs.recallMatches, (row) => row.batteryRecordId);
  const runsBy = groupBy(inputs.recallCheckRuns, (row) => row.batteryRecordId);
  const states = new Map<string, CurrentItemState>();

  const batteryOrder = scheme.factorOrder.battery_record;
  const heldBatteries = inputs.batteries.filter((battery) =>
    (HELD_BATTERY_STATUSES as readonly string[]).includes(battery.status),
  );
  const readingsById = new Map<
    Uuid,
    ReadonlyMap<HazardFactorCode, FactorReading>
  >();
  const batteries: ReadItem[] = heldBatteries.map((battery) => {
    const matches = matchesBy.get(battery.id) ?? [];
    const entry =
      battery.catalogEntryId === null
        ? null
        : (catalog.get(battery.catalogEntryId) ?? null);
    const standing = recallStanding({
      matches,
      runs: runsBy.get(battery.id) ?? [],
      identities: recallIdentitiesForRecord(battery, entry).map(
        (identity) => identity.kind,
      ),
    });
    const readings = batteryReadings(
      {
        battery,
        assessments: assessmentsBy.get(battery.id) ?? [],
        standing,
        recallMatchRefs: matches.map((match) => `${match.id}:${match.status}`),
      },
      batteryOrder,
      scheme,
      ctx,
    );
    readingsById.set(
      battery.id,
      new Map(readings.map((reading) => [reading.code, reading])),
    );
    return {
      rankable: { id: battery.id, label: battery.recordNumber, readings },
      inputsSignature: signatureOf(scheme, readings),
    };
  });
  for (const battery of inputs.batteries) {
    const read = batteries.find((item) => item.rankable.id === battery.id);
    states.set(itemKey("battery_record", battery.id), {
      isHeld: read !== undefined,
      isEmpty: false,
      inputsSignature: read?.inputsSignature ?? null,
    });
  }

  const membersOf = (containerIds: readonly Uuid[]): GroupMember[] =>
    heldBatteries
      .filter(
        (battery) =>
          battery.containerId !== null &&
          containerIds.includes(battery.containerId),
      )
      .map((battery) => ({
        id: battery.id,
        label: battery.recordNumber,
        ratedEnergyWh: battery.ratedEnergyWh,
        readings: readingsById.get(battery.id) ?? new Map(),
      }));

  const group = (
    scope: "container" | "lot",
    id: Uuid,
    label: string,
    isHeld: boolean,
    containerIds: readonly Uuid[],
  ): ReadItem | null => {
    const members = isHeld ? membersOf(containerIds) : [];
    if (!isHeld || members.length === 0) {
      states.set(itemKey(scope, id), {
        isHeld,
        isEmpty: isHeld,
        inputsSignature: null,
      });
      return null;
    }
    const readings = groupReadings(members, scheme.factorOrder[scope], scheme);
    const inputsSignature = signatureOf(scheme, readings);
    states.set(itemKey(scope, id), { isHeld, isEmpty: false, inputsSignature });
    return { rankable: { id, label, readings }, inputsSignature };
  };

  const containers = inputs.containers
    .map((container) =>
      group(
        "container",
        container.id,
        container.containerCode,
        (HELD_CONTAINER_STATUSES as readonly string[]).includes(
          container.status,
        ),
        [container.id],
      ),
    )
    .filter((item): item is ReadItem => item !== null);

  const lots = inputs.lots
    .map((lot) =>
      group(
        "lot",
        lot.id,
        lot.lotCode,
        (HELD_LOT_STATUSES as readonly string[]).includes(lot.status),
        inputs.containers
          .filter((container) => container.lotId === lot.id)
          .map((container) => container.id),
      ),
    )
    .filter((item): item is ReadItem => item !== null);

  return { batteries, containers, lots, states };
}

const SET_NOUNS: Readonly<
  Record<HazardRankingScope, { readonly one: string; readonly many: string }>
> = {
  battery_record: { one: "held battery", many: "held batteries" },
  container: {
    one: "held container holding batteries",
    many: "held containers holding batteries",
  },
  lot: {
    one: "held lot holding batteries",
    many: "held lots holding batteries",
  },
};

/** "17 held batteries at Cascade Auto Recyclers" — the set, its size and its owner (T-33). */
export function comparisonSetText(input: {
  readonly scopeType: HazardRankingScope;
  readonly setSize: number;
  readonly organizationName: string;
}): string {
  const noun = SET_NOUNS[input.scopeType];
  return `${input.setSize} ${input.setSize === 1 ? noun.one : noun.many} at ${input.organizationName}`;
}

function basisStatement(
  scope: HazardRankingScope,
  ranked: RankedItem,
  inputs: HazardRankingInputs,
  scheme: HazardRankingScheme,
  asOf: IsoTimestamp,
): string {
  const set = comparisonSetText({
    scopeType: scope,
    setSize: ranked.setSize,
    organizationName: inputs.organizationName,
  });
  const when = basisInstant(asOf, inputs.timeZone);
  const order = scheme.factorOrder[scope]
    .map((code) => HAZARD_FACTOR_CODE_LABELS[code])
    .join(", ");
  const method = `Compared factor by factor in the order of ranking scheme ${scheme.schemeVersion}: ${order}. The first factor that differs decides which ranks above; nothing is added up. A factor with no recorded evidence ranks level with its highest level.`;
  if (ranked.band === "not_ranked") {
    const why =
      ranked.setSize === 1
        ? `It is the only ${SET_NOUNS[scope].one} at ${inputs.organizationName} as of ${when}, so nothing sets it apart and it is not ranked.`
        : `Every one of the ${set} is level on every factor as of ${when}, so nothing sets one apart and none is ranked.`;
    return `${why} ${method}`;
  }
  return `Ranked against the ${set}, as of ${when}. ${method}`;
}

function draftsFor(
  scope: HazardRankingScope,
  items: readonly ReadItem[],
  inputs: HazardRankingInputs,
  scheme: HazardRankingScheme,
  asOf: IsoTimestamp,
): readonly HazardRankingDraft[] {
  const signatures = new Map(
    items.map((item) => [item.rankable.id, item.inputsSignature]),
  );
  return rankItems(
    items.map((item) => item.rankable),
    scheme.bandCutPoints,
  ).map((ranked) => ({
    scopeType: scope,
    itemId: ranked.item.id,
    itemLabel: ranked.item.label,
    rankPosition: ranked.position,
    rankedSetSize: ranked.setSize,
    levelWithCount: ranked.levelWithCount,
    band: ranked.band,
    basisStatement: basisStatement(scope, ranked, inputs, scheme, asOf),
    factorCodes: ranked.item.readings.map((reading) => reading.code),
    factors: ranked.item.readings.map((reading, index) => ({
      code: reading.code,
      order: index + 1,
      level: reading.level,
      value: reading.label,
      basis: reading.basis,
    })),
    why: ranked.why,
    comparisonSet: "organization_held",
    inputsSignature: signatures.get(ranked.item.id) ?? "",
  }));
}

/** The rows one run writes for one organization, all three kinds at once (Rule 10.24). */
export function computeHazardRanking(
  inputs: HazardRankingInputs,
  scheme: HazardRankingScheme,
  asOf: IsoTimestamp,
): HazardRankingComputation {
  const sets = readSets(inputs, scheme, asOf);
  const batteries = draftsFor(
    "battery_record",
    sets.batteries,
    inputs,
    scheme,
    asOf,
  );
  const containers = draftsFor(
    "container",
    sets.containers,
    inputs,
    scheme,
    asOf,
  );
  const lots = draftsFor("lot", sets.lots, inputs, scheme, asOf);
  return {
    schemeVersion: scheme.schemeVersion,
    computedAt: asOf,
    rows: [...batteries, ...containers, ...lots],
    counts: {
      battery_record: batteries.length,
      container: containers.length,
      lot: lots.length,
    },
  };
}

/** Every item as it stands now, keyed `<scope>:<id>` ({@link itemKey}). */
export function currentItemStates(
  inputs: HazardRankingInputs,
  scheme: HazardRankingScheme,
  asOf: IsoTimestamp,
): ReadonlyMap<string, CurrentItemState> {
  return readSets(inputs, scheme, asOf).states;
}
