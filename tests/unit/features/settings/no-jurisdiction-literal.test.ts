import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rule 1.23, enforced against the source — **no jurisdiction threshold,
 * deadline, citation or unit is a literal on the settings surfaces.**
 *
 * `/settings/organization` is where the whole product's thresholds surface, so
 * it is the file set most likely to acquire a helpful `"365 days"` or a
 * `"3 years"` in a label. A hard-coded value here is a review rejection, not a
 * style preference: the next jurisdiction measures by energy rather than by
 * volume, and a screen that assumes a unit prints a number the law never
 * supplied.
 *
 * The heuristic is deliberately blunt — a numeric literal adjacent to a unit
 * token, **inside a string literal**. It will occasionally flag something
 * innocent; the fix is to move the number out of the string, which is the rule
 * anyway.
 */

const ROOTS = [
  "src/app/(app)/settings/organization",
  "src/app/(app)/settings/users",
  "src/features/settings",
] as const;

/**
 * Units a jurisdiction rule supplies. **`hour` is absent on purpose**: the
 * 24-hour emergency contact number is the regulatory name of a thing, fixed by
 * `UX_SPEC.md` §3.17, not a threshold this product chose.
 */
const UNIT_TOKENS =
  "days?|weeks?|months?|years?|kg|lbs?|Wh|kWh|cu ft|cubic feet|%";

const NUMBER_BESIDE_UNIT = new RegExp(
  String.raw`\b\d+(?:\.\d+)?\s*(?:-\s*)?(?:${UNIT_TOKENS})\b`,
  "i",
);

/** A citation looks like a code reference: a title, a part and a section. */
const CITATION_SHAPE = /\b(?:WAC|CFR|RCW|USC)\b/i;

function sourceFiles(root: string): readonly string[] {
  const absolute = join(process.cwd(), root);
  let entries: readonly string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) return sourceFiles(join(root, entry));
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * Comments are stripped before the scan.
 *
 * A comment naming the rule a line implements is required by the house style,
 * and one of them citing a period would otherwise fail this test for saying the
 * right thing.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Every single-, double- and back-quoted string literal in the source. */
function stringLiterals(source: string): readonly string[] {
  return (
    source.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []
  );
}

describe("Rule 1.23 — no jurisdiction literal on the settings surfaces", () => {
  const files = ROOTS.flatMap(sourceFiles);

  it("finds the files it is meant to be guarding", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("writes no number beside a unit inside any string", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const literal of stringLiterals(source)) {
        if (NUMBER_BESIDE_UNIT.test(literal)) {
          offenders.push(`${file}: ${literal}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("writes no citation of its own", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const literal of stringLiterals(source)) {
        if (CITATION_SHAPE.test(literal)) {
          offenders.push(`${file}: ${literal}`);
        }
      }
    }

    // Every citation on these pages comes out of `rule_version.citation`.
    expect(offenders).toEqual([]);
  });

  it("expresses no probability of ignition anywhere on these surfaces", () => {
    // Rule 1.25. Not word choice — legal exposure.
    const prohibited =
      /probability of ignition|likelihood of (?:fire|ignition|thermal)|risk of fire|chance of (?:fire|ignition|thermal runaway)|ignition score/i;

    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toMatch(prohibited);
    }
  });
});
