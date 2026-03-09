"use client";

/**
 * Shared Page Header
 *
 * Standardized header pattern for all workspace pages (dashboards, admin,
 * finance tools). Replaces the per-component header implementations.
 *
 * Usage:
 *   <PageHeader
 *     icon={Brain}
 *     title="Atlas Intelligence Console"
 *     description="Financial intelligence, anomaly detection, and adaptive learning"
 *   />
 *
 *   <PageHeader
 *     icon={Globe}
 *     title="Global Close Monitor"
 *     badge={{ label: "Advisory", variant: "outline" }}
 *     actions={<Button size="sm" onClick={refresh}><RefreshCw /> Refresh</Button>}
 *   />
 */

import type { LucideIcon } from "lucide-react";
import type React from "react";
import { Badge } from "@neon/ui";

interface PageHeaderProps {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  description?: string;
  badge?: {
    label: string;
    variant?: "default" | "secondary" | "destructive" | "outline";
  };
  /** Total count shown next to title */
  count?: number;
  /** Loading state — hides count */
  loading?: boolean;
  /** Right-aligned action area */
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  icon: Icon,
  iconClassName,
  title,
  description,
  badge,
  count,
  loading,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between ${className ?? ""}`}
    >
      <div>
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon
              className={`h-4 w-4 ${iconClassName ?? "text-muted-foreground"}`}
            />
          )}
          <h1 className="text-lg font-semibold">{title}</h1>
          {!loading && count != null && (
            <span className="text-sm text-muted-foreground">
              ({count} total)
            </span>
          )}
          {badge && (
            <Badge variant={badge.variant ?? "outline"} className="text-[10px]">
              {badge.label}
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
