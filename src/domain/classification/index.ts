/**
 * Waste-stream classification as a pure evaluator — `BUSINESS_RULES.md` §3.
 *
 * Every list, switch and threshold it reads is in the resolved rule version's
 * payload; the module carries the shape of that payload and none of its
 * contents. A missing input blocks; it never defaults (Rule 3.10).
 */

export * from "./waste-stream";
