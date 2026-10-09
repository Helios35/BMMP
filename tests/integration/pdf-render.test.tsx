import { describe, expect, it } from "vitest";
import { Document, Page, Text, View } from "@react-pdf/renderer";

import { DOCUMENT_FONT_FAMILY, unprintableCharacters } from "@/lib/pdf/fonts";
import { qrSymbol, QR_QUIET_ZONE_MODULES } from "@/lib/pdf/qr";
import { renderPdf } from "@/lib/pdf/render";

import { pdfText } from "./document-support";

/**
 * The renderer itself — `TECHNICAL_SPEC.md` §8.1. **A render depends on its
 * input and on nothing else**: not on the clock, not on the machine's fonts,
 * and not on which documents this process rendered before it.
 *
 * The last one is not hypothetical. react-pdf keeps parsed fonts for the life
 * of the process, and with them glyph objects carrying the characters they
 * were first looked up with; a later render's text layer then read "Co." as
 * "C'." and "ion" as "i\u0013n" while its page looked right — and the same
 * payload made different bytes depending on its history. These documents mix
 * weights, case transforms and accented letters, which is what surfaced it.
 */

const WORDS = [
  "UN3480",
  "Lithium",
  "ion",
  "batteries,",
  "9",
  "TRANSPORT",
  "MODE",
  "+1-800-555-0142",
  "Co.",
  "Kettle",
  "Falls",
  "Freight",
  "QUANTITY",
  "Yakima",
  "Haul",
  "Fairfax",
  "&",
  "24/7",
  "Łódź",
  "Ærø",
  "—",
  "SH-0003",
  "480.000",
  "kg",
];

/** Six lines of seeded words, alternating weight, every third upper-cased. */
function varied(seed: number) {
  const lines: string[] = [];
  let state = seed;
  for (let line = 0; line < 6; line += 1) {
    const words: string[] = [];
    for (let word = 0; word < 6; word += 1) {
      state = (state * 1103515245 + 12345) % 2147483648;
      words.push(WORDS[state % WORDS.length] ?? "");
    }
    lines.push(words.join(" "));
  }
  const element = (
    <Document creationDate={new Date("2026-10-09T17:00:00.000Z")}>
      <Page
        size="LETTER"
        style={{ fontFamily: DOCUMENT_FONT_FAMILY, padding: 40 }}
      >
        {lines.map((text, index) => (
          <View key={index}>
            <Text
              style={{
                fontWeight: index % 2 === 0 ? 400 : 700,
                textTransform: index % 3 === 0 ? "uppercase" : "none",
              }}
            >
              {text}
            </Text>
          </View>
        ))}
      </Page>
    </Document>
  );
  const printed = lines.map((text, index) =>
    index % 3 === 0 ? text.toUpperCase() : text,
  );
  return { element, printed };
}

describe("renderPdf", () => {
  it("writes a text layer that reads what the page prints, whatever was rendered before", async () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const { element, printed } = varied(seed);
      const { bytes, pageCount } = await renderPdf(element);
      expect(pageCount).toBe(1);
      const text = await pdfText(bytes);
      for (const line of printed) expect(text).toContain(line);
    }
  }, 60_000);

  it("makes the same bytes for the same element after other renders", async () => {
    const first = await renderPdf(varied(3).element);
    await renderPdf(varied(5).element);
    await renderPdf(varied(2).element);
    const again = await renderPdf(varied(3).element);
    expect(Buffer.from(again.bytes).equals(Buffer.from(first.bytes))).toBe(
      true,
    );
  }, 60_000);

  it("takes its creation date from the element, never the clock", async () => {
    const { bytes } = await renderPdf(varied(1).element);
    const raw = Buffer.from(bytes).toString("latin1");
    // The info dictionary refers to it; the date is the element's, to the second.
    expect(raw).toContain("(D:20261009170000Z)");
  });
});

describe("unprintableCharacters", () => {
  it("passes what the embedded font carries — Latin, accented, Greek, Cyrillic", () => {
    expect(
      unprintableCharacters({
        a: "Łódź Ærø — Ψ Ж ≤ “quoted”",
        b: ["UN3480", "+1-800-555-0142"],
      }),
    ).toEqual([]);
  });

  it("names every character it cannot print, and where", () => {
    expect(unprintableCharacters({ carrier: { name: "运 Hauling" } })).toEqual([
      { at: "carrier.name", character: "运", codePoint: "U+8FD0" },
    ]);
  });
});

describe("qrSymbol", () => {
  it("is the same path for the same text, with the quiet zone around it", () => {
    const url =
      "https://bmmp.test/containers/0a000009-0000-4000-8000-000000000001";
    const a = qrSymbol(url);
    const b = qrSymbol(url);
    expect(a).toEqual(b);
    expect(
      a.path.startsWith(`M${QR_QUIET_ZONE_MODULES} ${QR_QUIET_ZONE_MODULES}`),
    ).toBe(true);
    expect(qrSymbol(`${url}x`).path).not.toBe(a.path);
  });
});
