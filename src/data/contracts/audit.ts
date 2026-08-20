import type {
  AppendInput,
  AppendOnlyRepository,
  BaseQuery,
} from "./repository";
import type { AuditEvent } from "@/types/audit";
import type { IsoTimestamp, Uuid } from "@/types/common";

/** Audit contracts — `ERD.md` §10.2. */

/**
 * Under Supabase, `audit_event` rows are written by a `security definer` trigger
 * on every tenant table, **never by a user statement** — so a user can neither
 * forge nor suppress a row (Rules 12.3, 12.4).
 *
 * `append` exists on this contract because the **mock adapter has no triggers**
 * and must produce the same coverage in code, and because a handful of events
 * genuinely originate in the application rather than in a row change: a denial
 * (Rule 12.6), a failed document render, a reprint, a view, an export
 * (Rule 12.18). The Supabase adapter routes those through the same
 * `security definer` path rather than an ordinary insert.
 */
export type CreateAuditEvent = AppendInput<AuditEvent, "sequenceNo">;

export interface AuditEventQuery extends BaseQuery {
  readonly entityTable?: string;
  readonly entityId?: Uuid;
  readonly actorUserId?: Uuid;
  readonly eventType?: string;
  readonly correlationId?: string;
  readonly governingRuleVersionId?: Uuid;
  readonly occurredAfter?: IsoTimestamp;
  readonly occurredBefore?: IsoTimestamp;
}

/**
 * **Append-only, with no update and no delete on the contract, in the policy
 * matrix, or through the service-role key.**
 *
 * `audit_event` is not deleted at all. The export at `/audit` is how it leaves
 * the system; every export is scoped to what the requester could already open
 * individually (Rule 12.17) and is itself an audited act (Rule 12.18).
 *
 * SELECT is limited to P2, P5 and P6 (Rule 12.8). **P1 cannot read the audit
 * log** — P1, P3 and P4 see the history of records they can already open, built
 * from `storage_event`, `classification_decision`, `damage_assessment`, `alert`
 * and `document_render` rather than from the raw log.
 */
export type AuditEventRepository = AppendOnlyRepository<
  AuditEvent,
  CreateAuditEvent,
  AuditEventQuery
>;
