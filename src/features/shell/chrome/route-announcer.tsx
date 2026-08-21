"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Focus and announcement on route change — `UX_SPEC.md` §6.6.
 *
 * *"Focus moves to the `h1` on every route change so screen-reader users hear
 * where they landed."* Without it a client-side navigation leaves focus on the
 * link that was clicked and a screen reader says nothing at all: the page
 * changed and the user was not told.
 *
 * Every page renders `<h1 id="page-title" tabIndex={-1}>`, which `PageHeader`
 * supplies, so this component needs no knowledge of routes.
 *
 * **The announced name is the heading's own text**, read from the DOM after the
 * navigation settles. It could be derived from `APP_ROUTE_NAMES`, but that map
 * lives in `src/domain/access` and a client component does not read the access
 * layer for a value (`SITE_ARCHITECTURE.md` §5.3(3)) — and the heading is the
 * better source anyway: on a detail route it carries the record's own name,
 * which is what the user actually navigated to.
 *
 * **The live region is written through a ref rather than through state.** A live
 * region is a platform API being synchronised with React, which is exactly what
 * an effect is for; routing the same string through `useState` would re-render
 * the whole shell on every navigation to change one `textContent`.
 *
 * The first render is skipped. A full page load already announces its title;
 * announcing it twice is noise.
 */
export function RouteAnnouncer() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  const liveRegion = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (previous.current === null) {
      previous.current = pathname;
      return;
    }
    if (previous.current === pathname) return;
    previous.current = pathname;

    const heading = document.getElementById("page-title");
    if (heading !== null) heading.focus();
    if (liveRegion.current !== null) {
      liveRegion.current.textContent = heading?.textContent?.trim() ?? "";
    }
  }, [pathname]);

  return (
    <div
      ref={liveRegion}
      aria-live="polite"
      aria-atomic="true"
      data-route-announcer
      className="sr-only"
    />
  );
}
