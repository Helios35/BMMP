import type { AppliedRuleVersion } from "@/domain/rules/outcome";
import type { DeadlineDueBasis } from "@/domain/taxonomy/deadline-due-basis";
import type { ObligationDeadlineStatus } from "@/domain/taxonomy/obligation-deadline-status";
import type { ProducerObligationStatus } from "@/domain/taxonomy/producer-obligation-status";
import type { IsoDate, JsonObject, JsonValue, Uuid } from "@/types/common";

import type { DeadlineDraft } from "./deadlines";
import {
  obligationBasis,
  type ObligationEvaluation,
  type ProducerEvaluation,
  type StateEvaluation,
} from "./evaluate";

/**
 * What one run writes — Rules 8.11, 8.12.
 *
 * A run writes a new `producer_obligation` row **only where the result
 * changed**, marks the old row not current, and carries the old row's
 * deadlines into the new one. **A run never undoes a completion**: a done
 * deadline stays done whatever the run finds. When an obligation stops
 * applying, its open deadlines become `withdrawn` and its done ones stay done;
 * a withdrawn deadline whose obligation applies again opens again.
 *
 * Pure: the current rows are passed in, and the plan comes back for the
 * adapter to apply in one write with one audit row.
 */

export const RUN_TRIGGERS = [
  "product_added",
  "product_changed",
  "product_removed",
  "check_now",
  "nightly_job",
] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

/** A current `producer_obligation` row, as much of it as a run reads. */
export interface CurrentObligation {
  readonly id: Uuid;
  readonly jurisdictionId: Uuid;
  readonly jurisdictionRuleId: Uuid;
  readonly governingRuleVersionId: Uuid;
  readonly obligationKey: string;
  readonly obligationTitle: string;
  readonly citation: string;
  readonly status: ProducerObligationStatus;
  readonly appliesBecause: JsonObject;
  readonly evaluationTrace: readonly AppliedRuleVersion[];
  readonly stewardshipOrgName: string | null;
}

/** An `obligation_deadline` row, as much of it as a run reads. */
export interface CurrentDeadline {
  readonly id: Uuid;
  readonly producerObligationId: Uuid;
  readonly deadlineKey: string;
  readonly status: ObligationDeadlineStatus;
  readonly governingRuleVersionId: Uuid;
  readonly citation: string;
}

/** A new `producer_obligation` row. `ref` names it until the adapter gives it an id. */
export interface ObligationDraft {
  readonly ref: string;
  readonly jurisdictionId: Uuid;
  readonly jurisdictionRuleId: Uuid;
  readonly governingRuleVersionId: Uuid;
  readonly obligationKey: string;
  readonly obligationTitle: string;
  readonly citation: string;
  readonly appliesBecause: JsonObject;
  readonly evaluationTrace: readonly AppliedRuleVersion[];
  readonly stewardshipOrgName: string | null;
  readonly status: ProducerObligationStatus;
  readonly supersedesProducerObligationId: Uuid | null;
}

export type ObligationTarget =
  | { readonly kind: "existing"; readonly id: Uuid }
  | { readonly kind: "new"; readonly ref: string };

export type DeadlineChange =
  | {
      readonly kind: "insert";
      readonly target: ObligationTarget;
      readonly deadlineKey: string;
      readonly dueOn: IsoDate;
      readonly dueBasis: DeadlineDueBasis;
      readonly citation: string;
      readonly governingRuleVersionId: Uuid;
    }
  | {
      readonly kind: "update";
      readonly id: Uuid;
      readonly target: ObligationTarget;
      readonly status: ObligationDeadlineStatus;
      readonly citation: string;
      readonly governingRuleVersionId: Uuid;
    };

export interface ProducerRunCounts {
  readonly states: number;
  readonly obligations: number;
  readonly written: number;
  readonly unchanged: number;
  readonly deadlinesAdded: number;
  readonly withdrawn: number;
  readonly reopened: number;
}

export interface ProducerRunPlan {
  readonly asOf: IsoDate;
  readonly trigger: RunTrigger;
  readonly inserts: readonly ObligationDraft[];
  /** Rows that stop being current — every one superseded by an insert. */
  readonly retire: readonly Uuid[];
  readonly deadlineChanges: readonly DeadlineChange[];
  readonly counts: ProducerRunCounts;
  readonly ruleVersionsApplied: readonly AppliedRuleVersion[];
}

/** Why a current obligation has no counterpart in this run. */
type DroppedBecause = "not_sold" | "not_listed" | "not_on_file";

