/**
 * Domain primitives for rules-as-data.
 *
 * `PROJECT_SETUP_BMMP.md` §8.1 makes a hard-coded threshold a review rejection;
 * these are the shapes that make it mechanically hard to write one. **The rules
 * themselves are not here** — this is what rules get written into.
 */

export * from "./outcome";
export * from "./resolve";
