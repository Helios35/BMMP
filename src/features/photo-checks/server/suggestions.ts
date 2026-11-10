import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  decisionFor,
  proposalKey,
  proposalsFrom,
  undecidedProposals,
  type DamageProposal,
  type DamageProposalDecision,
} from "@/domain/photo-checks/damage-proposals";
import { DAMAGE_FINDING_TYPE_LABELS } from "@/domain/taxonomy/damage-finding-type";
import { INTAKE_PHOTO_TYPE_LABELS } from "@/domain/taxonomy/intake-photo-type";
import type { Uuid } from "@/types/common";
import type { IntakePhoto } from "@/types/intake";
import type { PhotoCheck } from "@/types/photo-check";

import { takesDamageProposal } from "./run-checks";

/**
 * The Suggestions list a condition step shows — Rules 6.25, 6.26; `UX_SPEC.md`
 * §3.6 step 3, §3.7, §3.8a.
 *
 * For every whole-pack and damage photo on the session, the **latest** damage
 * check run: a `proposed` run's findings become rows, one per finding, each
 * naming its photo by its place among the session's photos ("photo 2"); a
 * `failed` run makes the list read "AI suggestions unavailable — inspect as
 * usual" (Rule 6.26). Nothing proposed is an empty list, never "none
 * observed".
 *
 * `excludeDecided` leaves out proposals an earlier assessment already
 * decided — the re-assessment's view: what was attached for it, not what the
 * intake already settled (Rule 6.25).
 */

const SESSION_PHOTO_LIMIT = 100;
const CHECK_LIMIT = 200;

export interface SuggestionRow {
  readonly key: string;
  readonly proposal: DamageProposal;
  readonly findingLabel: string;
  /** 1-based, among the session's original photos in the order they were taken. */
  readonly photoNumber: number;
  readonly photoTypeLabel: string;
  readonly decision: DamageProposalDecision | null;
}

export interface SessionSuggestions {
  readonly rows: readonly SuggestionRow[];
  /** Every proposal shown — what the assessment's method and decisions are checked against. */
  readonly proposals: readonly DamageProposal[];
  /** The proposals no decision covers. Confirm waits until this is empty. */
  readonly undecided: readonly DamageProposal[];
  /** A damage check on one of these photos failed (Rule 6.26). */
  readonly unavailable: boolean;
  /** The provider and model that proposed, for the assessment row. Null when none did. */
  readonly model: {
    readonly provider: string | null;
    readonly modelIdentifier: string | null;
  } | null;
}

export const NO_SUGGESTIONS: SessionSuggestions = {
  rows: [],
  proposals: [],
  undecided: [],
  unavailable: false,
  model: null,
};

function latestPerPhoto(
  checks: readonly PhotoCheck[],
): ReadonlyMap<Uuid, PhotoCheck> {
  const latest = new Map<Uuid, PhotoCheck>();
  for (const check of checks) {
    if (check.checkKind !== "damage_proposal") continue;
    const seen = latest.get(check.intakePhotoId);
    if (
      seen === undefined ||
      check.ranAt > seen.ranAt ||
      (check.ranAt === seen.ranAt && check.createdAt > seen.createdAt)
    ) {
      latest.set(check.intakePhotoId, check);
    }
  }
  return latest;
}

export async function readSessionSuggestions(
  ctx: RequestContext,
  input: {
    readonly intakeSessionId: Uuid;
    /** The decisions that stand: the draft's, or the dialog's. */
    readonly decisions: readonly DamageProposalDecision[];
    readonly photos?: readonly IntakePhoto[];
    /** Proposals some assessment already decided, left out (a re-assessment). */
    readonly excludeDecided?: readonly DamageProposalDecision[];
  },
): Promise<SessionSuggestions> {
  const photos =
    input.photos ??
    (
      await data.intakePhotos.list(ctx, {
        intakeSessionId: input.intakeSessionId,
        limit: SESSION_PHOTO_LIMIT,
      })
    ).items;
  const originals = photos
    .filter((photo) => photo.parentIntakePhotoId === null)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  const proposing = originals.filter(takesDamageProposal);
  if (proposing.length === 0) return NO_SUGGESTIONS;

  const checks = (
    await data.photoChecks.list(ctx, {
      intakeSessionId: input.intakeSessionId,
      checkKind: "damage_proposal",
      limit: CHECK_LIMIT,
    })
  ).items;
  const latest = latestPerPhoto(checks);

  const runs: PhotoCheck[] = [];
  let unavailable = false;
  for (const photo of proposing) {
    const check = latest.get(photo.id);
    if (check === undefined) continue;
    if (check.outcome === "failed") unavailable = true;
    if (check.outcome === "proposed") runs.push(check);
  }

  const settled = new Set((input.excludeDecided ?? []).map(proposalKey));
  const proposals = proposalsFrom(
    runs.map((run) => ({
      photoCheckId: run.id,
      intakePhotoId: run.intakePhotoId,
      proposedFindings: run.proposedFindings,
    })),
  ).filter((proposal) => !settled.has(proposalKey(proposal)));

  const numberOf = new Map(
    originals.map((photo, index) => [photo.id, index + 1]),
  );
  const typeOf = new Map(originals.map((photo) => [photo.id, photo.photoType]));
  const rows: SuggestionRow[] = proposals.map((proposal) => {
    const photoType = typeOf.get(proposal.intakePhotoId);
    return {
      key: proposalKey(proposal),
      proposal,
      findingLabel: DAMAGE_FINDING_TYPE_LABELS[proposal.findingType],
      photoNumber: numberOf.get(proposal.intakePhotoId) ?? 0,
      photoTypeLabel:
        photoType === undefined ? "" : INTAKE_PHOTO_TYPE_LABELS[photoType],
      decision: decisionFor(proposal, input.decisions),
    };
  });

  const proposer = runs.find((run) =>
    proposals.some((proposal) => proposal.photoCheckId === run.id),
  );
  return {
    rows,
    proposals,
    undecided: undecidedProposals(proposals, input.decisions),
    unavailable,
    model:
      proposer === undefined
        ? null
        : {
            provider: proposer.provider,
            modelIdentifier: proposer.modelIdentifier,
          },
  };
}
