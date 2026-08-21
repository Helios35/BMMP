"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  activeFilterCount,
  encodeListQuery,
  type ListQuery,
  type ListQuerySpec,
} from "./list-url";

/**
 * The bounded filters — inline from `md` up, inside a bottom `Sheet` below it
 * (`UX_SPEC.md` §2.7, §4.2).
 *
 * Each change is a URL write, so a filtered view is a link a colleague can open.
 * `router.push`, not `replace`: choosing a filter is a navigation the reader
 * should be able to undo with Back.
 */

/**
 * Radix `Select` cannot carry an empty string as a value, so "any value" needs a
 * sentinel. It never reaches the URL — the codec drops the filter instead.
 */
const ANY_VALUE = "__any__";

export interface RecordTableFilterOption {
  readonly value: string;
  readonly label: string;
}

export interface RecordTableFilter {
  /** The query-parameter key. Never one of `LIST_QUERY_KEYS`. */
  readonly id: string;
  readonly label: string;
  readonly options: readonly RecordTableFilterOption[];
  /** Copy for the "any value" option. */
  readonly anyLabel?: string;
}

export interface RecordTableFiltersProps {
  readonly basePath: string;
  readonly query: ListQuery;
  readonly spec: ListQuerySpec;
  readonly filters: readonly RecordTableFilter[];
  readonly className?: string;
}

export function RecordTableFilters({
  basePath,
  query,
  spec,
  filters,
  className,
}: RecordTableFiltersProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const count = activeFilterCount(query);

  function apply(id: string, value: string) {
    const nextFilters: Record<string, string> = { ...query.filters };
    if (value === ANY_VALUE) delete nextFilters[id];
    else nextFilters[id] = value;
    const href = encodeListQuery(
      basePath,
      query,
      { filters: nextFilters },
      spec,
    );
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  const controls = filters.map((filter) => (
    <FilterSelect
      key={filter.id}
      filter={filter}
      value={query.filters[filter.id] ?? ANY_VALUE}
      onChange={(value) => {
        apply(filter.id, value);
      }}
    />
  ));

  if (filters.length === 0) return null;

  return (
    <div className={cn("contents", className)}>
      {/* From md up the filters sit in the header row. */}
      <div
        data-record-table-filters="inline"
        className="hidden flex-wrap items-center gap-2 md:flex"
      >
        {controls}
      </div>

      {/* Below md they collapse behind one button carrying the active count. */}
      <div className="md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="lg"
              className="min-h-11 rounded-md text-label"
              data-record-table-filters="sheet-trigger"
            >
              <SlidersHorizontal aria-hidden="true" />
              Filters
              {count > 0 ? (
                <Badge
                  variant="secondary"
                  className="tabular rounded-md text-caption"
                >
                  {count}
                </Badge>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="gap-4 rounded-t-lg p-4">
            <SheetHeader className="p-0">
              <SheetTitle className="text-h2">Filters</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-4">{controls}</div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

function FilterSelect({
  filter,
  value,
  onChange,
}: {
  readonly filter: RecordTableFilter;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const anyLabel = filter.anyLabel ?? "Any";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-caption text-muted-foreground">{filter.label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={filter.label}
          data-record-table-filter={filter.id}
          className="min-h-11 w-full rounded-md text-label md:w-44"
        >
          <SelectValue placeholder={anyLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE} className="min-h-11">
            {anyLabel}
          </SelectItem>
          {filter.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="min-h-11"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
