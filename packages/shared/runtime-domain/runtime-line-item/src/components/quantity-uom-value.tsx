import type { ReactNode } from "react";
import { cn } from "@athyper/theme/utils";

export interface QuantityUomValueProps {
  quantity: ReactNode;
  uom?: ReactNode;
  title?: string;
  variant?: "pill" | "inline";
  className?: string;
}

function hasDisplayValue(value: ReactNode): boolean {
  return value !== null && value !== undefined && value !== "";
}

export function QuantityUomValue({
  quantity,
  uom,
  title,
  variant = "pill",
  className,
}: QuantityUomValueProps) {
  const hasUom = hasDisplayValue(uom);

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-baseline gap-1.5 tabular-nums", className)} title={title}>
        <span>{quantity}</span>
        {hasUom ? (
          <span className="text-[0.72rem] font-medium uppercase text-muted-foreground">{uom}</span>
        ) : null}
      </span>
    );
  }

  if (!hasUom) {
    return (
      <span className={cn("tabular-nums", className)} title={title}>
        {quantity}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-[88px] max-w-full overflow-hidden rounded-md border border-border/60 bg-background text-sm shadow-sm",
        className,
      )}
      title={title}
    >
      <span className="flex min-w-0 flex-1 items-center justify-end px-2 tabular-nums">
        {quantity}
      </span>
      {hasUom ? (
        <span className="flex shrink-0 items-center border-l border-border/60 bg-muted/30 px-2 text-xs font-medium uppercase text-muted-foreground">
          {uom}
        </span>
      ) : null}
    </span>
  );
}
