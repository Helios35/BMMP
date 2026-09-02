import { describe, expect, it } from "vitest";

import {
  DATE_CODE_DECODER_VERSION,
  DATE_CODE_FORMAT_KEYS,
  decodeDateCode,
  UNKNOWN_FORMAT_KEY,
} from "@/domain/intake/date-code";

/**
 * The date-code decoder — Rule 2.24, T-56, T-57, EC-11.
 *
 * Two fixture expectations pin the format arithmetic: `2144` under
 * `northvale_yyww` is November 2021, and `0322` under `ridgeline_mmyy` is
 * March 2022. Everything that cannot decode is `undecodable`, never a nearest
 * date.
 */

const TODAY = "2026-09-02";

function undecodable(formatKey: string) {
  return {
    formatKey,
    decodedManufacturedOn: null,
    decodedPrecision: "undecodable",
    decoderVersion: DATE_CODE_DECODER_VERSION,
    confidence: null,
  };
}

describe("decodeDateCode", () => {
  it("states its version, and the list of keys it can act on", () => {
    expect(DATE_CODE_DECODER_VERSION).toBe("1.0.0");
    expect(DATE_CODE_FORMAT_KEYS).toContain("northvale_yyww");
    expect(DATE_CODE_FORMAT_KEYS).toContain("ridgeline_mmyy");
  });

  describe("northvale_yyww", () => {
    it("Rule 2.24 — 2144 is the month of ISO week 44 of 2021 (the fixture row)", () => {
      expect(decodeDateCode("2144", "northvale_yyww", TODAY)).toEqual({
        formatKey: "northvale_yyww",
        decodedManufacturedOn: "2021-11-01",
        decodedPrecision: "month",
        decoderVersion: DATE_CODE_DECODER_VERSION,
        confidence: "1.000",
      });
    });

    it("Rule 2.24 — week 1 of a year whose 1 January is a Tuesday starts in the previous December", () => {
      // ISO week 1 of 2019 begins Monday 2018-12-31; the month holding that
      // Monday is December 2018. Month precision, honestly stated.
      expect(
        decodeDateCode("1901", "northvale_yyww", TODAY).decodedManufacturedOn,
      ).toBe("2018-12-01");
    });

    it("T-56 — week 53 decodes only in a year that has one", () => {
      // 2020 has 53 ISO weeks; 2021 does not.
      expect(
        decodeDateCode("2053", "northvale_yyww", TODAY).decodedManufacturedOn,
      ).toBe("2020-12-01");
      expect(decodeDateCode("2153", "northvale_yyww", TODAY)).toEqual(
        undecodable("northvale_yyww"),
      );
    });

    it("T-56 — week 00, week 54 and non-digits are undecodable", () => {
      expect(decodeDateCode("2100", "northvale_yyww", TODAY)).toEqual(
        undecodable("northvale_yyww"),
      );
      expect(decodeDateCode("2154", "northvale_yyww", TODAY)).toEqual(
        undecodable("northvale_yyww"),
      );
      expect(decodeDateCode("21W4", "northvale_yyww", TODAY)).toEqual(
        undecodable("northvale_yyww"),
      );
      expect(decodeDateCode("214", "northvale_yyww", TODAY)).toEqual(
        undecodable("northvale_yyww"),
      );
    });

    it("trims whitespace around the code and nothing else", () => {
      expect(
        decodeDateCode(" 2144 ", "northvale_yyww", TODAY).decodedManufacturedOn,
      ).toBe("2021-11-01");
      expect(decodeDateCode("21 44", "northvale_yyww", TODAY)).toEqual(
        undecodable("northvale_yyww"),
      );
    });
  });

  describe("ridgeline_mmyy", () => {
    it("Rule 2.24 — 0322 is March 2022 at month precision (the fixture row)", () => {
      expect(decodeDateCode("0322", "ridgeline_mmyy", TODAY)).toEqual({
        formatKey: "ridgeline_mmyy",
        decodedManufacturedOn: "2022-03-01",
        decodedPrecision: "month",
        decoderVersion: DATE_CODE_DECODER_VERSION,
        confidence: "1.000",
      });
    });

    it("T-56 — a thirteenth month and a zero month are undecodable", () => {
      expect(decodeDateCode("1322", "ridgeline_mmyy", TODAY)).toEqual(
        undecodable("ridgeline_mmyy"),
      );
      expect(decodeDateCode("0022", "ridgeline_mmyy", TODAY)).toEqual(
        undecodable("ridgeline_mmyy"),
      );
    });
  });

  describe("iso formats", () => {
    it("Rule 2.24 — iso_yyyymmdd decodes to a day", () => {
      expect(decodeDateCode("20240229", "iso_yyyymmdd", TODAY)).toMatchObject({
        decodedManufacturedOn: "2024-02-29",
        decodedPrecision: "day",
      });
    });

    it("T-56 — a day the calendar does not have is undecodable", () => {
      expect(decodeDateCode("20230229", "iso_yyyymmdd", TODAY)).toEqual(
        undecodable("iso_yyyymmdd"),
      );
      expect(decodeDateCode("20230431", "iso_yyyymmdd", TODAY)).toEqual(
        undecodable("iso_yyyymmdd"),
      );
    });

    it("Rule 2.24 — iso_yyyymm decodes to a month", () => {
      expect(decodeDateCode("202311", "iso_yyyymm", TODAY)).toMatchObject({
        decodedManufacturedOn: "2023-11-01",
        decodedPrecision: "month",
      });
      expect(decodeDateCode("202313", "iso_yyyymm", TODAY)).toEqual(
        undecodable("iso_yyyymm"),
      );
    });

    it("T-56 — year_yyyy decodes to a year, and says so rather than naming a day", () => {
      expect(decodeDateCode("2019", "year_yyyy", TODAY)).toMatchObject({
        decodedManufacturedOn: "2019-01-01",
        decodedPrecision: "year",
      });
      expect(decodeDateCode("19", "year_yyyy", TODAY)).toEqual(
        undecodable("year_yyyy"),
      );
    });
  });

  describe("EC-11 — a future date is a validation failure, not a fact", () => {
    it("refuses a decode after today under every format", () => {
      expect(decodeDateCode("2701", "northvale_yyww", TODAY)).toEqual(
        undecodable("northvale_yyww"),
      );
      expect(decodeDateCode("1026", "ridgeline_mmyy", TODAY)).toEqual(
        undecodable("ridgeline_mmyy"),
      );
      expect(decodeDateCode("20260903", "iso_yyyymmdd", TODAY)).toEqual(
        undecodable("iso_yyyymmdd"),
      );
      expect(decodeDateCode("202610", "iso_yyyymm", TODAY)).toEqual(
        undecodable("iso_yyyymm"),
      );
      expect(decodeDateCode("2027", "year_yyyy", TODAY)).toEqual(
        undecodable("year_yyyy"),
      );
    });

    it("accepts today itself, and the current month and year", () => {
      expect(
        decodeDateCode("20260902", "iso_yyyymmdd", TODAY).decodedManufacturedOn,
      ).toBe("2026-09-02");
      expect(
        decodeDateCode("0926", "ridgeline_mmyy", TODAY).decodedManufacturedOn,
      ).toBe("2026-09-01");
      expect(
        decodeDateCode("2026", "year_yyyy", TODAY).decodedManufacturedOn,
      ).toBe("2026-01-01");
    });

    it("moves with the stated day, never with a clock", () => {
      expect(
        decodeDateCode("2027", "year_yyyy", "2027-01-01").decodedManufacturedOn,
      ).toBe("2027-01-01");
    });
  });

  describe("an unknown or absent format", () => {
    it("Rule 2.24 — K2##7 with no format is undecodable under the unknown key (the fixture row)", () => {
      expect(decodeDateCode("K2##7", null, TODAY)).toEqual(
        undecodable(UNKNOWN_FORMAT_KEY),
      );
    });

    it("Rule 2.24 — a well-formed code with no format is still undecodable: the shape is never guessed", () => {
      expect(decodeDateCode("2144", null, TODAY)).toEqual(
        undecodable(UNKNOWN_FORMAT_KEY),
      );
      expect(decodeDateCode("2144", "someone_elses_format", TODAY)).toEqual(
        undecodable(UNKNOWN_FORMAT_KEY),
      );
    });

    it("Rule 2.24 — malformed characters under a known format are undecodable under that format", () => {
      expect(decodeDateCode("K2##7", "northvale_yyww", TODAY)).toEqual(
        undecodable("northvale_yyww"),
      );
    });
  });
});
