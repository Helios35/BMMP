import { describe, expect, it } from "vitest";

import {
  absDecimal,
  addDecimal,
  compareDecimal,
  decimalFromNumber,
  divideDecimal,
  energyWhFromVoltageAndCapacity,
  isDecimalString,
  multiplyDecimal,
  normalizeDecimal,
  parseLabelQuantity,
  scaleDecimal,
  subtractDecimal,
  toAmpHours,
  toKilograms,
  toVolts,
  toWattHours,
} from "@/domain/units";

/**
 * Decimal arithmetic on digits — `TECHNICAL_SPEC.md` §3.2, `ERD.md` §2.3.
 *
 * The module exists so that no quantity that reaches a record is ever a double.
 * The proof that matters is the one a double fails: `0.1 + 0.2` is `0.3`, a
 * pound is exactly `0.45359237` kilograms, and anything that is not digits is
 * refused loudly rather than coerced.
 */

describe("isDecimalString", () => {
  it.each([
    "0",
    "12",
    "-3",
    "0.5",
    "-0.045",
    "600.000",
    "12345678901234567890",
  ])("accepts %s", (value) => {
    expect(isDecimalString(value)).toBe(true);
  });

  it.each(["", " 1", "1 ", "1.", ".5", "1e3", "0x10", "1,5", "NaN", "+1"])(
    "rejects %j",
    (value) => {
      expect(isDecimalString(value)).toBe(false);
    },
  );

  it("rejects anything that is not a string", () => {
    expect(isDecimalString(1)).toBe(false);
    expect(isDecimalString(null)).toBe(false);
    expect(isDecimalString(undefined)).toBe(false);
  });
});

describe("compareDecimal", () => {
  it("orders across differing scales exactly", () => {
    expect(compareDecimal("0.9", "0.90")).toBe(0);
    expect(compareDecimal("0.89999", "0.9")).toBe(-1);
    expect(compareDecimal("0.90001", "0.9")).toBe(1);
    expect(compareDecimal("-1", "0")).toBe(-1);
    expect(compareDecimal("10", "9.99")).toBe(1);
  });

  it("throws RangeError on malformed input", () => {
    expect(() => compareDecimal("1e3", "1")).toThrow(RangeError);
    expect(() => compareDecimal("1", "abc")).toThrow(/not a decimal string/);
  });
});

describe("addDecimal", () => {
  it("adds 0.1 and 0.2 to exactly 0.3", () => {
    expect(addDecimal("0.1", "0.2")).toBe("0.3");
  });

  it("carries the larger scale", () => {
    expect(addDecimal("1.5", "2.25")).toBe("3.75");
    expect(addDecimal("100", "0.001")).toBe("100.001");
  });

  it("handles signs", () => {
    expect(addDecimal("-1.5", "0.5")).toBe("-1.0");
    expect(addDecimal("-0.25", "0.25")).toBe("0.00");
  });

  it("throws RangeError on malformed input", () => {
    expect(() => addDecimal("1.", "1")).toThrow(RangeError);
  });
});

describe("subtractDecimal", () => {
  it("subtracts exactly", () => {
    expect(subtractDecimal("0.3", "0.1")).toBe("0.2");
    expect(subtractDecimal("0.82", "0.7")).toBe("0.12");
    expect(subtractDecimal("1", "1.001")).toBe("-0.001");
  });

  it("throws RangeError on malformed input", () => {
    expect(() => subtractDecimal("x", "1")).toThrow(RangeError);
  });
});

describe("multiplyDecimal", () => {
  it("multiplies exactly, summing the scales", () => {
    expect(multiplyDecimal("355.2", "220")).toBe("78144.0");
    expect(multiplyDecimal("0.1", "0.1")).toBe("0.01");
    expect(multiplyDecimal("-2", "1.5")).toBe("-3.0");
  });

  it("throws RangeError on malformed input", () => {
    expect(() => multiplyDecimal("1", "")).toThrow(RangeError);
  });
});

describe("divideDecimal", () => {
  it("truncates to the stated scale, never rounding up", () => {
    expect(divideDecimal("1", "3", 3)).toBe("0.333");
    expect(divideDecimal("2", "3", 3)).toBe("0.666");
    expect(divideDecimal("10", "4", 0)).toBe("2");
  });

  it("throws on division by zero and on a bad scale", () => {
    expect(() => divideDecimal("1", "0", 2)).toThrow(RangeError);
    expect(() => divideDecimal("1", "0.00", 2)).toThrow(/division by zero/);
    expect(() => divideDecimal("1", "2", -1)).toThrow(RangeError);
    expect(() => divideDecimal("1", "2", 1.5)).toThrow(RangeError);
  });

  it("throws RangeError on malformed input", () => {
    expect(() => divideDecimal("1/2", "2", 2)).toThrow(RangeError);
  });
});

describe("scaleDecimal", () => {
  it("pads exactly", () => {
    expect(scaleDecimal("1.5", 3)).toBe("1.500");
    expect(scaleDecimal("7", 2)).toBe("7.00");
  });

  it("rounds half away from zero when narrowing", () => {
    expect(scaleDecimal("1.2345", 3)).toBe("1.235");
    expect(scaleDecimal("1.2344", 3)).toBe("1.234");
    expect(scaleDecimal("-1.2345", 3)).toBe("-1.235");
    expect(scaleDecimal("0.5", 0)).toBe("1");
  });

  it("throws on a bad scale or malformed input", () => {
    expect(() => scaleDecimal("1", -1)).toThrow(RangeError);
    expect(() => scaleDecimal("one", 1)).toThrow(RangeError);
  });
});

