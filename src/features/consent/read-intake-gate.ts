import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  canAcceptTerms,
  NO_BINDING_AUTHORITY_REMEDY,
} from "@/domain/consent/binding-authority";
import {
  evaluateIntakeGate,
  type ConsentRecord,
  type IntakeGate,
} from "@/domain/consent/intake-gate";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { actionFailed, type ActionResult } from "@/lib/action-result";
import type { IsoDate } from "@/types/common";

/**
 * The one read of `tos_acceptance` for the active organization, evaluated.
 *
 * **Called by `/batteries/new` and by the intake Server Actions, and by nothing
 * else.** The gate blocks intake, not the app (Rule 7.2, E-12) — putting this
 * call in middleware or in `(app)/layout.tsx` would lock every read-only route
 * behind consent, which is the exact failure Rule 7.2 exists to prevent.
 *
 * Both halves of the block come from live data: the decision from the consent
 * rows, and the remedy from the membership list. Rule 7.2 requires the block to
 * name **who in this organization can accept it**, and a name a screen made up
 * is not a remedy.
 */

/** A person this organization may send to accept. Rules 7.3, 7.4, 1.19 — **never a platform admin.** */
export interface TermsAcceptor {
  readonly fullName: string;
  /** T-37, from `ROLE_LABELS`. */
  readonly roleLabel: string;
}

export interface IntakeGateView extends IntakeGate {
  readonly acceptors: readonly TermsAcceptor[];
  /** True where the **current viewer** is one of them. Changes the block's copy, never its existence. */
  readonly viewerCanAccept: boolean;
}

export const INTAKE_BLOCK_HEADLINE = "Batteries can't be logged yet.";

export { NO_BINDING_AUTHORITY_REMEDY };

/**
 * How many consent rows are read.
 *
 * An organization accumulates one row per accepted version and every prior row
 * is retained permanently as the governing terms for the records captured under
 * it (Rule 7.16). Twenty bounds the read and is far more than any organization
 * holds in B1a; the evaluator only ever acts on the live one.
 */
const CONSENT_ROW_LIMIT = 20;

/** Enough members to find every holder. Rule 1.12 guarantees at least one. */
const MEMBERSHIP_SCAN_LIMIT = 100;

function calendarDay(at: Date): IsoDate {
  return at.toISOString().slice(0, 10);
}

/**
 * Read the gate for the active organization.
 *
 * `today` is an argument with a default rather than a clock read inside the
 * evaluator, so the grace-window boundary day is pinnable by a test without
 * mocking time (`src/domain` reads no clock at all).
 */
export async function readIntakeGate(
  ctx: RequestContext,
  today: IsoDate = calendarDay(new Date()),
): Promise<IntakeGateView> {
  const consent = await data.tosAcceptances.list(ctx, {
    limit: CONSENT_ROW_LIMIT,
  });

  const records: readonly ConsentRecord[] = consent.items.map((row) => ({
    status: row.status,
    documentKey: row.documentKey,
    documentVersion: row.documentVersion,
    trainingRightsGranted: row.trainingRightsGranted,
    reacceptanceDeadlineOn: row.reacceptanceDeadlineOn,
    revokedAt: row.revokedAt,
  }));

  const gate = evaluateIntakeGate(records, today);

  // One membership read serves both halves of the remedy: who may accept, and
  // whether the person reading the block is one of them.
  const memberships = await data.memberships.list(ctx, {
    isActive: true,
    limit: MEMBERSHIP_SCAN_LIMIT,
  });

  const acceptors: TermsAcceptor[] = [];
  for (const membership of memberships.items) {
    const holdsAuthority = canAcceptTerms({
      role: membership.role,
      holdsBindingAuthority: membership.holdsBindingAuthority,
      // A P6 support grant is a membership row carrying `platform_admin`
      // (Rule 1.18), and Rules 1.19 and 7.4 refuse it here as well as in the
      // adapter. Neither is the only enforcement.
      isPlatformAdmin: membership.role === "platform_admin",
    });
    if (!holdsAuthority || membership.userId === null) continue;

    const user = await data.users.get(ctx, membership.userId);
    // A holder whose user row will not resolve is a data defect. It is dropped
    // rather than rendered as a blank name — a block that names nobody while
    // implying someone is worse than one that names the remedy.
    if (user === null || user.fullName === null) continue;
    acceptors.push({
      fullName: user.fullName,
      roleLabel: ROLE_LABELS[membership.role],
    });
  }

  const viewer = memberships.items.find(
    (membership) => membership.userId === ctx.userId,
  );

  return {
    ...gate,
    acceptors,
    viewerCanAccept:
      viewer !== undefined &&
      canAcceptTerms({
        role: viewer.role,
        holdsBindingAuthority: viewer.holdsBindingAuthority,
        isPlatformAdmin: ctx.isPlatformAdmin,
      }),
  };
}

