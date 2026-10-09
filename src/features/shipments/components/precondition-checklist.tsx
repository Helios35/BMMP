import Link from "next/link";
import type { ReactElement } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

import { SectionCard } from "@/components/page";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import { canReadRoute } from "@/domain/access/route-capability";
import type { AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";
import type {
  PreconditionItem,
  ShippingPaperChecklist,
  ShippingPaperPrecondition,
} from "@/domain/transport/shipping-paper";
import { cn } from "@/lib/utils";

import {
  checklistUnmet,
  CHECKLIST_COMPLETE,
  CHECKLIST_TITLE,
  FIX_CONTENTS,
  FIX_IN_CATALOG,
  FIX_IN_SETTINGS,
  FIX_ON_REVIEW,
  FIX_TRANSPORT,
  MET,
  PRECONDITION_TITLES,
  UNMET,
  whoCanFix,
} from "../shipment-copy";

/**
 * Step 3's precondition checklist — `UX_SPEC.md` §3.12; Rule 5.3.
 *
 * **Every unmet item is named** — which record, which identifier, which rule —
 * never a single "can't generate". The items and their findings are the
 * builder's (`buildShippingPaperPayload`), the same output the paper reads, so
 * a checklist that reads complete is exactly what the paper says.
 *
 * Each unmet item names who can fix it (Rule 5.7's pointer) and, where this
 * role can reach the place it is fixed, links there; where it cannot — P1 and
 * `/settings/organization` — the copy names who can, never a dead link (E-11).
 */

type FixTarget =
  | { readonly kind: "route"; readonly route: AppRoute; readonly label: string }
  | { readonly kind: "step"; readonly step: 1 | 2; readonly label: string }
  | null;

const FIX: Readonly<Record<ShippingPaperPrecondition, FixTarget>> = {
  contents: { kind: "step", step: 1, label: FIX_CONTENTS },
  identification: { kind: "route", route: "/review", label: FIX_ON_REVIEW },
  classification: { kind: "route", route: "/review", label: FIX_ON_REVIEW },
  transport_mode: { kind: "step", step: 2, label: FIX_TRANSPORT },
  emergency_contact: {
    kind: "route",
    route: "/settings/organization",
    label: FIX_IN_SETTINGS,
  },
  destination_and_carrier: { kind: "step", step: 2, label: FIX_TRANSPORT },
  shipping_identifiers: {
    kind: "route",
    route: "/settings/catalog",
    label: FIX_IN_CATALOG,
  },
  quantity: { kind: "step", step: 1, label: FIX_CONTENTS },
  container_labels: { kind: "step", step: 1, label: FIX_CONTENTS },
  rule_data: null,
};

function fixLink(
  item: PreconditionItem,
  role: RoleCode,
  shipmentId: string,
): { readonly href: string; readonly label: string } | null {
  const target = FIX[item.id];
  if (target === null) return null;
  if (target.kind === "step") {
    return {
      href: `/shipments/new?shipment=${shipmentId}&step=${target.step}`,
      label: target.label,
    };
  }
  return canReadRoute(role, target.route)
    ? { href: target.route, label: target.label }
    : null;
}

export function PreconditionChecklist({
  checklist,
  role,
  shipmentId,
}: {
  readonly checklist: ShippingPaperChecklist;
  readonly role: RoleCode;
  readonly shipmentId: string;
}): ReactElement {
  return (
    <SectionCard
      title={CHECKLIST_TITLE}
      dataAttributes={{
        "data-precondition-checklist": checklist.isComplete
          ? "complete"
          : "incomplete",
        "data-unmet": checklist.unmet.join(","),
      }}
    >
      <p
        role="status"
        className={cn(
          "max-w-[72ch] text-body-strong",
          !checklist.isComplete && INTENT_TEXT_CLASSES.critical,
        )}
      >
        {checklist.isComplete
          ? CHECKLIST_COMPLETE
          : checklistUnmet(checklist.unmet.length)}
      </p>
      <ol className="grid gap-3">
        {checklist.items.map((item) => {
          const link = item.met ? null : fixLink(item, role, shipmentId);
          return (
            <li
              key={item.id}
              data-precondition={item.id}
              data-precondition-met={item.met ? "true" : "false"}
              className="flex gap-3"
            >
              {item.met ? (
                <CircleCheck
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-5 shrink-0",
                    INTENT_TEXT_CLASSES.ok,
                  )}
                />
              ) : (
                <CircleAlert
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-5 shrink-0",
                    INTENT_TEXT_CLASSES.critical,
                  )}
                />
              )}
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-body-strong">
                  {PRECONDITION_TITLES[item.id]}
                  <span className="sr-only">{` — ${item.met ? MET : UNMET}`}</span>
                  <span className="ml-2 text-caption text-muted-foreground">
                    {`Rule ${item.rules.join(", ")}`}
                  </span>
                </p>
                {item.findings.map((finding) => (
                  <p
                    key={finding}
                    data-precondition-finding="true"
                    className="max-w-[72ch] text-body"
                  >
                    {finding}
                  </p>
                ))}
                {item.met || item.whoCanFix.length === 0 ? null : (
                  <p className="text-caption text-muted-foreground">
                    {whoCanFix(item.whoCanFix)}
                  </p>
                )}
                {link === null ? null : (
                  <Link
                    href={link.href}
                    data-precondition-fix={item.id}
                    className="inline-flex min-h-11 items-center text-label underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
