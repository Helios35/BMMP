import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import type { Uuid } from "@/types/common";

/**
 * Display names for the people a record names.
 *
 * **`users.get`, one id at a time, and never `users.list`.** `user` is a
 * platform table with an unscoped read, so listing it from a tenant screen would
 * hand a reader every account on the platform. Every id resolved here came out
 * of one of this organisation's own rows — a confirmer, a photographer, an
 * actor on an audit event — so asking for it by id discloses nothing the reader
 * could not already see.
 *
 * A name that cannot be resolved is **absent, not invented**: the caller renders
 * the attribution it has rather than a placeholder person.
 */
export async function resolveUserNames(
  ctx: RequestContext,
  ids: readonly (Uuid | null)[],
): Promise<ReadonlyMap<Uuid, string>> {
  const unique = [...new Set(ids.filter((id): id is Uuid => id !== null))];
  const resolved = await Promise.all(
    unique.map(async (id) => [id, await data.users.get(ctx, id)] as const),
  );

  const names = new Map<Uuid, string>();
  for (const [id, user] of resolved) {
    if (user === null) continue;
    names.set(id, user.fullName ?? user.email);
  }
  return names;
}
