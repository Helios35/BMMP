import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * §1.3's type scale and §1.4's spacing scale, **enforced rather than agreed**.
 *
 * The brief that produced this file asks for the rule to be provable: *"Prove it
 * with a check that fails on an arbitrary value, the same way the contrast and
 * bounding-box sweeps work — a rule nobody can violate beats a rule everybody
 * agrees with."* Unit 01 is the evidence for that sentence. Its eight defects
 * were all found by something that measures, and none by reading a diff.
 *
 * ## What is scanned
 *
 * Every `.ts` and `.tsx` file under `src/`, with comments stripped, reading only
 * **string literals** — which is where a Tailwind class can be. Prose in a
 * docblock is not a class list and is not scanned, so the word "shadow" in a
 * paragraph explaining why there is no shadow does not fail the shadow rule.
 *
 * ## What is not scanned, and why
 *
 * **`src/components/ui/` is generated shadcn and is never hand-edited** (§1.1,
 * `PROJECT_SETUP_BMMP.md` §3.1). Its primitives carry `text-sm`, `rounded-lg`,
 * `gap-1.5` and `px-2.5`, none of which is a token — which is exactly why app
 * code carries `ACTION_BUTTON_CLASS` and why every generated size gets
 * `min-h-11` added. Linting a file nobody may edit produces a failure with no
 * legal fix.
 *
 * ## Two stated exemptions
 *
 * Both are greppable decisions rather than silent passes, in the same way
 * `tests/e2e/ergonomics.spec.ts` marks its one WCAG 2.5.8 exemption:
 *
 * 1. **`env(safe-area-inset-*)`.** §1.5 and §4.3 *require* it, and it cannot be
 *    expressed on a four-pixel scale. Any arbitrary spacing value whose
 *    expression names it passes.
 * 2. **The raised centre nav tab.** §1.4 permits elevation on "surfaces that
 *    float above the page — Dialog, Sheet, Popover, DropdownMenu, the mobile
 *    action bar", and §1.5 specifies the centre tab as *"64px, raised"*. One
 *    file, named below.
 *
 * ## What is deliberately outside the rule
 *
 * §1.4's scale governs **spacing** — padding, margin and gap. It cannot govern
 * sizing: §1.5 mandates a 44px target and §1.4 mandates 56px and 48px row
 * heights, none of which is one of its eight values. `h-*`, `w-*`, `size-*`,
 * `top-*` and `scroll-m*` are therefore not spacing and are not scanned.
 *
 * Native emphasis markup — `<strong>`, `<em>` — keeps the user agent's weight.
 * The rule governs authored utility classes.
 */

/* ------------------------------------------------------------------ corpus */

const ROOT = path.join(process.cwd(), "src");

/** Generated, and never hand-edited (§1.1). */
const NOT_SCANNED = [path.join("src", "components", "ui")];

/** §1.4 and §1.5 — the raised 64px centre tab is a floating surface. */
const ELEVATION_ALLOWED = [
  path.join("src", "features", "shell", "navigation", "mobile-tab-bar.tsx"),
];

function sourceFiles(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const relative = path.relative(process.cwd(), full);
      if (NOT_SCANNED.some((skip) => relative.startsWith(skip))) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) found.push(relative);
    }
  };
  walk(ROOT);
  return found;
}

const FILES = sourceFiles();

/** Block and line comments removed, so prose in a docblock is never a class. */
function withoutComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, " ")
    .replaceAll(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

interface Token {
  readonly file: string;
  readonly line: number;
  /** The whole class as written, variants included. */
  readonly raw: string;
  /** The utility with every `variant:` prefix stripped. */
  readonly utility: string;
}

/**
 * Every whitespace-separated token inside a string literal.
 *
 * A class list is always a string literal — `className="…"`, an argument to
 * `cn()`, a `cva` variant. Reading literals rather than whole lines is what
 * keeps a sentence out of the corpus.
 */
function classTokens(): readonly Token[] {
  const tokens: Token[] = [];

  for (const file of FILES) {
    const source = withoutComments(readFileSync(file, "utf8"));
    const lineStarts: number[] = [0];
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] === "\n") lineStarts.push(i + 1);
    }
    const lineOf = (index: number) => {
      let low = 0;
      let high = lineStarts.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if ((lineStarts[mid] ?? 0) <= index) low = mid;
        else high = mid - 1;
      }
      return low + 1;
    };

    for (const match of source.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
      const literal = match[1] ?? match[2] ?? match[3] ?? "";
      if (literal.trim() === "") continue;
      const line = lineOf(match.index);
      for (const raw of literal.split(/\s+/)) {
        if (raw === "") continue;
        const parts = raw.split(":");
        const utility = parts.at(-1) ?? raw;
        tokens.push({ file, line, raw, utility });
      }
    }
  }

  return tokens;
}

