import { cn } from "@athyper/theme/utils";

export interface QuantityUnitProps {
  quantity: number;
  unit?: string | null;
  decimals?: number;
  className?: string;
}

export function QuantityUnit({ quantity, unit, decimals = 2, className }: QuantityUnitProps) {
  const formatted = new Intl.NumberFormat("en", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(quantity);

  return (
    <span className={cn("text-sm tabular-nums", className)}>
      {formatted}
      {unit && <span className="ml-1 text-muted-foreground">{unit}</span>}
    </span>
  );
}
