import type { RequestContext } from "./context";
import type {
  AppendInput,
  AppendOnlyRepository,
  BaseQuery,
  SortRequest,
} from "./repository";
import type { AuditEvent } from "@/types/audit";
import type { AuditActorType } from "@/domain/taxonomy/audit-actor-type";
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

/**
 * `/audit` renders **newest first** and offers the column as a sort. Nothing
 * else on the row is orderable: an audit log sorted by actor or by event type
 * stops being a chronology, and the chronology is the evidence.
 *
 * `sequenceNo` is the total order and is the tie-break `occurredAt` needs —
 * two events in one transaction share an instant.
 */
export type AuditEventSortField = "occurredAt" | "sequenceNo";

export interface AuditEventQuery
  extends BaseQuery, SortRequest<AuditEventSortField> {
  readonly entityTable?: string;
  readonly entityId?: Uuid;
  readonly actorUserId?: Uuid;
  readonly eventType?: string;
  /**
   * T-60. The `/audit` "platform actions only" filter.
   *
   * **A support grant that is invisible in the log is not a recorded support
   * grant** (Rules 1.18, 12.7) — this filter is how an auditor asks the log what
   * the platform did inside their tenant, so nothing may filter it out of the
   * default view either.
   */
  readonly actorType?: AuditActorType;
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
export interface AuditEventRepository extends AppendOnlyRepository<
  AuditEvent,
  CreateAuditEvent,
  AuditEventQuery
> {
  /**
   * The `security definer` path — `TECHNICAL_SPEC.md` §10.5,
   * `app.write_audit_event()`.
   *
   * **The only way a denial is recorded.** `TECHNICAL_SPEC.md` §9.5 gives
   * `audit_event` INSERT to no tenant role at all, because Postgres writes these
   * rows from a trigger and never from a user statement (Rules 12.3, 12.4) — so
   * the denied caller holds no INSERT and {@link AppendOnlyRepository.append}
   * refuses them. Without this door, "every denial writes an `audit_event`"
   * (`SITE_ARCHITECTURE.md` §5.3(8), Rules 1.16, 12.6) cannot be true, because
   * the only caller who could write the row is the one who was just refused.
   *
   * ## The asymmetry, and why both doors exist
   *
   * `append` **stays policy-checked** so an ordinary caller still cannot forge a
   * row, and `write` bypasses the policy check on the insert **and on nothing
   * else**: same tenant scoping from `ctx.organizationId`, same sequence
   * allocation, same immutability. **Actor and correlation id still come from
   * `ctx`**, exactly as the trigger reads them from `set_config` locals — the
   * elevated privilege is on the write, never on the attribution, so an elevated
   * write cannot claim to be someone else.
   *
   * **This is not a general-purpose escape hatch.** It is for the writes that
   * originate in the application rather than in a row change and that the actor
   * therefore cannot perform for themselves: a denial (Rule 12.6), an export
   * (Rule 12.18), a failed render, a reprint, a view. A feature reaching for
   * `write` to avoid a `PermissionError` on some *other* table has misread the
   * denial — record it and let it stand.
   *
   * There is still no update and no delete, here or anywhere.
   */
  write(ctx: RequestContext, input: CreateAuditEvent): Promise<AuditEvent>;
}
