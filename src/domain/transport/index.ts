/**
 * Transport and shipping papers — `BUSINESS_RULES.md` §5, §6.7–6.16.
 *
 * Pure. The rows, the resolved rule versions and the instant arrive as
 * arguments, and every regulatory string is a rule version's payload. The
 * screen renders these decisions and the adapter re-checks them; neither
 * re-derives one.
 */

export * from "./air-transport";
export * from "./basic-description";
export * from "./container-admission";
export * from "./departure";
export * from "./emergency-verification";
export * from "./packaging-exception";
export * from "./rule-data";
export * from "./shipping-paper";
export * from "./stored-paper";
export * from "./contents-summary";
