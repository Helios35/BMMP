import type { RequestContext } from "./context";
import type { IntakeGateConfiguration } from "@/domain/intake/thresholds";
import type { EmergencyContactConfiguration } from "@/domain/transport/emergency-verification";
import type { RecallMatchConfiguration } from "@/domain/recalls/configuration";

/**
 * Platform configuration — the values P6 owns that are neither jurisdiction
 * rules nor tenant data (D-22, D-40).
 *
 * **The confidence-gate thresholds are read here and nowhere else.** They are a
 * platform-wide floor a tenant may raise and can never lower; the value is
 * versioned configuration data and never a constant in code. `src/domain`
 * receives the set as an argument, and the applied set is stamped on the intake
 * session and on every extraction row so the decision reproduces after the
 * configuration changes (Rule 2.16).
 *
 * The **existence** of the gate is not read from here and is not configurable
 * by anyone (Rules 2.13, 2.17). This repository supplies numbers to a gate that
 * always runs; it cannot switch the gate off, defer it or exempt a role, and a
 * missing or malformed set is a loud failure rather than a permissive default.
 *
 * Under Supabase this is a platform table readable by every authenticated user
 * and writable only by P6, with every change an audited act. The mock reads
 * its own fixture module — the only place in `src/` a threshold value exists.
 */
export interface PlatformConfigurationRepository {
  /**
   * The configuration in force for this request's organisation.
   *
   * Returns the platform floor, or the tenant's raised set where one exists.
   * **Never a lowered set.** The adapter validates the shape with
   * `validateIntakeGateConfiguration` before handing it back and throws
   * `DataIntegrityError` on an invalid row rather than returning a partial one.
   */
  readIntakeGateConfiguration(
    ctx: RequestContext,
  ): Promise<IntakeGateConfiguration>;

  /**
   * The platform default for how long a verification of the 24-hour number
   * stands — D-32, D-63 #4. **Read here and nowhere else**, beside the gate
   * thresholds and for the same reason (D-40): an interval in a TypeScript
   * conditional is a rule in code.
   *
   * An organization's own `emergencyReverificationIntervalMonths` wins where it
   * is set; `null` there means this value applies. Not editable in B1a. The
   * adapter validates the shape with `validateEmergencyContactConfiguration`
   * and throws `DataIntegrityError` on an invalid row — never a default.
   */
  readEmergencyContactConfiguration(
    ctx: RequestContext,
  ): Promise<EmergencyContactConfiguration>;

  /**
   * How recall matching reads a name — Rule 10.12; D-73. The maker words a
   * name may carry without changing who the maker is, and the phrases that
   * make a vehicle recall's component the propulsion or traction battery.
   * **Read here and nowhere else** (Rule 1.23): a word list in a TypeScript
   * conditional is a rule in code. Validated with
   * `validateRecallMatchConfiguration`; an invalid row throws
   * `DataIntegrityError`, never a default.
   */
  readRecallMatchConfiguration(
    ctx: RequestContext,
  ): Promise<RecallMatchConfiguration>;
}
