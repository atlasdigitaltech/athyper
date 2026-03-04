"use client";

import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ContentAreaBarProps {
  /** Page or section title displayed on the left */
  title: string;
  /** Optional summary (e.g., count, badge) shown after the title */
  summary?: ReactNode;
  /** Optional flex-growing search/filter area between title and actions */
  search?: ReactNode;
  /** Optional fixed-width actions rendered on the right side of the title row */
  actions?: ReactNode;
  /** Optional content below the title row (collapsible panels, chips, etc.) */
  children?: ReactNode;
  /** Additional CSS classes on the outer Card */
  className?: string;
}

export function ContentAreaBar({
  title,
  summary,
  search,
  actions,
  children,
  className,
}: ContentAreaBarProps) {
  return (
    <Card
      data-slot="content-area-bar"
      className={cn("flex flex-col gap-0 px-3 py-2", className)}
    >
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 text-base font-semibold">{title}</h2>
        {summary && (
          <span className="shrink-0 text-sm text-muted-foreground">
            {summary}
          </span>
        )}
        {search && <div className="min-w-0 flex-1 max-w-xs">{search}</div>}
        {actions && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {children}
    </Card>
  );
}
