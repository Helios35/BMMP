import type {
  ListQuery,
  ListQuerySpec,
} from "@/components/record-table/list-url";
import type { AuditEventQuery } from "@/data/contracts";
import { AUDIT_ACTOR_TYPES } from "@/domain/taxonomy/audit-actor-type";
import { AUDIT_EVENT_TYPES } from "@/domain/taxonomy/audit-event-type";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { TimeZone } from "@/types/common";

import {
  endOfCivilDayInZone,
  isCivilDate,
  startOfCivilDayInZone,
} from "./civil-day-bounds";

/**
 * The one place `/audit`'s URL is turned into a query.
 *
 * **The screen and the export read the same module.** `UX_SPEC.md` §3.20's
 * export anchor carries the page's current filter state so the two always agree
 * about scope, and Rule 12.17 puts the scoping obligation on the export itself —
 * both of which are only true if one function decides what a URL means. A second
 * decoder in the route handler is how an export comes to contain a row the
 * screen was not showing.
 *
 * It is pure: strings in, a query object out. Every read still goes through
 * `src/data`, and the adapter still applies tenant scope and the policy matrix
 * underneath whatever this produces.
 */

/**
 * The query parameters `/audit` narrows on.
 *
 * These are the **screen's** names. The export endpoint's names are
 * `TECHNICAL_SPEC.md` §7.2's and are mapped in {@link auditExportHref} — one
 * mapping, in one file, rather than two vocabularies that drift.
 *
 * None of them may collide with a key the list codec owns
 * (`SITE_ARCHITECTURE.md` §7.4 rule 5); the codec asserts that at first render.
 */
export const AUDIT_FILTER_IDS = [
  "from",
  "to",
  "actor",
  "type",
  "actorType",
  "entity",
] as const;

export type AuditFilterId = (typeof AUDIT_FILTER_IDS)[number];

/**
 * **Newest first**, and the timestamp is the only sortable column.
 *
 * `src/data/contracts/audit.ts` is explicit about why: an audit log sorted by
 * actor or by event type stops being a chronology, and the chronology is the
 * evidence.
 *
 * `type` and `actorType` are bounded by their taxonomy, so a link carrying a
 * value this build does not know falls back to "any" instead of filtering the
 * list to nothing. `actor` and `entity` are not bounded here — an actor id and a
 * table name are data, not a taxonomy, and inventing a list of either would be
 * inventing a vocabulary (`TAXONOMY.md` §1.1).
 */
export const AUDIT_LIST_SPEC: ListQuerySpec = {
  sortableColumnIds: ["occurredAt"],
  defaultSort: "occurredAt",
  defaultDir: "desc",
  filterIds: AUDIT_FILTER_IDS,
  filterValues: {
    type: AUDIT_EVENT_TYPES,
    actorType: AUDIT_ACTOR_TYPES,
  },
};

/** The decoded range, as instants, for the zone the timestamps render in. */
export interface AuditRange {
  readonly occurredAfter: string | undefined;
  readonly occurredBefore: string | undefined;
}

/**
 * The reader's date range as two instants in the organization's zone.
 *
 * A value that is not a calendar date is dropped rather than rejected — an
 * invalid parameter never renders an error page (§7.4 rule 2).
 */
export function auditRange(query: ListQuery, timeZone: TimeZone): AuditRange {
  const from = query.filters.from;
  const to = query.filters.to;
  return {
    occurredAfter: isCivilDate(from)
      ? startOfCivilDayInZone(from, timeZone)
      : undefined,
    occurredBefore: isCivilDate(to)
      ? endOfCivilDayInZone(to, timeZone)
      : undefined,
  };
}

/**
 * The adapter query for a decoded URL.
 *
 * **Nothing here removes a row from the default view.** A denial, an override
 * and an export are ordinary event types (T-43) and are only excluded when the
 * reader asks for one type explicitly — Rules 1.16, 12.6, `SITE_ARCHITECTURE.md`
 * §5.3(8): attempts are evidence, and evidence a screen quietly filters out is
 * evidence the screen destroyed.
 */
export function toAuditEventQuery(
  query: ListQuery,
  timeZone: TimeZone,
): AuditEventQuery {
  const range = auditRange(query, timeZone);
  const actorType = query.filters.actorType;

  return {
    search: query.q ?? undefined,
    occurredAfter: range.occurredAfter,
    occurredBefore: range.occurredBefore,
    actorUserId: query.filters.actor,
    eventType: query.filters.type,
    // T-60, narrowed rather than cast: an unrecognised value is dropped, never
    // forced into a union member it is not.
    actorType:
      actorType !== undefined && isTaxonomyValue(AUDIT_ACTOR_TYPES, actorType)
        ? actorType
        : undefined,
    entityTable: query.filters.entity,
    sortBy: "occurredAt",
    sortDirection: query.dir ?? "desc",
  };
}

/** Where the CSV export lives — `TECHNICAL_SPEC.md` §7.2. */
export const AUDIT_EXPORT_PATH = "/api/exports/audit";

/**
 * The screen's filter id to the export endpoint's parameter name.
 *
 * `TECHNICAL_SPEC.md` §7.2 fixes `from`, `to`, `entityTable`, `actionCode` and
 * `format` on this endpoint. `actor`, `actorType` and `q` are not in that row
 * and are carried anyway, because §3.20 requires the export to match the screen's
 * scope and the screen narrows on all three — reported for a one-cell
 * documentation amendment rather than resolved by dropping a filter and letting
 * the export quietly return more than the reader was looking at.
 */
const EXPORT_PARAM_NAME: Readonly<Record<AuditFilterId, string>> = {
  from: "from",
  to: "to",
  entity: "entityTable",
  type: "actionCode",
  actor: "actor",
  actorType: "actorType",
};

/** The only format this unit builds. §7.2 also names JSON; see the build notes. */
export const AUDIT_EXPORT_FORMAT = "csv";

/**
 * The export href for the view currently on screen.
 *
 * Page and page size are deliberately absent: an export is the whole scope the
 * reader narrowed to, not the twenty-five rows they happen to be looking at.
 */
export function auditExportHref(query: ListQuery): string {
  const params = new URLSearchParams();

  if (query.q !== null) params.set("q", query.q);
  if (query.dir !== null) params.set("dir", query.dir);
  for (const id of AUDIT_FILTER_IDS) {
    const value = query.filters[id];
    if (value !== undefined && value !== "") {
      params.set(EXPORT_PARAM_NAME[id], value);
    }
  }
  params.set("format", AUDIT_EXPORT_FORMAT);

  return `${AUDIT_EXPORT_PATH}?${params.toString()}`;
}

/**
 * The export endpoint's own parameters, read back into the screen's vocabulary.
 *
 * The route handler decodes with the same codec and the same spec the page uses,
 * so *"the export and the screen always agree about scope"* is structural rather
 * than a habit two files share.
 */
export function auditExportSearchParams(
  url: URL,
): Readonly<Record<string, string>> {
  const decoded: Record<string, string> = {};

  const q = url.searchParams.get("q");
  if (q !== null) decoded.q = q;
  const dir = url.searchParams.get("dir");
  if (dir !== null) decoded.dir = dir;

  for (const id of AUDIT_FILTER_IDS) {
    const value = url.searchParams.get(EXPORT_PARAM_NAME[id]);
    if (value !== null && value !== "") decoded[id] = value;
  }

  return decoded;
}
