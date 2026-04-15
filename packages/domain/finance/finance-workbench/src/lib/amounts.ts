/* ---------------------------------------------------------------------------
   Amount utilities — sign conventions, debit/credit labels, variance.
   --------------------------------------------------------------------------- */

import type { AccountClass } from "../data/types";

/**
 * Normal balance sign for display: +1 if the account normally has a
 * debit balance, -1 if credit.
 * Used to derive "net balance" from closing_debit - closing_credit.
 */
export function normalBalanceSign(accountClass: AccountClass): 1 | -1 {
  switch (accountClass) {
    case "asset":
    case "contra_liability":
    case "contra_equity":
    case "expense":
      return 1;   // debit-normal
    case "liability":
    case "contra_asset":
    case "equity":
    case "income":
    default:
      return -1;  // credit-normal
  }
}

/**
 * Converts closing_debit / closing_credit pair into a signed net balance
 * (positive = normal side has more, negative = abnormal).
 */
export function netBalance(
  closingDebit: number,
  closingCredit: number,
  accountClass: AccountClass,
): number {
  const sign = normalBalanceSign(accountClass);
  return sign === 1
    ? closingDebit - closingCredit
    : closingCredit - closingDebit;
}

/**
 * Absolute variance between two amounts, and the percentage change.
 * Returns null percentage when base is zero.
 */
export function variance(
  current: number,
  prior: number,
): { absolute: number; pct: number | null } {
  const absolute = current - prior;
  const pct = prior === 0 ? null : (absolute / Math.abs(prior)) * 100;
  return { absolute, pct };
}

/** Tailwind class for a variance value (positive good vs negative good). */
export function varianceColor(
  value: number,
  positiveIsGood = true,
): string {
  if (value === 0) return "text-muted-foreground";
  const isPositive = value > 0;
  if (positiveIsGood) {
    return isPositive ? "text-success" : "text-destructive";
  }
  return isPositive ? "text-destructive" : "text-success";
}

/** BS/P&L sign convention: P&L income should show as positive when credit-normal. */
export function statementAmount(
  closingDebit: number,
  closingCredit: number,
  accountClass: AccountClass,
): number {
  return netBalance(closingDebit, closingCredit, accountClass);
}
