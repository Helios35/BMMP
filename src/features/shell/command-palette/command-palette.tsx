"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { CircleAlert, Loader2 } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import type { ActionResult } from "@/lib/action-result";
import { LeadingIcon } from "@/components/page/leading-icon";
import { cn } from "@/lib/utils";

import { useCommandPalette } from "./command-palette-provider";
import {
  PALETTE_DEBOUNCE_MS,
  PALETTE_GROUP_HEADINGS,
  PALETTE_GROUP_ORDER,
  PALETTE_MINIMUM_QUERY_LENGTH,
  type PaletteGroup,
  type PaletteResult,
  type PaletteResults,
} from "./palette-types";

/**
 * The command palette — `UX_SPEC.md` §2.14.
 *
 * **Every result is role-filtered before it exists.** `pages` is
 * `NAV_ITEMS ∩ readableRoutesFor(role)`, computed server-side in the layout;
 * record results come from a Server Action that does not query a scope this role
 * cannot read (§5.3(7)). The palette therefore cannot offer a destination the
 * guard would refuse, which is the whole point of §2.14's role filter.
 *
 * Keyboard is `cmdk`'s: `↑`/`↓` move, `Enter` opens, `Escape` closes. The global
 * `⌘K` lives in `CommandPaletteProvider`. None of it is reimplemented here.
 *
 * **Previous results stay visible while a new query is in flight** (§2.14) — a
 * list that empties on every keystroke reads as "no matches" four times a
 * second.
 *
 * §2.14 also names "recent items". No entity models a per-user recents list, and
 * a `localStorage` one is per-device and is not evidence — in a product whose
 * premise is that what the system knew is auditable, that is not a store to
 * invent. The default state is the role's pages; recents are raised to the owner.
 */

export interface CommandPaletteProps {
  /** The pages this role can reach, resolved server-side. Labels are `APP_ROUTE_NAMES`. */
  readonly pages: readonly PaletteResult[];
  readonly search: (input: {
    q: string;
  }) => Promise<ActionResult<PaletteResults>>;
}

/**
 * §2.14's illustrative suggestion names a container label. Containers are not
 * searchable until `b1a-04`, and offering a scope that returns nothing is worse
 * than a narrower hint.
 */
const EMPTY_SUGGESTION = "Try a record ID, a serial number or a part number.";

function matchesLocally(result: PaletteResult, query: string): boolean {
  return result.label.toLowerCase().includes(query.toLowerCase());
}

export function CommandPalette({ pages, search }: CommandPaletteProps) {
  const router = useRouter();
  const { isOpen, setOpen } = useCommandPalette();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResults | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const trimmed = query.trim();
  const isServerQuery = trimmed.length >= PALETTE_MINIMUM_QUERY_LENGTH;

  const runSearch = useCallback(
    (q: string) => {
      startTransition(async () => {
        const outcome = await search({ q });
        if (outcome.ok) {
          setResults(outcome.data);
          setFailure(null);
        } else {
          // Never an empty list on failure — an empty list reads as "nothing
          // matched", which is not what happened.
          setFailure(outcome.error.message);
        }
      });
    },
    [search],
  );

  useEffect(() => {
    // Below the floor the server is not called at all; only the local `pages`
    // filter runs, over a list the server already role-filtered.
    if (!isOpen || !isServerQuery) return;

    const timer = setTimeout(() => runSearch(trimmed), PALETTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isOpen, isServerQuery, runSearch, trimmed]);

  function handleOpenChange(next: boolean) {
    // Reset on close in the handler rather than in an effect: closing is an
    // event, and an effect that clears state after the fact renders twice.
    if (!next) {
      setQuery("");
      setResults(null);
      setFailure(null);
    }
    setOpen(next);
  }

  const pageResults =
    trimmed === ""
      ? pages
      : pages.filter((page) => matchesLocally(page, trimmed));

  // Server state belongs to a server query. Dropping back below the floor hides
  // it without a second render to clear it.
  const serverGroups = isServerQuery ? (results?.groups ?? []) : [];
  const visibleFailure = isServerQuery ? failure : null;

  const groups: readonly PaletteGroup[] = [
    ...(pageResults.length === 0
      ? []
      : [
          {
            group: "pages" as const,
            heading: PALETTE_GROUP_HEADINGS.pages,
            results: pageResults,
          },
        ]),
    ...serverGroups,
  ];

  const ordered = PALETTE_GROUP_ORDER.flatMap((id) =>
    groups.filter((group) => group.group === id),
  );

  function openResult(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      title="Search"
      description="Search battery records, the catalog and pages."
      className={cn(
        // Full-screen below md, a centred dialog above it. One palette, two
        // presentations — never a second Sheet-based one.
        "top-0 h-dvh max-w-full translate-y-0 rounded-none",
        "md:top-1/2 md:h-auto md:max-w-2xl md:-translate-y-1/2 md:rounded-lg",
        // The generated CommandInput is 32px tall. App code always adds the 44px
        // target rather than hand-editing the primitive (UX_SPEC.md §1.5, §1.1).
        "**:data-[slot=input-group]:h-11!",
      )}
    >
      <Command shouldFilter={false} className="rounded-none md:rounded-lg">
        <div className="relative">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search records, the catalog and pages"
            className="text-body"
          />
          {isPending ? (
            <span
              data-palette-state="loading"
              className="absolute top-1/2 right-4 -translate-y-1/2"
            >
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin text-muted-foreground"
              />
              <span className="sr-only">Searching</span>
            </span>
          ) : null}
        </div>

        <CommandList className="max-h-none flex-1 md:max-h-96">
          {visibleFailure === null ? null : (
            <div
              role="alert"
              data-palette-state="error"
              className="flex flex-col gap-2 px-3 py-4"
            >
              <p
                className={cn(
                  "flex items-start gap-2 text-body-strong",
                  INTENT_TEXT_CLASSES.critical,
                )}
              >
                <LeadingIcon icon={CircleAlert} />
                Search unavailable
              </p>
              <p className="text-caption text-muted-foreground">
                {visibleFailure}
              </p>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11 self-start"
                onClick={() => runSearch(trimmed)}
              >
                Retry
              </Button>
            </div>
          )}

          {visibleFailure === null && ordered.length === 0 ? (
            <CommandEmpty
              data-palette-state="empty"
              className="px-3 py-6 text-body"
            >
              <p className="text-body-strong">
                No matches for &ldquo;{trimmed}&rdquo;
              </p>
              <p className="pt-1 text-caption text-muted-foreground">
                {EMPTY_SUGGESTION}
              </p>
            </CommandEmpty>
          ) : null}

          {ordered.map((group) => (
            <CommandGroup
              key={group.group}
              heading={group.heading}
              className="**:[[cmdk-group-heading]]:text-caption!"
            >
              {group.results.map((result) => (
                <CommandItem
                  key={`${group.group}-${result.id}`}
                  value={`${group.group}-${result.id}`}
                  onSelect={() => openResult(result.href)}
                  className="min-h-11 gap-3 text-body"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{result.label}</span>
                    {result.detail === undefined ? null : (
                      <span
                        className={cn(
                          "truncate text-caption text-muted-foreground",
                          result.detailIsMono === true && "font-mono",
                        )}
                      >
                        {result.detail}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
