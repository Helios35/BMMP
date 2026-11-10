import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { formatInstant } from "@/components/extraction-review";
import type { Uuid } from "@/types/common";

import type { ReferencePhotoView } from "../components/reference-photo";

/** Well beyond any entry's replacements. */
const HISTORY_LIMIT = 50;

/**
 * An entry's current reference label photo as the two catalog pages show it,
 * or `null` — "None on file" (Rule 2.36). The time reads in the viewer's
 * organization's zone; a platform row has none of its own.
 */
export async function readReferencePhotoView(
  ctx: RequestContext,
  catalogEntryId: Uuid,
): Promise<ReferencePhotoView | null> {
  const [current, history, organization] = await Promise.all([
    data.catalogReferencePhotos.current(ctx, catalogEntryId),
    data.catalogReferencePhotos.list(ctx, {
      catalogEntryId,
      limit: HISTORY_LIMIT,
    }),
    data.organizations.get(ctx, ctx.organizationId),
  ]);
  if (current === null) return null;
  const setter = await data.users.get(ctx, current.setBy);
  return {
    widthPx: current.widthPx,
    heightPx: current.heightPx,
    fileName: current.fileName,
    setByName: setter === null ? null : (setter.fullName ?? setter.email),
    setAtText: formatInstant(current.setAt, organization?.timeZone ?? "UTC"),
    replacedCount: history.items.filter((row) => row.id !== current.id).length,
  };
}
