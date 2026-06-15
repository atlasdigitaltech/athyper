/**
 * @athyper/content-ui — CurrencyTriad
 *
 * Spec v1.1 §6.1 / acceptance criterion A1.
 * Document currency PRIMARY, base currency parenthetical with rate.
 *
 * Examples:
 *   USD = INR (rate 1.0)        →  "USD 20.50"
 *   USD doc, INR base, rate 83  →  "USD 20.50 (INR 1,711.00 @ 83.46)"
 *
 * Authority: pc_currency_chk enforces (currency_code = base AND rate = 1.0)
 *   OR (currency_code <> base AND rate > 0).
 */
"use client";

import { cn } from "@athyper/theme/utils";

export interface CurrencyTriadProps {
  /** Amount expressed in the document (transaction) currency. */
  amount: number;
  /** Document/transaction currency (ISO 4217). */
  currencyCode: string;
  /** Base/posting currency (ISO 4217). */
  baseCurrencyCode: string;
  /** Exchange rate: document → base. */
  exchangeRate: number;
  /** When true, show explicit "+"/"-" sign for non-zero amounts. */
  signed?: boolean;
  /** Locale for number formatting. */
  locale?: string;
  className?: string;
}

function formatMoney(amount: number, currencyCode: string, locale: string, signed: boolean): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(amount);
}

/**
 * Renders a money amount with optional base-currency reconciliation hint.
 *
 * When `currencyCode === baseCurrencyCode`, only the document currency
 * renders. When they differ, the base currency is shown parenthetically
 * with the applied rate so users can reconcile FX deltas inline.
 */
export function CurrencyTriad({
  amount,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  signed = false,
  locale = "en",
  className,
}: CurrencyTriadProps) {
  const isSameCurrency = currencyCode === baseCurrencyCode;
  const docFormatted = formatMoney(amount, currencyCode, locale, signed);

  if (isSameCurrency) {
    return (
      <span className={cn("tabular-nums", className)}>{docFormatted}</span>
    );
  }

  const baseAmount = amount * exchangeRate;
  const baseFormatted = formatMoney(baseAmount, baseCurrencyCode, locale, signed);
  const rateFormatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(exchangeRate);

  return (
    <span className={cn("tabular-nums", className)}>
      <span>{docFormatted}</span>
      <span className="ml-1 text-muted-foreground">
        ({baseFormatted} @ {rateFormatted})
      </span>
    </span>
  );
}