const DROPPED_SIGNATURE_PREFIX = "dropped:";

export function signatureOf(row: {
  readonly appliesBecause: JsonObject;
}): string {
  const signature: JsonValue | undefined = row.appliesBecause.signature;
  return typeof signature === "string" ? signature : "";
}

function refOf(jurisdictionId: Uuid, obligationKey: string): string {
  return `${jurisdictionId}:${obligationKey}`;
}

interface Tally {
  deadlinesAdded: number;
  withdrawn: number;
  reopened: number;
}

function reconcileDeadlines(
  existing: readonly CurrentDeadline[],
  drafts: readonly DeadlineDraft[] | "keep",
  target: ObligationTarget,
  moved: boolean,
  citation: string,
  governingRuleVersionId: Uuid,
  changes: DeadlineChange[],
  tally: Tally,
): void {
  if (drafts === "keep") {
    // Nothing is decided about these dates — they only follow their row.
    for (const deadline of existing) {
      if (!moved) continue;
      changes.push({
        kind: "update",
        id: deadline.id,
        target,
        status: deadline.status,
        citation: deadline.citation,
        governingRuleVersionId: deadline.governingRuleVersionId,
      });
    }
    return;
  }
  const byKey = new Map(
    existing.map((deadline) => [deadline.deadlineKey, deadline]),
  );
  const wanted = new Set(drafts.map((draft) => draft.deadlineKey));

  for (const draft of drafts) {
    const deadline = byKey.get(draft.deadlineKey);
    if (deadline === undefined) {
      changes.push({
        kind: "insert",
        target,
        deadlineKey: draft.deadlineKey,
        dueOn: draft.dueOn,
        dueBasis: draft.dueBasis,
        citation,
        governingRuleVersionId,
      });
      tally.deadlinesAdded += 1;
      continue;
    }
    // A done deadline stays done (Rule 8.12); a withdrawn one opens again.
    const status: ObligationDeadlineStatus =
      deadline.status === "withdrawn" ? "open" : deadline.status;
    if (deadline.status === "withdrawn") tally.reopened += 1;
    if (
      moved ||
      status !== deadline.status ||
      deadline.citation !== citation ||
      deadline.governingRuleVersionId !== governingRuleVersionId
    ) {
      changes.push({
        kind: "update",
        id: deadline.id,
        target,
        status,
        citation,
        governingRuleVersionId,
      });
    }
  }

  for (const deadline of existing) {
    if (wanted.has(deadline.deadlineKey)) continue;
    // Open becomes withdrawn; done stays done; withdrawn stays withdrawn.
    const status: ObligationDeadlineStatus =
      deadline.status === "open" ? "withdrawn" : deadline.status;
    if (deadline.status === "open") tally.withdrawn += 1;
    if (moved || status !== deadline.status) {
      changes.push({
        kind: "update",
        id: deadline.id,
        target,
        status,
        citation: deadline.citation,
        governingRuleVersionId: deadline.governingRuleVersionId,
      });
    }
  }
}

function draftFrom(
  state: StateEvaluation,
  obligation: ObligationEvaluation,
  supersedes: Uuid | null,
): ObligationDraft {
  const version = state.obligationsVersion;
  if (version === null) {
    throw new RangeError(
      "an obligation was evaluated with no obligations rule",
    );
  }
  return {
    ref: refOf(state.jurisdiction.id, obligation.key),
    jurisdictionId: state.jurisdiction.id,
    jurisdictionRuleId: version.jurisdictionRuleId,
    governingRuleVersionId: version.ruleVersionId,
    obligationKey: obligation.key,
    obligationTitle: obligation.duty,
    citation: obligation.citation,
    appliesBecause: obligationBasis(state, obligation),
    evaluationTrace: obligation.ruleVersionsApplied,
    stewardshipOrgName:
      state.stewardshipOrganizations.length === 0
        ? null
        : state.stewardshipOrganizations.join("; "),
    status: obligation.status,
    supersedesProducerObligationId: supersedes,
  };
}

const DROPPED_WORDS: Readonly<
  Record<DroppedBecause, (state: string) => string>
> = {
  not_sold: (state) =>
    `Doesn't apply: no declared product is sold in ${state} now.`,
  not_listed: () =>
    "Doesn't apply: the rule version in force no longer lists it.",
  not_on_file: (state) =>
    `Can't tell yet: no producer rules on file for ${state} now. This doesn't mean none apply.`,
};

