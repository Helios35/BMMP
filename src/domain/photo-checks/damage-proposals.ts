import type { DamageAssessmentMethod } from "@/domain/taxonomy/damage-assessment-method";
import {
  DAMAGE_FINDING_TYPES,
  type DamageFindingType,
} from "@/domain/taxonomy/damage-finding-type";
import type { IsoTimestamp, JsonObject, Uuid } from "@/types/common";

/**
 * Damage proposals — Rules 6.2, 6.6, 6.25, 6.26, 7.25; T-29, T-59; D-75 #3, #4.
 *
 * **A model proposes; a person decides each proposal.** The vision model may
 * propose T-29 findings from a whole-pack or damage photo. Nothing it proposes
 * counts until a person accepts it, and **nothing is pre-ticked**: a proposal
 * is a row the person accepts or rejects, never a finding already in the set.
 * Only what the person confirms reaches `assessDamage` (Rules 6.2, 6.6), and an
 * accepted finding sets flags exactly as a picked one does (Rule 6.4).
 *
 * **What a model may never propose** (D-75 #4): `none_observed`, a DDR flag,
 * `defective` or a grade. The proposable set is T-29 minus `none_observed`,
 * read from the taxonomy rather than listed — "nothing proposed" is never
 * "none observed", and a person still inspects (Rule 6.25).
 *
 * **Every decision is kept, rejected ones included** (Rules 6.12, 7.25): the
 * decisions travel on the draft, onto the assessment, and onto its audit row.
 *
 * Pure. The caller reads the photo checks through `src/data` and hands them in.
 */

/** T-29 minus `none_observed` — the only findings a model may propose. */
export type ProposableFindingType = Exclude<DamageFindingType, "none_observed">;

export const PROPOSABLE_FINDING_TYPES: readonly ProposableFindingType[] =
  DAMAGE_FINDING_TYPES.filter(
    (finding): finding is ProposableFindingType => finding !== "none_observed",
  );

export function isProposableFindingType(
  value: string,
): value is ProposableFindingType {
  return (PROPOSABLE_FINDING_TYPES as readonly string[]).includes(value);
}

export type ProposalDecisionValue = "accepted" | "rejected";

export const PROPOSAL_DECISION_VALUES: readonly ProposalDecisionValue[] = [
  "accepted",
  "rejected",
];

/** One proposal: one finding a model proposed on one photo, in one check run. */
export interface DamageProposal {
  readonly photoCheckId: Uuid;
  readonly intakePhotoId: Uuid;
  readonly findingType: ProposableFindingType;
}

/** A person's decision on one proposal — attributable, timed, and kept (Rule 7.25). */
export interface DamageProposalDecision extends DamageProposal {
  readonly decision: ProposalDecisionValue;
  readonly decidedBy: Uuid;
  readonly decidedAt: IsoTimestamp;
}

/** A check run with what it proposed, as the caller read it from `photo_check`. */
export interface ProposalCheckRun {
  readonly photoCheckId: Uuid;
  readonly intakePhotoId: Uuid;
  readonly proposedFindings: readonly ProposableFindingType[];
}

/** The stable key one proposal is decided under. */
export function proposalKey(proposal: {
  readonly photoCheckId: Uuid;
  readonly findingType: string;
}): string {
  return `${proposal.photoCheckId}:${proposal.findingType}`;
}

/**
 * Every proposal the runs make, one per finding per run, in T-29 order within
 * a run and the runs' own order across them. A finding proposed twice in one
 * run is one proposal.
 */
export function proposalsFrom(
  runs: readonly ProposalCheckRun[],
): readonly DamageProposal[] {
  return runs.flatMap((run) => {
    const proposed = new Set(run.proposedFindings);
    return PROPOSABLE_FINDING_TYPES.filter((finding) =>
      proposed.has(finding),
    ).map((findingType) => ({
      photoCheckId: run.photoCheckId,
      intakePhotoId: run.intakePhotoId,
      findingType,
    }));
  });
}

/** The proposals no decision covers yet. Empty means the condition may be confirmed. */
export function undecidedProposals(
  proposals: readonly DamageProposal[],
  decisions: readonly DamageProposalDecision[],
): readonly DamageProposal[] {
  const decided = new Set(decisions.map(proposalKey));
  return proposals.filter((proposal) => !decided.has(proposalKey(proposal)));
}

