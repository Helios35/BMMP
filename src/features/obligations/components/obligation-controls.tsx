import type { ReactNode } from "react";

import { GatedControl } from "@/components/access/gated-control";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  controlTreatment,
  controlTreatmentReason,
} from "@/domain/access/control-treatment";
import {
  mayTakeProducerAction,
  type ProducerAction,
} from "@/domain/access/producer-actions";
import { capabilityFor } from "@/domain/access/route-capability";
import type { RoleCode } from "@/domain/taxonomy/role";
import { cn } from "@/lib/utils";

/**
 * One control on `/obligations`, for one role — Rule 8.15; `UX_SPEC.md` §2.9.
 *
 * P3 and P6 get the live control. The auditor sees a non-destructive control
 * disabled with its reason (E-8a) and a destructive one not at all; P2 sees
 * none — the same `controlTreatment` every route reads, so this screen
 * decides nothing about access on its own.
 */
export function producerControl(input: {
  readonly role: RoleCode;
  readonly action: ProducerAction;
  readonly isDestructive: boolean;
  readonly label: string;
  readonly dataAttributes: Readonly<Record<string, string>>;
  readonly live: () => ReactNode;
}): ReactNode {
  if (mayTakeProducerAction(input.role, input.action)) return input.live();
  const reason = controlTreatmentReason(
    controlTreatment({
      role: input.role,
      capability: capabilityFor(input.role, "/obligations"),
      isDestructive: input.isDestructive,
      isExportOrPrint: false,
    }),
  );
  if (reason === null) return undefined;
  return (
    <GatedControl reason={reason}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        aria-disabled="true"
        data-disabled="true"
        data-mutating="true"
        {...input.dataAttributes}
        className={cn(ACTION_BUTTON_CLASS, "opacity-60")}
      >
        {input.label}
      </Button>
    </GatedControl>
  );
}
