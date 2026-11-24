import type { JsonObject, JsonValue } from "@/types/common";

import type {
  FilingLine,
  FilingPacketContent,
  FilingPacketItem,
} from "./build-filing-packet-payload";

/**
 * A filing packet read back from its render's stored input —
 * `TECHNICAL_SPEC.md` §8.2, §8.5; Rule 8.19.
 *
 * `/documents/[id]` shows what the packet says from **the snapshot it was
 * issued with**, never from today's rule data or sales. A snapshot that does
 * not read as a packet is `null`, and the page falls back to the render's
 * own record — it never invents a line.
 */

export type StoredFilingPacket = Pick<
  FilingPacketContent,
  | "title"
  | "notTheFiling"
  | "sendToWords"
  | "period"
  | "gaps"
  | "items"
  | "state"
  | "obligation"
  | "deadline"
>;

function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function object(value: JsonValue | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function lineOf(value: JsonValue): FilingLine | null {
  const line = object(value);
  if (line === null) return null;
  switch (line.kind) {
    case "value":
    case "not_held": {
      const words = text(line.text);
      return words === null ? null : { kind: line.kind, text: words };
    }
    case "gap": {
      const what = text(line.what);
      const fixer = text(line.fixer);
      return what === null || fixer === null
        ? null
        : { kind: "gap", what, fixer };
    }
    case "total": {
      const words = text(line.text);
      return words === null || typeof line.missing !== "number"
        ? null
        : { kind: "total", text: words, missing: line.missing };
    }
    default:
      return null;
  }
}

function itemOf(value: JsonValue): FilingPacketItem | null {
  const item = object(value);
  if (item === null || !Array.isArray(item.lines)) return null;
  const source = text(item.source);
  const sourceLabel = text(item.sourceLabel);
  const label = text(item.label);
  const citation = text(item.citation);
  const lines = item.lines.map(lineOf);
  if (
    source === null ||
    sourceLabel === null ||
    label === null ||
    citation === null ||
    lines.some((line) => line === null)
  ) {
    return null;
  }
  return {
    source: source as FilingPacketItem["source"],
    sourceLabel,
    label,
    citation,
    lines: lines as FilingLine[],
    gaps: typeof item.gaps === "number" ? item.gaps : 0,
  };
}

export function readStoredFilingPacket(
  snapshot: JsonObject,
): StoredFilingPacket | null {
  const title = text(snapshot.title);
  const notTheFiling = text(snapshot.notTheFiling);
  const sendToWords = text(snapshot.sendToWords);
  const period = object(snapshot.period);
  const gaps = object(snapshot.gaps);
  const state = object(snapshot.state);
  const obligation = object(snapshot.obligation);
  const deadline = object(snapshot.deadline);
  if (
    title === null ||
    notTheFiling === null ||
    sendToWords === null ||
    period === null ||
    gaps === null ||
    state === null ||
    obligation === null ||
    deadline === null ||
    !Array.isArray(snapshot.items)
  ) {
    return null;
  }
  const items = snapshot.items.map(itemOf);
  if (items.some((item) => item === null)) return null;
  const years = Array.isArray(period.years)
    ? period.years.filter((year): year is number => typeof year === "number")
    : [];
  return {
    title,
    notTheFiling,
    sendToWords,
    period: {
      kind: (text(period.kind) ??
        "none") as StoredFilingPacket["period"]["kind"],
      years,
      words: text(period.words) ?? "",
      chosenByUserId: text(period.chosenByUserId),
      chosenByName: text(period.chosenByName),
    },
    gaps: {
      notOnFile: typeof gaps.notOnFile === "number" ? gaps.notOnFile : 0,
      notHeld: typeof gaps.notHeld === "number" ? gaps.notHeld : 0,
      words: text(gaps.words) ?? "",
    },
    items: items as FilingPacketItem[],
    state: {
      jurisdictionId: text(state.jurisdictionId) ?? "",
      code: text(state.code) ?? "",
      name: text(state.name) ?? "",
    },
    obligation: {
      id: text(obligation.id) ?? "",
      key: text(obligation.key) ?? "",
      duty: text(obligation.duty) ?? "",
      citation: text(obligation.citation) ?? "",
      status: (text(obligation.status) ??
        "applies") as StoredFilingPacket["obligation"]["status"],
    },
    deadline: {
      id: text(deadline.id) ?? "",
      dueOn: text(deadline.dueOn) ?? "",
      dueOnText: text(deadline.dueOnText) ?? "",
    },
  };
}
