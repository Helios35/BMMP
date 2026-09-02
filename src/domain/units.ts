import type { Decimal } from "@/types/common";

/**
 * Decimal arithmetic and unit conversion — **the one module** where either
 * happens (`TECHNICAL_SPEC.md` §3.2).
 *
 * `Decimal` is a string of digits. `ERD.md` §2.3 bans `float` and
 * `double precision` for every quantity a rule reads or a document prints, and a
 * JavaScript `number` is a double — so `"0.1" + "0.2"` through `parseFloat`
 * would put back into the application exactly the hazard the schema keeps out
 * of the database, and the first place it would surface is a mass total on a
 * shipping paper. Every function here works on scaled `BigInt` integers and
 * returns digits. **Arithmetic on a quantity anywhere else in `src/` is a
 * review rejection.**
 *
 * SI units only, one unit per concept: mass in kg, energy in Wh, volume in m³
 * (§3.2). A label prints what it prints — `355.2V`, `50Ah`, `1.2 kWh`, `54 lb`
 * — and the conversions below carry those into the record's unit exactly, with
 * the conversion factor stated once. **No jurisdiction threshold lives here**:
 * a rule payload declares its own unit and the caller converts a *value*, never
 * a limit written into this file.
 *
 * Pure: no `Intl`, no locale, no environment, no rounding mode a caller did not
 * ask for.
 */

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export function isDecimalString(value: unknown): value is Decimal {
  return typeof value === "string" && DECIMAL_PATTERN.test(value);
}

function assertDecimal(value: string, name: string): void {
  if (!isDecimalString(value)) {
    throw new RangeError(
      `${name} is not a decimal string: ${JSON.stringify(value)}. A quantity travels as its digits (ERD.md §2.3).`,
    );
  }
}

interface Scaled {
  readonly integer: bigint;
  readonly scale: number;
}

/** The digits after the point, as the integer they scale. `"12.340"` → 12340 × 10⁻³. */
function toScaled(value: string): Scaled {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = digits.split(".");
  const integer =
    BigInt(`${whole}${fraction}`) * (negative ? BigInt(-1) : BigInt(1));
  return { integer, scale: fraction.length };
}

function raiseScale(scaled: Scaled, scale: number): bigint {
  return scaled.integer * BigInt(10) ** BigInt(scale - scaled.scale);
}

function fromScaled(integer: bigint, scale: number): string {
  const negative = integer < BigInt(0);
  const magnitude = (negative ? -integer : integer).toString();
  if (scale === 0) return `${negative ? "-" : ""}${magnitude}`;
  const padded = magnitude.padStart(scale + 1, "0");
  const whole = padded.slice(0, padded.length - scale);
  const fraction = padded.slice(padded.length - scale);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** `-1`, `0` or `1`. Exact, at any scale. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  assertDecimal(a, "a");
  assertDecimal(b, "b");
  const left = toScaled(a);
  const right = toScaled(b);
  const scale = Math.max(left.scale, right.scale);
  const l = raiseScale(left, scale);
  const r = raiseScale(right, scale);
  if (l < r) return -1;
  if (l > r) return 1;
  return 0;
}

/** Exact. The result carries the larger of the two scales. */
export function addDecimal(a: string, b: string): string {
  assertDecimal(a, "a");
  assertDecimal(b, "b");
  const left = toScaled(a);
  const right = toScaled(b);
  const scale = Math.max(left.scale, right.scale);
  return fromScaled(raiseScale(left, scale) + raiseScale(right, scale), scale);
}

/** Exact. `a − b`, at the larger of the two scales. */
export function subtractDecimal(a: string, b: string): string {
  assertDecimal(a, "a");
  assertDecimal(b, "b");
  const left = toScaled(a);
  const right = toScaled(b);
  const scale = Math.max(left.scale, right.scale);
  return fromScaled(raiseScale(left, scale) - raiseScale(right, scale), scale);
}

/** Exact. The result carries the sum of the two scales, as long multiplication does. */
export function multiplyDecimal(a: string, b: string): string {
  assertDecimal(a, "a");
  assertDecimal(b, "b");
  const left = toScaled(a);
  const right = toScaled(b);
  return fromScaled(left.integer * right.integer, left.scale + right.scale);
}

/**
 * `a ÷ b` to a stated scale, **truncated** — never rounded up, so a derived
 * quantity never exceeds what the inputs support. Division by zero throws.
 */
export function divideDecimal(a: string, b: string, scale: number): string {
  assertDecimal(a, "a");
  assertDecimal(b, "b");
  if (!Number.isInteger(scale) || scale < 0) {
    throw new RangeError(`scale must be a non-negative integer, got ${scale}`);
  }
  const left = toScaled(a);
  const right = toScaled(b);
  if (right.integer === BigInt(0)) throw new RangeError("division by zero");
  // Bring both to a common scale, then shift the numerator up by the requested
  // scale so integer division yields the digits after the point.
  const common = Math.max(left.scale, right.scale);
  const numerator = raiseScale(left, common) * BigInt(10) ** BigInt(scale);
  const denominator = raiseScale(right, common);
  return fromScaled(numerator / denominator, scale);
}

/**
 * Re-express a decimal at a fixed scale. Padding is exact; narrowing rounds
 * half away from zero, which is what a nameplate figure written to three places
 * expects (`numeric(10,3)`).
 */
