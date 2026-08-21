"use client";

import { useSyncExternalStore } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useCommandPalette } from "./command-palette-provider";

/**
 * The two ways in — `SITE_ARCHITECTURE.md` §2.4, `UX_SPEC.md` §2.14.
 *
 * Desktop gets a labelled search field-alike carrying its shortcut; mobile gets
 * a 44×44 icon button. Both dispatch the same open state, so there is one
 * dialog.
 *
 * **The shortcut hint renders only once the browser is known.** `⌘K` on Apple
 * and `Ctrl K` elsewhere is a fact only the client has, and rendering a guess on
 * the server produces a hydration mismatch on half the machines in a warehouse.
 * `useSyncExternalStore` gives the server `null` and the client the real answer,
 * which is the supported way to say "this value differs across the boundary".
 */

/** The value never changes after load, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

function platformShortcut(): string {
  return /Mac|iPhone|iPad|iPod/i.test(window.navigator.userAgent)
    ? "⌘K"
    : "Ctrl K";
}

function noShortcutOnTheServer(): null {
  return null;
}

export function CommandPaletteTrigger() {
  const { open } = useCommandPalette();
  const shortcut = useSyncExternalStore<string | null>(
    subscribeToNothing,
    platformShortcut,
    noShortcutOnTheServer,
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={open}
        data-command-palette-trigger="desktop"
        className="hidden min-h-11 min-w-60 justify-start gap-2 text-body text-muted-foreground md:inline-flex"
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search</span>
        {shortcut === null ? null : (
          <kbd
            aria-hidden="true"
            className="rounded-md border border-input px-1.5 py-0.5 text-caption tabular-nums"
          >
            {shortcut}
          </kbd>
        )}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        onClick={open}
        aria-label="Search"
        data-command-palette-trigger="mobile"
        className="size-11 md:hidden"
      >
        <Search aria-hidden="true" className="size-5" />
      </Button>
    </>
  );
}
