import type { RequestContext } from "@/data/contracts/context";
import type { PlatformConfigurationRepository } from "@/data/contracts/platform-configuration";
import { validateIntakeGateConfiguration } from "@/domain/intake/thresholds";
import { validateEmergencyContactConfiguration } from "@/domain/transport/emergency-verification";
import { validateRecallMatchConfiguration } from "@/domain/recalls/configuration";
import { DataIntegrityError } from "@/lib/errors";

import {
  PLATFORM_EMERGENCY_CONTACT_CONFIGURATION,
  PLATFORM_INTAKE_GATE_CONFIGURATION,
  PLATFORM_RECALL_MATCH_CONFIGURATION,
} from "./fixtures/platform-configuration";

/**
 * Platform configuration — D-22, D-40, D-63 #4.
 *
 * Reads the mock's own rows and validates them on every read, exactly as the
 * Supabase adapter will validate a platform table row: an invalid set is a
 * `DataIntegrityError`, never a default and never a partial. **There is no
 * tenant override in B1a** — the platform row is what every organisation
 * reads.
 *
 * A module of its own rather than a block in `./index.ts` because the shipment
 * writes read the emergency-contact default inside an issue, and they cannot
 * import the adapter that imports them.
 */
export const mockPlatformConfiguration: PlatformConfigurationRepository = {
  async readIntakeGateConfiguration(ctx: RequestContext) {
    const validation = validateIntakeGateConfiguration(
      PLATFORM_INTAKE_GATE_CONFIGURATION,
    );
    if (!validation.ok) {
      throw new DataIntegrityError({
        userMessage:
          "The label-reading configuration could not be loaded. Nothing was changed — ask an Admin.",
        correlationId: ctx.correlationId,
        context: { issues: validation.issues },
      });
    }
    return validation.configuration;
  },

  async readEmergencyContactConfiguration(ctx: RequestContext) {
    const validation = validateEmergencyContactConfiguration(
      PLATFORM_EMERGENCY_CONTACT_CONFIGURATION,
    );
    if (!validation.ok) {
      throw new DataIntegrityError({
        userMessage:
          "The 24-hour emergency contact configuration could not be loaded. Nothing was changed — ask an Admin.",
        correlationId: ctx.correlationId,
        context: { issues: validation.issues },
      });
    }
    return validation.configuration;
  },

  async readRecallMatchConfiguration(ctx: RequestContext) {
    const validation = validateRecallMatchConfiguration(
      PLATFORM_RECALL_MATCH_CONFIGURATION,
    );
    if (!validation.ok) {
      throw new DataIntegrityError({
        userMessage:
          "The recall-matching configuration could not be loaded. No check ran — ask an Admin.",
        correlationId: ctx.correlationId,
        context: { issues: validation.issues },
      });
    }
    return validation.configuration;
  },
};
