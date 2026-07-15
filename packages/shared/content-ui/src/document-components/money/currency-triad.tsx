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

import { Info } from "lucide-react";
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
  /**
   * Render mode for the base-currency reconciliation:
   *   - "inline" (default): `$3,180.00 (MYR 14,946.00 @ 4.70)` on one line
   *   - "stacked": doc amount on its own line, `≈ MYR 14,946.00` on a
   *     second muted line beneath. Use in narrow chips where the inline
   *     parenthetical overflows the container.
   */
  layout?: "inline" | "stacked";
  /**
   * Suppresses the `@ rate` suffix. Useful when the rate is shown once
   * at the document level (e.g. PI header FX badge) so per-cell repetition
   * isn't visual noise. Has no effect when doc === base.
   */
  hideRate?: boolean;
  /** Accessible tooltip/title for the compact exchange-rate info affordance. */
  rateInfoTitle?: string;
  /** Optional click handler for opening the detailed FX/history surface. */
  onRateInfoClick?: () => void;
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
  layout = "inline",
  hideRate = false,
  rateInfoTitle,
  onRateInfoClick,
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
  const rateInfo = rateInfoTitle ?? `1 ${currencyCode} = ${rateFormatted} ${baseCurrencyCode}`;
  const rateInfoIcon = hideRate ? (
    onRateInfoClick ? (
      <button
        type="button"
        onClick={onRateInfoClick}
        title={rateInfo}
        aria-label={rateInfo}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="size-3" aria-hidden />
      </button>
    ) : (
      <span
        title={rateInfo}
        aria-label={rateInfo}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground"
      >
        <Info className="size-3" aria-hidden />
      </span>
    )
  ) : null;

  if (layout === "stacked") {
    return (
      <span className={cn("tabular-nums flex flex-col gap-0.5 min-w-0", className)}>
        <span className="truncate">{docFormatted}</span>
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
          <span className="truncate">
            ≈ {baseFormatted}
            {!hideRate && <> @ {rateFormatted}</>}
          </span>
          {rateInfoIcon}
        </span>
      </span>
    );
  }

  return (
    <span className={cn("tabular-nums", className)}>
      <span>{docFormatted}</span>
      <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
        <span>({baseFormatted}{hideRate ? "" : ` @ ${rateFormatted}`})</span>
        {rateInfoIcon}
      </span>
    </span>
  );
}
