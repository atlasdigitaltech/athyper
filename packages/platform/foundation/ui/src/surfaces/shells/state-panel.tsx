import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface StatePanelProps {
  /** Optional illustration or icon above the title. */
  icon?: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
  className?: string;
}

export function StatePanel({ icon, title, message, action, className }: StatePanelProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-52 flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
