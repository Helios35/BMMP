import { TriangleAlert } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { activeAdapterName } from "@/data";
import { cn } from "@/lib/utils";

/**
 * The mock-data banner — `RUNBOOK.md` §1.4's third place the adapter guard
 * lives: **a persistent banner on every screen when the mock adapter is
 * active.** Not a console log — a banner a person cannot miss.
 *
 * The other two places already exist: the selector throws on an unset or
 * misspelled value and refuses `mock` outright when `VERCEL_ENV=production`,
 * and `GET /api/health` reports which adapter is live.
 *
 * **Every screen** means both route groups, so it is mounted once in the root
 * layout, above `(app)` and `(auth)` alike — the sign-in page of a prototype
 * says it is a prototype before anyone types into it.
 *
 * **A server component, deliberately.** `activeAdapterName` comes from `@/data`,
 * which imports `server-only`; importing it into a client component would be the
 * exact trap the runbook names, silently selecting the mock inside the browser
 * bundle.
 *
 * Not dismissible. A banner a user can close is a banner nobody sees on the
 * screenshot that ends up in a compliance file. `role="status"`, never
 * `alert`: it is a standing fact about the build, not something that just
 * went wrong — and it is not `ReadOnlyBanner`, which is P5's alone.
 */

/** Brief 07 outcome 7, verbatim. */
export const MOCK_DATA_BANNER_TEXT =
  "Prototype — sample data. Anything entered here is not kept.";

export function MockDataBanner() {
  if (activeAdapterName === "supabase") return null;

  return (
    <div
      role="status"
      data-mock-data-banner
      className={cn(
        "flex w-full items-center justify-center gap-2 border-b px-4 py-2 text-caption",
        INTENT_SURFACE_CLASSES.attention,
      )}
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      <p>{MOCK_DATA_BANNER_TEXT}</p>
    </div>
  );
}
