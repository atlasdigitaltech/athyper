import { type ReactNode } from "react";
import { cn } from "@athyper/theme/utils";

export interface EmptyStateProps {
  /** Icon node — pass a pre-sized JSX element, e.g. <Inbox className="h-10 w-10 text-muted-foreground/30" /> */
  icon?: ReactNode;
  /** Primary message line. Renders in muted-foreground weight-medium. */
  title?: string;
  /** Secondary hint. Accepts ReactNode so inline <code> / <strong> markup works. */
  description?: ReactNode;
  /** Optional call-to-action below the text. */
  action?: ReactNode;
  /**
   * size="default" — full-page empty region (py-12 default, override with className)
   * size="sm"      — card-embedded (py-6, smaller gap)
   */
  size?: "sm" | "default";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "default" ? "gap-3 py-12" : "gap-2 py-6",
        className,
      )}
    >
      {icon && <div>{icon}</div>}
      {title && (
        <p
          className={cn(
            "font-medium text-muted-foreground",
            size === "default" ? "text-sm" : "text-xs",
          )}
        >
          {title}
        </p>
      )}
      {description && (
        <p
          className={cn(
            "text-muted-foreground/70",
            size === "default" ? "max-w-xs text-xs" : "text-[10px]",
          )}
        >
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
