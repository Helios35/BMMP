import type { RoleCode } from "@/domain/taxonomy/role";
import type { Uuid } from "@/types/common";

/**
 * The caller, resolved once per request.
 *
 * **Every contract method takes this as its first argument. This is not optional
 * and it is the reason the swap works** (`TECHNICAL_SPEC.md` §5.2): the mock
 * adapter has no row-level security, so it must enforce tenant scope and role in
 * code — or the Playwright suite passes on mock and leaks on Supabase.
 *
 * Under Supabase, RLS is the floor: it permits every organization the user
 * actually belongs to, and the application narrows to the active one. **Both
 * layers, always. Never one** (`TECHNICAL_SPEC.md` §9.1).
 */
export interface RequestContext {
  readonly userId: Uuid;
  /**
   * The active organization for this request.
   *
   * A user may belong to several but **acts in exactly one at a time**, and the
   * switch is an explicit, recorded act (Rules 1.3, 1.5). Access is re-checked
   * on every request, never only at sign-in (Rule 1.28).
   */
  readonly organizationId: Uuid;
  /** T-37. This user's role **in this organization**. Roles never combine or leak (Rule 1.22). */
  readonly role: RoleCode;
  /**
   * `user.is_platform_admin`. **Platform scope alone confers no tenant data
   * access** (Rule 1.17) — acting inside a tenant additionally requires an
   * active support grant, and every action under one is marked in the audit log
   * as a platform action (Rules 1.18, 12.7).
   */
  readonly isPlatformAdmin: boolean;
  /** Threads one user action through every log line, every provider call and every `audit_event`. */
  readonly correlationId: string;
}
