/**
 * Generated documents — `TECHNICAL_SPEC.md` §8; Rules 4.18–4.22, 5.12–5.28.
 *
 * Pure. Each builder takes what a document says and the render's own
 * identity, validates the whole before any renderer runs, and returns the
 * payload a template prints and nothing more. The snapshot and its
 * verification code are defined here, so the code printed on a page and the
 * code a verification recomputes come from one definition.
 */

export * from "./build-container-label-payload";
export * from "./build-shipping-paper-payload";
export * from "./document-identity";
export * from "./snapshot";
