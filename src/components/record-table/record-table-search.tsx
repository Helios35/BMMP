"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  encodeListQuery,
  normalizeSearch,
  SEARCH_MAX_LENGTH,
  type ListQuery,
  type ListQuerySpec,
} from "./list-url";

/**
 * The search box — the only part of `RecordTable` that types.
 *
 * It **writes** the URL and never reads it (`useSearchParams` would force a
 * `<Suspense>` boundary and de-opt the route to client rendering). The decoded
 * query arrives as a prop from the server render, so there is one decode per
 * render and this component cannot disagree with it.
 *
 * `router.replace`, not `push`: a debounced keystroke must not fill the back
 * stack. Sort, page, filter and tab changes are `<Link>` navigations and do push
 * (`SITE_ARCHITECTURE.md` §7.4, rule 6).
 */

const DEBOUNCE_MS = 250;

export interface RecordTableSearchProps {
  readonly basePath: string;
  readonly query: ListQuery;
  readonly spec: ListQuerySpec;
  readonly placeholder: string;
  readonly className?: string;
}

export function RecordTableSearch({
  basePath,
  query,
  spec,
  placeholder,
  className,
}: RecordTableSearchProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const committed = query.q ?? "";
  const [value, setValue] = useState(committed);
  const [lastCommitted, setLastCommitted] = useState(committed);

  // The server is the source of truth: Clear search, a back navigation and a
  // shared link all arrive as a new `query.q`, and the field follows them.
  // Adjusted during render rather than in an effect — React re-renders this
  // component before touching the DOM, so the field never flashes the stale
  // value (react.dev, "You Might Not Need an Effect").
  if (committed !== lastCommitted) {
    setLastCommitted(committed);
    setValue(committed);
  }

  useEffect(() => {
    if (value === committed) return;
    const timer = setTimeout(() => {
      const href = encodeListQuery(
        basePath,
        query,
        { q: normalizeSearch(value) },
        spec,
      );
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [value, committed, basePath, query, spec, router]);

  return (
    <div className={cn("relative w-full sm:max-w-80", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        inputMode="search"
        autoComplete="off"
        maxLength={SEARCH_MAX_LENGTH}
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        data-record-table-search="true"
        className="min-h-11 rounded-md pl-8 text-body"
      />
    </div>
  );
}
