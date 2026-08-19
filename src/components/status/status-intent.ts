import {
  BATTERY_RECORD_STATUS_LABELS,
  CATALOG_ENTRY_STATUS_LABELS,
  CLASSIFICATION_DECISION_STATUS_LABELS,
  CONTAINER_STATUS_LABELS,
  CONTAINER_TYPE_LABELS,
  DAMAGE_ASSESSMENT_STATUS_LABELS,
  DATA_USE_ELIGIBILITY_LABELS,
  DDR_FLAG_LABELS,
  DOCUMENT_RENDER_STATUS_LABELS,
  FORMAT_CATEGORY_LABELS,
  HANDLER_SIZE_CLASS_LABELS,
  INTAKE_SESSION_STATUS_LABELS,
  LOT_STATUS_LABELS,
  RECALL_MATCH_STATUS_LABELS,
  RULE_VERSION_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
  STATE_OF_CHARGE_BAND_LABELS,
  STORAGE_CLOCK_ALERT_BAND_LABELS,
  STORAGE_CLOCK_STATUS_LABELS,
  TOS_ACCEPTANCE_STATUS_LABELS,
  TRANSPORT_MODE_LABELS,
  WASTE_CLASSIFICATION_LABELS,
} from "@/domain/taxonomy";

/**
 * The five status intents, and the single map from a stored status value to one
 * of them — `UX_SPEC.md` §1.2 Rule 2.
 *
 * **Statuses are named in `TAXONOMY.md`; the intent each maps to is defined
 * here, once. A component never picks a colour for a status.**
 *
 * The map is keyed on `(system, value)` rather than on the value alone, and that
 * is not incidental: `draft` is neutral on a battery record and on a shipment,
 * but on a `document_render` it means *watermarked, not valid, satisfies no
 * documentation obligation* (Rule 5.28) — the same word, a different weight.
 * `open` appears on both `container` and `lot`. A value-keyed map would have to
 * choose, and would choose wrong somewhere.
 */

export const STATUS_INTENTS_BY_NAME = [
  "neutral",
  "ok",
  "attention",
  "critical",
  "pending",
] as const;

export type StatusIntent = (typeof STATUS_INTENTS_BY_NAME)[number];

/**
 * The taxonomy systems a `StatusBadge` can render.
 *
 * Every one is a `T-` system in `TAXONOMY.md`. T-10 (extraction confidence) is
 * deliberately **absent**: confidence is a property of a text extraction from an
 * image and is never placed near, combined with, or styled like a condition,
 * damage or hazard signal (`UX_SPEC.md` §0). It has its own component.
 */
export const STATUS_SYSTEMS = {
  catalog_entry_status: CATALOG_ENTRY_STATUS_LABELS,
  intake_session_status: INTAKE_SESSION_STATUS_LABELS,
  data_use_eligibility: DATA_USE_ELIGIBILITY_LABELS,
  waste_classification: WASTE_CLASSIFICATION_LABELS,
  handler_size_class: HANDLER_SIZE_CLASS_LABELS,
  transport_mode: TRANSPORT_MODE_LABELS,
  state_of_charge_band: STATE_OF_CHARGE_BAND_LABELS,
  battery_record_status: BATTERY_RECORD_STATUS_LABELS,
  container_type: CONTAINER_TYPE_LABELS,
  container_status: CONTAINER_STATUS_LABELS,
  lot_status: LOT_STATUS_LABELS,
  storage_clock_status: STORAGE_CLOCK_STATUS_LABELS,
  storage_clock_alert_band: STORAGE_CLOCK_ALERT_BAND_LABELS,
  shipment_status: SHIPMENT_STATUS_LABELS,
  ddr_flag: DDR_FLAG_LABELS,
  recall_match_status: RECALL_MATCH_STATUS_LABELS,
  document_render_status: DOCUMENT_RENDER_STATUS_LABELS,
  rule_version_status: RULE_VERSION_STATUS_LABELS,
  classification_decision_status: CLASSIFICATION_DECISION_STATUS_LABELS,
  damage_assessment_status: DAMAGE_ASSESSMENT_STATUS_LABELS,
  tos_acceptance_status: TOS_ACCEPTANCE_STATUS_LABELS,
  format_category: FORMAT_CATEGORY_LABELS,
} as const satisfies Readonly<Record<string, Readonly<Record<string, string>>>>;

