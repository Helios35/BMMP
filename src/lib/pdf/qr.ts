import { create } from "qrcode";

/**
 * A QR symbol as vector path data, for a template to draw with `<Svg>` —
 * `TECHNICAL_SPEC.md` §8.3 (the container label's QR to `/containers/[id]`).
 *
 * Vector rather than an embedded image, so nothing about the symbol depends on
 * an image encoder: the same text always produces the same modules and the
 * same path, which is what a byte-deterministic render needs (§8.1).
 */

/** The four-module light margin a reader needs around the symbol. */
export const QR_QUIET_ZONE_MODULES = 4;

export interface QrSymbol {
  /** Modules per side, quiet zone included — the `viewBox` edge. */
  readonly extent: number;
  /** One rectangle per run of dark modules in a row, in module units. */
  readonly path: string;
}

export function qrSymbol(text: string): QrSymbol {
  const { modules } = create(text, { errorCorrectionLevel: "M" });
  const { size } = modules;
  const runs: string[] = [];
  for (let row = 0; row < size; row += 1) {
    let column = 0;
    while (column < size) {
      if (modules.get(row, column) === 0) {
        column += 1;
        continue;
      }
      const start = column;
      while (column < size && modules.get(row, column) !== 0) column += 1;
      const x = start + QR_QUIET_ZONE_MODULES;
      const y = row + QR_QUIET_ZONE_MODULES;
      runs.push(`M${x} ${y}h${column - start}v1h${start - column}z`);
    }
  }
  return {
    extent: size + QR_QUIET_ZONE_MODULES * 2,
    path: runs.join(""),
  };
}
