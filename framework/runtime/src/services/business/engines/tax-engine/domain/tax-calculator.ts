// framework/runtime/src/services/business/engines/tax-engine/domain/tax-calculator.ts

import {
  multiplyByRate,
  money,
  sumAmounts,
  toRatio,
  compareAmounts,
} from "../../shared/money.js";

import type { TaxRate, TaxCalculation, CalculateTaxInput } from "./types.js";

/**
 * Calculate tax for a single line item against applicable rates.
 *
 * MC-4 compliance: Uses multiplyByRate with HALF_UP rounding. NO FLOAT.
 */
export function calculateTax(
  input: CalculateTaxInput,
  applicableRates: TaxRate[],
): Omit<TaxCalculation, "id" | "calculatedAt">[] {
  const results: Omit<TaxCalculation, "id" | "calculatedAt">[] = [];

  for (const rate of applicableRates) {
    // Check if rate is effective on transaction date
    if (!isRateEffective(rate, input.transactionDate)) continue;

    // Determine actual rate (treaty rate if applicable and lower)
    const actualRate = resolveActualRate(rate, input.vendorCountryCode);

    // Calculate tax amount = baseAmount * (rate / 100)
    // Rate is stored as percentage (e.g., "18.5" for 18.5%)
    // Convert to decimal: use toRatio-style division via string arithmetic
    const rateDecimalStr = toRatio(
      money(actualRate, input.currencyCode),
      money("100", input.currencyCode),
      8,
    );
    const taxAmount = multiplyByRate(
      money(input.baseAmount, input.currencyCode),
      rateDecimalStr,
    );

    results.push({
      tenantId: input.tenantId,
      txnId: input.txnId,
      docId: input.docId,
      commitmentId: input.commitmentId ?? null,
      lineItemIndex: input.lineItemIndex ?? null,
      jurisdictionId: rate.jurisdictionId,
      taxType: rate.taxType,
      taxCode: rate.taxCode,
      baseAmount: input.baseAmount,
      taxRate: actualRate,
      taxAmount: taxAmount.amount,
      currencyCode: input.currencyCode,
      isReverseCharge: rate.isReverseCharge,
      isWht: rate.taxType === "WHT",
      whtCertificateNo: null,
      isInputCreditEligible: !rate.isReverseCharge && rate.taxType !== "WHT",
    });
  }

  return results;
}

/**
 * Check if a tax rate is effective on a given date.
 */
function isRateEffective(rate: TaxRate, transactionDate: Date): boolean {
  const from = rate.effectiveFrom;
  if (transactionDate < from) return false;
  if (rate.effectiveTo && transactionDate > rate.effectiveTo) return false;
  return true;
}

/**
 * Resolve actual rate considering bilateral treaty.
 * MC-4 compliance: Uses compareAmounts instead of parseFloat.
 */
function resolveActualRate(rate: TaxRate, vendorCountryCode?: string): string {
  // Treaty rate only applies for cross-border WHT
  if (rate.treatyRate && vendorCountryCode && rate.taxType === "WHT") {
    // Use the lower of standard and treaty rate
    return compareAmounts(rate.treatyRate, rate.rate) < 0
      ? rate.treatyRate
      : rate.rate;
  }
  return rate.rate;
}

/**
 * Aggregate multiple tax calculations into a summary.
 * MC-4 compliance: Uses sumAmounts and toRatio. NO FLOAT.
 */
export function aggregateTaxResults(
  calculations: Array<{ baseAmount: string; taxAmount: string }>,
): {
  totalTaxAmount: string;
  totalBaseAmount: string;
  effectiveRate: string;
} {
  const totalTaxAmount = sumAmounts(calculations.map((c) => c.taxAmount));
  const totalBaseAmount = sumAmounts(calculations.map((c) => c.baseAmount));

  let effectiveRate = "0";
  if (compareAmounts(totalBaseAmount, "0") > 0) {
    // effectiveRate = (totalTax / totalBase) * 100
    const ratio = toRatio(
      money(totalTaxAmount, "XXX"),
      money(totalBaseAmount, "XXX"),
      6,
    );
    // ratio is already a decimal (e.g., "0.185"), multiply by 100 for percentage display
    const ratioMoney = money(ratio, "XXX");
    const pct = multiplyByRate(money("100", "XXX"), ratioMoney.amount);
    effectiveRate = pct.amount;
  }

  return {
    totalTaxAmount,
    totalBaseAmount,
    effectiveRate,
  };
}
