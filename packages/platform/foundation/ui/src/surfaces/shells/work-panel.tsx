import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface WorkPanelProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  /** Remove the default p-4 padding from the body — use for full-bleed content
   *  such as data tables, image grids, or maps. */
  noPadding?: boolean;
  className?: string;
}

export function WorkPanel({ title, description, actions, children, noPadding = false, className }: WorkPanelProps) {
  const hasHeader = title || description || actions;
  return (
    <section
      className={cn("rounded-lg border bg-card", className)}
      aria-label={title}
    >
      {hasHeader && (
        <div className="flex min-h-12 items-center justify-between gap-4 border-b px-5 py-2">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children && (
        <div className={noPadding ? undefined : "p-4"}>{children}</div>
      )}
    </section>
  );
}
