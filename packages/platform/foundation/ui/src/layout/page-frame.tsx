import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface PageFrameProps {
  eyebrow?: string;
  /** Panel-level label — rendered as a styled div, not a heading, since
   *  PageFrame is a sub-pane container. Use ListScreen for full-page titles. */
  title?: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageFrame({ eyebrow, title, description, actions, children, className }: PageFrameProps) {
  const hasHeader = eyebrow || title || description || actions;
  return (
    <div className={cn("flex h-full flex-col", className)}>
      {hasHeader && (
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-0.5 truncate text-xs text-muted-foreground">{eyebrow}</p>
            )}
            {title && (
              <div className="truncate text-base font-semibold text-foreground">{title}</div>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">{children}</div>
    </div>
  );
}