/** The decision on one proposal, or `null` while it waits. */
export function decisionFor(
  proposal: DamageProposal,
  decisions: readonly DamageProposalDecision[],
): DamageProposalDecision | null {
  const key = proposalKey(proposal);
  return decisions.find((decision) => proposalKey(decision) === key) ?? null;
}

export interface ProposalDecided {
  readonly findings: readonly DamageFindingType[];
  readonly decisions: readonly DamageProposalDecision[];
}

/**
 * Record a person's decision on one proposal and what it does to the findings.
 *
 * - **Accept** puts the finding in the set (clearing `none_observed`, which is
 *   exclusive — Rule 6.3), exactly as ticking it would.
 * - **Reject** leaves the set as the person made it, with one exception: a
 *   proposal accepted earlier and now rejected takes back the finding its
 *   acceptance added, unless another accepted proposal still stands for the
 *   same finding. A finding the person ticked themselves is their own
 *   observation, and rejecting the model's version of it does not untick it.
 *
 * A changed decision replaces the earlier one for the same proposal; the
 * history of changes before the condition is confirmed is the draft's, and the
 * decision that stands is what the assessment keeps.
 */
export function decideProposal(
  current: ProposalDecided,
  proposal: DamageProposal,
  decision: ProposalDecisionValue,
  actor: { readonly userId: Uuid; readonly at: IsoTimestamp },
): ProposalDecided {
  const key = proposalKey(proposal);
  const previous = current.decisions.find((row) => proposalKey(row) === key);
  const decisions: DamageProposalDecision[] = [
    ...current.decisions.filter((row) => proposalKey(row) !== key),
    {
      photoCheckId: proposal.photoCheckId,
      intakePhotoId: proposal.intakePhotoId,
      findingType: proposal.findingType,
      decision,
      decidedBy: actor.userId,
      decidedAt: actor.at,
    },
  ];

  let findings: readonly DamageFindingType[] = current.findings;
  if (decision === "accepted") {
    findings = current.findings.includes(proposal.findingType)
      ? current.findings.filter((finding) => finding !== "none_observed")
      : [
          ...current.findings.filter((finding) => finding !== "none_observed"),
          proposal.findingType,
        ];
  } else if (previous?.decision === "accepted") {
    const stillAccepted = decisions.some(
      (row) =>
        row.findingType === proposal.findingType && row.decision === "accepted",
    );
    if (!stillAccepted) {
      findings = current.findings.filter(
        (finding) => finding !== proposal.findingType,
      );
    }
  }
  return { findings, decisions };
}

/**
 * T-59 — `model_assisted_visual` when at least one proposal was shown to the
 * person who confirmed, `visual_inspection` otherwise (Rule 6.25). The method
 * says how the proposal arrived, never who decided: a person decided either
 * way (Rule 6.6).
 */
export function assessmentMethodFor(
  proposalsShown: readonly DamageProposal[],
): Extract<
  DamageAssessmentMethod,
  "visual_inspection" | "model_assisted_visual"
> {
  return proposalsShown.length > 0
    ? "model_assisted_visual"
    : "visual_inspection";
}

/**
 * Keep only decisions on proposals that were shown — a decision on a proposal
 * no run made is not a decision on anything, and is refused rather than kept.
 */
export function decisionsOnShownProposals(
  proposals: readonly DamageProposal[],
  decisions: readonly DamageProposalDecision[],
): readonly DamageProposalDecision[] {
  const shown = new Set(proposals.map(proposalKey));
  return decisions.filter((decision) => shown.has(proposalKey(decision)));
}

/** One decision as an audit row's `after_state` carries it (Rule 6.25, T-43). */
export function proposalDecisionJson(
  decision: DamageProposalDecision,
): JsonObject {
  return {
    photoCheckId: decision.photoCheckId,
    intakePhotoId: decision.intakePhotoId,
    findingType: decision.findingType,
    decision: decision.decision,
    decidedBy: decision.decidedBy,
    decidedAt: decision.decidedAt,
  };
}
