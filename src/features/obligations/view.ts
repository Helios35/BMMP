import {
  deadlineAlertTier,
  deadlineStanding,
  DEADLINE_STANDING_LABELS,
  dueWords,
  laterVersionWords,
  MISSING_INPUT_WORDS,
  noRulesOnFile,
  versionWords,
  bandInStateWords,
  type DeadlineStanding,
  type Due,
  type MissingInput,
  type ObligationAlertConfiguration,
} from "@/domain/producer";
import { basisCivilDate } from "@/domain/hazard/words";
import type { RuleVersionCandidate } from "@/domain/rules/resolve";
import {
  APPLICATION_CLASS_LABELS,
  type ApplicationClass,
} from "@/domain/taxonomy/application-class";
import { CHEMISTRY_LABELS, type Chemistry } from "@/domain/taxonomy/chemistry";
import { DEADLINE_DUE_BASIS_LABELS } from "@/domain/taxonomy/deadline-due-basis";
import type { FormatCategory } from "@/domain/taxonomy/format-category";
import {
  PRODUCER_OBLIGATION_STATUS_LABELS,
  type ProducerObligationStatus,
} from "@/domain/taxonomy/producer-obligation-status";
import {
  REMOVABILITY_LABELS,
  type Removability,
} from "@/domain/taxonomy/removability";
import type { IsoDate, JsonObject, JsonValue, Uuid } from "@/types/common";
import type { CatalogEntry } from "@/types/catalog";
import type {
  ObligationDeadline,
  ProducerObligation,
  ProducerProduct,
} from "@/types/producer";
import type { Jurisdiction } from "@/types/rules-as-data";

/**
 * The obligations page's read model — `UX_SPEC.md` §3.21; Rule 8.14.
 *
 * **Every band, status and date here was decided by a run and stored**
 * (`producer_obligation.applies_because`, D-78 #4); this only arranges the
 * stored rows for reading. Overdue is read from the date (T-69), never
 * stored; the colour follows `UX_SPEC.md` §3.21 — overdue `critical`, inside
 * the first configured offset `attention`, the rest neutral.
 */

export type DeadlineIntent = "critical" | "attention" | "neutral";

export interface StateLabel {
  readonly jurisdictionId: Uuid;
  readonly code: string;
  readonly name: string;
  /** The row's own ISO 3166-2 subdivision code, or its name — never a slice of `code` (T-40). */
  readonly short: string;
}

export interface DeadlineView {
  readonly id: Uuid;
  readonly obligationId: Uuid;
  readonly dueOn: IsoDate;
  readonly dueWords: string;
  readonly basisLabel: string;
  readonly state: StateLabel;
  readonly duty: string;
  readonly citation: string;
  readonly obligationStatus: ProducerObligationStatus;
  readonly standing: DeadlineStanding;
  readonly standingLabel: string;
  readonly intent: DeadlineIntent;
  readonly completedOn: IsoDate | null;
  readonly completionNote: string | null;
  readonly completionReference: string | null;
  readonly completedBy: Uuid | null;
  readonly completedAt: string | null;
  readonly versionLabel: string;
}

export interface ObligationProductView {
  readonly label: string;
  readonly bandWords: string;
  readonly truth: string;
  readonly missing: readonly string[];
}

export interface ObligationView {
  readonly id: Uuid;
  readonly key: string;
  readonly duty: string;
  readonly citation: string;
  readonly status: ProducerObligationStatus;
  readonly statusLabel: string;
  readonly reasoning: string;
  readonly products: readonly ObligationProductView[];
  /** The due rule as the law states it: a date, a yearly date, or "No date yet — <event>". */
  readonly dueWords: string;
  readonly noDateYet: boolean;
  readonly deadlines: readonly DeadlineView[];
}

export interface StateView {
  readonly state: StateLabel;
  readonly onFile: boolean;
  /** "No producer rules on file for <state>. This doesn't mean none apply." */
  readonly noRulesWords: string | null;
  readonly law: string | null;
  readonly lawUrl: string | null;
  readonly agency: string | null;
  readonly obligationsVersionWords: string | null;
  readonly coverageVersionWords: string | null;
  readonly laterVersions: readonly string[];
  readonly counts: {
    readonly applies: number;
    readonly notApplicable: number;
    readonly undetermined: number;
  };
  readonly resultWords: string;
  readonly nextDeadline: DeadlineView | null;
  readonly obligations: readonly ObligationView[];
  readonly stewardshipOrganizations: readonly string[];
  readonly notChecked: readonly string[];
  readonly products: readonly string[];
}

