// framework/runtime/src/services/business/engines/shared/money.ts

/**
 * Money type — v2.1 Micro-Clause MC-4: NO FLOAT.
 * All monetary values are strings representing DECIMAL to preserve precision.
 *
 * Rounding policy: HALF_UP at 4dp is the platform default.
 * All engines (Tax, Commission, Depreciation, FX) MUST use the same rounding mode
 * to prevent cross-engine mismatch.
 */

export type RoundingMode = "HALF_UP" | "BANKERS" | "TRUNCATE";
export const DEFAULT_ROUNDING: RoundingMode = "HALF_UP";
export const DEFAULT_PRECISION = 4;

export interface Money {
  /** DECIMAL as string to preserve precision (e.g., "1234.5678") */
  amount: string;
  /** ISO 4217 currency code (e.g., "USD", "INR", "EUR") */
  currencyCode: string;
  /** Number of decimal places (default: 4 for internal, 2 for display) */
  precision: number;
}

/** Create a Money value. Validates format. */
export function money(
  amount: string,
  currencyCode: string,
  precision = 4,
): Money {
  if (!/^-?\d+(\.\d+)?$/.test(amount)) {
    throw new Error(
      `Invalid money amount: "${amount}" — must be a numeric string`,
    );
  }
  return { amount, currencyCode, precision };
}

/** Zero money in a given currency */
export function zeroMoney(currencyCode: string, precision = 4): Money {
  return { amount: "0", currencyCode, precision };
}

/**
 * Add two Money values. Throws if currencies differ.
 * Uses BigInt-based integer arithmetic to avoid float.
 */
export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  const precision = Math.max(a.precision, b.precision);
  const result = bigAdd(a.amount, b.amount, precision);
  return { amount: result, currencyCode: a.currencyCode, precision };
}

/** Subtract b from a */
export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  const precision = Math.max(a.precision, b.precision);
  const result = bigSubtract(a.amount, b.amount, precision);
  return { amount: result, currencyCode: a.currencyCode, precision };
}

/** Multiply money by a scalar (e.g., quantity, rate) */
export function multiplyMoney(m: Money, scalar: string): Money {
  const result = bigMultiply(m.amount, scalar, m.precision);
  return {
    amount: result,
    currencyCode: m.currencyCode,
    precision: m.precision,
  };
}

/** Compare: returns -1 (a < b), 0 (equal), 1 (a > b) */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  const precision = Math.max(a.precision, b.precision);
  const aInt = toScaledBigInt(a.amount, precision);
  const bInt = toScaledBigInt(b.amount, precision);
  if (aInt < bInt) return -1;
  if (aInt > bInt) return 1;
  return 0;
}

/** Check if money is negative */
export function isNegative(m: Money): boolean {
  return m.amount.startsWith("-") && m.amount !== "-0" && m.amount !== "0";
}

/** Check if money is zero */
export function isZero(m: Money): boolean {
  return toScaledBigInt(m.amount, m.precision) === 0n;
}

/**
 * Multiply money by a rate/percentage string with explicit rounding.
 * Use for: tax calculation (amount × rate), commission (amount × pct),
 * depreciation (cost × rate), FX (amount × exchange rate).
 *
 * Unlike multiplyMoney (which truncates), this applies the specified rounding mode.
 */
export function multiplyByRate(
  m: Money,
  rate: string,
  roundingMode: RoundingMode = DEFAULT_ROUNDING,
): Money {
  const precision = m.precision;
  const mScaled = toScaledBigInt(m.amount, precision);
  const rScaled = toScaledBigInt(rate, precision);
  const factor = 10n ** BigInt(precision);
  const rawResult = mScaled * rScaled;
  const rounded = applyRounding(rawResult, factor, roundingMode);
  return {
    amount: fromScaledBigInt(rounded, precision),
    currencyCode: m.currencyCode,
    precision,
  };
}

/**
 * Compute ratio of two Money values. Returns a plain string (never Money)
 * to prevent accidental posting of ratio values.
 *
 * Use for: utilization percentages, fulfillment ratios, budget health %.
 * The result is a decimal string like "0.753846" (not a monetary amount).
 */
export function toRatio(a: Money, b: Money, scale = 6): string {
  assertSameCurrency(a, b);
  const precision = Math.max(a.precision, b.precision);
  const aScaled = toScaledBigInt(a.amount, precision);
  const bScaled = toScaledBigInt(b.amount, precision);
  if (bScaled === 0n) {
    throw new Error("Division by zero in toRatio");
  }
  const scaleFactor = 10n ** BigInt(scale);
  const result = (aScaled * scaleFactor) / bScaled;
  return fromScaledBigInt(result, scale);
}

/**
 * Sum an array of string amounts. Returns string.
 * Replaces the common parseFloat accumulation anti-pattern:
 *   BAD:  total += parseFloat(item.amount)
 *   GOOD: total = sumAmounts(items.map(i => i.amount))
 */
export function sumAmounts(
  amounts: string[],
  precision = DEFAULT_PRECISION,
): string {
  let total = 0n;
  for (const amt of amounts) {
    total += toScaledBigInt(amt || "0", precision);
  }
  return fromScaledBigInt(total, precision);
}

