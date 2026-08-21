import Link from "next/link";
import { CircleAlert, Clock3 } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import {
  INTAKE_BLOCK_HEADLINE,
  intakeBlockExplanation,
  intakeBlockRemedy,
  type IntakeGateView,
} from "@/features/consent/read-intake-gate";
import { cn } from "@/lib/utils";

/**
 * The Terms of Service block, on `/batteries/new` — E-12, Rules 7.1, 7.2, 7.14,
 * 7.18.
 *
 * **A `critical` intent, and this is one of the five surfaces reserved for it**
 * (`UX_SPEC.md` §1.2 Rule 5): a hard compliance block. Icon plus text plus
 * colour, because colour is never the only signal (§1.2 Rule 4).
 *
 * It renders a decision; it never takes one. `readIntakeGate` resolved the
 * status, the reason and the acceptors before this file was reached.
 */

const SETTINGS_ROUTE = "/settings/organization";

export interface IntakeBlockedNoticeProps {
  readonly gate: IntakeGateView;
  /**
   * Resolved server-side from `ROUTE_ACCESS`.
   *
   * **Never a link the role will be redirected away from** — E-11's rule,
   * generalised. P1 cannot reach `/settings/organization`, so P1 is given the
   * names with no link rather than a dead one.
   */
  readonly canReachOrganizationSettings: boolean;
}

export function IntakeBlockedNotice({
  gate,
  canReachOrganizationSettings,
}: IntakeBlockedNoticeProps) {
  return (
    <Alert
      className={cn(
        INTENT_SURFACE_CLASSES.critical,
        "gap-2 px-4 py-4 text-body",
      )}
      data-intake-gate-state="blocked"
    >
      <CircleAlert aria-hidden="true" className="size-5" />
      <AlertTitle className="text-body-strong">
        {INTAKE_BLOCK_HEADLINE}
      </AlertTitle>
      <AlertDescription className="grid gap-2 text-body text-current">
        <p className="max-w-[72ch]">{intakeBlockExplanation(gate)}</p>
        <p className="max-w-[72ch] text-body-strong">
          {intakeBlockRemedy(gate)}
        </p>
        {canReachOrganizationSettings ? (
          <Link
            href={SETTINGS_ROUTE}
            className="inline-flex min-h-11 items-center self-start rounded-md px-3 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            Open {APP_ROUTE_NAMES[SETTINGS_ROUTE]} settings
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * The grace-window banner — Rules 7.13, 7.15.
 *
 * **Intake is not blocked here**, so the intent is `neutral` and not `attention`:
 * nothing is wrong and nothing is late. The final sentence is required rather
 * than helpful — Rule 7.15 makes records captured in the window permanently
 * governed by the **prior** version, and a banner that stops one sentence early
 * implies that accepting now covers them.
 */
export function IntakeGraceNotice({ gate }: { readonly gate: IntakeGateView }) {
  if (gate.status !== "grace") return null;
  const version = gate.documentVersion ?? "the new version";

  return (
    <Alert
      className={cn(
        INTENT_SURFACE_CLASSES.neutral,
        "gap-2 px-4 py-4 text-body",
      )}
      role="status"
      data-intake-gate-state="grace"
    >
      <Clock3 aria-hidden="true" className="size-5" />
      <AlertTitle className="text-body-strong">
        A new version of the Terms of Service takes effect.
      </AlertTitle>
      <AlertDescription className="max-w-[72ch] text-body text-current">
        Your organization has until {gate.reacceptanceDeadlineOn} to accept
        version {version}. Batteries logged before then are governed by the
        version you accepted previously.
      </AlertDescription>
    </Alert>
  );
}
