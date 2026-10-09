// Exact decimal arithmetic for aggregates (Entity list Tree blueprint A2).
// PostgreSQL numeric values arrive as text; adding or comparing them through
// JavaScript numbers loses precision on large or long decimals.

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Whether a value is a plain decimal (a JSON number or numeric text). */
export function isExactDecimal(value: unknown): value is number | string {
  return (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && DECIMAL.test(value));
}

function scaled(value: number | string): { readonly units: bigint; readonly scale: number } {
  const text = typeof value === "number" ? numberText(value) : value;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const units = BigInt(`${whole}${fraction}` || "0");
  return { units: negative ? -units : units, scale: fraction.length };
}

/** A number's shortest exact decimal text, without exponent notation. */
function numberText(value: number): string {
  const text = String(value);
  if (!/e/i.test(text)) return text;
  return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

function align(a: ReturnType<typeof scaled>, scale: number): bigint {
  return a.units * 10n ** BigInt(scale - a.scale);
}

function text(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale), fraction = digits.slice(digits.length - scale).replace(/0+$/, "");
  return `${negative && (whole !== "0" || fraction) ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** The exact sum of decimals, as decimal text. */
export function addDecimals(values: readonly (number | string)[]): string {
  const parts = values.map(scaled);
  const scale = Math.max(0, ...parts.map((part) => part.scale));
  return text(parts.reduce((sum, part) => sum + align(part, scale), 0n), scale);
}

/** Compares two decimals exactly: negative, zero or positive. */
export function compareDecimals(a: number | string, b: number | string): number {
  const left = scaled(a), right = scaled(b);
  const scale = Math.max(left.scale, right.scale);
  const difference = align(left, scale) - align(right, scale);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

/** A decimal's mean to `digits` fraction digits (truncated), as decimal text. */
export function averageDecimals(values: readonly (number | string)[], digits = 10): string {
  const parts = values.map(scaled);
  const scale = Math.max(0, ...parts.map((part) => part.scale));
  const total = parts.reduce((sum, part) => sum + align(part, scale), 0n);
  const mean = (total * 10n ** BigInt(digits)) / BigInt(values.length);
  return text(mean, scale + digits);
}

/** An aggregate as a JSON number when that is exact, otherwise its decimal text. */
export function exactAggregate(value: string): number | string {
  const number = Number(value);
  return Number.isFinite(number) && numberText(number) === text(scaled(value).units, scaled(value).scale) ? number : value;
}