const TOKENS = classTokens();

function report(
  violations: readonly (Token & { readonly why: string })[],
  rule: string,
): string {
  return `${violations.length} violation(s) of ${rule}:\n  ${violations
    .map((v) => `${v.file}:${v.line} — ${v.raw} (${v.why})`)
    .join("\n  ")}`;
}

/* ----------------------------------------------------------------- spacing */

/** §1.4: 4, 8, 12, 16, 24, 32, 48, 64 — and 0, which is the absence of one. */
const PERMITTED_SPACING = new Set([0, 1, 2, 3, 4, 6, 8, 12, 16]);

const SPACING_UTILITY =
  /^-?(m|mt|mr|mb|ml|ms|me|mx|my|p|pt|pr|pb|pl|ps|pe|px|py|gap|gap-x|gap-y|space-x|space-y)-(.+)$/;

/** §1.5, §4.3 require it, and it is not expressible on a four-pixel scale. */
function isSafeAreaInset(value: string): boolean {
  return value.includes("env(safe-area-inset");
}

describe("§1.4 — 4, 8, 12, 16, 24, 32, 48, 64, and nothing else", () => {
  it("no spacing utility carries an off-scale value", () => {
    const violations: (Token & { why: string })[] = [];

    for (const token of TOKENS) {
      const match = SPACING_UTILITY.exec(token.utility);
      const value = match?.[2];
      if (value === undefined) continue;

      if (value.startsWith("[")) {
        if (isSafeAreaInset(value)) continue;
        violations.push({
          ...token,
          why: "an arbitrary spacing value; §1.4 permits eight and no others",
        });
        continue;
      }
      if (!/^\d+(\.\d+)?$/.test(value)) continue;
      if (PERMITTED_SPACING.has(Number(value))) continue;

      violations.push({
        ...token,
        why: `${Number(value) * 4}px, which is not one of §1.4's eight values`,
      });
    }

    expect(violations, report(violations, "§1.4's spacing scale")).toEqual([]);
  });

  it("the only arbitrary spacing values name a safe-area inset", () => {
    // The exemption records a judgement — *is this the inset §1.5 requires* —
    // and no assertion can make that judgement. What it can do is stop the
    // bracket being reached for as a way around the scale.
    const arbitrary = TOKENS.filter((token) =>
      Boolean(SPACING_UTILITY.exec(token.utility)?.[2]?.startsWith("[")),
    );
    for (const token of arbitrary) {
      expect(
        token.raw,
        `${token.file}:${token.line} — ${token.raw} claims the spacing exemption without naming env(safe-area-inset-*)`,
      ).toContain("env(safe-area-inset");
    }
  });
});

/* -------------------------------------------------------------------- type */

/** §1.3's eight, as the classes `globals.css` defines. */
const TYPE_TOKENS = new Set([
  "text-display",
  "text-h1",
  "text-h2",
  "text-body",
  "text-body-strong",
  "text-label",
  "text-caption",
  "text-mono",
]);

/** Tailwind's own size ramp — every one of these is off-token by definition. */
const TAILWIND_TEXT_SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl)$/;

/** A family is not a size. `font-mono` beside `text-h1` is how §1.3 spells mono. */
const FONT_FAMILY = /^font-(sans|serif|mono|heading)$/;

const FONT_WEIGHT =
  /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[)/;

