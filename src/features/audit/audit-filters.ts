import type {
  RecordTableFilter,
  RecordTableFilterOption,
} from "@/components/record-table/record-table-filters";
import {
  AUDIT_ACTOR_TYPE_LABELS,
  AUDIT_ACTOR_TYPES,
} from "@/domain/taxonomy/audit-actor-type";
import {
  AUDIT_EVENT_TYPE_LABELS,
  AUDIT_EVENT_TYPES,
} from "@/domain/taxonomy/audit-event-type";
import { optionsFor } from "@/domain/taxonomy/lookup";

/**
 * `/audit`'s bounded filters — `UX_SPEC.md` §3.20.
 *
 * **The event-type options come from T-43 itself**, in the taxonomy's own order,
 * which is the display order (`TAXONOMY.md` §5.7). That is why `denial.recorded`,
 * `override.recorded` and `export.generated` are offered: the taxonomy carries
 * them, so the screen does. **Nothing filters a denial out of the default view**
 * — attempts are evidence (Rules 1.16, 12.6; `SITE_ARCHITECTURE.md` §5.3(8)),
 * and a screen that hides them destroys the record it exists to show.
 *
 * The actor-type options are T-60's, which is how an auditor asks the log what
 * the platform did inside their tenant (Rules 1.18, 12.7).
 *
 * The date range is not here: it is not a bounded set, so it is its own control
 * (`components/audit-range-filter.tsx`) writing through the same URL codec.
 */
export function auditFilters(
  actorOptions: readonly RecordTableFilterOption[],
): readonly RecordTableFilter[] {
  return [
    {
      id: "actor",
      label: "Actor",
      options: actorOptions,
      anyLabel: "Anyone",
    },
    {
      id: "type",
      label: "Event type",
      options: optionsFor(AUDIT_EVENT_TYPES, AUDIT_EVENT_TYPE_LABELS),
      anyLabel: "Any event type",
    },
    {
      id: "actorType",
      label: "Actor type",
      options: optionsFor(AUDIT_ACTOR_TYPES, AUDIT_ACTOR_TYPE_LABELS),
      anyLabel: "Any actor type",
    },
  ];
}
