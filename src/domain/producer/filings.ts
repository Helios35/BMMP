import { z } from "zod";

import {
  FILING_ITEM_SOURCES,
  type FilingItemSource,
} from "@/domain/taxonomy/filing-item-source";
import type { DocumentType } from "@/domain/taxonomy/document-type";

import {
  ProducerRulePayloadError,
  type ObligationsPayload,
  type PayloadParse,
} from "./payloads";

/**
 * What each state's filing must contain — Rule 8.18; T-71; D-81.
 *
 * A state's filings are a third producer rule, `producer.filings` (T-41
 * `producer_obligation`), one version per state, keyed by the version's
 * `payload_schema_key` (`ERD.md` §4.3). **Every filing belongs to one
 * obligation in the same state's `producer.obligations` rule**, and every
 * item carries its citation (Rule 12.15). The title, where it is sent, the
 * period, each item's label and every statement are **the law's words, from
 * the rule data** — nothing here names a state or an item (Rule 1.23).
 *
 * A payload that does not parse is a loud failure that names the rule: a
 * packet built on a filing rule nobody could read would print a wrong list
 * of items as if it were the law's.
 */

export const FILINGS_RULE_KEY = "producer.filings";
export const FILINGS_SCHEMA_KEY = "producer.filings.v1";

/** The two document types a filing may be — T-38. */
export const FILING_DOCUMENT_TYPES = [
  "filing_packet",
  "annual_report",
] as const satisfies readonly DocumentType[];
export type FilingDocumentType = (typeof FILING_DOCUMENT_TYPES)[number];

/** Whether a document type is a filing — the one test the documents page reads (Rule 8.22). */
export function isFilingDocumentType(
  value: string,
): value is FilingDocumentType {
  return (FILING_DOCUMENT_TYPES as readonly string[]).includes(value);
}

const TEXT = z.string().trim().min(1);

/** Rule 8.21 — the period an annual report covers, as the filing rule names it. */
export type FilingPeriodRule =
  /** A packet that covers no period: a registration, a notice. */
  | { readonly kind: "none" }
  /** The `count` calendar years before the deadline's year. */
  | { readonly kind: "calendar_years_before_due"; readonly count: number }
  /** The law states no period: the person picks the calendar year. */
  | { readonly kind: "chosen_year" };

const period = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({
    kind: z.literal("calendar_years_before_due"),
    count: z.number().int().min(1),
  }),
  z.strictObject({ kind: z.literal("chosen_year") }),
]);

const item = z
  .strictObject({
    source: z.enum(FILING_ITEM_SOURCES),
    /** The law's own words for the item. */
    label: TEXT,
    citation: TEXT,
    /** A `statement`'s text, as the law requires it — and nothing else's. */
    text: TEXT.optional(),
  })
  .refine(
    (entry) => (entry.source === "statement") === (entry.text !== undefined),
    "a statement carries its text, and only a statement does",
  );

export interface FilingItem {
  readonly source: FilingItemSource;
  readonly label: string;
  readonly citation: string;
  readonly text?: string | undefined;
}

const filing = z
  .strictObject({
    obligationKey: TEXT,
    documentType: z.enum(FILING_DOCUMENT_TYPES),
    /** In the law's words. */
    title: TEXT,
    /** Where and how it is sent, in the law's words. */
    sendTo: TEXT,
    period,
    items: z.array(item).min(1),
    citation: TEXT,
    citationUrl: z.url().nullable(),
  })
  // A registration or a notice covers no period; an annual report always
  // does, or the period on the page would be a guess (Rule 8.21).
  .refine(
    (entry) =>
      entry.documentType === "annual_report"
        ? entry.period.kind !== "none"
        : entry.period.kind === "none",
    "an annual report names its period, and a filing packet names none",
  );

export interface FilingDefinition {
  readonly obligationKey: string;
  readonly documentType: FilingDocumentType;
  readonly title: string;
  readonly sendTo: string;
  readonly period: FilingPeriodRule;
  readonly items: readonly FilingItem[];
  readonly citation: string;
  readonly citationUrl: string | null;
}

const filingsPayload = z
  .strictObject({ filings: z.array(filing).min(1) })
  .refine(
    (payload) =>
      new Set(payload.filings.map((entry) => entry.obligationKey)).size ===
      payload.filings.length,
    "two filings name the same obligation",
  );

export interface FilingsPayload {
  readonly filings: readonly FilingDefinition[];
}

function issuesOf(error: z.ZodError): readonly string[] {
  return error.issues.map(
    (issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`,
  );
}

export function parseFilingsPayload(
  value: unknown,
): PayloadParse<FilingsPayload> {
  const parsed = filingsPayload.safeParse(value);
  return parsed.success
    ? { ok: true, payload: parsed.data }
    : { ok: false, issues: issuesOf(parsed.error) };
}

/**
 * A filings version's payload, or a loud failure naming the rule. Thrown, as
 * an unreadable obligations payload is: a packet must not be built from a
 * filing rule the platform could not read (EC-53).
 */
export function filingsOf(version: {
  readonly ruleKey: string;
  readonly versionLabel: string;
  readonly payload: unknown;
  readonly payloadSchemaKey: string;
}): FilingsPayload {
  const parsed =
    version.payloadSchemaKey === FILINGS_SCHEMA_KEY
      ? parseFilingsPayload(version.payload)
      : {
          ok: false as const,
          issues: [
            `schema ${version.payloadSchemaKey} is not ${FILINGS_SCHEMA_KEY}`,
          ],
        };
  if (!parsed.ok) {
    throw new ProducerRulePayloadError(
      version.ruleKey,
      version.versionLabel,
      parsed.issues,
    );
  }
  return parsed.payload;
}

/** The filing for one obligation, or `null` where the rule data has none (a plan, a mark). */
export function filingFor(
  payload: FilingsPayload,
  obligationKey: string,
): FilingDefinition | null {
  return (
    payload.filings.find((entry) => entry.obligationKey === obligationKey) ??
    null
  );
}

/**
 * The filings whose obligation key the same state's obligations rule doesn't
 * name — Rule 8.18: a filing belongs to one obligation. Empty when every
 * filing is anchored; a test holds every version on file to that.
 */
export function unanchoredFilings(
  filings: FilingsPayload,
  obligations: ObligationsPayload,
): readonly string[] {
  const keys = new Set(obligations.obligations.map((entry) => entry.key));
  return filings.filings
    .map((entry) => entry.obligationKey)
    .filter((key) => !keys.has(key));
}
