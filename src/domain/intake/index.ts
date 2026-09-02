/**
 * Intake — the pure half of the pipeline `TECHNICAL_SPEC.md` §11.1 describes.
 *
 * Score to band, shape validation, the confidence gate, the commit checklist,
 * the date-code decoder, the step arithmetic and the draft reducers. Everything
 * here takes its inputs as arguments — thresholds and cutoffs from platform
 * configuration, the day from the caller, the person from the request — and
 * holds no value of its own: **no threshold, no cutoff, no default** lives in
 * this folder (D-22, D-40, Rule 2.17). The orchestration that calls these in
 * order lives in `src/features/intake/server`.
 */

export * from "./thresholds";
export * from "./confidence-band";
export * from "./field-validation";
export * from "./confidence-gate";
export * from "./commit-gate";
export * from "./date-code";
export * from "./steps";
export * from "./draft";
