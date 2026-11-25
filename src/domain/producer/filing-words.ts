/**
 * The fixed words of a filing packet — Rules 8.19, 8.20 — so the dialog, the
 * packet and the documents page say them the same way. **No item, label,
 * period, citation or "send to" text from any law is here** (Rule 1.23):
 * those come from the `producer.filings` rule data and are only placed into
 * these sentences.
 */

/** Rule 8.20 — a value the platform should hold and doesn't. Never zero, never blank. */
export const NOT_ON_FILE = "Not on file";

/** Rule 8.20 — an item the platform doesn't keep, printed by name. */
export const NOT_HELD_HERE = "Not held here — add it on the agency's form";

/** Rule 8.19 — every packet says so. */
export const NOT_THE_FILING =
  "A packet is not the filing. It gathers what this platform holds for the filing, with every gap shown; you send it yourself. Nothing has been sent to anyone.";

/** Rule 8.19 — and says where and how to send it, in the law's words. */
export function sendToWords(sendTo: string): string {
  return `Send it to: ${sendTo}`;
}

/** Who can fix a missing sales entry (Rule 8.20). */
export const SALES_FIXER =
  "A Producer Compliance Officer or an Admin can record it on the Sales tab.";

/** Who can fix a missing catalog value (Rule 8.20). */
export const CATALOG_FIXER =
  "An Admin can add the missing value to the catalog entry.";

/** Who can fix a missing organization value (Rule 8.20). */
export const ORGANIZATION_FIXER =
  "A Facility Manager or an Admin can add it in the organization's settings.";

/** Who can fix a missing name on the person making the packet. */
export const CONTACT_FIXER =
  "Add your name to your profile, or ask an Admin to.";

/** Rule 8.20 — a total with any gap in it is never shown as complete. */
export function missingEntriesWords(missing: number): string {
  return missing === 1
    ? "1 entry missing — not complete"
    : `${String(missing)} entries missing — not complete`;
}

/** An empty list the rule data asked for, stated — not a gap, and never blank. */
export const NONE = "None";

/** How a packet's gaps are summed up on the dialog and the packet (Rule 8.19). */
export function gapSummaryWords(input: {
  readonly notOnFile: number;
  readonly notHeld: number;
}): string {
  const parts: string[] = [];
  parts.push(
    input.notOnFile === 0
      ? "Nothing the platform should hold is missing."
      : input.notOnFile === 1
        ? "1 value the platform should hold is not on file."
        : `${String(input.notOnFile)} values the platform should hold are not on file.`,
  );
  if (input.notHeld > 0) {
    parts.push(
      input.notHeld === 1
        ? "1 item is not held here and goes on the agency's form."
        : `${String(input.notHeld)} items are not held here and go on the agency's form.`,
    );
  }
  return parts.join(" ");
}

/** Rule 8.19 — an `undetermined` obligation gets no packet; the page names the missing input. */
export function undeterminedWords(missing: readonly string[]): string {
  return missing.length === 0
    ? "It can't be told yet whether this obligation applies, so no packet can be made."
    : `It can't be told yet whether this obligation applies (${missing.join("; ")}), so no packet can be made.`;
}

export const NOT_APPLICABLE_WORDS =
  "This obligation doesn't apply to any product you sell in this state, so it has no packet.";

export const NO_FILING_WORDS =
  "The rule data names no filing for this obligation, so there is no packet to make.";
