/**
 * Offline — `UX_SPEC.md` §2.10, E-10; D-20.
 *
 * The banner the shell mounts, the hook that says whether the browser has a
 * network, and the per-tab capture queue the intake step writes and the
 * banner reads. Shared because the banner lives in the shell and the queue is
 * written from a feature.
 */

export * from "./use-online-status";
export * from "./capture-queue";
export * from "./offline-banner";
