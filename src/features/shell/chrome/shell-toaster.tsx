"use client";

import { useCallback, useSyncExternalStore } from "react";

import { Toaster } from "@/components/ui/sonner";

/**
 * The one `Toaster` — `SITE_ARCHITECTURE.md` §2.4, `UX_SPEC.md` §6.1, §6.5.
 *
 * **Bottom-centre on mobile, bottom-right on desktop.** One instance, its
 * position subscribed to the viewport rather than duplicated per breakpoint: two
 * `Toaster`s means two portals and a toast that can fire into the hidden one.
 *
 * The mobile offset clears the fixed bottom tab bar and the safe-area inset, so
 * a toast never lands under the thumb rest on a phone in a storage room.
 *
 * **`richColors` stays off** — it picks its own palette, and every literal
 * colour in this product lives once in `globals.css` (`UX_SPEC.md` §1.2 Rule 1).
 * The generated `sonner.tsx` already supplies an icon per variant, so every
 * toast carries icon **and** text: colour is never the only signal (Rule 4).
 *
 * The server-rendered default is `bottom-center`, mobile-first, and
 * `useSyncExternalStore` hands React the same value on both sides of hydration.
 */

const DESKTOP_QUERY = "(min-width: 768px)";

/** Below `md` the fixed tab bar is 64px tall, plus the inset, plus a 12px gap. */
const MOBILE_BOTTOM_OFFSET =
  "calc(4rem + env(safe-area-inset-bottom) + 0.75rem)";
const DESKTOP_BOTTOM_OFFSET = "24px";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function ShellToaster() {
  const isDesktop = useSyncExternalStore(
    subscribe,
    useCallback(() => window.matchMedia(DESKTOP_QUERY).matches, []),
    // Mobile-first: the server has no viewport, and guessing desktop would put
    // the first toast under the tab bar on the form factor that matters most.
    useCallback(() => false, []),
  );

  return (
    <Toaster
      position={isDesktop ? "bottom-right" : "bottom-center"}
      offset={{
        bottom: isDesktop ? DESKTOP_BOTTOM_OFFSET : MOBILE_BOTTOM_OFFSET,
      }}
      closeButton
      visibleToasts={3}
      toastOptions={{
        // 6s on an error, 4s otherwise (UX_SPEC.md §6.1). A caller raising an
        // error passes its own longer duration; this is the floor for the rest.
        duration: 4000,
        closeButton: true,
        classNames: {
          // The generated primitive's own toast class, restated because a
          // `toastOptions` prop replaces its object rather than merging into it.
          toast: "cn-toast",
          // §1.5 — the action (*Log another*) is tapped between every battery,
          // and sonner's own rule renders it 24px tall. sonner's stylesheet is
          // unlayered, so on any property it sets it outranks a Tailwind
          // utility whatever the specificity; `min-height` it never sets, so
          // the 44px floor lands, and the radius, padding and type it does set
          // are taken back with `!`. Colour stays sonner's — `--normal-bg` and
          // `--normal-text` are the popover tokens the primitive maps.
          actionButton: "min-h-11 rounded-md! px-3! text-label!",
        },
      }}
    />
  );
}
