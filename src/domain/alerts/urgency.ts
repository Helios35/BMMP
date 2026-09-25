import { ALERT_SEVERITIES } from "@/domain/taxonomy/alert-severity";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";

/**
 * The order every surface lists open alerts in — T-48's ordering rule.
 *
 * *"Where alerts are ordered by urgency, `critical` before `attention` before
 * `informational`, and within `critical` an overdue storage clock is pinned
 * above everything else and is dismissible by no role, including P6"*
 * (`TAXONOMY.md` T-48; E-6). The bell, the dashboard region and the alert card
 * read this one module, so no two of them can disagree about what is on top.
 *
 * **Severity is read as stored, never re-derived from the subject.** An
 * unrecognised severity sorts after every known one — it is never guessed
 * upward into `critical`, and it is never filtered out (`TAXONOMY.md` §5.8).
 */

/** The facts an order needs. Structural, so the domain imports no entity type. */
export interface AlertUrgencyFacts {
  readonly id: string;
  readonly alertType: string;
  readonly severity: string;
  readonly raisedAt: string;
  readonly resolvedAt: string | null;
}

/**
 * Whether an alert pins: an **open overdue storage clock**.
 *
 * T-48 sets an overdue storage clock at `critical` and a clock in a band short
 * of overdue at `attention`, so the pair (type, severity) names the overdue
 * condition without reading the clock — the alert row is the record of what
 * was true when it was raised.
 */
export function isPinnedAlert(alert: AlertUrgencyFacts): boolean {
  return (
    alert.alertType === "storage_clock" &&
    alert.severity === "critical" &&
    alert.resolvedAt === null
  );
}

/** T-48's value order is its urgency order; an unknown value ranks last. */
function severityRank(severity: string): number {
  return isTaxonomyValue(ALERT_SEVERITIES, severity)
    ? ALERT_SEVERITIES.indexOf(severity)
    : ALERT_SEVERITIES.length;
}

/**
 * Pinned first, then by severity, then newest, then `id` ascending.
 *
 * The final tiebreak is what makes the order **stable across renders** — two
 * alerts raised in the same millisecond must not swap places between the server
 * render and the client one.
 */
export function compareAlertsByUrgency(
  a: AlertUrgencyFacts,
  b: AlertUrgencyFacts,
): number {
  const pinned = Number(isPinnedAlert(b)) - Number(isPinnedAlert(a));
  if (pinned !== 0) return pinned;

  const severity = severityRank(a.severity) - severityRank(b.severity);
  if (severity !== 0) return severity;

  if (a.raisedAt !== b.raisedAt) return a.raisedAt < b.raisedAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
