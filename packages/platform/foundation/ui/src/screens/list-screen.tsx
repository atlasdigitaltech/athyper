import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface ListScreenProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  /** Sticky bar below the header — search, filters, view switcher. */
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ListScreen({
  eyebrow,
  title,
  description,
  actions,
  toolbar,
  children,
  className,
}: ListScreenProps) {
  const hasHeader = eyebrow || title || description || actions;
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {hasHeader && (
        <div className="flex shrink-0 items-start justify-between gap-4 border-b bg-background px-6 py-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-0.5 truncate text-xs text-muted-foreground">{eyebrow}</p>
            )}
            {title && (
              <h1 className="truncate text-xl font-semibold text-foreground">{title}</h1>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}

      {/* Single scroll container — toolbar must live inside so sticky top-0
          is relative to this scroll boundary, not a distant ancestor. */}
      <div className="flex-1 overflow-auto">
        {toolbar && (
          <div className="sticky top-0 z-10 border-b bg-background/95 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            {toolbar}
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