export type StatusSystem = keyof typeof STATUS_SYSTEMS;

type IntentMap = Readonly<Record<string, StatusIntent>>;

/**
 * The single `statusIntent` map.
 *
 * Rule 5 governs `critical`: it is reserved for an overdue storage clock, a
 * damaged-or-defective or recalled condition, a hard block, and a destructive
 * confirmation. **If red appears where nothing is wrong, red stops meaning
 * anything** — so a validation hint, a required-field marker or a count badge
 * never gets it.
 */
export const STATUS_INTENTS: Readonly<Record<StatusSystem, IntentMap>> = {
  // T-07
  catalog_entry_status: {
    proposed: "pending",
    published: "ok",
    deprecated: "neutral",
    rejected: "neutral",
  },
  // T-08
  intake_session_status: {
    open: "pending",
    extracting: "pending",
    awaiting_confirmation: "pending",
    completed: "ok",
    failed: "attention",
    abandoned: "neutral",
  },
  // T-12. `training_excluded` is terminal but it is not a fault — an ineligible
  // record is still fully usable (Rule 7.8), so it reads neutral, not critical.
  data_use_eligibility: {
    training_eligible: "ok",
    training_excluded: "neutral",
    pending_determination: "pending",
  },
  // T-13. `undetermined` blocks every downstream document (Rule 3.12), which is
  // a hard stop and reads as one.
  waste_classification: {
    light_category: "ok",
    fully_regulated: "attention",
    undetermined: "critical",
  },
  // T-15
  handler_size_class: {
    small_handler: "neutral",
    large_handler: "attention",
    undetermined: "neutral",
  },
  // T-18. `air` is not itself wrong — it is unavailable for a DDR record, and
  // that block is expressed by the block, not by colouring the mode red.
  transport_mode: {
    ground: "neutral",
    rail: "neutral",
    vessel: "neutral",
    air: "neutral",
  },
  // T-21
  state_of_charge_band: {
    at_or_below_storage_limit: "ok",
    above_storage_limit: "attention",
    not_captured: "neutral",
  },
  // T-22
  battery_record_status: {
    draft: "neutral",
    pending_review: "pending",
    confirmed: "ok",
    classified: "ok",
    reclassifying: "pending",
    stored: "ok",
    quarantined: "critical",
    staged: "pending",
    shipped: "ok",
    closed: "neutral",
    voided: "neutral",
  },
  // T-23. A `*_hold` container issues no documents, and a `*_ddr` container is
  // holding damaged material — both are conditions a facility manager acts on.
  container_type: {
    light_category_sound: "neutral",
    light_category_ddr: "critical",
    light_category_hold: "attention",
    fully_regulated_sound: "neutral",
    fully_regulated_ddr: "critical",
    fully_regulated_hold: "attention",
  },
  // T-24. `overdue` is a hard state, not a warning (Rule 4.15).
  container_status: {
    open: "ok",
    full: "attention",
    overdue: "critical",
    closed: "neutral",
    staged: "pending",
    shipped: "neutral",
    retired: "neutral",
  },
  // T-25
  lot_status: {
    open: "ok",
    closed: "neutral",
    allocated: "pending",
    shipped: "neutral",
    dissolved: "neutral",
  },
  // T-26
  storage_clock_status: {
    not_started: "neutral",
    running: "ok",
    approaching_limit: "attention",
    overdue: "critical",
    stopped: "neutral",
  },
  // T-27. The labels carry no number — the configured offset is rendered
  // alongside them, never read out of the stored value (TAXONOMY.md §5.4).
  storage_clock_alert_band: {
    none: "neutral",
    early: "attention",
    mid: "attention",
    final: "attention",
    overdue: "critical",
  },
  // T-28
  shipment_status: {
    draft: "neutral",
    ready: "ok",
    documents_issued: "ok",
    dispatched: "ok",
    delivered: "ok",
    exception: "critical",
    closed: "neutral",
    cancelled: "neutral",
  },
  // T-30. Any DDR flag removes air transport as an option and routes the record
  // to quarantine. All three are critical.
  ddr_flag: {
    damaged: "critical",
    defective: "critical",
    recalled: "critical",
  },
  // T-35
  recall_match_status: {
    not_checked: "neutral",
    no_match: "ok",
    possible_match: "attention",
    confirmed_match: "critical",
    dismissed: "neutral",
  },
  // T-39. A draft is watermarked not-valid and closes no precondition
  // (Rule 5.28) — `attention`, so it is never mistaken for an issued document.
  document_render_status: {
    draft: "attention",
    issued: "ok",
    superseded: "neutral",
    voided: "neutral",
  },
  // T-42. `withdrawn` was published in error and pulled; anything produced under
  // it has to be findable.
  rule_version_status: {
    draft: "neutral",
    scheduled: "pending",
    active: "ok",
    superseded: "neutral",
    withdrawn: "critical",
  },
  // T-45. `blocked` produces no downstream document (Rule 3.12).
  classification_decision_status: {
    pending: "pending",
    blocked: "critical",
    active: "ok",
    superseded: "neutral",
  },
  // T-46. `not_assessed` blocks a shipment (Rule 6.1) — a stop, not a nicety.
  damage_assessment_status: {
    not_assessed: "attention",
    assessed_sound: "ok",
    assessed_damaged: "critical",
    superseded: "neutral",
  },
  // T-47. `not_accepted` and `lapsed` both block intake organisation-wide.
  tos_acceptance_status: {
    not_accepted: "critical",
    in_force: "ok",
    grace: "attention",
    lapsed: "critical",
    superseded: "neutral",
    revoked: "attention",
  },
  // T-06. `not_covered` is a real, meaningful result — not an error.
  format_category: {
    portable: "neutral",
    medium_format: "neutral",
    large_format: "neutral",
    not_covered: "neutral",
    undetermined: "attention",
  },
};

