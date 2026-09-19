/** Exact decimal rounding shared by configuration simulation and financial execution. */
export type DecimalRoundingMethod =
  "ROUND_HALF_UP" | "ROUND_HALF_EVEN" | "ROUND_UP" | "ROUND_DOWN" | "TRUNCATE";
export interface DecimalRoundingSettings {
  readonly method: DecimalRoundingMethod;
  readonly precisionDigits: number;
  readonly roundingIncrement: string;
}
export interface CurrencyRoundingSettings {
  readonly minorUnits: number;
  readonly roundingIncrement?: string;
}

export function resolveDecimalRounding(
  rule: {
    readonly method: DecimalRoundingMethod;
    readonly precisionDigits?: number;
    readonly roundingIncrement?: string;
  },
  currency?: CurrencyRoundingSettings,
): DecimalRoundingSettings {
  const precisionDigits = rule.precisionDigits ?? currency?.minorUnits;
  if (
    !Number.isInteger(precisionDigits) ||
    precisionDigits! < 0 ||
    precisionDigits! > 6
  )
    throw new RangeError("Rounding precision cannot be resolved within 0..6");
  const roundingIncrement =
    rule.roundingIncrement ??
    currency?.roundingIncrement ??
    (precisionDigits === 0 ? "1" : `0.${"0".repeat(precisionDigits! - 1)}1`);
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(roundingIncrement))
    throw new RangeError("Invalid rounding increment");
  const increment = decimal(roundingIncrement);
  if (increment.units <= 0n)
    throw new RangeError("Rounding increment must be positive");
  // Trailing zeroes are presentation, not extra required precision.
  if (
    increment.scale > precisionDigits! &&
    increment.units % 10n ** BigInt(increment.scale - precisionDigits!) !== 0n
  )
    throw new RangeError(
      "Rounding increment cannot be represented at the resolved precision",
    );
  if (
    ![
      "ROUND_HALF_UP",
      "ROUND_HALF_EVEN",
      "ROUND_UP",
      "ROUND_DOWN",
      "TRUNCATE",
    ].includes(rule.method)
  )
    throw new RangeError("Invalid rounding method");
  return {
    method: rule.method,
    precisionDigits: precisionDigits!,
    roundingIncrement,
  };
}

export function roundDecimal(
  value: string,
  supplied: DecimalRoundingSettings,
): string {
  const rule = resolveDecimalRounding(supplied);
  if (!/^-?\d{1,38}(\.\d{1,18})?$/.test(value))
    throw new RangeError("Invalid decimal amount");
  const amount = decimal(value),
    increment = decimal(rule.roundingIncrement);
  const numerator = amount.units * 10n ** BigInt(increment.scale);
  const denominator = 10n ** BigInt(amount.scale) * increment.units;
  const negative = numerator < 0n,
    absolute = negative ? -numerator : numerator;
  let units = absolute / denominator;
  const remainder = absolute % denominator;
  if (
    (rule.method === "ROUND_UP" && remainder > 0n) ||
    (rule.method === "ROUND_HALF_UP" && remainder * 2n >= denominator) ||
    (rule.method === "ROUND_HALF_EVEN" &&
      (remainder * 2n > denominator ||
        (remainder * 2n === denominator && units % 2n === 1n)))
  )
    units++;
  const rounded = (negative ? -units : units) * increment.units;
  const scaled =
    increment.scale > rule.precisionDigits
      ? rounded / 10n ** BigInt(increment.scale - rule.precisionDigits)
      : rounded * 10n ** BigInt(rule.precisionDigits - increment.scale);
  const digits = (scaled < 0n ? -scaled : scaled)
    .toString()
    .padStart(rule.precisionDigits + 1, "0");
  return `${scaled < 0n ? "-" : ""}${rule.precisionDigits ? digits.slice(0, -rule.precisionDigits) + "." + digits.slice(-rule.precisionDigits) : digits}`;
}
function decimal(value: string): { units: bigint; scale: number } {
  const negative = value.startsWith("-"),
    [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  return {
    units: BigInt(whole! + fraction) * (negative ? -1n : 1n),
    scale: fraction.length,
  };
}