/**
 * Subtract two string amounts. Returns string.
 * Convenience for non-Money contexts (e.g., commitment remaining = total - fulfilled).
 */
export function subtractAmounts(
  a: string,
  b: string,
  precision = DEFAULT_PRECISION,
): string {
  return fromScaledBigInt(
    toScaledBigInt(a || "0", precision) - toScaledBigInt(b || "0", precision),
    precision,
  );
}

/**
 * Compare two string amounts. Returns -1, 0, or 1.
 * Replaces parseFloat comparison anti-patterns.
 */
export function compareAmounts(
  a: string,
  b: string,
  precision = DEFAULT_PRECISION,
): -1 | 0 | 1 {
  const aInt = toScaledBigInt(a || "0", precision);
  const bInt = toScaledBigInt(b || "0", precision);
  if (aInt < bInt) return -1;
  if (aInt > bInt) return 1;
  return 0;
}

/**
 * Multiply two string amounts. Returns string.
 * For rate × amount calculations outside Money context.
 */
export function multiplyAmounts(
  a: string,
  b: string,
  precision = DEFAULT_PRECISION,
  roundingMode: RoundingMode = DEFAULT_ROUNDING,
): string {
  const aScaled = toScaledBigInt(a || "0", precision);
  const bScaled = toScaledBigInt(b || "0", precision);
  const factor = 10n ** BigInt(precision);
  const rawResult = aScaled * bScaled;
  const rounded = applyRounding(rawResult, factor, roundingMode);
  return fromScaledBigInt(rounded, precision);
}

/** Format money for display (rounds to display precision) */
export function formatMoney(m: Money, displayPrecision = 2): string {
  const parts = m.amount.split(".");
  const intPart = parts[0]!;
  const fracPart = (parts[1] ?? "")
    .padEnd(displayPrecision, "0")
    .slice(0, displayPrecision);
  return `${intPart}.${fracPart}`;
}

// --- Internal BigInt arithmetic helpers (exported for engine MC-4 fixes) ---

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currencyCode !== b.currencyCode) {
    throw new Error(
      `Currency mismatch: ${a.currencyCode} vs ${b.currencyCode}. Use FX conversion first.`,
    );
  }
}

/** Exported for engine MC-4 fixes that need raw BigInt conversion */
export function toScaledBigInt(amount: string, precision: number): bigint {
  const negative = amount.startsWith("-");
  const abs = negative ? amount.slice(1) : amount;
  const parts = abs.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = (parts[1] ?? "").padEnd(precision, "0").slice(0, precision);
  const scaled = BigInt(intPart + fracPart);
  return negative ? -scaled : scaled;
}

/** Exported for engine MC-4 fixes that need raw BigInt conversion */
export function fromScaledBigInt(scaled: bigint, precision: number): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const str = abs.toString().padStart(precision + 1, "0");
  const intPart = str.slice(0, str.length - precision) || "0";
  const fracPart = str.slice(str.length - precision);
  const trimmed = fracPart.replace(/0+$/, "");
  const result = trimmed.length > 0 ? `${intPart}.${trimmed}` : intPart;
  return negative ? `-${result}` : result;
}

/**
 * Apply rounding to a BigInt result after multiplication.
 * rawResult is the product (aScaled * bScaled), factor is 10^precision.
 */
function applyRounding(
  rawResult: bigint,
  factor: bigint,
  mode: RoundingMode,
): bigint {
  const negative = rawResult < 0n;
  const abs = negative ? -rawResult : rawResult;
  const quotient = abs / factor;
  const remainder = abs % factor;

  let rounded: bigint;
  switch (mode) {
    case "TRUNCATE":
      rounded = quotient;
      break;
    case "HALF_UP": {
      const half = factor / 2n;
      rounded = remainder >= half ? quotient + 1n : quotient;
      break;
    }
    case "BANKERS": {
      const half = factor / 2n;
      if (remainder > half) {
        rounded = quotient + 1n;
      } else if (remainder < half) {
        rounded = quotient;
      } else {
        // Exactly half — round to even
        rounded = quotient % 2n === 0n ? quotient : quotient + 1n;
      }
      break;
    }
  }
  return negative ? -rounded : rounded;
}

function bigAdd(a: string, b: string, precision: number): string {
  return fromScaledBigInt(
    toScaledBigInt(a, precision) + toScaledBigInt(b, precision),
    precision,
  );
}

function bigSubtract(a: string, b: string, precision: number): string {
  return fromScaledBigInt(
    toScaledBigInt(a, precision) - toScaledBigInt(b, precision),
    precision,
  );
}

function bigMultiply(a: string, b: string, precision: number): string {
  const aScaled = toScaledBigInt(a, precision);
  const bScaled = toScaledBigInt(b, precision);
  const factor = 10n ** BigInt(precision);
  // (aScaled * bScaled) / factor gives us the correct precision (truncation)
  const result = (aScaled * bScaled) / factor;
  return fromScaledBigInt(result, precision);
}
