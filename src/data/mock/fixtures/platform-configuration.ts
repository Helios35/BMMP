/**
 * The mock's platform-configuration rows — **the only place in `src/` a
 * confidence threshold exists** (D-22, D-40).
 *
 * This file is the mock adapter's database, not application code. Under
 * Supabase these are rows in a platform table that P6 edits with an audit
 * trail; here they are the seed the mock reads through
 * `platformConfiguration.readIntakeGateConfiguration`. Nothing in `src/domain`,
 * `src/features`, `src/components` or `src/app` may import this module — a
 * screen or a rule that read a threshold from a fixture would be a screen or a
 * rule that read a threshold from code, which is exactly what D-22 forbids.
 *
 * The values agree with what the fixture sessions and extraction rows already
 * carry as their stamped `gateThresholdsApplied` and `bandCutoffsApplied`
 * (`./index.ts`), so a fixture decision reproduces under the configuration in
 * force. **Set conservatively for Gate 1** — more records route to review
 * rather than fewer — and tuned only on measured review-queue outcomes (D-22).
 *
 * The shape is validated on every read by
 * `validateIntakeGateConfiguration`; a row that fails validation is refused,
 * never patched.
 */

/**
 * The platform floor. A tenant may raise it; nothing lowers it (Rule 2.16).
 *
 * `matchTolerances` are product configuration rather than jurisdiction data: a
 * nameplate printed as `355 V` against a catalog entry rated `355.200 V` is the
 * same battery, and how close is close enough is the platform's call, not a
 * state's.
 */
export const PLATFORM_INTAKE_GATE_CONFIGURATION = {
  configurationVersion: "platform-floor-2026-08",
  thresholds: {
    minFieldConfidence: 0.9,
    minMatchScore: 0.82,
    minMatchSeparation: 0.12,
  },
  bandCutoffs: { high: 0.9, medium: 0.7, low: 0.4 },
  matchTolerances: {
    voltageRelative: 0.02,
    capacityRelative: 0.05,
    energyRelative: 0.05,
  },
  matchScoring: {
    labelPatternScore: 0.9,
    similarityCeiling: 0.8,
    numericAgreementBonus: 0.05,
  },
} as const;
