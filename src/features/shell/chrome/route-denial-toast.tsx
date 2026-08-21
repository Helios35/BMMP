"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import {
  deniedRouteFrom,
  denialDescription,
  routeDenialMessage,
} from "@/domain/access/denial";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * The guard's denial toast — `SITE_ARCHITECTURE.md` §5.3(4).
 *
 * A member of this organisation who reaches a route their role cannot open is
 * **redirected to `/` with a toast naming the restriction**. Not a 403 page, not
 * a blank screen, not a silent no-op: in a single-tenant internal tool, telling
 * a colleague that a page exists and is not theirs is the correct answer. The
 * redirect is `requireRoute`'s; firing the toast is the shell's, because the
 * redirect target renders inside this layout — and `UX_SPEC.md` §6.1 puts a
 * toast on the destination, never on the page being left.
 *
 * ## Why the role is not in the URL
 *
 * The guard redirects to `/?denied=<route>` and **the role travels as a prop**,
 * resolved server-side on this request. A role in a query string is a role any
 * reader can edit, and an edited role produces a confidently worded false
 * statement about who may open a page — in a product whose premise is that a
 * wrong document is worse than no document.
 *
 * The `?denied=` value is still untrusted: `deniedRouteFrom` validates it
 * against `APP_ROUTES` and an unrecognised value is ignored in silence. The copy
 * itself is derived from `ROUTE_ACCESS` and `ROLE_LABELS` (Rule 1.26) and is
 * never a hand-written sentence, so a toast cannot disagree with the guard about
 * who may open a page.
 */

export interface RouteDenialToastProps {
  /** The viewer's role in the active organisation, resolved server-side. */
  readonly role: RoleCode;
}

/** No auto-dismiss shorter than 6s, and no action button (§5.3(4)). */
const DENIAL_TOAST_DURATION_MS = 6000;

export function RouteDenialToast({ role }: RouteDenialToastProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const denied = searchParams.get("denied");
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (denied === null) return;
    // One payload, one toast. Without this, a re-render before `router.replace`
    // settles fires the same restriction twice.
    if (handled.current === denied) return;
    handled.current = denied;

    const route = deniedRouteFrom(denied);
    if (route !== null) {
      const message = routeDenialMessage(role, route);
      toast.error(message.headline, {
        description: denialDescription(message),
        duration: DENIAL_TOAST_DURATION_MS,
        className: INTENT_SURFACE_CLASSES.critical,
      });
    }

    const remaining = new URLSearchParams(searchParams.toString());
    remaining.delete("denied");
    const query = remaining.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, {
      scroll: false,
    });
  }, [denied, pathname, role, router, searchParams]);

  return null;
}
