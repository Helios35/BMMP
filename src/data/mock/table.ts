import type { RequestContext } from "@/data/contracts/context";
import type { Page, PageRequest } from "@/data/contracts/repository";
import type { Uuid } from "@/types/common";
import {
  DataIntegrityError,
  IntegrationError,
  NotFoundError,
  TenantScopeError,
} from "@/lib/errors";
import { assertPolicy, type PolicyTable } from "./policy";
import { isSeededToFail, simulateLatency } from "./runtime";

/**
 * An in-memory table, scoped and paged the way its Postgres counterpart is.
 *
 * The generic machinery every mock repository is built from. It exists so tenant
 * scoping and the policy check are applied in **one** place rather than
 * twenty-six — the failure mode this guards against is a single repository that
 * forgets the scope and leaks a tenant into a screen that then ships.
 */

export interface MockRow {
  readonly id: Uuid;
}

export interface TenantRow extends MockRow {
  readonly organizationId: Uuid;
}

/**
 * The index the requested page starts at — the one place either paging mode is
 * read, so the two table classes cannot drift.
 *
 * `PageRequest` carries a cursor **or** an offset. Both together is a caller
 * defect rather than a user-facing failure, so it is generic to the user and
 * fully detailed in the log (`TECHNICAL_SPEC.md` §10.3).
 *
 * The mock's cursor is a stringified offset, which is an implementation detail
 * of this file and of nothing else: a caller that wants numbered pages sends
 * `offset` and gets the same behaviour from `.range()` under Supabase.
 */
