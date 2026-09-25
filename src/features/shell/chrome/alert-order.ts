import { compareAlertsByUrgency, isPinnedAlert } from "@/domain/alerts/urgency";
import type { Alert } from "@/types/storage";

/**
 * The order the alert bell and the dashboard region list open alerts in.
 *
 * T-48's ordering, from `src/domain/alerts/urgency.ts`: an open overdue storage
 * clock pinned above everything, then `critical` before `attention` before
 * `informational`, then newest. **An unrecognised severity is never filtered
 * out and never guessed upward** (`TAXONOMY.md` §5.8) — it sorts after the
 * three known ones.
 */

export { isPinnedAlert };

export function compareAlertsForBell(a: Alert, b: Alert): number {
  return compareAlertsByUrgency(a, b);
}

export function sortAlertsForBell(alerts: readonly Alert[]): readonly Alert[] {
  return [...alerts].sort(compareAlertsForBell);
}
