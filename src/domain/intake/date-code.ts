import type { DateCodePrecision } from "@/domain/taxonomy/date-code-precision";
import type { IsoDate } from "@/types/common";

/**
 * A printed date code to a manufacture date — Rule 2.24, T-56, T-57, EC-11.
 *
 * **Rules, versioned. No machine learning, no approximation.** A code either
 * decodes under the format its catalog entry names, or it does not, and when it
 * does not the answer is `undecodable` with the raw code retained — never a
 * fuzzy date, never a nearest year (T-56). The precision travels with the
 * value: a month-precision decode is the first day of the month *and* says so,
 * and rendering it as a day is a defect downstream, not here.
 *
 * The format key is **catalog data** (`catalog_entry.date_code_format_key`),
 * chosen by the matched entry and passed in. This module never guesses a format
 * from the code's shape: two manufacturers print four digits and mean different
 * things by them, and a decoder that picked one would be an approximation
 * dressed as a fact. Absent or unrecognised key → `formatKey: "unknown"`.
 *
 * `today` is an argument: a decode that lands after today is a validation
 * failure and not a fact (EC-11), and the boundary day is the case a test has
 * to pin, so the day is stated by the caller and never read from a clock.
 *
 * `DATE_CODE_DECODER_VERSION` is bumped when any decoder below changes; old
 * `date_code_decode` rows keep their old answer, which is why the version is
 * on the row.
 *
 * Calendar arithmetic is integer maths over proleptic Gregorian days
 * (`daysFromCivil` / `civilFromDays`, the standard algorithms). No `Date`, no
 * zone, no locale: a manufacture date is a calendar day, not an instant.
 */

export const DATE_CODE_DECODER_VERSION = "1.0.0";

/** What a decoder writes when the format is not one it knows. */
export const UNKNOWN_FORMAT_KEY = "unknown";

export interface DateCodeDecodeResult {
  readonly formatKey: string;
  readonly decodedManufacturedOn: IsoDate | null;
  readonly decodedPrecision: DateCodePrecision | null;
  readonly decoderVersion: string;
  /**
   * A deterministic decoder is certain of its arithmetic once the format is
   * given; the uncertainty lives in the catalog's choice of format, not here.
   * `"1.000"` on a decode, `null` when nothing decoded — as the fixture rows
   * carry it. It says nothing about anything but the arithmetic.
   */
  readonly confidence: string | null;
}

/**
 * The format keys this decoder version understands. Adding one is a decoder
 * change and bumps the version; the catalog names the key, this list says
 * whether the platform can act on it yet.
 */
export const DATE_CODE_FORMAT_KEYS = [
  "northvale_yyww",
  "ridgeline_mmyy",
  "iso_yyyymmdd",
  "iso_yyyymm",
  "year_yyyy",
] as const;

export type DateCodeFormatKey = (typeof DATE_CODE_FORMAT_KEYS)[number];

/**
 * Two-digit years are read into this century. A code printed `44` is 2044 or
 * 1944 to the arithmetic; the future check (EC-11) settles the former and no
 * battery this product handles predates the latter.
 */
const TWO_DIGIT_YEAR_BASE = 2000;

/* --------------------------------------------------------- calendar maths */

interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Days since 1970-01-01 for a proleptic Gregorian date. */
function daysFromCivil({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** The inverse of {@link daysFromCivil}. */
function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/** 0 = Monday … 6 = Sunday. 1970-01-01 was a Thursday. */
function isoWeekday(days: number): number {
  return (((days + 3) % 7) + 7) % 7;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidCivilDate({ year, month, day }: CivilDate): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function toIsoDate({ year, month, day }: CivilDate): IsoDate {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * The Monday of ISO week `week` in ISO year `year`, or `null` when that year has
 * no such week. ISO week 1 is the week containing 4 January; a year has 53
 * weeks only when 28 December falls inside week 53.
 */
function mondayOfIsoWeek(year: number, week: number): CivilDate | null {
  if (!Number.isInteger(week) || week < 1 || week > 53) return null;
  const january4 = daysFromCivil({ year, month: 1, day: 4 });
  const week1Monday = january4 - isoWeekday(january4);
  const monday = week1Monday + (week - 1) * 7;
  const december28 = daysFromCivil({ year, month: 12, day: 28 });
  if (monday > december28) return null;
  return civilFromDays(monday);
}

/* ---------------------------------------------------------------- decoders */

interface Decoded {
  readonly date: CivilDate;
  readonly precision: Exclude<DateCodePrecision, "undecodable">;
}

type Decoder = (code: string) => Decoded | null;

/** YYWW — year and ISO week. Resolves to the month holding that week's Monday. */
const decodeNorthvaleYyww: Decoder = (code) => {
  const match = /^(\d{2})(\d{2})$/.exec(code);
  if (match === null) return null;
  const year = TWO_DIGIT_YEAR_BASE + Number(match[1]);
  const monday = mondayOfIsoWeek(year, Number(match[2]));
  if (monday === null) return null;
  return {
    date: { year: monday.year, month: monday.month, day: 1 },
    precision: "month",
  };
};

/** MMYY — month and two-digit year. */
const decodeRidgelineMmyy: Decoder = (code) => {
  const match = /^(\d{2})(\d{2})$/.exec(code);
  if (match === null) return null;
  const date = {
    year: TWO_DIGIT_YEAR_BASE + Number(match[2]),
    month: Number(match[1]),
    day: 1,
  };
  return isValidCivilDate(date) ? { date, precision: "month" } : null;
};

const decodeIsoYyyymmdd: Decoder = (code) => {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(code);
  if (match === null) return null;
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  return isValidCivilDate(date) ? { date, precision: "day" } : null;
};

const decodeIsoYyyymm: Decoder = (code) => {
  const match = /^(\d{4})(\d{2})$/.exec(code);
  if (match === null) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: 1 };
  return isValidCivilDate(date) ? { date, precision: "month" } : null;
};

const decodeYearYyyy: Decoder = (code) => {
  const match = /^(\d{4})$/.exec(code);
  if (match === null) return null;
  return {
    date: { year: Number(match[1]), month: 1, day: 1 },
    precision: "year",
  };
};

const DECODERS: Readonly<Record<DateCodeFormatKey, Decoder>> = {
  northvale_yyww: decodeNorthvaleYyww,
  ridgeline_mmyy: decodeRidgelineMmyy,
  iso_yyyymmdd: decodeIsoYyyymmdd,
  iso_yyyymm: decodeIsoYyyymm,
  year_yyyy: decodeYearYyyy,
};

function isKnownFormatKey(key: string): key is DateCodeFormatKey {
  return (DATE_CODE_FORMAT_KEYS as readonly string[]).includes(key);
}

function undecodable(formatKey: string): DateCodeDecodeResult {
  return {
    formatKey,
    decodedManufacturedOn: null,
    decodedPrecision: "undecodable",
    decoderVersion: DATE_CODE_DECODER_VERSION,
    confidence: null,
  };
}

/**
 * Decode `rawCode` under `formatKey`, as of `today`.
 *
 * Whitespace around the code is trimmed — it is a read artefact, not a
 * character — and nothing else is altered: a code with a stray character
 * (`K2##7`) does not decode, and neither does a week a year does not have, a
 * thirteenth month, or any date after `today` (EC-11). **A result is either a
 * date with its precision or `undecodable`; there is no third kind.**
 */
export function decodeDateCode(
  rawCode: string,
  formatKey: string | null,
  today: IsoDate,
): DateCodeDecodeResult {
  if (formatKey === null || !isKnownFormatKey(formatKey)) {
    return undecodable(UNKNOWN_FORMAT_KEY);
  }
  const decoded = DECODERS[formatKey](rawCode.trim());
  if (decoded === null) return undecodable(formatKey);

  const decodedManufacturedOn = toIsoDate(decoded.date);
  // ISO dates compare lexicographically. A date after today is not a fact.
  if (decodedManufacturedOn > today) return undecodable(formatKey);

  return {
    formatKey,
    decodedManufacturedOn,
    decodedPrecision: decoded.precision,
    decoderVersion: DATE_CODE_DECODER_VERSION,
    confidence: "1.000",
  };
}