function droppedDraft(
  current: CurrentObligation,
  because: DroppedBecause,
): ObligationDraft {
  const stateName =
    typeof current.appliesBecause.stateName === "string"
      ? current.appliesBecause.stateName
      : "this state";
  return {
    ref: refOf(current.jurisdictionId, current.obligationKey),
    jurisdictionId: current.jurisdictionId,
    jurisdictionRuleId: current.jurisdictionRuleId,
    governingRuleVersionId: current.governingRuleVersionId,
    obligationKey: current.obligationKey,
    obligationTitle: current.obligationTitle,
    citation: current.citation,
    appliesBecause: {
      ...current.appliesBecause,
      products: [],
      reasoning: DROPPED_WORDS[because](stateName),
      signature: `${DROPPED_SIGNATURE_PREFIX}${because}`,
    },
    evaluationTrace: current.evaluationTrace,
    stewardshipOrgName: current.stewardshipOrgName,
    // No rules on file is never "doesn't apply" (Rule 8.7).
    status: because === "not_on_file" ? "undetermined" : "not_applicable",
    supersedesProducerObligationId: current.id,
  };
}

export function planProducerRun(
  evaluation: ProducerEvaluation,
  current: {
    readonly obligations: readonly CurrentObligation[];
    readonly deadlines: readonly CurrentDeadline[];
  },
  trigger: RunTrigger,
): ProducerRunPlan {
  const byRef = new Map(
    current.obligations.map((row) => [
      refOf(row.jurisdictionId, row.obligationKey),
      row,
    ]),
  );
  const deadlinesOf = (obligationId: Uuid): readonly CurrentDeadline[] =>
    current.deadlines.filter(
      (deadline) => deadline.producerObligationId === obligationId,
    );

  const inserts: ObligationDraft[] = [];
  const retire: Uuid[] = [];
  const changes: DeadlineChange[] = [];
  const tally: Tally = { deadlinesAdded: 0, withdrawn: 0, reopened: 0 };
  const seen = new Set<string>();
  let obligations = 0;
  let unchanged = 0;

  for (const state of evaluation.states) {
    const version = state.obligationsVersion;
    for (const obligation of state.obligations) {
      if (version === null) continue;
      obligations += 1;
      const ref = refOf(state.jurisdiction.id, obligation.key);
      seen.add(ref);
      const row = byRef.get(ref);
      const changed =
        row === undefined ||
        signatureOf(row) !== obligation.signature ||
        row.governingRuleVersionId !== version.ruleVersionId;
      const target: ObligationTarget = changed
        ? { kind: "new", ref }
        : { kind: "existing", id: row.id };
      if (changed) {
        inserts.push(draftFrom(state, obligation, row?.id ?? null));
        if (row !== undefined) retire.push(row.id);
      } else {
        unchanged += 1;
      }
      reconcileDeadlines(
        row === undefined ? [] : deadlinesOf(row.id),
        obligation.deadlines,
        target,
        changed && row !== undefined,
        obligation.citation,
        version.ruleVersionId,
        changes,
        tally,
      );
    }
  }

  const statesById = new Map(
    evaluation.states.map((state) => [state.jurisdiction.id, state]),
  );
  for (const row of current.obligations) {
    const ref = refOf(row.jurisdictionId, row.obligationKey);
    if (seen.has(ref)) continue;
    const state = statesById.get(row.jurisdictionId);
    const because: DroppedBecause =
      state === undefined
        ? "not_sold"
        : state.onFile
          ? "not_listed"
          : "not_on_file";
    if (signatureOf(row) === `${DROPPED_SIGNATURE_PREFIX}${because}`) {
      continue;
    }
    const draft = droppedDraft(row, because);
    inserts.push(draft);
    retire.push(row.id);
    reconcileDeadlines(
      deadlinesOf(row.id),
      because === "not_on_file" ? "keep" : [],
      { kind: "new", ref: draft.ref },
      true,
      row.citation,
      row.governingRuleVersionId,
      changes,
      tally,
    );
  }

  return {
    asOf: evaluation.asOf,
    trigger,
    inserts,
    retire,
    deadlineChanges: changes,
    counts: {
      states: evaluation.states.length,
      obligations,
      written: inserts.length,
      unchanged,
      deadlinesAdded: tally.deadlinesAdded,
      withdrawn: tally.withdrawn,
      reopened: tally.reopened,
    },
    ruleVersionsApplied: evaluation.ruleVersionsApplied,
  };
}