describe("§1.3 — eight type tokens, and no size, weight or leading outside them", () => {
  it("no Tailwind text size survives in app code", () => {
    const violations = TOKENS.filter((token) =>
      TAILWIND_TEXT_SIZE.test(token.utility),
    ).map((token) => ({
      ...token,
      why: "a Tailwind size, not one of §1.3's eight tokens",
    }));
    expect(violations, report(violations, "§1.3's type scale")).toEqual([]);
  });

  it("no arbitrary font size survives", () => {
    const violations = TOKENS.filter(
      (token) =>
        token.utility.startsWith("text-[") &&
        // `text-[color]` is not a size, and Rule 1 already forbids raw colour.
        /^text-\[[\d.]/.test(token.utility),
    ).map((token) => ({
      ...token,
      why: "an arbitrary font size; §1.3 says the builder writes a token, never a size",
    }));
    expect(violations, report(violations, "§1.3's type scale")).toEqual([]);
  });

  it("no font weight is set outside a type token", () => {
    const violations = TOKENS.filter(
      (token) =>
        FONT_WEIGHT.test(token.utility) && !FONT_FAMILY.test(token.utility),
    ).map((token) => ({
      ...token,
      why: "a font weight; the token carries the weight (§1.3)",
    }));
    expect(violations, report(violations, "§1.3's type scale")).toEqual([]);
  });

  it("no line height is set outside a type token", () => {
    const violations = TOKENS.filter((token) =>
      /^leading-/.test(token.utility),
    ).map((token) => ({
      ...token,
      why: "a line height; the token carries the line height (§1.3)",
    }));
    expect(violations, report(violations, "§1.3's type scale")).toEqual([]);
  });

  it("the eight tokens are the ones globals.css actually defines", () => {
    // A token nobody defined renders as nothing, silently. `text-body-strong`
    // was one of the three defects unit 01 found: §1.3's eight did not exist as
    // classes at all until that unit's final commits.
    const css = readFileSync(
      path.join(process.cwd(), "src", "styles", "globals.css"),
      "utf8",
    );
    for (const token of TYPE_TOKENS) {
      expect(css, `globals.css defines no @utility ${token}`).toContain(
        `@utility ${token} {`,
      );
    }
  });
});

/* ------------------------------------------------------- radius, elevation */

/** §1.4 — `rounded-lg` for cards, dialogs and sheets; `rounded-md` for the rest. */
const PERMITTED_RADIUS =
  /^rounded(-[trbl]|-[trbl][trbl]|-[se]|-[trbl][se])?-(md|lg|none|full)$/;

const ANY_RADIUS = /^rounded(-[a-z]{1,2})?(-.+)?$/;

describe("§1.4 — two radii, and elevation only where a surface floats", () => {
  it("no third border radius survives", () => {
    const violations = TOKENS.filter((token) => {
      if (!ANY_RADIUS.test(token.utility)) return false;
      if (PERMITTED_RADIUS.test(token.utility)) return false;
      // `rounded-t-xl` and friends are the ones that matter; a bare `rounded`
      // is Tailwind's `--radius-sm`, which §1.4 does not carry either.
      return /^rounded(-[trbles]{1,2})?(-(sm|xl|[2-4]xl|\[.*))?$/.test(
        token.utility,
      );
    }).map((token) => ({
      ...token,
      why: "§1.4 carries two radii: rounded-md (6px) and rounded-lg (8px). `none` and `full` are shapes, not corner sizes",
    }));
    expect(violations, report(violations, "§1.4's two radii")).toEqual([]);
  });

  it("no shadow outside the one file §1.4 and §1.5 permit one in", () => {
    const violations = TOKENS.filter(
      (token) =>
        /^(shadow|drop-shadow)(-.+)?$/.test(token.utility) &&
        !ELEVATION_ALLOWED.includes(token.file),
    ).map((token) => ({
      ...token,
      why: "flat by default; a shadow is only for a surface that floats above the page (§1.4)",
    }));
    expect(violations, report(violations, "§1.4's elevation rule")).toEqual([]);
  });
});

/* -------------------------------------------------------------- the corpus */

describe("the sweep looks at what it claims to", () => {
  it("scans every source file outside the generated primitives", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(
      FILES.filter((file) => file.includes(path.join("components", "ui"))),
    ).toEqual([]);
  });

  it("finds classes to look at, so it cannot pass by finding nothing", () => {
    // The failure mode that made unit 01's theme assertion pass vacuously for a
    // whole unit: a check whose corpus is empty is a check that always passes.
    expect(TOKENS.length).toBeGreaterThan(1000);
    expect(TOKENS.some((token) => token.utility === "text-body")).toBe(true);
    expect(TOKENS.some((token) => token.utility === "gap-4")).toBe(true);
  });

  it("does not read prose out of a comment", () => {
    // `page-section.tsx` explains in a docblock that a card carries a border and
    // never a shadow. The word is in the file; it is not a class.
    const commented = withoutComments(
      readFileSync(
        path.join("src", "components", "page", "page-section.tsx"),
        "utf8",
      ),
    );
    expect(commented).not.toContain("never a shadow");
  });
});
