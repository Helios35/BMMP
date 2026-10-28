/**
 * CSV, the way every export in this product writes it — `UX_SPEC.md` §3.20;
 * Rules 12.17–12.19.
 *
 * Pure — strings in, a string out. The scoping, the tenancy and the audit
 * write live in the route handler, where the request is.
 */

/**
 * RFC 4180 quoting.
 *
 * **Values are never rewritten.** A spreadsheet may read a leading `=` as a
 * formula, and the usual mitigation is to prefix the cell — which changes what
 * the record said. An export that alters a stored value to suit a reader's
 * spreadsheet is a falsified record, so the bytes stay as stored and the
 * quoting is the only transformation.
 */
export function csvCell(value: string): string {
  if (!/[",\r\n]/u.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

/** U+FEFF, so a spreadsheet reads the file as UTF-8. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

export function csvLine(cells: readonly string[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * The whole file.
 *
 * CRLF line endings and a UTF-8 byte-order mark, because the reader of the
 * file is a person opening it in a spreadsheet, and a name with an accent in
 * it rendering as mojibake is a defect in a record.
 */
export function csvFile(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [csvLine(headers), ...rows.map((row) => csvLine(row))];
  return `${BYTE_ORDER_MARK}${lines.join("\r\n")}\r\n`;
}
