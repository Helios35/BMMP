import type { ReactElement } from "react";
import { Eye } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { cn } from "@/lib/utils";

/**
 * `ReadOnlyBanner` — `UX_SPEC.md` §2.9.
 *
 * **It is P5's, and it is explicitly not for P2 on `/review`.** §2.9's decision
 * table is the authority and it turns on *why the person is on the screen*:
 *
 * - The role's job is **evaluating the system itself** (P5): the banner renders
 *   and the mutating controls render **disabled with a stated reason**. Controls
 *   she cannot see, she cannot assess — which is the entire reason they stay.
 * - The role's job is **something else entirely** (P2 on `/review`, E-8b): the
 *   other role's controls are **absent** and there is **no banner**, because
 *   nothing has been withheld from her.
 *
 * *A disabled control tells a colleague she is missing a permission; an absent
 * one tells her this is not her job.* Both are honest; which one is correct
 * depends entirely on why the person is there. Unit 03 composes P2's `/review`
 * view and does not render this component.
 *
 * **The decision is not made here.** A route asks
 * `showsReadOnlyBanner({ role, routeHasMutatingControls })` in
 * `@/domain/access` and renders this when the answer is yes. This file is
 * presentation and holds no rule — `UX_SPEC.md` §7.4.
 *
 * Not dismissible: the restriction does not stop applying because it was read.
 */

/**
 * §2.9's copy, verbatim. **Do not paraphrase** — the sentence promises the
 * auditor that export is not among the things she cannot do, and Rule 5.27 makes
 * that promise binding on every route she can reach.
 */
export const READ_ONLY_BANNER_MESSAGE =
  "Read-only access. You can view and export everything on this page; you can't change it.";

export function ReadOnlyBanner({
  className,
}: {
  readonly className?: string;
} = {}): ReactElement {
  return (
    <Alert
      // A standing condition, not an error: `status` announces it politely on
      // arrival rather than interrupting (§G7).
      role="status"
      data-banner-state="default"
      data-intent="neutral"
      className={cn("gap-2 border", INTENT_SURFACE_CLASSES.neutral, className)}
    >
      {/* Icon plus text plus colour. Colour is never the only signal (§1.2 Rule 4). */}
      <Eye aria-hidden="true" />
      <AlertTitle className="text-body-strong text-balance">
        {READ_ONLY_BANNER_MESSAGE}
      </AlertTitle>
    </Alert>
  );
}
