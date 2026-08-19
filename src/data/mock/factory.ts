import type { RequestContext } from "@/data/contracts/context";
import type {
  AppendOnlyRepository,
  Page,
  PageRequest,
  Repository,
} from "@/data/contracts/repository";
import type { IsoTimestamp, Uuid } from "@/types/common";
import {
  PlatformTable,
  TenantTable,
  type MockRow,
  type TenantRow,
} from "./table";
import { nextId } from "./ids";

/**
 * The generic repository factories.
 *
 * Twenty-six entities behave the same way in twenty-four of their methods. They
 * are built from these so tenant scoping, the policy check and paging exist
 * once — a repository that hand-rolls its own `list` is a repository that can
 * forget the scope, and one that forgets it leaks a tenant into a screen.
 */

export function now(): IsoTimestamp {
  return new Date().toISOString();
}

interface TenantRepositoryOptions<T extends TenantRow, TCreate, TQuery> {
  /** Whether a row satisfies a query. `undefined` fields in the query do not filter. */
  readonly matches: (row: T, query: TQuery) => boolean;
  /** Display order. `TAXONOMY.md` §5.7 — never alphabetical by stored value. */
  readonly compare?: (a: T, b: T) => number;
  /**
   * Build the stored row from the caller's input.
   *
   * **The adapter sets `id`, `organizationId`, `createdAt` and `createdBy` from
   * `ctx`** — a caller cannot write into another tenant even by accident
   * (`TECHNICAL_SPEC.md` §5.2).
   */
  readonly build: (ctx: RequestContext, input: TCreate, id: Uuid) => T;
}

export function tenantRepository<T extends TenantRow, TCreate, TUpdate, TQuery>(
  table: TenantTable<T>,
  options: TenantRepositoryOptions<T, TCreate, TQuery>,
): Repository<T, TCreate, TUpdate, TQuery> {
  return {
    async list(
      ctx: RequestContext,
      query: TQuery & PageRequest,
    ): Promise<Page<T>> {
      return table.list(
        ctx,
        query,
        (row) => options.matches(row, query),
        options.compare,
      );
    },
    async get(ctx: RequestContext, id: Uuid): Promise<T | null> {
      return table.get(ctx, id);
    },
    async create(ctx: RequestContext, input: TCreate): Promise<T> {
      return table.insert(ctx, options.build(ctx, input, nextId()));
    },
    async update(ctx: RequestContext, id: Uuid, input: TUpdate): Promise<T> {
      return table.update(ctx, id, {
        ...(input as Partial<T>),
        updatedAt: now(),
        updatedBy: ctx.userId,
      } as Partial<T>);
    },
  };
}

export function tenantAppendOnlyRepository<
  T extends TenantRow,
  TCreate,
  TQuery,
>(
  table: TenantTable<T>,
  options: TenantRepositoryOptions<T, TCreate, TQuery>,
): AppendOnlyRepository<T, TCreate, TQuery> {
  return {
    async list(
      ctx: RequestContext,
      query: TQuery & PageRequest,
    ): Promise<Page<T>> {
      return table.list(
        ctx,
        query,
        (row) => options.matches(row, query),
        options.compare,
      );
    },
    async get(ctx: RequestContext, id: Uuid): Promise<T | null> {
      return table.get(ctx, id);
    },
    async append(ctx: RequestContext, input: TCreate): Promise<T> {
      return table.insert(ctx, options.build(ctx, input, nextId()));
    },
  };
}

interface PlatformRepositoryOptions<T extends MockRow, TCreate, TQuery> {
  readonly matches: (row: T, query: TQuery) => boolean;
  readonly compare?: (a: T, b: T) => number;
  readonly build: (ctx: RequestContext, input: TCreate, id: Uuid) => T;
}

export function platformRepository<T extends MockRow, TCreate, TUpdate, TQuery>(
  table: PlatformTable<T>,
  options: PlatformRepositoryOptions<T, TCreate, TQuery>,
): Repository<T, TCreate, TUpdate, TQuery> {
  return {
    async list(
      ctx: RequestContext,
      query: TQuery & PageRequest,
    ): Promise<Page<T>> {
      return table.list(
        ctx,
        query,
        (row) => options.matches(row, query),
        options.compare,
      );
    },
    async get(ctx: RequestContext, id: Uuid): Promise<T | null> {
      return table.get(ctx, id);
    },
    async create(ctx: RequestContext, input: TCreate): Promise<T> {
      return table.insert(ctx, options.build(ctx, input, nextId()));
    },
    async update(ctx: RequestContext, id: Uuid, input: TUpdate): Promise<T> {
      return table.update(ctx, id, {
        ...(input as Partial<T>),
        updatedAt: now(),
      } as Partial<T>);
    },
  };
}

export function platformAppendOnlyRepository<
  T extends MockRow,
  TCreate,
  TQuery,
>(
  table: PlatformTable<T>,
  options: PlatformRepositoryOptions<T, TCreate, TQuery>,
): AppendOnlyRepository<T, TCreate, TQuery> {
  return {
    async list(
      ctx: RequestContext,
      query: TQuery & PageRequest,
    ): Promise<Page<T>> {
      return table.list(
        ctx,
        query,
        (row) => options.matches(row, query),
        options.compare,
      );
    },
    async get(ctx: RequestContext, id: Uuid): Promise<T | null> {
      return table.get(ctx, id);
    },
    async append(ctx: RequestContext, input: TCreate): Promise<T> {
      return table.insert(ctx, options.build(ctx, input, nextId()));
    },
  };
}
