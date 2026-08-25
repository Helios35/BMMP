import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";

/**
 * `UX_SPEC.md` §1.2 Rule 3's contrast floors, **computed from the tokens that
 * actually ship** rather than asserted.
 *
 * ## Why this file exists at all
 *
 * `src/styles/globals.css` names it — *"`tests/unit/design-tokens.test.ts`
 * excludes this token with the same reason written there"* — and it did not
 * exist. Unit 01 found `--input` below the 3:1 interactive-border floor by
 * measuring it once, by hand, during the unit, and shipped the corrected value
 * with no check behind it. A floor cleared once is a floor that drifts on the
 * next token edit, and the two defects unit 01 found this way had both been
 * green for a whole unit.
 *
 * **No threshold here is lowered to make anything pass.** The one exemption is
 * `--border`, and it is exempt for the reason written beside the token: §1.2
 * Rule 3 scopes the 3:1 floor to *interactive* borders, and §1.4 makes the card
 * border a structural device. `--input` and `--ring` are the tokens that do
 * bound a control, and both are held to 3:1.
 *
 * The intent borders are a separate question with a separate answer — see the
 * block near the end of this file, which reports a finding rather than
 * asserting a floor.
 *
 * ## What is measured
 *
 * Every value in `globals.css` is `oklch()`, some with an alpha. So the file is
 * parsed, each colour converted oklch → OKLab → linear sRGB → sRGB, composited
 * over its background where it carries an alpha, and the WCAG 2.x relative
 * luminance ratio computed. **Both themes**, because §1.2 Rule 6 makes dark mode
 * a B1a deliverable rather than a toggle bolted on.
 */

const CSS = readFileSync(
  path.join(process.cwd(), "src", "styles", "globals.css"),
  "utf8",
);

/* ------------------------------------------------------------------ colour */

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0–1. `1` for an opaque token. */
  readonly a: number;
}

/** `oklch(L C H)` or `oklch(L C H / A%)`, as `globals.css` writes them. */
function parseOklch(value: string): Rgb {
  const match =
    /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/.exec(
      value.trim(),
    );
  if (match === null) throw new Error(`Not an oklch() colour: ${value}`);

  const [, lRaw, cRaw, hRaw, aRaw, aUnit] = match;
  const l = Number(lRaw);
  const c = Number(cRaw);
  const h = (Number(hRaw) * Math.PI) / 180;
  const alpha =
    aRaw === undefined ? 1 : aUnit === "%" ? Number(aRaw) / 100 : Number(aRaw);

  // OKLab → LMS → linear sRGB (Björn Ottosson's matrices).
  const a = c * Math.cos(h);
  const bb = c * Math.sin(h);

  const lp = l + 0.3963377774 * a + 0.2158037573 * bb;
  const mp = l - 0.1055613458 * a - 0.0638541728 * bb;
  const sp = l - 0.0894841775 * a - 1.291485548 * bb;

  const lc = lp * lp * lp;
  const mc = mp * mp * mp;
  const sc = sp * sp * sp;

  return {
    r: +4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    g: -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    b: -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
    a: alpha,
  };
}

/** Alpha compositing happens in linear light, which is where these already are. */
function over(foreground: Rgb, background: Rgb): Rgb {
  if (foreground.a >= 1) return foreground;
  const mix = (f: number, b: number) =>
    f * foreground.a + b * (1 - foreground.a);
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a: 1,
  };
}

/** WCAG 2.x relative luminance, from linear-light sRGB. */
function luminance(colour: Rgb): number {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return (
    0.2126 * clamp(colour.r) +
    0.7152 * clamp(colour.g) +
    0.0722 * clamp(colour.b)
  );
}

function contrast(foreground: Rgb, background: Rgb): number {
  const composited = over(foreground, background);
  const a = luminance(composited);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/* ------------------------------------------------------------------ tokens */

/** Every `--name: value;` declaration inside one selector block. */
function tokensIn(selector: string): Readonly<Record<string, string>> {
  const start = CSS.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} block in globals.css`);

  let depth = 0;
  let end = start;
  for (let i = CSS.indexOf("{", start); i < CSS.length; i += 1) {
    if (CSS[i] === "{") depth += 1;
    else if (CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = CSS.slice(start, end);
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    const [, name, value] = match;
    if (name === undefined || value === undefined) continue;
    tokens[name] = value.trim();
  }
  return tokens;
}

const THEMES = [
  { name: "light", tokens: tokensIn(":root") },
  { name: "dark", tokens: tokensIn(".dark") },
] as const;

function colour(tokens: Readonly<Record<string, string>>, name: string): Rgb {
  const value = tokens[name];
  if (value === undefined) {
    throw new Error(`globals.css declares no ${name}`);
  }
  return parseOklch(value);
}

function ratio(
  tokens: Readonly<Record<string, string>>,
  foreground: string,
  background: string,
): number {
  return contrast(colour(tokens, foreground), colour(tokens, background));
}

/** Rounded for a failure message a person can act on. */
function stated(value: number): string {
  return `${Math.round(value * 100) / 100}:1`;
}

const INTENTS = ["neutral", "ok", "attention", "critical", "pending"] as const;

/* ------------------------------------------------------------------- rules */

describe("§1.2 Rule 3 — body text clears 4.5:1", () => {
  for (const theme of THEMES) {
    it(`${theme.name}: foreground on background, and on card`, () => {
      for (const surface of ["--background", "--card", "--popover"]) {
        const foreground =
          surface === "--background" ? "--foreground" : `${surface}-foreground`;
        const measured = ratio(theme.tokens, foreground, surface);
        expect(
          measured,
          `${theme.name}: ${foreground} on ${surface} measures ${stated(measured)} against §1.2 Rule 3's 4.5:1 body floor`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${theme.name}: muted-foreground still clears the body floor`, () => {
      // §1.2 Rule 3 permits this token for metadata only — but metadata is still
      // read, so it is held to the body floor rather than to a lower one.
      for (const surface of ["--background", "--card", "--muted"]) {
        const measured = ratio(theme.tokens, "--muted-foreground", surface);
        expect(
          measured,
          `${theme.name}: --muted-foreground on ${surface} measures ${stated(measured)} against the 4.5:1 body floor`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${theme.name}: primary and secondary button text`, () => {
      for (const [foreground, background] of [
        ["--primary-foreground", "--primary"],
        ["--secondary-foreground", "--secondary"],
        ["--accent-foreground", "--accent"],
      ] as const) {
        const measured = ratio(theme.tokens, foreground, background);
        expect(
          measured,
          `${theme.name}: ${foreground} on ${background} measures ${stated(measured)} against the 4.5:1 body floor`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("§1.2 Rule 3 — a status carried by text alone clears 7:1", () => {
  for (const theme of THEMES) {
    it(`${theme.name}: every intent's foreground on its own background`, () => {
      for (const intent of INTENTS) {
        const measured = ratio(
          theme.tokens,
          `--intent-${intent}-foreground`,
          `--intent-${intent}-background`,
        );
        expect(
          measured,
          `${theme.name}: the ${intent} intent measures ${stated(measured)} against §1.2 Rule 3's 7:1 floor for text that is the only carrier of a status`,
        ).toBeGreaterThanOrEqual(7);
      }
    });
  }
});

