"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The command palette's open state, shared by everything that opens it —
 * `UX_SPEC.md` §2.14.
 *
 * The desktop search button, the mobile search icon and the `⌘K` / `Ctrl K`
 * shortcut all dispatch here, so there is one dialog rather than one per
 * trigger.
 *
 * **`⌘K` is the only global shortcut this product registers** (`UX_SPEC.md`
 * §1.5). shadcn's `sidebar` block would claim `⌘B`; it is not on §1.7's
 * allow-list and is not installed. A bare `/` is deliberately not bound either —
 * it is not specified, and it breaks typing in a filter.
 */

interface CommandPaletteState {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly setOpen: (isOpen: boolean) => void;
}

const CommandPaletteContext = createContext<CommandPaletteState | null>(null);

export function useCommandPalette(): CommandPaletteState {
  const state = useContext(CommandPaletteContext);
  if (state === null) {
    throw new Error(
      "useCommandPalette must be used inside <CommandPaletteProvider>",
    );
  }
  return state;
}

export function CommandPaletteProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "k" && event.key !== "K") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      setIsOpen((current) => !current);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<CommandPaletteState>(
    () => ({ isOpen, open, setOpen: setIsOpen }),
    [isOpen, open],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}
