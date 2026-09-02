/**
 * Storage-clock arithmetic as pure functions — `BUSINESS_RULES.md` §4.
 *
 * It differences dates in the site's zone and nothing else. **It decides no
 * state and evaluates no rule**: `storage_clock.status` is written by the alert
 * job and `maxDurationDays` was stamped from the resolved rule version when the
 * clock started (Rule 4.5).
 */

export * from "./clock-display";
export * from "./placement";
