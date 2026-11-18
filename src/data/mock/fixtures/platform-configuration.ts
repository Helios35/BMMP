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

/**
 * The platform default for re-verifying the 24-hour emergency contact number
 * — D-32's twelve months, D-63 #4. **The only place in `src/` that interval
 * exists.** An organization's own setting wins where present; `null` there
 * reads this row. Not editable in B1a. Validated on every read by
 * `validateEmergencyContactConfiguration`.
 */
export const PLATFORM_EMERGENCY_CONTACT_CONFIGURATION = {
  configurationVersion: "platform-default-2026-10",
  reverificationIntervalMonths: 12,
} as const;

/**
 * Recall matching's configuration (Rule 10.12; D-73) — **the only place in
 * `src/` these words exist.** The maker words a name may carry without
 * changing who the maker is (a legal form, not part of the name), and the
 * phrases that make a vehicle recall's component the propulsion or traction
 * battery. Stamped on every check run by its version. Validated on every read
 * by `validateRecallMatchConfiguration`.
 */
export const PLATFORM_RECALL_MATCH_CONFIGURATION = {
  configurationVersion: "recall-match-2026-10",
  makerWordsIgnored: [
    "Inc",
    "Incorporated",
    "LLC",
    "Ltd",
    "Limited",
    "Corp",
    "Corporation",
    "Co",
    "Company",
    "GmbH",
  ],
  tractionBatteryComponentTerms: [
    "propulsion battery",
    "traction battery",
    "high voltage battery",
    "high-voltage battery",
  ],
} as const;

/**
 * How close two look-alike fingerprints must be to count as a copy (Rule
 * 2.37; D-40) — **the only place in `src/` this closeness exists.** Stated for
 * the fixture vision provider's 64-bit scheme; unit 19's real fingerprint
 * function gets its own row and version. Stamped on every copy check run by
 * its version. Validated on every read by `validateLookAlikeConfiguration`.
 */
export const PLATFORM_LOOK_ALIKE_CONFIGURATION = {
  configurationVersion: "look-alike-2026-11",
  fingerprintScheme: "fixture64",
  maxDifferingBits: 6,
} as const;

/**
 * The hazard ranking scheme, v1 (Rules 10.20–10.23; D-77 #2) — **the only
 * place in `src/` the factor order, the levels, the age and energy bands and
 * the band cut points exist.** Stamped on every ranking row by its version;
 * changing any of it is a new version, never an edit. Validated on every read
 * by `validateHazardRankingScheme`.
 *
 * The order and levels are Rule 10.20's table; storage aggregation sits after
 * chemistry for containers and lots (Rule 10.22); the cut points are Rule
 * 10.23's. **The age bands and the energy bands are the builder's placeholder
 * values** — Rules 10.20 and 10.22 leave them to the scheme, and planning has
 * not set them — raised in `BUILD_NOTES_b2-11-risk-ranking.md` §4.
 */
