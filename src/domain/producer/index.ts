/**
 * State producer obligations — `BUSINESS_RULES.md` Rules 8.6–8.16; D-78.
 *
 * Products and states in; a band per state; obligations and deadlines out.
 * **Every limit, date, citation and label is rule data** read through
 * `src/data` and passed in — nothing here names a state or branches on one
 * (Rule 1.23; T-40).
 */

export * from "./alerts";
export * from "./band";
export * from "./conditions";
export * from "./deadlines";
export * from "./evaluate";
export * from "./payloads";
export * from "./run";
export * from "./words";
