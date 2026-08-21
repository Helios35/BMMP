import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import type { BreadcrumbCrumb } from "@/features/shell/navigation/breadcrumb-ancestors";

/**
 * The breadcrumb trail — `SITE_ARCHITECTURE.md` §2.4.
 *
 * **On every detail and multi-step route. Never on a list route.** In this unit
 * that is `/batteries/[id]` and `/catalog/[id]` only; `/settings/*` uses §2.5's
 * section sub-nav instead.
 *
 * A server component: the crumbs are resolved by `breadcrumbTrail`, which reads
 * the capability map, and access is never resolved in the browser (§5.3(3)). It
 * renders through `PageHeader.breadcrumbs` rather than being placed by each
 * page, so one page cannot quietly grow a third crumb.
 *
 * A long leaf label truncates and stays selectable in full — `UX_SPEC.md` §1.3
 * and E-15's "very long values" both require the whole value to remain
 * copyable, so nothing here replaces characters.
 */

export interface BreadcrumbsProps {
  readonly crumbs: readonly BreadcrumbCrumb[];
}

export function Breadcrumbs({ crumbs }: BreadcrumbsProps) {
  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList className="text-caption">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${crumb.href ?? "leaf"}`}>
              <BreadcrumbItem>
                {crumb.href === undefined || isLast ? (
                  <BreadcrumbPage className="max-w-[24ch] truncate sm:max-w-[48ch]">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={crumb.href}
                    // Inline in a trail rather than a standalone control, which is
                    // WCAG 2.5.8's own exemption from the 44px floor. Marked so the
                    // ergonomics sweep skips it by decision rather than by accident.
                    data-inline-target="true"
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {isLast ? null : <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
