import { ASSESSED_CONDITIONS } from "@/domain/taxonomy/assessed-condition";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import {
  parseLabelQuantity,
  toAmpHours,
  toVolts,
  toWattHours,
} from "@/domain/units";

/**
 * Shape validation of one extracted field — Rule 2.12, EC-7, EC-11.
 *
 * A vision model returns characters. Before a character string is allowed to
 * stand as a nameplate figure, a model number or a date code, it has to be the
 * *shape* of one: a voltage has a number and a voltage unit, a date code has no
 * lowercase and no spaces, a condition is a T-49 value. **A value that fails
 * validation is returned as unread with the raw text retained** — the reviewer
 * sees what the model reported and decides; nothing here corrects, rounds,
 * completes or guesses (Rule 2.11).
 *
 * These are shapes, not thresholds. A length cap keeps a runaway read from
 * becoming a 4 KB "model number" and is not a regulatory figure; nothing in
 * this file reads a jurisdiction rule and nothing here is a unit a rule
 * supplies (Rule 1.23).
 *
 * `chemistry_code` is validated as characters printed on a label and nothing
 * more. It is not a chemistry, and it is not compared to one here
 * (Rules 2.9, 2.10).
 */

export type FieldValidationResult =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly reason: string; readonly rawText: string };

/**
 * The three states of the transport-test marking control on the extraction
 * review card (`UX_SPEC.md` §2.1.3). **These are the UI's tri-state, not a
 * taxonomy system** — the record stores `is_transport_tested` as a nullable
 * boolean, and `could_not_tell` is what maps to its null. They live here so the
 * validator and the card agree on the strings without either inventing them.
 */
export const TRANSPORT_TEST_MARKING_VALUES = [
  "present",
  "not_present",
  "could_not_tell",
] as const;

export type TransportTestMarkingValue =
  (typeof TRANSPORT_TEST_MARKING_VALUES)[number];

/** Free-text caps. Shape limits on a read, not figures a rule supplies. */
const MAX_NAME_LENGTH = 120;
const MAX_SERIAL_NUMBER_LENGTH = 64;
const MAX_CHEMISTRY_CODE_LENGTH = 32;
const MIN_DATE_CODE_LENGTH = 2;
const MAX_DATE_CODE_LENGTH = 12;

/** Uppercase letters, digits, hyphen and slash only — no lowercase, no spaces. */
const DATE_CODE_PATTERN = /^[A-Z0-9\-/]+$/;

/** Printable characters: nothing below a space and no DEL. */
const PRINTABLE_PATTERN = /^[^\x00-\x1f\x7f]+$/;

function ok(value: string | null): FieldValidationResult {
  return { ok: true, value };
}

function failed(reason: string, rawText: string): FieldValidationResult {
  return { ok: false, reason, rawText };
}

function validateQuantity(
  text: string,
  convert: (quantity: { value: string; unit: string }) => string | null,
  family: string,
): FieldValidationResult {
  const quantity = parseLabelQuantity(text);
  if (quantity === null) {
    return failed(`not a number followed by a unit`, text);
  }
  if (convert(quantity) === null) {
    return failed(`"${quantity.unit}" is not a ${family} unit`, text);
  }
  return ok(text);
}

function validateText(
  text: string,
  maxLength: number,
  what: string,
): FieldValidationResult {
  if (text.length === 0) return failed(`${what} is empty`, text);
  if (text.length > maxLength) {
    return failed(`${what} is longer than ${maxLength} characters`, text);
  }
  if (!PRINTABLE_PATTERN.test(text)) {
    return failed(`${what} contains non-printable characters`, text);
  }
  return ok(text);
}

/**
 * Validate the shape of one T-09 field as the model returned it.
 *
 * `null` is a legitimate answer — the field was not read — and passes through
 * as `{ ok: true, value: null }`. Surrounding whitespace is the one thing this
 * function removes, because a trailing space is an artefact of the read and not
 * a character on the label; **the value returned is otherwise verbatim**
 * (Rule 2.11). Every failure carries the raw text so the reviewer sees exactly
 * what was read.
 */
export function validateExtractedField(
  fieldCode: LabelFieldCode,
  value: string | null,
): FieldValidationResult {
  if (value === null) return ok(null);
  const text = value.trim();

  switch (fieldCode) {
    case "voltage":
      return validateQuantity(text, toVolts, "voltage");
    case "capacity_ah":
      return validateQuantity(text, toAmpHours, "capacity");
    case "energy_wh":
      return validateQuantity(text, toWattHours, "energy");

    case "date_code":
      if (
        text.length < MIN_DATE_CODE_LENGTH ||
        text.length > MAX_DATE_CODE_LENGTH
      ) {
        return failed(
          `date code must be ${MIN_DATE_CODE_LENGTH}–${MAX_DATE_CODE_LENGTH} characters`,
          text,
        );
      }
      if (!DATE_CODE_PATTERN.test(text)) {
        return failed(
          "date code may contain only uppercase letters, digits, hyphen and slash",
          text,
        );
      }
      return ok(text);

    case "serial_number":
      return validateText(text, MAX_SERIAL_NUMBER_LENGTH, "serial number");
    case "manufacturer":
      return validateText(text, MAX_NAME_LENGTH, "manufacturer");
    case "model":
      return validateText(text, MAX_NAME_LENGTH, "model");
    case "chemistry_code":
      return validateText(text, MAX_CHEMISTRY_CODE_LENGTH, "chemistry code");

    case "transport_test_marking":
      return (TRANSPORT_TEST_MARKING_VALUES as readonly string[]).includes(text)
        ? ok(text)
        : failed(
            "transport test marking must be present, not_present or could_not_tell",
            text,
          );

    case "certification_marks": {
      const tokens = text.split(",").map((token) => token.trim());
      if (tokens.some((token) => token.length === 0)) {
        return failed(
          "certification marks must be comma-separated, none empty",
          text,
        );
      }
      if (!PRINTABLE_PATTERN.test(text)) {
        return failed(
          "certification marks contain non-printable characters",
          text,
        );
      }
      return ok(tokens.join(", "));
    }

    case "assessed_condition":
      // A model may propose a condition; only a person sets one (Rule 6.2).
      // What it proposes still has to be a T-49 value or it is nothing.
      return (ASSESSED_CONDITIONS as readonly string[]).includes(text)
        ? ok(text)
        : failed("assessed condition is not a recognised value", text);
  }
}
