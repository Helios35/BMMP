import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rules 1.23 and 1.25, and D-22/D-40, enforced against the intake source —
 * **no jurisdiction threshold, deadline, citation or unit is a literal, and
 * no confidence threshold value exists anywhere but the mock's fixtures.**
 *
 * Modelled on `tests/unit/features/settings/no-jurisdiction-literal.test.ts`,
 * extended to the surfaces intake adds. Intake is where a helpful
 * `if (score >= 0.9)` is most tempting and most damaging: the gate's numbers
 * are platform configuration a tenant may raise, stamped on every session and
 * extraction row so a decision reproduces after they change (Rule 2.16). A
 * value in code cannot be raised, cannot be stamped, and quietly disagrees
 * with the one that was.
 *
 * The heuristics are deliberately blunt and **nothing is allow-listed**. A
 * false positive is fixed by moving the number out of the source, which is
 * the rule anyway.
 */

/** Every intake surface, domain to route. Roots that do not exist yet scan empty. */
const ROOTS = [
  "src/domain/intake",
  "src/domain/catalog",
  "src/domain/classification",
  "src/domain/storage",
  "src/domain/condition",
  "src/features/intake",
  "src/components/extraction-review",
  "src/components/flow",
  "src/app/(app)/batteries/new",
] as const;

/** The roots that exist today; the found-file count is asserted over these. */
const ROOTS_PRESENT_TODAY = [
  "src/domain/intake",
  "src/domain/storage",
] as const;

/**
 * Where a threshold **value** may never be written (D-22, D-40). The fixture
 * module `src/data/mock/fixtures/platform-configuration.ts` is the mock's
 * database and the only place in `src/` such a value lives.
 */
const NO_FRACTION_ROOTS = [
  "src/domain/intake",
  "src/domain/catalog",
  "src/domain/classification",
  "src/features/intake",
] as const;

/**
 * Units a jurisdiction rule supplies. `hour` is absent for the same reason it
 * is absent from the settings guard: the 24-hour emergency contact number is
 * the regulatory name of a thing, not a threshold this product chose.
 */
const UNIT_TOKENS =
  "days?|weeks?|months?|years?|kg|lbs?|Wh|kWh|cu ft|cubic feet|%";

const NUMBER_BESIDE_UNIT = new RegExp(
  String.raw`\b\d+(?:\.\d+)?\s*(?:-\s*)?(?:${UNIT_TOKENS})\b`,
  "i",
);

/** A citation looks like a code reference: a title, a part and a section. */
const CITATION_SHAPE = /\b(?:WAC|CFR|RCW|USC)\b/i;

/**
 * A fraction of one — the shape of every confidence threshold, band cutoff,
 * match score floor and tolerance. Scanned over the comment-stripped source,
 * so it catches a numeric literal as well as one inside a string.
 *
 * A fraction embedded in a dotted version (`"1.0.0"`, `"0.1.0"`) is not a
 * threshold and is not matched: the digit-or-dot lookbehind and the dot-digit
 * lookahead exclude it without allow-listing any file. Nothing else is
 * excluded.
 */
const FRACTION_OF_ONE = /(?<![\d.])\b0\.\d+\b(?!\.\d)/;

/** Rule 1.25. Not word choice — legal exposure. */
const IGNITION_PROBABILITY =
  /probability of ignition|likelihood of (?:fire|ignition|thermal)|risk of fire|chance of (?:fire|ignition|thermal runaway)|ignition score/i;

/**
 * Chemistry is never detected from a photograph (design §0.3). `chemistry_code`
 * is characters printed on the label; chemistry on the record comes from a
 * matched catalog entry or a person. Copy that says a camera read it is copy
 * that will be believed.
 */
const CHEMISTRY_FROM_IMAGE =
  /(?:detected|read|recognis(?:e|z)ed|identified)\s+chemistry\s+from\s+(?:the\s+)?(?:photo|image|picture|camera|label)|chemistry\s+(?:was\s+)?(?:detected|read|recognis(?:e|z)ed|identified)\s+from\s+(?:the\s+)?(?:photo|image|picture|camera|label)|detected chemistry|read chemistry/i;

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
    // A test file beside its module is scanned by its own suite, not this one.
    if (/\.test\.tsx?$/.test(entry)) return [];
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * Comments are stripped before the scan.
 *
 * A comment naming the rule a line implements is required by the house style,
 * and one of them citing a period or a band would otherwise fail this test
 * for saying the right thing.
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

function offendersIn(
  files: readonly string[],
  pattern: RegExp,
): readonly string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const literal of stringLiterals(source)) {
      if (pattern.test(literal)) offenders.push(`${file}: ${literal}`);
    }
  }
  return offenders;
}

describe("Rules 1.23, 1.25 and D-22/D-40 — no threshold literal on the intake surfaces", () => {
  const files = ROOTS.flatMap(sourceFiles);

  it("finds the files it is meant to be guarding", () => {
    // The roots that exist today must yield something, or the guard is
    // scanning nothing and passing for it.
    expect(ROOTS_PRESENT_TODAY.flatMap(sourceFiles).length).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(0);
  });

  it("writes no number beside a unit inside any string", () => {
    expect(offendersIn(files, NUMBER_BESIDE_UNIT)).toEqual([]);
  });

  it("writes no citation of its own", () => {
    // Every citation comes out of `rule_version.citation`.
    expect(offendersIn(files, CITATION_SHAPE)).toEqual([]);
  });

  it("expresses no probability of ignition anywhere on these surfaces", () => {
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toMatch(IGNITION_PROBABILITY);
    }
  });

  it("never says a chemistry was detected or read from a photograph", () => {
    expect(offendersIn(files, CHEMISTRY_FROM_IMAGE)).toEqual([]);
  });

  it("holds no fraction-of-one literal, in a string or a number — thresholds live in src/data/mock/fixtures/ only (D-22, D-40)", () => {
    const offenders: string[] = [];
    for (const file of NO_FRACTION_ROOTS.flatMap(sourceFiles)) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const line of source.split("\n")) {
        if (FRACTION_OF_ONE.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }

    expect(
      offenders,
      "A confidence threshold, band cutoff, match score or tolerance value is data, never code (D-22, D-40): " +
        "thresholds live in src/data/mock/fixtures/ only, and reach the domain as an argument read through src/data.",
    ).toEqual([]);
  });
});