export interface ProductStateView {
  readonly state: StateLabel;
  readonly band: FormatCategory | null;
  /** "Medium format battery in WA", "Not covered in DC", "No producer rules on file for Florida…". */
  readonly words: string;
}

export interface ProductView {
  readonly id: Uuid;
  readonly catalogEntryId: Uuid;
  readonly label: string;
  readonly chemistry: string;
  readonly massKg: string | null;
  readonly energyWh: string | null;
  readonly removability: string;
  readonly applicationClass: string;
  readonly states: readonly ProductStateView[];
  readonly stateIds: readonly Uuid[];
  /** The catalog values a rule needed and could not read — P6 fixes them. */
  readonly missingValues: readonly string[];
}

// --- reading stored JSON --------------------------------------------------------------------

function textOf(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectOf(value: JsonValue | undefined): JsonObject | null {
  return isObject(value) ? value : null;
}

function listOf(value: JsonValue | undefined): readonly JsonValue[] {
  return Array.isArray(value) ? value : [];
}

/** The due rule an obligation row stored, or `null` if it cannot be read. */
export function storedDue(row: ProducerObligation): Due | null {
  const due = objectOf(row.appliesBecause.due);
  if (due === null) return null;
  if (due.kind === "statutory_date" && typeof due.on === "string") {
    return { kind: "statutory_date", on: due.on };
  }
  if (
    due.kind === "annual" &&
    typeof due.month === "number" &&
    typeof due.day === "number" &&
    typeof due.firstOn === "string"
  ) {
    return {
      kind: "annual",
      month: due.month,
      day: due.day,
      firstOn: due.firstOn,
    };
  }
  if (due.kind === "no_date" && typeof due.event === "string") {
    return { kind: "no_date", event: due.event };
  }
  return null;
}

interface StoredProduct {
  readonly productId: string;
  readonly label: string;
  readonly band: FormatCategory | null;
  readonly bandWords: string;
  readonly truth: string;
  readonly missing: readonly MissingInput[];
}

function storedProducts(row: ProducerObligation): readonly StoredProduct[] {
  return listOf(row.appliesBecause.products).flatMap((value) => {
    const product = objectOf(value);
    if (product === null) return [];
    const missing = listOf(product.missing).filter(
      (input): input is MissingInput =>
        typeof input === "string" && input in MISSING_INPUT_WORDS,
    );
    return [
      {
        productId: textOf(product.productId) ?? "",
        label: textOf(product.label) ?? "",
        band: (textOf(product.band) as FormatCategory | null) ?? null,
        bandWords: textOf(product.bandWords) ?? "",
        truth: textOf(product.truth) ?? "",
        missing,
      },
    ];
  });
}

function versionWordsOf(value: JsonValue | undefined): string | null {
  const version = objectOf(value);
  if (version === null) return null;
  const label = textOf(version.versionLabel);
  const effectiveOn = textOf(version.effectiveOn);
  return label === null || effectiveOn === null
    ? null
    : versionWords({ versionLabel: label, effectiveOn });
}

// --- building ------------------------------------------------------------------------------

export function stateLabel(row: Jurisdiction): StateLabel {
  return {
    jurisdictionId: row.id,
    code: row.code,
    name: row.name,
    short: row.subdivisionCode ?? row.name,
  };
}

function intentFor(
  standing: DeadlineStanding,
  dueOn: IsoDate,
  today: IsoDate,
  configuration: ObligationAlertConfiguration,
): DeadlineIntent {
  if (standing === "overdue") return "critical";
  if (standing !== "open") return "neutral";
  const farthest = configuration.daysBefore[0];
  if (farthest === undefined) return "neutral";
  const tier = deadlineAlertTier(dueOn, today, {
    ...configuration,
    daysBefore: [farthest],
  });
  return tier === null ? "neutral" : "attention";
}

export function deadlineView(input: {
  readonly deadline: ObligationDeadline;
  readonly obligation: ProducerObligation;
  readonly state: StateLabel;
  readonly today: IsoDate;
  readonly configuration: ObligationAlertConfiguration;
}): DeadlineView {
  const { deadline, obligation, state, today, configuration } = input;
  const standing = deadlineStanding(deadline, today);
  const version = objectOf(obligation.appliesBecause.obligationsVersion);
  return {
    id: deadline.id,
    obligationId: obligation.id,
    dueOn: deadline.dueOn,
    dueWords: basisCivilDate(deadline.dueOn),
    basisLabel: DEADLINE_DUE_BASIS_LABELS[deadline.dueBasis],
    state,
    duty: obligation.obligationTitle,
    citation: deadline.citation,
    obligationStatus: obligation.status,
    standing,
    standingLabel: DEADLINE_STANDING_LABELS[standing],
    intent: intentFor(standing, deadline.dueOn, today, configuration),
    completedOn: deadline.completedOn,
    completionNote: deadline.completionNote,
    completionReference: deadline.completionReference,
    completedBy: deadline.completedBy,
    completedAt: deadline.completedAt,
    versionLabel: textOf(version?.versionLabel) ?? "",
  };
}

export interface ObligationsReadModel {
  readonly deadlines: readonly DeadlineView[];
  readonly states: readonly StateView[];
  readonly products: readonly ProductView[];
}

export function obligationsReadModel(input: {
  readonly today: IsoDate;
  readonly configuration: ObligationAlertConfiguration;
  readonly jurisdictions: readonly Jurisdiction[];
  readonly products: readonly ProducerProduct[];
  readonly catalogEntries: readonly CatalogEntry[];
  /** Current rows only. */
  readonly obligations: readonly ProducerObligation[];
  readonly deadlines: readonly ObligationDeadline[];
  /** Every producer rule version on file — for the versions that take effect later (Rule 8.14). */
  readonly candidates: readonly RuleVersionCandidate[];
}): ObligationsReadModel {
  const states = new Map(
    input.jurisdictions.map((row) => [row.id, stateLabel(row)]),
  );
  const obligationsById = new Map(
    input.obligations.map((row) => [row.id, row]),
  );
  const entries = new Map(input.catalogEntries.map((row) => [row.id, row]));

  const deadlines: DeadlineView[] = input.deadlines
    .flatMap((deadline) => {
      const obligation = obligationsById.get(deadline.producerObligationId);
      const state = obligation && states.get(obligation.jurisdictionId);
      if (obligation === undefined || state === undefined) return [];
      return [
        deadlineView({
          deadline,
          obligation,
          state,
          today: input.today,
          configuration: input.configuration,
        }),
      ];
    })
    .sort(
      (a, b) =>
        a.dueOn.localeCompare(b.dueOn) ||
        a.state.name.localeCompare(b.state.name),
    );

  const soldIn = new Set(
    input.products.flatMap((product) => product.jurisdictionIds),
  );
  const stateViews: StateView[] = [...soldIn]
    .flatMap((id) => {
      const state = states.get(id);
      return state === undefined ? [] : [state];
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((state) =>
      stateView(
        state,
        input,
        deadlines.filter(
          (row) => row.state.jurisdictionId === state.jurisdictionId,
        ),
      ),
    );

  const products: ProductView[] = input.products.flatMap((product) => {
    const entry = entries.get(product.catalogEntryId);
    if (entry === undefined) return [];
    const productStates = product.jurisdictionIds
      .flatMap((id) => {
        const state = states.get(id);
        return state === undefined ? [] : [state];
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((state) =>
        productStateView(product, state, input.obligations, stateViews),
      );
    const missing = new Set<string>();
    for (const row of input.obligations) {
      for (const stored of storedProducts(row)) {
        if (stored.productId !== product.id) continue;
        for (const input of stored.missing) {
          if (input !== "coverage_rule")
            missing.add(MISSING_INPUT_WORDS[input]);
        }
      }
    }
    return [
      {
        id: product.id,
        catalogEntryId: entry.id,
        label: productLabelOf(entry),
        chemistry: CHEMISTRY_LABELS[entry.chemistry as Chemistry],
        massKg: entry.massKg,
        energyWh: entry.ratedEnergyWh,
        removability: REMOVABILITY_LABELS[entry.removability as Removability],
        applicationClass:
          APPLICATION_CLASS_LABELS[entry.applicationClass as ApplicationClass],
        states: productStates,
        stateIds: product.jurisdictionIds,
        missingValues: [...missing].sort(),
      },
    ];
  });

  return { deadlines, states: stateViews, products };
}

function productLabelOf(entry: CatalogEntry): string {
  const maker = entry.brandName ?? entry.manufacturerName;
  return entry.modelName === null ? maker : `${maker} ${entry.modelName}`;
}

function productStateView(
  product: ProducerProduct,
  state: StateLabel,
  obligations: readonly ProducerObligation[],
  stateViews: readonly StateView[],
): ProductStateView {
  const view = stateViews.find(
    (row) => row.state.jurisdictionId === state.jurisdictionId,
  );
  if (view !== undefined && !view.onFile) {
    return { state, band: null, words: noRulesOnFile(state.name) };
  }
  for (const row of obligations) {
    if (row.jurisdictionId !== state.jurisdictionId) continue;
    const stored = storedProducts(row).find(
      (entry) => entry.productId === product.id,
    );
    if (stored === undefined || stored.band === null) continue;
    return {
      state,
      band: stored.band,
      words: bandInStateWords({
        bandWords: stored.bandWords,
        band: stored.band,
        stateLabel: state.short,
      }),
    };
  }
  return { state, band: null, words: `Not checked yet in ${state.short}` };
}

function stateView(
  state: StateLabel,
  input: Parameters<typeof obligationsReadModel>[0],
  deadlines: readonly DeadlineView[],
): StateView {
  const rows = input.obligations
    .filter((row) => row.jurisdictionId === state.jurisdictionId)
    .sort((a, b) => a.obligationKey.localeCompare(b.obligationKey));
  const first = rows[0];
  const onFile = rows.length > 0;
  const counts = {
    applies: rows.filter((row) => row.status === "applies").length,
    notApplicable: rows.filter((row) => row.status === "not_applicable").length,
    undetermined: rows.filter((row) => row.status === "undetermined").length,
  };
  const laterVersions = input.candidates
    .filter(
      (candidate) =>
        candidate.jurisdictionId === state.jurisdictionId &&
        candidate.publishedAt !== null &&
        candidate.isRuleActive &&
        candidate.effectiveOn > input.today,
    )
    .sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn))
    .map((candidate) =>
      laterVersionWords({
        versionLabel: candidate.versionLabel,
        effectiveOn: candidate.effectiveOn,
        citation: candidate.citation,
      }),
    );
  const open = deadlines.filter(
    (row) => row.standing === "open" || row.standing === "overdue",
  );
  const products = input.products
    .filter((product) => product.jurisdictionIds.includes(state.jurisdictionId))
    .flatMap((product) => {
      const entry = input.catalogEntries.find(
        (row) => row.id === product.catalogEntryId,
      );
      return entry === undefined ? [] : [productLabelOf(entry)];
    });
  return {
    state,
    onFile,
    noRulesWords: onFile ? null : noRulesOnFile(state.name),
    law: textOf(first?.appliesBecause.law),
    lawUrl: textOf(first?.appliesBecause.lawUrl),
    agency: textOf(first?.appliesBecause.agency),
    obligationsVersionWords: versionWordsOf(
      first?.appliesBecause.obligationsVersion,
    ),
    coverageVersionWords: versionWordsOf(first?.appliesBecause.coverageVersion),
    laterVersions,
    counts,
    resultWords: onFile
      ? [
          `${PRODUCER_OBLIGATION_STATUS_LABELS.applies}: ${counts.applies}`,
          ...(counts.notApplicable > 0
            ? [
                `${PRODUCER_OBLIGATION_STATUS_LABELS.not_applicable}: ${counts.notApplicable}`,
              ]
            : []),
          ...(counts.undetermined > 0
            ? [
                `${PRODUCER_OBLIGATION_STATUS_LABELS.undetermined}: ${counts.undetermined}`,
              ]
            : []),
        ].join(" · ")
      : "No rules on file",
    nextDeadline: open[0] ?? null,
    obligations: rows.map((row) => {
      const due = storedDue(row);
      return {
        id: row.id,
        key: row.obligationKey,
        duty: row.obligationTitle,
        citation: row.citation,
        status: row.status,
        statusLabel: PRODUCER_OBLIGATION_STATUS_LABELS[row.status],
        reasoning: textOf(row.appliesBecause.reasoning) ?? "",
        products: storedProducts(row).map((stored) => ({
          label: stored.label,
          bandWords: stored.bandWords,
          truth: stored.truth,
          missing: stored.missing.map((value) => MISSING_INPUT_WORDS[value]),
        })),
        dueWords: due === null ? "" : dueWords(due),
        noDateYet: due?.kind === "no_date",
        deadlines: deadlines.filter(
          (deadline) => deadline.obligationId === row.id,
        ),
      };
    }),
    stewardshipOrganizations: listOf(
      first?.appliesBecause.stewardshipOrganizations,
    ).flatMap((value) => (typeof value === "string" ? [value] : [])),
    notChecked: listOf(first?.appliesBecause.notChecked).flatMap((value) =>
      typeof value === "string" ? [value] : [],
    ),
    products,
  };
}
