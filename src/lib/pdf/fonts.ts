import path from "node:path";

import { Font } from "@react-pdf/renderer";
import { openSync } from "fontkit";

import type { JsonValue } from "@/types/common";

/**
 * The font every generated document is set in — `TECHNICAL_SPEC.md` §8.1.
 *
 * **Embedded from files committed to this repository, never a system font and
 * never fetched at runtime.** Byte-determinism depends on it: a font that
 * arrived from a CDN, or from whatever the host machine had installed, is a
 * different font on a different day, and then the same input no longer makes
 * the same bytes. The two files beside this module are Inter 3.19 Regular and
 * Bold, complete (Latin, Latin Extended, Greek, Cyrillic, Vietnamese), as
 * published in `inter-ui` 3.19.3 (SIL Open Font License 1.1,
 * `./fonts/ofl.txt`). Replacing one changes every document rendered after
 * it, so it is a template-version change, never a quiet swap.
 *
 * **One file per weight, no fallback font.** Two fonts behind one family let
 * react-pdf ask one font for a glyph by the other font's id, and the text
 * layer of a later render then read "Co." as "C'." while the page looked
 * right. With one complete font there is nothing to fall back to.
 *
 * A glyph the font does not carry would print as nothing — a wrong document
 * that looks right. {@link unprintableCharacters} finds them, from the font's
 * own character map, before a render is attempted, so the render refuses
 * instead.
 */

const FONT_DIRECTORY = path.join(process.cwd(), "src", "lib", "pdf", "fonts");

/** The family a template sets. */
export const DOCUMENT_FONT_FAMILY = "Inter";

const FACES = [
  { file: "inter-regular.woff", fontWeight: 400 },
  { file: "inter-bold.woff", fontWeight: 700 },
] as const;

function facePath(file: string): string {
  return path.join(FONT_DIRECTORY, file);
}

/**
 * Register the family **afresh**, for one render. Hyphenation is off — see
 * below.
 *
 * Fresh, because react-pdf keeps a parsed font — and the glyph objects it
 * hands out, each carrying the characters it was first asked for — for the
 * life of the process, so one render's glyph lookups could reach the next
 * render's text layer, and the same payload could make different bytes
 * depending on what was rendered before it. Parsing the files again for every
 * render makes a render depend on its payload and nothing else. Only this
 * family is reset; react-pdf's own standard fonts are left as they are. The
 * caller must not let two renders run at once (`renderPdf` serialises them).
 */
export function registerDocumentFonts(): void {
  const existing = Font.getRegisteredFonts()[DOCUMENT_FONT_FAMILY];
  if (existing === undefined) {
    Font.register({
      family: DOCUMENT_FONT_FAMILY,
      fonts: FACES.map(({ file, fontWeight }) => ({
        src: facePath(file),
        fontWeight,
      })),
    });
  } else {
    // Forget the parsed font, so this render parses the file again and owns
    // every glyph object it lays out.
    for (const source of existing.sources) {
      source.data = null;
      source.loadResultPromise = null;
    }
  }
  // A word broken across a line gains a hyphen the payload never held. On a
  // render id, an identification number or a phone number that is a changed
  // value, not a layout choice.
  Font.registerHyphenationCallback((word) => [word]);
}

/**
 * The code points every face can print — read once from the files
 * themselves, so the check and the font cannot disagree.
 */
let printable: ReadonlySet<number> | null = null;

function printableCodePoints(): ReadonlySet<number> {
  if (printable !== null) return printable;
  const sets = FACES.map(({ file }) => {
    const font = openSync(facePath(file));
    if (!("characterSet" in font)) {
      throw new Error(`${file} is a font collection, not a single face.`);
    }
    return new Set(font.characterSet);
  });
  const [first, ...rest] = sets;
  printable = new Set(
    [...(first ?? [])].filter((codePoint) =>
      rest.every((set) => set.has(codePoint)),
    ),
  );
  return printable;
}

/** Characters that carry no glyph and are never printed: line breaks and tabs. */
function isLayoutControl(codePoint: number): boolean {
  return codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x09;
}

export interface UnprintableCharacter {
  /** Where in the snapshot, as a dotted path. */
  readonly at: string;
  /** The character, and its code point as `U+XXXX`. */
  readonly character: string;
  readonly codePoint: string;
}

/**
 * Every character in a snapshot the embedded font cannot print, in any
 * weight. Empty means the document can be set exactly as its payload reads.
 */
export function unprintableCharacters(
  value: JsonValue,
  at = "",
): readonly UnprintableCharacter[] {
  if (typeof value === "string") {
    const covered = printableCodePoints();
    const found: UnprintableCharacter[] = [];
    for (const character of value) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (!covered.has(codePoint) && !isLayoutControl(codePoint)) {
        found.push({
          at,
          character,
          codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
        });
      }
    }
    return found;
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      unprintableCharacters(entry, `${at}[${index}]`),
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) =>
      unprintableCharacters(entry, at === "" ? key : `${at}.${key}`),
    );
  }
  return [];
}