describe("§1.2 Rule 3 — an interactive border or a focus ring clears 3:1", () => {
  for (const theme of THEMES) {
    it(`${theme.name}: --input, the control boundary`, () => {
      // The token unit 01 found at 1.48:1 light and 1.91:1 dark, on the first
      // unit that installed an Input and a Select. The threshold was not
      // lowered then and is not lowered here.
      for (const surface of ["--background", "--card"]) {
        const measured = ratio(theme.tokens, "--input", surface);
        expect(
          measured,
          `${theme.name}: --input on ${surface} measures ${stated(measured)} against §1.2 Rule 3's 3:1 interactive-border floor`,
        ).toBeGreaterThanOrEqual(3);
      }
    });

    it(`${theme.name}: --ring, on every surface it can land on`, () => {
      for (const surface of ["--background", "--card", "--muted"]) {
        const measured = ratio(theme.tokens, "--ring", surface);
        expect(
          measured,
          `${theme.name}: --ring on ${surface} measures ${stated(measured)} against §1.2 Rule 3's 3:1 floor for a focus ring`,
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

/**
 * **The intent borders are not held to the 3:1 floor, and the reason is a
 * finding rather than a convenience.**
 *
 * §1.2 Rule 3 scopes that floor to *interactive* borders and focus rings. An
 * intent border bounds a `Badge` or an `Alert` — neither is a control — and Rule
 * 4 already requires icon **and** text **and** colour on every status, so the
 * border is reinforcement and never the carrier.
 *
 * Measured against their own surfaces, **none of the five intent borders clears
 * 3:1 in light mode** (neutral 1.35, ok 1.46, attention 1.67, pending 1.70,
 * critical 2.65) and only two do in dark. Those are §1.2 Rule 2's own palette
 * anchors — `slate-300`, `emerald-300`, `amber-400`, `red-400`, `violet-300` —
 * so the floor is unreachable without reinterpreting the intent table, and §1.2
 * is explicitly not this unit's to reinterpret.
 *
 * That makes one sentence in `globals.css` too generous: *"an interactive
 * boundary uses `border-input` **or an intent border**"*. An intent border used
 * as a control boundary would fail Rule 3 on every intent in light mode.
 * **Reported to the owner, not resolved here.**
 *
 * What is asserted instead is the invariant that keeps the exemption true today:
 * a status surface never carries its border alone.
 */
describe("§1.2 Rule 4 — an intent border is never the only signal", () => {
  it("every surface pairs a border with a background and a foreground", () => {
    for (const intent of INTENTS) {
      const surface = INTENT_SURFACE_CLASSES[intent];
      expect(
        surface,
        `the ${intent} surface must set a background, so the border is not the only signal`,
      ).toContain(`bg-intent-${intent}-background`);
      expect(
        surface,
        `the ${intent} surface must set a foreground — Rule 4 requires text`,
      ).toContain(`text-intent-${intent}-foreground`);
      expect(surface).toContain(`border-intent-${intent}-border`);
    }
  });
});

describe("the one exemption, stated rather than assumed", () => {
  it("--border is structural, and globals.css says so where the token is set", () => {
    // The exemption is a decision, and a decision has to be greppable. This
    // asserts the reasoning is written beside the value rather than scattered as
    // ignore comments — if someone deletes the paragraph, this fails.
    expect(CSS).toContain("--border is STRUCTURAL and is exempt");
    expect(CSS).toContain("border-border never bounds a control");
  });

  it("is the only token this file exempts", () => {
    // A second exemption is a review item, not a quiet edit. Every other token
    // named in §1.2 is measured above.
    const exempted = [...CSS.matchAll(/is exempt/g)];
    expect(exempted).toHaveLength(1);
  });
});
