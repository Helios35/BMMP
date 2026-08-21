import type { Alert } from "@/types/storage";

/**
 * The order the alert bell lists open alerts in — pinned first, then newest.
 *
 * ## Why there is no severity rank here
 *
 * T-48 governs `alert.severity` and **has no module in `src/domain/taxonomy/`**;
 * `alert.severity` is still typed `string` (`src/types/storage.ts`). A rank
 * constant over three string literals would be a fifteenth taxonomy system
 * invented in a component, and `TAXONOMY.md` §1.1 is explicit that a value not in
 * `src/domain/taxonomy/` does not exist yet. So the bell orders on facts the
 * record already carries: whether the alert is pinned, and when it was raised.
 * That order is correct, is stable, and needs nothing T-48 has not settled.
 *
 * **An unrecognised severity is never filtered out and never guessed upward**
 * (`TAXONOMY.md` §5.8) — it is not consulted here at all, so it cannot be.
 */

/**
 * Alert types that pin to the top and **cannot be dismissed by any role,
 * including P6** (Rules 4.15, 4.16).
 */
const PINNED_ALERT_TYPES: readonly string[] = ["storage_clock"];

/** Whether this alert pins — an unresolved alert of a pinned type. */
export function isPinnedAlert(alert: Alert): boolean {
  return (
    PINNED_ALERT_TYPES.includes(alert.alertType) && alert.resolvedAt === null
  );
}

/**
 * Pinned before unpinned, newest before older, then `id` ascending.
 *
 * The final tiebreak is what makes the order **stable across renders** — two
 * alerts raised in the same millisecond must not swap places between the server
 * render and the client one.
 */
export function compareAlertsForBell(a: Alert, b: Alert): number {
  const pinned = Number(isPinnedAlert(b)) - Number(isPinnedAlert(a));
  if (pinned !== 0) return pinned;

  if (a.raisedAt !== b.raisedAt) return a.raisedAt < b.raisedAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortAlertsForBell(alerts: readonly Alert[]): readonly Alert[] {
  return [...alerts].sort(compareAlertsForBell);
}
