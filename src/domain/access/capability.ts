/**
 * What a role may do on a route.
 *
 * `SITE_ARCHITECTURE.md` §5.3 rule 3 is explicit that this is a **capability**,
 * not a boolean: §5.2 already contains a role that reaches a route in one mode
 * and not another — P2 on `/review`, view-only — and B3 will add another (P4 on
 * `/batteries/new`). A boolean map cannot express view-only and would be
 * rewritten within one phase.
 */
export const CAPABILITIES = ["none", "read", "write"] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Whether a capability permits reaching and reading the route at all. */
export function canRead(capability: Capability): boolean {
  return capability !== "none";
}

/**
 * Whether a capability permits this route's mutating actions.
 *
 * **Never the only enforcement.** Every mutating server action re-checks the
 * role and rejects, and RLS refuses underneath that (`SITE_ARCHITECTURE.md`
 * §5.3 rules 6 and 9; `TECHNICAL_SPEC.md` §9.4). A disabled button is a
 * courtesy, never a control.
 */
export function canWrite(capability: Capability): boolean {
  return capability === "write";
}
