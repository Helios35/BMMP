"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";

/**
 * `LoggedToast` — *"Battery logged"* with **Log another** on arrival at
 * `/batteries/[id]?logged=1` (`UX_SPEC.md` §6.2, §3.9).
 *
 * `confirmIntake` redirects here after the commit; the toast fires on the
 * destination, never on the page being left (§6.1), which is why it lives on
 * the record page and not in the intake feature's action. The pattern is
 * `RouteDenialToast`'s: one payload, one toast, and the parameter is stripped
 * so a reload or a shared link does not congratulate anyone twice.
 *
 * **Log another** returns to `/batteries/new?container=<id>` — the container
 * the record just went into, so a handler emptying a pallet into one drum
 * does not pick it again for every battery. The id is a prop the page
 * resolved server-side, never read from the URL.
 */

export interface LoggedToastProps {
  /** The container the record was placed into, or `null` when unplaced. */
  readonly containerId: string | null;
}

/** An action toast stays long enough to be tapped (§6.1). */
const LOGGED_TOAST_DURATION_MS = 6000;

export function logAnotherHref(containerId: string | null): string {
  return containerId === null
    ? "/batteries/new"
    : `/batteries/new?container=${encodeURIComponent(containerId)}`;
}

export function LoggedToast({ containerId }: LoggedToastProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const logged = searchParams.get("logged");
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (logged === null) return;
    if (handled.current === logged) return;
    handled.current = logged;

    const href = logAnotherHref(containerId);
    toast.success("Battery logged", {
      duration: LOGGED_TOAST_DURATION_MS,
      className: INTENT_SURFACE_CLASSES.ok,
      action: {
        label: "Log another",
        onClick: () => router.push(href),
      },
    });

    const remaining = new URLSearchParams(searchParams.toString());
    remaining.delete("logged");
    const query = remaining.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, {
      scroll: false,
    });
  }, [containerId, logged, pathname, router, searchParams]);

  return null;
}