export function pageStart(query: PageRequest, correlationId?: string): number {
  const hasCursor = query.cursor !== undefined && query.cursor !== null;
  if (query.offset !== undefined) {
    if (hasCursor) {
      throw new DataIntegrityError({
        userMessage: "That list could not be read.",
        correlationId,
        context: { offset: query.offset, cursor: query.cursor },
      });
    }
    return query.offset < 0 ? 0 : Math.trunc(query.offset);
  }
  if (!hasCursor) return 0;
  const parsed = Number.parseInt(String(query.cursor), 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

/** A table whose rows carry `organization_id`. 27 of the 32 do. */
export class TenantTable<T extends TenantRow> {
  private rows: T[];

  constructor(
    readonly policyTable: PolicyTable,
    /** Used in `"entity.method"` seeded-failure keys and in error messages. */
    readonly entityName: string,
    seed: readonly T[],
  ) {
    this.rows = [...seed];
  }

  /** Every row, unscoped. For seeding and for tests that assert on isolation. */
  all(): readonly T[] {
    return this.rows;
  }

  replaceAll(rows: readonly T[]): void {
    this.rows = [...rows];
  }

  private scoped(ctx: RequestContext): T[] {
    // A platform admin reads across tenants only under a recorded support grant
    // (Rule 1.18). The grant lives outside this unit, so the mock scopes P6 to
    // the active organization too — narrower than production, never wider.
    return this.rows.filter((row) => row.organizationId === ctx.organizationId);
  }

  async list(
    ctx: RequestContext,
    query: PageRequest,
    matches: (row: T) => boolean,
    compare?: (a: T, b: T) => number,
  ): Promise<Page<T>> {
    await this.begin(ctx, "list", "select");
    const filtered = this.scoped(ctx).filter(matches);
    const ordered =
      compare === undefined ? filtered : [...filtered].sort(compare);
    const start = pageStart(query, ctx.correlationId);
    const items = ordered.slice(start, start + query.limit);
    const nextOffset = start + items.length;
    return {
      items,
      total: ordered.length,
      cursor: nextOffset < ordered.length ? String(nextOffset) : null,
    };
  }

  async get(ctx: RequestContext, id: Uuid): Promise<T | null> {
    await this.begin(ctx, "get", "select");
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row === undefined) return null;
    // A record belonging to another organization resolves as NOT FOUND, never as
    // forbidden. Existence is not disclosed across tenants (Rule 1.2).
    if (row.organizationId !== ctx.organizationId) return null;
    return row;
  }

  /** `get`, or a `NOT_FOUND` that does not distinguish absent from another tenant's. */
  async getOrThrow(ctx: RequestContext, id: Uuid): Promise<T> {
    const row = await this.get(ctx, id);
    if (row === null) {
      throw new NotFoundError({
        userMessage: `No ${this.entityName} was found.`,
        correlationId: ctx.correlationId,
        context: { entity: this.entityName, id },
      });
    }
    return row;
  }

  async insert(ctx: RequestContext, row: T): Promise<T> {
    await this.begin(ctx, "insert", "insert");
    if (row.organizationId !== ctx.organizationId) {
      // Unreachable through the contract, which sets organizationId from ctx.
      // Reaching it means something bypassed that, which is a sev-1 signal
      // rather than a routine denial (RUNBOOK.md F-3).
      throw new TenantScopeError({
        userMessage: "That action is not available.",
        correlationId: ctx.correlationId,
        context: {
          entity: this.entityName,
          rowOrganizationId: row.organizationId,
          contextOrganizationId: ctx.organizationId,
        },
      });
    }
    this.rows.push(row);
    return row;
  }

  /**
   * The `security definer` insert — `TECHNICAL_SPEC.md` §10.5,
   * `app.write_audit_event()`.
   *
   * **It skips the policy check and nothing else.** The tenant scope, the
   * latency simulation and the seeded failure all still apply, and the row's
   * attribution still comes from whatever the caller built out of `ctx` — the
   * elevated privilege is on the write, never on who the write claims to be.
   *
   * It exists for `audit_event` and for nothing else. §9.5 gives that table's
   * INSERT to no tenant role at all, because Postgres writes those rows from a
   * trigger and never from a user statement (Rules 12.3, 12.4) — so the caller
   * who was just denied, whose denial has to be recorded, is precisely the
   * caller who holds no INSERT (Rules 1.16, 12.6). **A repository reaching for
   * this to get around a `PermissionError` on some other table has misread the
   * denial: record it and let it stand.**
   */
  async insertAsDefiner(ctx: RequestContext, row: T): Promise<T> {
    await this.begin(ctx, "insert", null);
    if (row.organizationId !== ctx.organizationId) {
      throw new TenantScopeError({
        userMessage: "That action is not available.",
        correlationId: ctx.correlationId,
        context: {
          entity: this.entityName,
          rowOrganizationId: row.organizationId,
          contextOrganizationId: ctx.organizationId,
        },
      });
    }
    this.rows.push(row);
    return row;
  }

  async update(ctx: RequestContext, id: Uuid, patch: Partial<T>): Promise<T> {
    await this.begin(ctx, "update", "update");
    return this.patchRow(ctx, id, patch);
  }

  /**
   * The trigger's update — the one column a trigger moves on an append-only
   * row when a superseding row lands: `status → superseded` on a
   * `damage_assessment` or a `classification_decision` (T-45, T-46).
   *
   * §9.5 gives those tables no UPDATE policy for any tenant role, because in
   * Postgres nobody issues the statement — the `after insert` trigger on the
   * superseding row does. This is that trigger's door in the mock, and like
   * {@link TenantTable.insertAsDefiner} **it skips the policy check and nothing
   * else**: tenant scope, latency and seeded failures all still apply. A
   * repository reaching for it to edit any other column has misread the
   * contract — append-only means append-only.
   */
  async updateAsDefiner(
    ctx: RequestContext,
    id: Uuid,
    patch: Partial<T>,
  ): Promise<T> {
    await this.begin(ctx, "update", null);
    return this.patchRow(ctx, id, patch);
  }

  private patchRow(ctx: RequestContext, id: Uuid, patch: Partial<T>): T {
    const index = this.rows.findIndex(
      (candidate) =>
        candidate.id === id && candidate.organizationId === ctx.organizationId,
    );
    if (index === -1) {
      throw new NotFoundError({
        userMessage: `No ${this.entityName} was found.`,
        correlationId: ctx.correlationId,
        context: { entity: this.entityName, id },
      });
    }
    const existing = this.rows[index] as T;
    const next = { ...existing, ...patch, id: existing.id } as T;
    this.rows[index] = next;
    return next;
  }

  /** `action: null` is the `security definer` path — see {@link TenantTable.insertAsDefiner}. */
  private async begin(
    ctx: RequestContext,
    method: string,
    action: "select" | "insert" | "update" | null,
  ): Promise<void> {
    const key = `${this.entityName}.${method}`;
    await simulateLatency(key);
    if (isSeededToFail(key)) {
      throw new IntegrationError({
        userMessage:
          "We could not reach the records service. Nothing was changed — try again.",
        correlationId: ctx.correlationId,
        context: { seededFailure: key },
      });
    }
    if (action !== null) assertPolicy(ctx, this.policyTable, action);
  }
}

/**
 * A table with no `organization_id` — `"user"` and the three platform rule
 * tables. Four of the thirty-two (`ERD.md` §12.1).
 */
export class PlatformTable<T extends MockRow> {
  private rows: T[];

  constructor(
    readonly policyTable: PolicyTable,
    readonly entityName: string,
    seed: readonly T[],
  ) {
    this.rows = [...seed];
  }

  all(): readonly T[] {
    return this.rows;
  }

  replaceAll(rows: readonly T[]): void {
    this.rows = [...rows];
  }

  async list(
    ctx: RequestContext,
    query: PageRequest,
    matches: (row: T) => boolean,
    compare?: (a: T, b: T) => number,
  ): Promise<Page<T>> {
    await this.begin(ctx, "list", "select");
    const filtered = this.rows.filter(matches);
    const ordered =
      compare === undefined ? filtered : [...filtered].sort(compare);
    const start = pageStart(query, ctx.correlationId);
    const items = ordered.slice(start, start + query.limit);
    const nextOffset = start + items.length;
    return {
      items,
      total: ordered.length,
      cursor: nextOffset < ordered.length ? String(nextOffset) : null,
    };
  }

  async get(ctx: RequestContext, id: Uuid): Promise<T | null> {
    await this.begin(ctx, "get", "select");
    return this.rows.find((candidate) => candidate.id === id) ?? null;
  }

  async getOrThrow(ctx: RequestContext, id: Uuid): Promise<T> {
    const row = await this.get(ctx, id);
    if (row === null) {
      throw new NotFoundError({
        userMessage: `No ${this.entityName} was found.`,
        correlationId: ctx.correlationId,
        context: { entity: this.entityName, id },
      });
    }
    return row;
  }

  async insert(ctx: RequestContext, row: T): Promise<T> {
    await this.begin(ctx, "insert", "insert");
    this.rows.push(row);
    return row;
  }

  async update(ctx: RequestContext, id: Uuid, patch: Partial<T>): Promise<T> {
    await this.begin(ctx, "update", "update");
    const index = this.rows.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      throw new NotFoundError({
        userMessage: `No ${this.entityName} was found.`,
        correlationId: ctx.correlationId,
        context: { entity: this.entityName, id },
      });
    }
    const existing = this.rows[index] as T;
    const next = { ...existing, ...patch, id: existing.id } as T;
    this.rows[index] = next;
    return next;
  }

  private async begin(
    ctx: RequestContext,
    method: string,
    action: "select" | "insert" | "update",
  ): Promise<void> {
    const key = `${this.entityName}.${method}`;
    await simulateLatency(key);
    if (isSeededToFail(key)) {
      throw new IntegrationError({
        userMessage:
          "We could not reach the records service. Nothing was changed — try again.",
        correlationId: ctx.correlationId,
        context: { seededFailure: key },
      });
    }
    assertPolicy(ctx, this.policyTable, action);
  }
}

/** Matches every row. The default filter. */
export function always(): boolean {
  return true;
}

/** `undefined` in a query means "do not filter on this field". */
export function eq<V>(expected: V | undefined, actual: V): boolean {
  return expected === undefined || expected === actual;
}

/** Case-insensitive substring match over the fields a query's `search` covers. */
export function matchesSearch(
  search: string | undefined,
  ...fields: readonly (string | null | undefined)[]
): boolean {
  if (search === undefined || search.trim() === "") return true;
  const needle = search.trim().toLowerCase();
  return fields.some(
    (field) =>
      typeof field === "string" && field.toLowerCase().includes(needle),
  );
}

/** Newest first, on an ISO timestamp field. */
export function byNewest(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}