/**
 * The check every intake Server Action calls before it writes — Rules 7.1, 7.2.
 *
 * Returns the failure arm of `ActionResult` rather than throwing, so an action
 * can `return blocked;` verbatim and a caller reads one shape of refusal however
 * it was produced. Unit 02's intake actions are the callers; this unit provides
 * the door.
 *
 * `FORBIDDEN` rather than `VALIDATION`: nothing about the submitted input is
 * wrong, and the block is not something the person filling the form can fix.
 */
export async function requireIntakeGate(
  ctx: RequestContext,
): Promise<ActionResult<never> | null> {
  const gate = await readIntakeGate(ctx);
  if (gate.status !== "blocked") return null;
  return actionFailed<never>({
    code: "FORBIDDEN",
    message: intakeBlockSentence(gate),
    correlationId: ctx.correlationId,
  });
}

/**
 * The second line — why intake is closed, by reason.
 *
 * `lapsed` names the version and the date, because Rule 7.14's block is only
 * actionable if the reader can see which version lapsed and when.
 */
export function intakeBlockExplanation(gate: IntakeGateView): string {
  switch (gate.reason) {
    case "no_training_rights":
      return "Your organization's acceptance doesn't include the data training-rights grant, which is required before any battery is logged.";
    case "lapsed":
      return gate.documentVersion !== null &&
        gate.reacceptanceDeadlineOn !== null
        ? `The deadline to re-accept version ${gate.documentVersion} passed on ${gate.reacceptanceDeadlineOn}, so the acceptance has lapsed.`
        : "The deadline to re-accept the Terms of Service has passed, so the acceptance has lapsed.";
    case "revoked":
      return "Your organization revoked the Terms of Service acceptance.";
    default:
      return "Your organization hasn't accepted the Terms of Service, which include the data training-rights grant. No batteries can be logged until it's accepted.";
  }
}

/**
 * The third line — **who can accept**, from live membership data (Rule 7.2).
 *
 * It names people rather than a role in the abstract, because "a Facility
 * Manager can accept this" leaves a warehouse handler with nobody to walk over
 * to. Where nobody holds the authority, D-35's remedy is named rather than the
 * block refusing twice.
 */
export function intakeBlockRemedy(gate: IntakeGateView): string {
  if (gate.viewerCanAccept) {
    return "You can accept this in Organization settings.";
  }

  const names = gate.acceptors.map(
    (acceptor) => `${acceptor.fullName} (${acceptor.roleLabel})`,
  );
  const last = names[names.length - 1];
  if (last === undefined) return NO_BINDING_AUTHORITY_REMEDY;
  if (names.length === 1) {
    return `${last} can accept this in Organization settings.`;
  }
  return `${names.slice(0, -1).join(", ")} or ${last} can accept this in Organization settings.`;
}

/**
 * The block as one string, for a boundary that carries a single message.
 *
 * `intake-blocked-notice.tsx` renders the same three facts laid out, so the
 * screen and a Server Action's error cannot say different things about why
 * intake is closed.
 */
export function intakeBlockSentence(gate: IntakeGateView): string {
  return `${INTAKE_BLOCK_HEADLINE} ${intakeBlockExplanation(gate)} ${intakeBlockRemedy(gate)}`;
}
