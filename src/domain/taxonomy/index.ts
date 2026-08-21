/**
 * The classification systems in the product — `docs/TAXONOMY.md`, T-01 through
 * T-61. T-48 is the one that is not here, and the comment beside it says why.
 *
 * One module per system, each exporting the value list constant, the union type
 * derived from it, and the label lookup (TAXONOMY.md §5.3). Shared read helpers
 * live in `./lookup`; there is exactly one lookup per system and a second one
 * anywhere is a defect (§5.7).
 *
 * `src/domain` imports nothing from `app`, `components`, `features`, `data` or
 * `lib`. Taxonomy is pure data and pure functions — the one thing every layer
 * may read and nothing may reach past.
 */

export * from "./lookup";

// T-01 · Battery chemistry
export * from "./chemistry";
// T-02 · Battery application class
export * from "./application-class";
// T-03 · Assembly level
export * from "./assembly-level";
// T-04 · Cell form factor
export * from "./cell-form-factor";
// T-05 · Battery removability
export * from "./removability";
// T-06 · Size / format category
export * from "./format-category";
// T-07 · Catalog entry status
export * from "./catalog-entry-status";
// T-08 · Intake session status
export * from "./intake-session-status";
// T-09 · Label extraction field code
export * from "./label-field-code";
// T-10 · Extraction confidence band
export * from "./confidence-band";
// T-11 · Provenance source type
export * from "./provenance-source-type";
// T-12 · Data-use eligibility
export * from "./data-use-eligibility";
// T-13 · Waste classification
export * from "./waste-classification";
// T-14 · Waste classification basis code
export * from "./classification-basis-code";
// T-15 · Handler size class
export * from "./handler-size-class";
// T-16 · Handler activity type
export * from "./handler-activity-type";
// T-17 · UN transport identifier
export * from "./un-transport-identifier";
// T-18 · Transport mode
export * from "./transport-mode";
// T-19 · Packing group
export * from "./packing-group";
// T-20 · Packaging exception
export * from "./packaging-exception";
// T-21 · State-of-charge band
export * from "./state-of-charge-band";
// T-22 · Battery record status
export * from "./battery-record-status";
// T-23 · Container type
export * from "./container-type";
// T-24 · Container status
export * from "./container-status";
// T-25 · Lot status
export * from "./lot-status";
// T-26 · Storage clock status
export * from "./storage-clock-status";
// T-27 · Storage clock alert band
export * from "./storage-clock-alert-band";
// T-28 · Shipment status
export * from "./shipment-status";
// T-29 · Damage finding type
export * from "./damage-finding-type";
// T-30 · DDR flag
export * from "./ddr-flag";
// T-31 · Condition grade
export * from "./condition-grade";
// T-32 · Disposition route
export * from "./disposition-route";
// T-33 · Hazard ranking band
export * from "./hazard-ranking-band";
// T-34 · Hazard factor code
export * from "./hazard-factor-code";
// T-35 · Recall match status
export * from "./recall-match-status";
// T-36 · Recall source
export * from "./recall-source";
// T-37 · Role
export * from "./role";
// T-38 · Document type
export * from "./document-type";
// T-39 · Document render status
export * from "./document-render-status";
// T-40 · Jurisdiction level
export * from "./jurisdiction-level";
// T-41 · Jurisdiction rule domain
export * from "./jurisdiction-rule-domain";
// T-42 · Rule version status
export * from "./rule-version-status";
// T-43 · Audit event type
export * from "./audit-event-type";
// T-44 · Alert type
export * from "./alert-type";
// T-45 · Classification decision status
export * from "./classification-decision-status";
// T-46 · Damage assessment status
export * from "./damage-assessment-status";
// T-47 · Terms of Service acceptance status
export * from "./tos-acceptance-status";
// T-48 · Alert severity — **no module.** Its label for `attention` is "Needs
// attention", and §4.5 forbids a label that contains its own stored value.
// Bending the label and bending the rule are both P6's call — reported in this
// unit's build-notes rather than settled here.
//
// T-49 · Assessed condition
export * from "./assessed-condition";
// T-50 · Intake photo type
export * from "./intake-photo-type";
// T-51 · Label crop method
export * from "./label-crop-method";
// T-52 · Review reason code
export * from "./review-reason-code";
// T-53 · Intake step
export * from "./intake-step";
// T-54 · Chemistry source
export * from "./chemistry-source";
// T-55 · State-of-charge source
export * from "./state-of-charge-source";
// T-56 · Date code precision
export * from "./date-code-precision";
// T-57 · Date code decode method
export * from "./date-code-decode-method";
// T-58 · Classification decision scope
export * from "./classification-decision-scope";
// T-59 · Damage assessment method
export * from "./damage-assessment-method";
// T-60 · Audit actor type
export * from "./audit-actor-type";
// T-61 · Catalog entry source type
export * from "./catalog-entry-source-type";
