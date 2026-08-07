import { type HTMLAttributes } from "react";
import { cn } from "@athyper/platform-theme/utils";

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value?: number;
}

function Progress({ className, value, "aria-label": ariaLabel, ...props }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-label={ariaLabel ?? "Progress"}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
