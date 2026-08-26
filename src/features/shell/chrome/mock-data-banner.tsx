import { TriangleAlert } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { activeAdapterName } from "@/data";
import { cn } from "@/lib/utils";

/**
 * The mock-data banner — `RUNBOOK.md` §2.1's fourth layer against a
 * `DATA_ADAPTER` misconfiguration, and the one that needed a UI shell.
 *
 * Three layers already exist: the selector throws on an unset or misspelled
 * value, refuses `mock` outright when `VERCEL_ENV=production`, and the health
 * endpoint reports which adapter is live. This is the fourth — the one a person
 * sees.
 *
 * **A server component, deliberately.** `activeAdapterName` comes from `@/data`,
 * which imports `server-only`; importing it into a client component would be the
 * exact trap `RUNBOOK.md` §2.1 names, silently selecting the mock inside the
 * browser bundle.
 *
 * Not dismissible. A banner a user can close is a banner nobody sees on the
 * screenshot that ends up in a compliance file.
 */
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
      <p>
        <strong>Mock data.</strong> Every record on this screen is invented.
        Nothing here describes anything real.
      </p>
    </div>
  );
}
