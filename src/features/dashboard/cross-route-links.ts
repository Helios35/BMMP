import type { AppRoute } from "@/domain/access/routes";
import type { Uuid } from "@/types/common";

/**
 * Every destination the dashboard points at, in one place.
 *
 * **Several of these routes are not built yet** — `/containers`, `/review`,
 * `/documents/[id]` and `/shipments/[id]` arrive with units 03, 04 and 05. They
 * are rendered anyway, exactly as specified: they are correct against the one
 * capability map, and inventing substitute copy now would mean rewriting the
 * screen when the page lands. A link into an unbuilt route 404s today, and that
 * is expected.
 *
 * Each link carries **the route pattern it targets**, so the caller gates it
 * with `canReadRoute` against `ROUTE_ACCESS` rather than against a role literal
 * (`SITE_ARCHITECTURE.md` §5.3(7)) — a role that cannot reach the target gets no
 * link at all.
 *
 * `remedy` is what the reader is told instead: **name who can, never only the
 * refusal** (Rule 1.26, D-35).
 */

export interface DashboardLink {
  /** The route pattern, for `canReadRoute` / `canWriteRoute`. */
  readonly route: AppRoute;
  /** The resolved href, which may carry a filter the pattern does not. */
  readonly href: string;
  readonly label: string;
  /** Shown in place of the link where this role cannot reach the target. */
  readonly remedy: string;
}

/**
 * The containers that have an unresolved alert against them.
 *
 * The filtered list rather than one container: an alert region shows several
 * subjects at once, and the storage-clock alert's own action resolves on the
 * containers screen (unit 04).
 */
export const CONTAINERS_WITH_ALERTS: DashboardLink = {
  route: "/containers",
  href: "/containers?filter=alerting",
  label: "View containers with alerts",
  remedy: "Ask a Facility Manager or an Admin to review these containers.",
};

/** The readings still waiting on a person (`SITE_ARCHITECTURE.md` CL-1). */
export const REVIEW_QUEUE: DashboardLink = {
  route: "/review",
  href: "/review",
  label: "Open the review queue",
  remedy: "Ask a Handler or an Admin to confirm these readings.",
};

export const AUDIT_LOG: DashboardLink = {
  route: "/audit",
  href: "/audit",
  label: "Open the audit log",
  remedy: "Ask a Facility Manager or an Admin to open the audit log.",
};

export const LOG_A_BATTERY: DashboardLink = {
  route: "/batteries/new",
  href: "/batteries/new",
  label: "Log a battery",
  remedy: "Ask a Handler or an Admin to log a battery.",
};

export const CATALOG: DashboardLink = {
  route: "/catalog",
  href: "/catalog",
  label: "View catalog",
  remedy: "Ask an Admin to open the catalog.",
};

export const CONTAINERS: DashboardLink = {
  route: "/containers",
  href: "/containers",
  label: "View containers",
  remedy: "Ask a Facility Manager or an Admin to open containers.",
};

export function batteryRecordLink(id: Uuid): DashboardLink {
  return {
    route: "/batteries/[id]",
    href: `/batteries/${id}`,
    label: "Open the battery record",
    remedy: "Ask a Handler or an Admin to open this record.",
  };
}

export function containerLink(id: Uuid): DashboardLink {
  return {
    route: "/containers/[id]",
    href: `/containers/${id}`,
    label: "Open the container",
    remedy: "Ask a Facility Manager or an Admin to open this container.",
  };
}

export function shipmentLink(id: Uuid): DashboardLink {
  return {
    route: "/shipments/[id]",
    href: `/shipments/${id}`,
    label: "Open the shipment",
    remedy: "Ask a Handler or an Admin to open this shipment.",
  };
}

export function documentLink(id: Uuid): DashboardLink {
  return {
    route: "/documents/[id]",
    href: `/documents/${id}`,
    label: "Open the document",
    remedy: "Ask a Handler or an Admin to open this document.",
  };
}

export function catalogEntryLink(id: Uuid): DashboardLink {
  return {
    route: "/catalog/[id]",
    href: `/catalog/${id}`,
    label: "Open the catalog entry",
    remedy: "Ask an Admin to open this catalog entry.",
  };
}
