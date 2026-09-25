/**
 * T-48 · Alert severity
 *
 * **Stored on:** `alert.severity`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * States how urgently an alert must be acted on, so that every surface that renders an alert — the dashboard region, the alert bell, the container list — orders and styles it the same way without re-deriving urgency from the alert's subject.
 *
 * **Set by the code that raises the alert, from the condition that raised it** —
 * never a property of the alert type (T-44), and **never derived from the
 * storage clock's alert band** (T-27): the band ladder is jurisdiction data
 * whose tier count varies, and this is three values platform-wide.
 *
 * **Frozen at insert.** A condition that worsens raises a *new* alert; it never
 * edits an old one's severity, because the alert row is evidence (`ERD.md`
 * §6.5).
 *
 * **An unrecognised severity renders as `neutral` and is never guessed upward**
 * into `critical` — inventing urgency in a compliance product is worse than
 * showing none. **No severity ever states or implies a probability of
 * ignition** (Rules 1.25, 10.3).
 *
 * ## The one label that contains its value
 *
 * `attention` reads "Needs attention" — authored so by the owner (D-30).
 * `TAXONOMY.md` §4.5 forbids a label containing its stored value, and its
 * example is a machine value shown to a human in brackets, "Light waste
 * category (light_category)". An ordinary English word the label happens to
 * share is not that shape. The owner kept the label (unit `b1a-04-containers`,
 * reported in its build-notes), and the §4.5 test exempts this one value by
 * name rather than loosening the rule for every system.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-48, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7), and here also the urgency
 * order: `critical` before `attention` before `informational` — and the display
 * label, and owns no transition.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const ALERT_SEVERITIES = [
  "critical",
  "attention",
  "informational",
] as const;

export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/**
 * Stored value to display label. **The only place a T-48 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const ALERT_SEVERITY_LABELS: Readonly<Record<AlertSeverity, string>> = {
  critical: "Critical",
  attention: "Needs attention",
  informational: "For information",
};
