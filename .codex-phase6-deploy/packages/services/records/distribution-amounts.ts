export type DistributionBasis = "PERCENT" | "AMOUNT" | "QUANTITY";

export interface DistributionAmountInput {
  distribution_basis?: unknown;
  split_pct?: unknown;
  split_amount?: unknown;
  split_quantity?: unknown;
}

export interface DistributionLineAmountInput {
  lineAmount: number;
  lineQuantity: number;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readDistributionBasis(value: unknown): DistributionBasis {
  return value === "AMOUNT" || value === "QUANTITY" || value === "PERCENT" ? value : "PERCENT";
}

export function computeDistributionDocumentAmount(
  row: DistributionAmountInput,
  line: DistributionLineAmountInput,
): number {
  const basis = readDistributionBasis(row.distribution_basis);
  if (basis === "PERCENT") {
    const pct = readNumber(row.split_pct) ?? 0;
    return roundCurrency(line.lineAmount * (pct / 100));
  }
  if (basis === "AMOUNT") {
    return roundCurrency(readNumber(row.split_amount) ?? 0);
  }

  const quantity = readNumber(row.split_quantity) ?? 0;
  if (!Number.isFinite(line.lineQuantity) || line.lineQuantity === 0) return 0;
  return roundCurrency(line.lineAmount * (quantity / line.lineQuantity));
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10_000) / 10_000;
}
