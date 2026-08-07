import { cn } from "@athyper/platform-theme/utils";

export interface MoneySummaryProps {
  amount: number;
  currencyCode: string;
  locale?: string;
  className?: string;
  /** Show sign for negative values */
  signed?: boolean;
}

export function MoneySummary({
  amount,
  currencyCode,
  locale = "en",
  className,
  signed = false,
}: MoneySummaryProps) {
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(amount);

  return (
    <span className={cn("text-sm tabular-nums", className)}>
      {formatted}
    </span>
  );
}
