/**
 * The hazard ranking as pure functions — Rules 10.19–10.26; D-77.
 *
 * It reads each item's factors from its confirmed record, compares items
 * factor by factor in the scheme's order, places each in a band against its
 * comparison set, and says why in comparative words. **It produces no
 * probability, percentage, score or total of any kind** (Rules 1.25, 10.3,
 * 10.4), and it holds no level, band or cut point: the scheme is data, read
 * through `src/data` and handed in (Rule 1.23).
 */

export * from "./explain";
export * from "./order";
export * from "./readings";
export * from "./run";
export * from "./scheme";
export * from "./words";
export * from "./view";
