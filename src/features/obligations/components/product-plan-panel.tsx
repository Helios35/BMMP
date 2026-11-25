import Link from "next/link";
import type { ReactElement } from "react";

import { SectionCard } from "@/components/page";
import { StatusBadge } from "@/components/status/status-badge";
import type { PlanEntry, ProductPlan } from "@/domain/producer";

import {
  PLAN_CANT_TELL,
  PLAN_EMPTY,
  PLAN_HEADING,
  STATE_PANEL_CLOSE,
} from "../obligation-copy";

/**
 * `ProductPlan` — Rule 8.23; the marking planner in Rule 8.1; `UX_SPEC.md`
 * §3.21. Opened by `?product=`. Every obligation that applies to one product
 * across the states it is sold in, **earliest date first**: the duty in the
 * law's words, the state, the date or "No date yet", and the deadline's
 * status. Marking duties appear with the rest. An obligation it can't be told
 * whether the product meets is listed apart, by name — never dropped.
 */

function Entry({ entry }: { readonly entry: PlanEntry }): ReactElement {
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-border p-3"
      data-plan-entry={entry.deadlineId ?? entry.obligationId}
      data-plan-due={entry.dueOn ?? "no_date"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular text-body-strong">{entry.dateWords}</span>
        {entry.standing === null ? null : (
          <StatusBadge
            system="obligation_deadline_standing"
            value={entry.standing}
          />
        )}
      </div>
      <span className="text-body">{entry.duty}</span>
      <span className="text-caption text-muted-foreground">
        {entry.stateName} · {entry.citation}
      </span>
    </li>
  );
}

export function ProductPlanPanel({
  label,
  productId,
  plan,
  closeHref,
}: {
  readonly label: string;
  readonly productId: string;
  readonly plan: ProductPlan;
  readonly closeHref: string;
}): ReactElement {
  return (
    <SectionCard
      title={label}
      description={PLAN_HEADING}
      action={
        <Link
          href={closeHref}
          className="text-label underline-offset-4 hover:underline"
          data-product-plan-close="true"
        >
          {STATE_PANEL_CLOSE}
        </Link>
      }
    >
      <div className="flex flex-col gap-4" data-product-plan={productId}>
        {plan.entries.length === 0 ? (
          <p className="text-body" data-product-plan-empty="true">
            {PLAN_EMPTY}
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {plan.entries.map((entry) => (
              <Entry
                key={entry.deadlineId ?? entry.obligationId}
                entry={entry}
              />
            ))}
          </ol>
        )}
        {plan.cantTell.length === 0 ? null : (
          <div
            className="flex flex-col gap-2"
            data-product-plan-cant-tell="true"
          >
            <h3 className="text-label text-foreground">{PLAN_CANT_TELL}</h3>
            <ul className="flex flex-col gap-2">
              {plan.cantTell.map((entry) => (
                <Entry key={entry.obligationId} entry={entry} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
