import { FinanceContractError } from "@athyper/server-contract-finance";

export function decimalUnits(value: string, scale: number, field = "amount"): bigint {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", `${field} must be a canonical decimal string`);
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace(/^-/, "").split(".");
  if (fraction.length > scale) throw new FinanceContractError("FINANCE_INVALID_COMMAND", `${field} supports at most ${scale} decimal places`);
  const units = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0") || "0");
  return negative ? -units : units;
}

export function decimalString(units: bigint, scale: number): string {
  const sign = units < 0n ? "-" : "";
  const digits = (units < 0n ? -units : units).toString().padStart(scale + 1, "0");
  return scale === 0 ? `${sign}${digits}` : `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

export function addDecimals(values: readonly string[], scale: number, field = "amount"): string {
  return decimalString(values.reduce((sum, value) => sum + decimalUnits(value, scale, field), 0n), scale);
}

export function negateDecimal(value: string, scale: number, field = "amount"): string { return decimalString(-decimalUnits(value, scale, field), scale); }
export function equalDecimals(left: string, right: string, scale: number): boolean { return decimalUnits(left, scale) === decimalUnits(right, scale); }