export function scaleDecimal(value: string, scale: number): string {
  assertDecimal(value, "value");
  if (!Number.isInteger(scale) || scale < 0) {
    throw new RangeError(`scale must be a non-negative integer, got ${scale}`);
  }
  const scaled = toScaled(value);
  if (scaled.scale <= scale)
    return fromScaled(raiseScale(scaled, scale), scale);
  const drop = BigInt(10) ** BigInt(scaled.scale - scale);
  const negative = scaled.integer < BigInt(0);
  const magnitude = negative ? -scaled.integer : scaled.integer;
  const quotient = magnitude / drop;
  const remainder = magnitude % drop;
  const rounded =
    remainder * BigInt(2) >= drop ? quotient + BigInt(1) : quotient;
  return fromScaled(negative ? -rounded : rounded, scale);
}

export function absDecimal(value: string): string {
  assertDecimal(value, "value");
  return value.startsWith("-") ? value.slice(1) : value;
}

/** Strip a sign of `-0` and leading zeros a caller may have produced; never changes the value. */
export function normalizeDecimal(value: string): string {
  assertDecimal(value, "value");
  const scaled = toScaled(value);
  return fromScaled(scaled.integer, scaled.scale);
}

/* ------------------------------------------------------------ quantities */

/** A figure as printed, with the unit it was printed in. */
export interface Quantity {
  readonly value: Decimal;
  readonly unit: string;
}

/**
 * A nameplate figure read as characters — `"355.2 V"`, `"50Ah"`, `"1.2 kWh"`,
 * `"54 lb"` — split into its digits and its unit token. `null` when there is no
 * number or no unit: an unread figure is unread, never guessed (Rule 2.11).
 *
 * The unit is returned exactly as printed (case preserved) so the caller
 * decides what it means; the conversions below are case-insensitive on the
 * unit and strict on the number.
 */
export function parseLabelQuantity(text: string): Quantity | null {
  const match =
    /^\s*([+-]?\d+(?:[.,]\d+)?)\s*([A-Za-zµμ]+(?:\s*[A-Za-z]+)?)\s*$/.exec(
      text,
    );
  if (match === null) return null;
  const [, number, unit] = match;
  if (number === undefined || unit === undefined) return null;
  const value = number.replace(",", ".").replace(/^\+/, "");
  if (!isDecimalString(value)) return null;
  return { value, unit: unit.replace(/\s+/g, "") };
}

/**
 * Each conversion table is the unit's factor into the record's SI unit, as
 * exact digits. `lb` is the international avoirdupois pound, defined as exactly
 * 0.45359237 kg.
 */
const TO_VOLTS: Readonly<Record<string, string>> = {
  v: "1",
  mv: "0.001",
  kv: "1000",
};

const TO_AMP_HOURS: Readonly<Record<string, string>> = {
  ah: "1",
  mah: "0.001",
};

const TO_WATT_HOURS: Readonly<Record<string, string>> = {
  wh: "1",
  mwh: "0.001",
  kwh: "1000",
};

const TO_KILOGRAMS: Readonly<Record<string, string>> = {
  kg: "1",
  g: "0.001",
  lb: "0.45359237",
  lbs: "0.45359237",
  oz: "0.028349523125",
};

function convert(
  quantity: Quantity,
  table: Readonly<Record<string, string>>,
): string | null {
  const factor = table[quantity.unit.toLowerCase()];
  if (factor === undefined) return null;
  if (!isDecimalString(quantity.value)) return null;
  return normalizeDecimal(multiplyDecimal(quantity.value, factor));
}

/** Nominal voltage in volts. `null` when the unit is not a voltage. */
export function toVolts(quantity: Quantity): string | null {
  return convert(quantity, TO_VOLTS);
}

/** Capacity in ampere-hours. */
export function toAmpHours(quantity: Quantity): string | null {
  return convert(quantity, TO_AMP_HOURS);
}

/** Energy in watt-hours. */
export function toWattHours(quantity: Quantity): string | null {
  return convert(quantity, TO_WATT_HOURS);
}

/** Mass in kilograms. */
export function toKilograms(quantity: Quantity): string | null {
  return convert(quantity, TO_KILOGRAMS);
}

/**
 * `Wh = V × Ah`, to three places — the record's `numeric(12,3)`.
 *
 * A derived figure, and it is labelled as derived where it is shown; a label
 * that prints its own Wh figure is read rather than recomputed.
 */
export function energyWhFromVoltageAndCapacity(
  volts: string,
  ampHours: string,
): string {
  return scaleDecimal(multiplyDecimal(volts, ampHours), 3);
}

/**
 * A JavaScript `number` as exact digits, for the one place a number is allowed
 * to meet a decimal: a configured cutoff or score arriving as `number` and
 * being compared against a stored `Decimal`. `String(0.75)` is `"0.75"`, but
 * `String(1e-7)` is `"1e-7"`, so the exponent form is expanded rather than
 * passed through. Throws `RangeError` for anything not finite — a threshold
 * that is `NaN` is not a threshold.
 */
export function decimalFromNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`not a finite number: ${String(value)}`);
  }
  const plain = String(value);
  if (isDecimalString(plain)) return plain;
  // A whole number beyond 1e21 prints in exponent form and `toFixed` cannot
  // expand it; BigInt holds every integer a double can represent exactly.
  if (Number.isInteger(value)) return BigInt(value).toString();
  // Exponent form. `toFixed` expands it; the trailing zeros it pads with carry
  // no information and are dropped so the scale reflects the value.
  const expanded = value.toFixed(20).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  if (!isDecimalString(expanded)) {
    throw new RangeError(`cannot express ${String(value)} as a decimal`);
  }
  return normalizeDecimal(expanded);
}
