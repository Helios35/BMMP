#!/usr/bin/env node
/**
 * The intake fixture images.
 *
 * Writes the nine synthetic PNGs the fixture label reader
 * (`src/lib/vision/providers/fixture.ts`) keys on, to `public/fixtures/intake/`
 * and, as identical copies, to `tests/e2e/fixtures/intake/` for the specs to
 * upload. No real photograph is ever committed: a photo of a real label is a
 * real customer's data, and a synthetic rectangle carries every fact the
 * pipeline reads (bytes, hash, dimensions, file name).
 *
 * No image library. A PNG is a signature, an IHDR chunk, a zlib-deflated stream
 * of filtered scanlines and an IEND chunk; `node:zlib` does the deflate and the
 * CRC-32 is thirty lines. Each image is 640×480, a solid ground with a
 * contrasting rectangle where the fixture provider's region box lands, and a
 * different ground per file so no two files hash the same — the upload route
 * refuses a duplicate `content_hash`.
 *
 * Run it from the repository root:
 *
 *     pnpm fixtures:images
 *
 * or `node scripts/make-intake-fixture-images.mjs`. It is deterministic: the
 * same run produces byte-identical files, so a re-run is a no-op diff.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const OUTPUT_DIRECTORIES = [
  join(repoRoot, "public", "fixtures", "intake"),
  join(repoRoot, "tests", "e2e", "fixtures", "intake"),
];

const WIDTH = 640;
const HEIGHT = 480;

/**
 * The label rectangle is the fixture provider's reference box scaled to
 * 640×480, so the drawn label and the detected region agree on screen.
 */
const LABEL_BOX = { x: 189, y: 160, width: 254, height: 120 };
const PACK_BOX = { x: 80, y: 90, width: 480, height: 300 };
const DAMAGE_BLOTCH = { x: 330, y: 250, width: 140, height: 90 };

/** @typedef {{ readonly r: number; readonly g: number; readonly b: number }} Rgb */

/**
 * @type {readonly { readonly name: string; readonly ground: Rgb; readonly label: Rgb; readonly box: typeof LABEL_BOX; readonly blotch?: { box: typeof LABEL_BOX; colour: Rgb } }[]}
 */
const IMAGES = [
  {
    name: "label-clean.png",
    ground: rgb(0x2f, 0x3e, 0x4e),
    label: rgb(0xf4, 0xf1, 0xe8),
    box: LABEL_BOX,
  },
  {
    name: "label-low.png",
    ground: rgb(0x3a, 0x3a, 0x3a),
    label: rgb(0xd9, 0xd4, 0xc7),
    box: LABEL_BOX,
  },
  {
    name: "label-nomatch.png",
    ground: rgb(0x1f, 0x4d, 0x3a),
    label: rgb(0xf7, 0xf3, 0xe3),
    box: LABEL_BOX,
  },
  {
    name: "label-unreadable.png",
    ground: rgb(0x4b, 0x40, 0x36),
    label: rgb(0x8c, 0x84, 0x78),
    box: LABEL_BOX,
  },
  {
    name: "label-fail.png",
    ground: rgb(0x55, 0x2a, 0x2a),
    label: rgb(0xf2, 0xe9, 0xe9),
    box: LABEL_BOX,
  },
  {
    name: "label-manualcrop.png",
    ground: rgb(0x2b, 0x2f, 0x55),
    label: rgb(0xec, 0xee, 0xf6),
    box: LABEL_BOX,
  },
  {
    name: "label-scooter.png",
    ground: rgb(0x26, 0x44, 0x5a),
    label: rgb(0xf9, 0xf5, 0xe6),
    box: LABEL_BOX,
  },
  {
    name: "whole-pack.png",
    ground: rgb(0x6b, 0x6f, 0x73),
    label: rgb(0x22, 0x26, 0x2a),
    box: PACK_BOX,
  },
  {
    name: "damage.png",
    ground: rgb(0x6b, 0x6f, 0x73),
    label: rgb(0x22, 0x26, 0x2a),
    box: PACK_BOX,
    blotch: { box: DAMAGE_BLOTCH, colour: rgb(0x0c, 0x0d, 0x0e) },
  },
];

/** @returns {Rgb} */
function rgb(r, g, b) {
  return { r, g, b };
}

// --- CRC-32 (ISO 3309), as PNG chunks require ----------------------------------

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

/** @param {Uint8Array} bytes */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// --- PNG encoding -----------------------------------------------------------------

/** @param {number} value */
function uint32BE(value) {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

/**
 * @param {string} type
 * @param {Uint8Array} data
 */
function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  return concat([uint32BE(data.length), body, uint32BE(crc32(body))]);
}

/** @param {readonly Uint8Array[]} parts */
function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * 8-bit RGB, no interlace, filter type 0 on every scanline.
 * @param {Uint8Array} pixels width*height*3 bytes, row-major
 */
function encodePng(pixels) {
  const signature = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = concat([
    uint32BE(WIDTH),
    uint32BE(HEIGHT),
    new Uint8Array([8, 2, 0, 0, 0]), // bit depth, colour type RGB, compression, filter, interlace
  ]);

  const stride = WIDTH * 3;
  const raw = new Uint8Array((stride + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(
      pixels.subarray(y * stride, (y + 1) * stride),
      y * (stride + 1) + 1,
    );
  }
  const idat = new Uint8Array(deflateSync(raw, { level: 9 }));

  return concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

// --- drawing ----------------------------------------------------------------------

/**
 * @param {Uint8Array} pixels
 * @param {typeof LABEL_BOX} box
 * @param {Rgb} colour
 */
function fillRect(pixels, box, colour) {
  for (let y = box.y; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const at = (y * WIDTH + x) * 3;
      pixels[at] = colour.r;
      pixels[at + 1] = colour.g;
      pixels[at + 2] = colour.b;
    }
  }
}

/** @param {(typeof IMAGES)[number]} image */
function render(image) {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
  fillRect(pixels, { x: 0, y: 0, width: WIDTH, height: HEIGHT }, image.ground);
  fillRect(pixels, image.box, image.label);
  if (image.blotch) fillRect(pixels, image.blotch.box, image.blotch.colour);
  return encodePng(pixels);
}

async function main() {
  for (const directory of OUTPUT_DIRECTORIES) {
    await mkdir(directory, { recursive: true });
  }
  for (const image of IMAGES) {
    const bytes = render(image);
    for (const directory of OUTPUT_DIRECTORIES) {
      await writeFile(join(directory, image.name), bytes);
    }
    console.log(`${image.name}\t${bytes.length} bytes`);
  }
}

await main();
