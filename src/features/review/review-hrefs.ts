/**
 * The `/review` URL — `UX_SPEC.md` §3.8a, `SITE_ARCHITECTURE.md` §7.4.
 *
 * **Selection lives in the URL.** `?item=` names the queue item open in the
 * pane, so a dashboard alert, a saved intake and a colleague's link all land
 * on the item they mean. An item is an intake session (its id) or a Flow F
 * raise (the raise's id); both are UUIDs and never collide.
 *
 * Plain strings in and out — safe on either side of the server boundary.
 */

export const REVIEW_ROUTE = "/review" as const;

export const REVIEW_ITEM_PARAM = "item";

/** Where the queue lands after an item left it — the record the item was about. */
export const REVIEW_RESOLVED_PARAM = "resolved";

/** How it left — one of {@link RESOLUTION_OUTCOMES}. A stale or edited value says nothing. */
export const REVIEW_OUTCOME_PARAM = "outcome";

/**
 * The four ways an item leaves the queue, as the notice after it names them:
 * an intake committed or voided (Rule 2.23), a Flow F raise confirmed or kept
 * as identified with a reason. Presentation only — the server decided each.
 */
export const RESOLUTION_OUTCOMES = [
  "logged",
  "voided",
  "matched",
  "kept",
] as const;

export type ResolutionOutcome = (typeof RESOLUTION_OUTCOMES)[number];

export function isResolutionOutcome(
  value: string | null,
): value is ResolutionOutcome {
  return (
    value !== null && (RESOLUTION_OUTCOMES as readonly string[]).includes(value)
  );
}

/** The href once an item has left: the next item, and what became of the one that left. */
export function afterResolvingHref(
  nextItemId: string | null,
  batteryRecordId: string,
  outcome: ResolutionOutcome,
): string {
  return reviewItemHref(nextItemId, {
    [REVIEW_RESOLVED_PARAM]: batteryRecordId,
    [REVIEW_OUTCOME_PARAM]: outcome,
  });
}

/** `/review?item=…`, or the queue itself where no item is named. */
export function reviewItemHref(
  itemId: string | null,
  extra: Readonly<Record<string, string>> = {},
): string {
  const params = new URLSearchParams();
  if (itemId !== null) params.set(REVIEW_ITEM_PARAM, itemId);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query === "" ? REVIEW_ROUTE : `${REVIEW_ROUTE}?${query}`;
}
