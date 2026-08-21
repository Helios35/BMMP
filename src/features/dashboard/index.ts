/**
 * The dashboard at `/` — `UX_SPEC.md` §3.4.
 *
 * **One feature, one folder** (`PROJECT_SETUP_BMMP.md` §3.3): nothing here is
 * used by a second route, so nothing here belongs in `src/components/`. The
 * pieces that *are* shared — `AlertCard`, `StorageClockMeter`, `StatusBadge` —
 * are consumed from the barrel and never forked.
 *
 * Every region reads through `src/data` and resolves access against
 * `ROUTE_ACCESS`. There is no second route list, no second status-intent map and
 * no second alert ordering in this folder.
 *
 * **Nothing here renders a hazard surface, and nothing expresses one as a
 * number** — no probability, no percentage, no likelihood, no score, in copy, in
 * a tooltip, in an `aria-label` or in an attribute (Rule 1.25,
 * `_ANCHORS.md` §7.1). **Nothing here renders a format band or any
 * organisation-wide size or format value**: the same battery classifies
 * differently under two jurisdictions, so a single such value would be wrong for
 * one of them by construction (`BUILD_NOTES_b1a-00` §8.4).
 */

export * from "./cross-route-links";
export * from "./dashboard-regions";
export * from "./dashboard-header";
export * from "./zero-batteries";
export * from "./alerts-region";
export * from "./storage-summary-region";
export * from "./review-queue-region";
export * from "./recent-activity-region";
export * from "./quick-actions-region";
