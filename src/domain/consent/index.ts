/**
 * Consent — the Terms of Service gate and who may close it.
 *
 * Rules 7.1–7.5, 7.13, 7.14, 7.18; D-2, D-35; E-12. Everything here is pure: it
 * takes consent rows and a stated day, or a role and its membership attributes,
 * and returns a decision. The reads live in `src/features/consent`, which is
 * what makes every branch of this folder testable without a request.
 */

export * from "./intake-gate";
export * from "./binding-authority";