export const PLATFORM_HAZARD_RANKING_SCHEME = {
  schemeVersion: "hazard-ranking-v1",
  factorOrder: {
    battery_record: [
      "damage_indicators",
      "recall_status",
      "chemistry",
      "state_of_charge_at_intake",
      "age_from_date_code",
      "certification_marks",
    ],
    container: [
      "damage_indicators",
      "recall_status",
      "chemistry",
      "storage_aggregation",
      "state_of_charge_at_intake",
      "age_from_date_code",
      "certification_marks",
    ],
    lot: [
      "damage_indicators",
      "recall_status",
      "chemistry",
      "storage_aggregation",
      "state_of_charge_at_intake",
      "age_from_date_code",
      "certification_marks",
    ],
  },
  factors: [
    {
      code: "damage_indicators",
      reading: "matched",
      notRecordedLabel: "Not recorded",
      levels: [
        {
          level: "damaged_or_defective",
          label: "Damaged or defective",
          evidenceValues: ["damaged_or_defective"],
        },
        {
          level: "cosmetic_only",
          label: "Cosmetic only",
          evidenceValues: ["cosmetic_only"],
        },
        {
          level: "none_observed",
          label: "None observed",
          evidenceValues: ["none_observed"],
        },
      ],
    },
    {
      code: "recall_status",
      reading: "matched",
      notRecordedLabel: "Not recorded",
      levels: [
        {
          level: "confirmed",
          label: "Confirmed",
          evidenceValues: ["confirmed_match"],
        },
        {
          level: "possible_match",
          label: "Possible match",
          evidenceValues: ["possible_match"],
        },
        { level: "no_match", label: "No match", evidenceValues: ["no_match"] },
      ],
    },
    {
      code: "chemistry",
      reading: "matched",
      notRecordedLabel: "Not recorded",
      levels: [
        {
          level: "lithium_metal",
          label: "Lithium metal",
          evidenceValues: ["lithium_metal"],
        },
        {
          level: "lithium_ion",
          label: "Lithium-ion",
          evidenceValues: [
            "li_nmc",
            "li_nca",
            "li_lfp",
            "li_lco",
            "li_lmo",
            "li_lto",
            "li_ion_unspecified",
          ],
        },
        {
          level: "other_rechargeable",
          label: "Other rechargeable",
          evidenceValues: [
            "lead_acid_sealed",
            "lead_acid_flooded",
            "nimh",
            "nicd",
            "sodium_ion",
          ],
        },
        { level: "alkaline", label: "Alkaline", evidenceValues: ["alkaline"] },
      ],
    },
    {
      code: "state_of_charge_at_intake",
      reading: "matched",
      notRecordedLabel: "Not recorded",
      levels: [
        {
          level: "above_storage_limit",
          label: "Above storage limit",
          evidenceValues: ["above_storage_limit"],
        },
        {
          level: "at_or_below_storage_limit",
          label: "At or below storage limit",
          evidenceValues: ["at_or_below_storage_limit"],
        },
      ],
    },
    {
      code: "age_from_date_code",
      reading: "banded",
      unit: "years",
      notRecordedLabel: "Not recorded",
      levels: [
        { level: "age_band_oldest", label: "10 years or more", atLeast: 10 },
        { level: "age_band_middle", label: "5 to under 10 years", atLeast: 5 },
        { level: "age_band_newest", label: "Under 5 years", atLeast: 0 },
      ],
    },
    {
      code: "certification_marks",
      reading: "matched",
      notRecordedLabel: "Not recorded",
      levels: [
        {
          level: "none_read",
          label: "None read",
          evidenceValues: ["none_read"],
        },
        {
          level: "marks_read",
          label: "Marks read",
          evidenceValues: ["marks_read"],
        },
      ],
    },
    {
      code: "storage_aggregation",
      reading: "banded",
      unit: "watt_hours",
      notRecordedLabel: "Not fully recorded",
      levels: [
        {
          level: "energy_band_largest",
          label: "100 kWh or more held together",
          atLeast: 100000,
        },
        {
          level: "energy_band_large",
          label: "10 kWh to under 100 kWh held together",
          atLeast: 10000,
        },
        {
          level: "energy_band_moderate",
          label: "1 kWh to under 10 kWh held together",
          atLeast: 1000,
        },
        {
          level: "energy_band_smallest",
          label: "Under 1 kWh held together",
          atLeast: 0,
        },
      ],
    },
  ],
  bandCutPoints: [0.25, 0.5, 0.75],
} as const;

/**
 * The deadline alert offsets, v1 (Rule 8.13; D-78 #10) — **the only place in
 * `src/` these day counts exist.** An open deadline raises an `attention`
 * alert 90, 30 and 7 days before it, and a `critical` one once it has passed.
 * Stamped on every alert's trigger snapshot; changing it is a new version.
 * Validated on every read by `validateObligationAlertConfiguration`.
 */
export const PLATFORM_OBLIGATION_ALERT_CONFIGURATION = {
  configurationVersion: "obligation-alerts-v1",
  daysBefore: [90, 30, 7],
  overdue: true,
} as const;