/**
 * Provisional intents for `alert.severity`.
 *
 * **`ERD.md` §6.5 says these values live in `TAXONOMY.md` and no `T-` system
 * defines them** — the gap is reported in this unit's build-notes. Until P6 adds
 * the system, an unrecognised severity resolves to `neutral` and is surfaced
 * rather than guessed, exactly as an unrecognised status is.
 *
 * A severity never expresses a probability of ignition (Rules 1.25, 10.3).
 */
export const ALERT_SEVERITY_INTENTS: IntentMap = {
  info: "neutral",
  attention: "attention",
  critical: "critical",
};

/**
 * The intent for one stored value, or `null` when the value is not one this
 * build knows.
 *
 * `null` is not an error. `TAXONOMY.md` §5.8: **render it, do not crash; never
 * coerce it to a default; never filter it out of a count.** The badge renders an
 * unrecognised value neutrally, with the raw value visible — a missing status is
 * more dangerous than an ugly one (`UX_SPEC.md` §2.3).
 */
export function statusIntent(
  system: StatusSystem,
  value: string,
): StatusIntent | null {
  return STATUS_INTENTS[system][value] ?? null;
}

/** The display label for one stored value, or `null` when it is unrecognised. */
export function statusLabel(
  system: StatusSystem,
  value: string,
): string | null {
  const labels: Readonly<Record<string, string>> = STATUS_SYSTEMS[system];
  return labels[value] ?? null;
}
