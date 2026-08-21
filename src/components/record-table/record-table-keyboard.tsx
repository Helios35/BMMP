"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { TableBody } from "@/components/ui/table";

/**
 * Arrow keys move between rows; Enter opens (`UX_SPEC.md` §2.7).
 *
 * Enter needs no handler — every navigable row carries exactly one anchor, so
 * the browser already opens it, middle-click already opens a tab, and a screen
 * reader already announces a link. This component adds only the vertical
 * movement, which is the part a list of links does not give for free.
 *
 * It renders the `<tbody>` and takes the server-rendered rows as `children`, so
 * the cells stay server components and a route can put any `ReactNode` in them.
 */

const ROW_ANCHOR = "a[data-row-anchor='true']";

export function RecordTableKeyboard({
  children,
}: {
  readonly children: ReactNode;
}) {
  const body = useRef<HTMLTableSectionElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const element = body.current;
    if (element === null) return;
    const anchors = Array.from(
      element.querySelectorAll<HTMLAnchorElement>(ROW_ANCHOR),
    );
    if (anchors.length === 0) return;

    const active = document.activeElement;
    const index = anchors.findIndex((anchor) => anchor === active);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next =
      index === -1
        ? anchors[step === 1 ? 0 : anchors.length - 1]
        : anchors[index + step];
    if (next === undefined) return;

    event.preventDefault();
    next.focus();
  }

  return (
    <TableBody ref={body} onKeyDown={handleKeyDown}>
      {children}
    </TableBody>
  );
}