describe("absDecimal", () => {
  it("drops the sign and nothing else", () => {
    expect(absDecimal("-0.045")).toBe("0.045");
    expect(absDecimal("0.045")).toBe("0.045");
  });

  it("throws RangeError on malformed input", () => {
    expect(() => absDecimal("--1")).toThrow(RangeError);
  });
});

describe("normalizeDecimal", () => {
  it("strips leading zeros and a negative zero without changing the value", () => {
    expect(normalizeDecimal("007.50")).toBe("7.50");
    expect(normalizeDecimal("-0.0")).toBe("0.0");
    expect(normalizeDecimal("-0")).toBe("0");
  });

  it("throws RangeError on malformed input", () => {
    expect(() => normalizeDecimal("7,5")).toThrow(RangeError);
  });
});

describe("decimalFromNumber", () => {
  it("renders an ordinary number as its digits", () => {
    expect(decimalFromNumber(0.82)).toBe("0.82");
    expect(decimalFromNumber(1)).toBe("1");
    expect(decimalFromNumber(-2.5)).toBe("-2.5");
  });

  it("expands exponent notation instead of passing it through", () => {
    expect(decimalFromNumber(1e-7)).toBe("0.0000001");
    expect(decimalFromNumber(1e21)).toBe("1000000000000000000000");
  });

  it("throws RangeError on anything not finite", () => {
    expect(() => decimalFromNumber(Number.NaN)).toThrow(RangeError);
    expect(() => decimalFromNumber(Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});

describe("parseLabelQuantity", () => {
  it("splits a nameplate figure into digits and its printed unit", () => {
    expect(parseLabelQuantity("355.2 V")).toEqual({
      value: "355.2",
      unit: "V",
    });
    expect(parseLabelQuantity("50Ah")).toEqual({ value: "50", unit: "Ah" });
    expect(parseLabelQuantity("1.2 kWh")).toEqual({
      value: "1.2",
      unit: "kWh",
    });
    expect(parseLabelQuantity("  54 lb ")).toEqual({
      value: "54",
      unit: "lb",
    });
  });

  it("reads a decimal comma as a point", () => {
    expect(parseLabelQuantity("3,7 V")).toEqual({ value: "3.7", unit: "V" });
  });

  it("returns null when there is no number or no unit", () => {
    expect(parseLabelQuantity("355.2")).toBeNull();
    expect(parseLabelQuantity("V")).toBeNull();
    expect(parseLabelQuantity("")).toBeNull();
    expect(parseLabelQuantity("about 50 Ah")).toBeNull();
  });
});

describe("unit conversions", () => {
  it("carries volts, millivolts and kilovolts into volts", () => {
    expect(toVolts({ value: "355.2", unit: "V" })).toBe("355.2");
    expect(toVolts({ value: "3700", unit: "mV" })).toBe("3.700");
    expect(toVolts({ value: "1.5", unit: "kV" })).toBe("1500.0");
  });

  it("carries ampere-hours and milliampere-hours into ampere-hours", () => {
    expect(toAmpHours({ value: "50", unit: "Ah" })).toBe("50");
    expect(toAmpHours({ value: "3000", unit: "mAh" })).toBe("3.000");
  });

  it("carries watt-hours, kilowatt-hours and milliwatt-hours into watt-hours", () => {
    expect(toWattHours({ value: "78100", unit: "Wh" })).toBe("78100");
    expect(toWattHours({ value: "1.2", unit: "kWh" })).toBe("1200.0");
    expect(toWattHours({ value: "500", unit: "mWh" })).toBe("0.500");
  });

  it("carries a pound into kilograms exactly, by the defined factor", () => {
    expect(toKilograms({ value: "1", unit: "lb" })).toBe("0.45359237");
    expect(toKilograms({ value: "54", unit: "lbs" })).toBe("24.49398798");
    expect(toKilograms({ value: "16", unit: "oz" })).toBe("0.453592370000");
    expect(toKilograms({ value: "2500", unit: "g" })).toBe("2.500");
    expect(toKilograms({ value: "12.5", unit: "kg" })).toBe("12.5");
  });

  it("is case-insensitive on the unit and strict on the number", () => {
    expect(toVolts({ value: "12", unit: "v" })).toBe("12");
    expect(toVolts({ value: "12.", unit: "V" })).toBeNull();
  });

  it("returns null for a unit outside the family", () => {
    expect(toVolts({ value: "50", unit: "Ah" })).toBeNull();
    expect(toAmpHours({ value: "50", unit: "V" })).toBeNull();
    expect(toWattHours({ value: "50", unit: "kg" })).toBeNull();
    expect(toKilograms({ value: "50", unit: "Wh" })).toBeNull();
  });
});

describe("energyWhFromVoltageAndCapacity", () => {
  it("derives Wh = V × Ah to three places", () => {
    expect(energyWhFromVoltageAndCapacity("355.2", "220")).toBe("78144.000");
    expect(energyWhFromVoltageAndCapacity("3.7", "2.6")).toBe("9.620");
  });

  it("throws RangeError on malformed input", () => {
    expect(() => energyWhFromVoltageAndCapacity("355.2 V", "220")).toThrow(
      RangeError,
    );
  });
});
