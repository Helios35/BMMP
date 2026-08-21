"use server";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import type { AppRoute } from "@/domain/access/routes";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { publicContext, resolveRequestContext } from "@/lib/auth/session";

import {
  PALETTE_GROUP_HEADINGS,
  PALETTE_RESULTS_PER_GROUP,
  type PaletteGroup,
  type PaletteGroupId,
  type PaletteResult,
  type PaletteResults,
} from "@/features/shell/command-palette/palette-types";

/**
 * The command palette's search — `UX_SPEC.md` §2.14.
 *
 * **It writes nothing and revalidates nothing.** It is a Server Action rather
 * than a Server Component because a keystroke cannot be served by a render, and
 * rather than a route handler because none of `TECHNICAL_SPEC.md` §7.2's three
 * criteria holds — the response is JSON, the caller is the BMMP UI, and there is
 * no upload. A `GET /api/search` would be a second surface over the data layer,
 * which is a second place to get tenancy wrong.
 *
 * **The role filter is the whole point of §2.14.** A scope whose detail route
 * this role cannot read is **not queried at all** — not queried and then
 * filtered — so the palette can never surface a destination the guard will
 * refuse (§5.3(7)).
 *
 * Tenant scoping needs no code here: every read carries `ctx`, and a row in
 * another organisation is invisible rather than forbidden (Rule 1.2).
 */

const MAXIMUM_QUERY_LENGTH = 120;

interface PaletteScope {
  readonly group: Exclude<PaletteGroupId, "pages">;
  /** The route a result in this group navigates to. */
  readonly detailRoute: AppRoute;
}

const SCOPES: readonly PaletteScope[] = [
  { group: "batteries", detailRoute: "/batteries/[id]" },
  { group: "catalog", detailRoute: "/catalog/[id]" },
  // b1a-04: { group: "containers", detailRoute: "/containers/[id]" } — P3, P4
  //         and P5 hold `none` there, so they get no container results at all.
  // b1a-05: { group: "shipments", detailRoute: "/shipments/[id]" }
];

/** Trimmed, whitespace collapsed and capped, exactly as `RecordTable`'s `?q=` is. */
function normaliseQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalised = value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAXIMUM_QUERY_LENGTH);
  return normalised === "" ? null : normalised;
}

function joinNonEmpty(parts: readonly (string | null)[]): string | null {
  const kept = parts.filter(
    (part): part is string => part !== null && part !== "",
  );
  return kept.length === 0 ? null : kept.join(" · ");
}

async function batteryResults(
  ctx: RequestContext,
  query: string,
): Promise<readonly PaletteResult[]> {
  const page = await data.batteryRecords.list(ctx, {
    search: query,
    limit: PALETTE_RESULTS_PER_GROUP,
  });

  return page.items.map((record) => ({
    id: record.id,
    group: "batteries" as const,
    label:
      joinNonEmpty([record.manufacturerName, record.modelName]) ??
      record.recordNumber,
    detail: record.recordNumber,
    detailIsMono: true,
    href: `/batteries/${record.id}`,
  }));
}

async function catalogResults(
  ctx: RequestContext,
  query: string,
): Promise<readonly PaletteResult[]> {
  const page = await data.catalogEntries.list(ctx, {
    search: query,
    limit: PALETTE_RESULTS_PER_GROUP,
  });

  return page.items.map((entry) => ({
    id: entry.id,
    group: "catalog" as const,
    label:
      joinNonEmpty([entry.manufacturerName, entry.modelName]) ??
      entry.manufacturerName,
    ...(entry.partNumber === null
      ? {}
      : { detail: entry.partNumber, detailIsMono: true }),
    href: `/catalog/${entry.id}`,
  }));
}

export async function searchCommandPalette(input: {
  q: string;
}): Promise<ActionResult<PaletteResults>> {
  const resolution = await resolveRequestContext();

  if (resolution.kind !== "resolved") {
    const pub = await publicContext();
    return actionFailed({
      code: "UNAUTHENTICATED",
      message: "You were signed out. Sign in again and try that once more.",
      correlationId: pub.correlationId,
    });
  }

  const { ctx } = resolution.session;
  const query = normaliseQuery(input.q);

  if (query === null) {
    return actionFailed({
      code: "VALIDATION",
      message: "Type something to search for.",
      field: "q",
      correlationId: ctx.correlationId,
    });
  }

  try {
    const groups: PaletteGroup[] = [];

    for (const scope of SCOPES) {
      if (!canReadRoute(ctx.role, scope.detailRoute)) continue;

      const results =
        scope.group === "batteries"
          ? await batteryResults(ctx, query)
          : await catalogResults(ctx, query);

      if (results.length > 0) {
        groups.push({
          group: scope.group,
          heading: PALETTE_GROUP_HEADINGS[scope.group],
          results,
        });
      }
    }

    return actionSucceeded({ query, groups });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}
