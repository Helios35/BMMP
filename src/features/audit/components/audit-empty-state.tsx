import { FileClock } from "lucide-react";

import { EmptyState } from "@/components/page/empty-state";

/**
 * `/audit` with nothing in it — **E-15, "zero audit events"**.
 *
 * The headline is E-15's exact copy. The rest is §5's other three parts — what is
 * true, why, what makes rows appear, and who produces them — because an empty
 * state that ships three of the four is a defect.
 *
 * **No action button**, and that is deliberate. `RecordTable` routes a narrowed
 * result to its own *filters exclude everything* state, so this branch is only
 * reached with **no filter and no search applied**: a **Clear filters** control
 * here would clear nothing, and showing an inert action is worse than showing
 * none. The reachable action, once anything has happened, is the filter row above.
 *
 * §3.20 notes that this state is *"practically unreachable, since sign-in is an
 * event"* — it is still built, because an organization reading its log on its
 * first day is exactly the reader who deserves a sentence rather than a blank.
 */
export function AuditEmptyState() {
  return (
    <EmptyState
      icon={FileClock}
      title="No activity in this range."
      description="Nothing has been recorded for this organization yet. Rows appear here on their own as people work — every sign-in, every battery logged, every document issued and every refused action is written to this log by the system, and no one can add to it or remove from it by hand."
      dataAttributes={{ "data-audit-empty": "zero-records" }}
    />
  );
}
