import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `UX_SPEC.md` §1.3's eight type tokens, as `globals.css` defines them.
 *
 * They are `@utility` rules rather than anything Tailwind ships, so
 * `tailwind-merge` has never heard of them — and its fallback for an unknown
 * `text-*` class is **colour**. That put `text-label` and
 * `text-primary-foreground` in the same conflict group, and the later of the two
 * deleted the earlier.
 *
 * The visible result was a primary button with no text colour at all: it
 * inherited `--foreground`, which in dark mode is near-white on a near-white
 * `--primary`. **The label was invisible.** The same collision silently dropped
 * the *size* wherever a token was written before a colour —
 * `text-caption text-muted-foreground` rendered at the inherited size rather
 * than at 13px.
 *
 * Registering the eight as font sizes puts them in the group they belong to, so
 * a token and a colour survive each other and two tokens still resolve
 * last-wins. `tests/unit/design-language.test.ts` asserts every pairing.
 */
const TYPE_TOKENS = [
  "display",
  "h1",
  "h2",
  "body",
  "body-strong",
  "label",
  "caption",
  "mono",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPE_TOKENS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Exported for the test that pins the eight against `globals.css`. */
export const TYPE_TOKEN_NAMES: readonly string[] = TYPE_TOKENS;
