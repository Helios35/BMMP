"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  encodeListQuery,
  type ListQuery,
  type ListQuerySpec,
} from "@/components/record-table/list-url";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * `/audit`'s date range — `UX_SPEC.md` §3.20's first filter.
 *
 * It writes `?from=` and `?to=` through the **same list codec** every other
 * control on the page uses, so the range survives a sort click, is carried into
 * the export href, counts toward the mobile **Filters** badge and is cleared by
 * **Clear filters** (`SITE_ARCHITECTURE.md` §7.4). It is rendered here rather
 * than inside `RecordTable`'s filter row because that row takes bounded
 * selects, and a date range is not a bounded set.
 *
 * The two values are **calendar dates in the organization's zone**, resolved to
 * instants server-side (`civil-day-bounds.ts`, Rule 12.20) — never in the
 * reader's browser zone, which would make two people reading the same link see
 * different rows.
 */

export interface AuditRangeFilterProps {
  readonly basePath: string;
  readonly query: ListQuery;
  readonly spec: ListQuerySpec;
  /** The short zone name shown once, so the range and the column agree. */
  readonly zoneLabel: string;
}

export function AuditRangeFilter({
  basePath,
  query,
  spec,
  zoneLabel,
}: AuditRangeFilterProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fromId = useId();
  const toId = useId();

  function apply(id: "from" | "to", value: string) {
    const filters: Record<string, string> = { ...query.filters };
    if (value === "") delete filters[id];
    else filters[id] = value;

    startTransition(() => {
      router.push(encodeListQuery(basePath, query, { filters }, spec), {
        scroll: false,
      });
    });
  }

  return (
    <div
      data-audit-range-filter="true"
      className="flex flex-wrap items-end gap-2"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={fromId} className="text-caption text-muted-foreground">
          {`From (${zoneLabel})`}
        </Label>
        <Input
          // Keyed on the URL value so **Clear filters** empties the box.
          // An uncontrolled input keeps whatever was typed into it, and a range
          // control still showing a range the list is no longer narrowed by is a
          // screen lying about its own scope.
          key={`from:${query.filters.from ?? ""}`}
          id={fromId}
          type="date"
          name="from"
          defaultValue={query.filters.from ?? ""}
          onChange={(event) => {
            apply("from", event.target.value);
          }}
          className="min-h-11 w-44 rounded-md text-label"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={toId} className="text-caption text-muted-foreground">
          {`To (${zoneLabel})`}
        </Label>
        <Input
          key={`to:${query.filters.to ?? ""}`}
          id={toId}
          type="date"
          name="to"
          defaultValue={query.filters.to ?? ""}
          onChange={(event) => {
            apply("to", event.target.value);
          }}
          className="min-h-11 w-44 rounded-md text-label"
        />
      </div>
    </div>
  );
}
