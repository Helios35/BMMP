import type { RequestContext } from "./context";
import type { Uuid } from "@/types/common";

/**
 * The two repository shapes every entity is reached through —
 * `TECHNICAL_SPEC.md` §5.2.
 */

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly cursor: string | null;
}

export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string | null;
  /**
   * Page-indexed access for a numbered pager. **Mutually exclusive with
   * {@link PageRequest.cursor} — supplying both is a caller defect and every
   * adapter rejects it rather than silently preferring one.**
   *
   * A cursor cannot express "jump to page 4", which is exactly what the numbered
   * `Pagination` in `UX_SPEC.md` §2.7 renders. The alternative — reading the
   * mock's cursor, which happens today to be a stringified offset — is the seam
   * leaking: it would work on `mock` and break on `supabase`, which is the one
   * failure the contract exists to prevent (D-16, D-19).
   *
   * Supabase implements it with `.range(offset, offset + limit - 1)`; the mock
   * slices from it. Cursor paging stays for callers that stream a whole table.
   */
  readonly offset?: number;
}

/** A standard mutable entity. */
export interface Repository<T, TCreate, TUpdate, TQuery> {
  list(ctx: RequestContext, query: TQuery & PageRequest): Promise<Page<T>>;
  get(ctx: RequestContext, id: Uuid): Promise<T | null>;
  create(ctx: RequestContext, input: TCreate): Promise<T>;
  update(ctx: RequestContext, id: Uuid, input: TUpdate): Promise<T>;
}

/**
 * An append-only entity. **Structurally cannot be updated: there is no update
 * method.**
 *
 * A correction is a **new row** carrying `supersedes*Id`; the superseded row
 * stays and stays readable. Immutability is expressed three times — no method on
 * the contract, no UPDATE/DELETE policy in Postgres, and a trigger that raises
 * even for the service role (`TECHNICAL_SPEC.md` §9.5).
 */
export interface AppendOnlyRepository<T, TCreate, TQuery> {
  list(ctx: RequestContext, query: TQuery & PageRequest): Promise<Page<T>>;
  get(ctx: RequestContext, id: Uuid): Promise<T | null>;
  append(ctx: RequestContext, input: TCreate): Promise<T>;
}

/**
 * The fields the adapter sets from `ctx` and the database, never the caller.
 *
 * **A caller cannot write into another tenant even by accident**
 * (`TECHNICAL_SPEC.md` §5.2). `createdAt` is never supplied by the application
 * (`ERD.md` §2.2), and per-organization sequence numbers are allocated inside
 * the insert transaction under the organization row lock.
 */
export type AdapterManagedFields =
  | "id"
  | "organizationId"
  | "createdAt"
  | "updatedAt"
  | "createdBy"
  | "updatedBy";

/** The create input for a mutable entity: everything except what the adapter sets. */
export type CreateInput<T, TExtraOmit extends keyof T = never> = Omit<
  T,
  Extract<AdapterManagedFields, keyof T> | TExtraOmit
>;

/**
 * The append input for an append-only entity.
 *
 * Same exclusions. Append-only rows carry `createdAt` but no `updatedAt`, and
 * the `Omit` handles either shape.
 */
export type AppendInput<T, TExtraOmit extends keyof T = never> = CreateInput<
  T,
  TExtraOmit
>;

/**
 * The update input for a mutable entity.
 *
 * Partial by definition, and never touches the adapter-managed fields or
 * whatever else the entity declares immutable.
 */
export type UpdateInput<T, TExtraOmit extends keyof T = never> = Partial<
  Omit<T, Extract<AdapterManagedFields, keyof T> | TExtraOmit>
>;

/** Every query shape carries these. Sorting is per entity where it differs. */
export interface BaseQuery {
  /** Free-text search over the entity's searchable fields. */
  readonly search?: string;
}

/**
 * Explicit, typed sort. **No adapter accepts a raw sort string** (see
 * `./index.ts`) — a sort field arrives from a URL query parameter, and a
 * `sortBy` typed `string` is a column name a caller chose.
 *
 * Each entity declares its own sortable field union, so a field that is not
 * sortable is a type error rather than an adapter that silently ignores it. The
 * default direction and the default field belong to the adapter, not here: two
 * adapters that disagree about what "unsorted" means is how a Playwright
 * assertion on row order passes on mock and fails on Supabase.
 */
export interface SortRequest<TField extends string> {
  readonly sortBy?: TField;
  readonly sortDirection?: "asc" | "desc";
}
