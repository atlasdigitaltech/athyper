/**
 * PageHeading — standard page header with breadcrumb, title, badge, and actions slot.
 *
 * Renders above the page content area. `actions` is a right-aligned slot for
 * primary buttons or dropdowns. `badge` sits inline with the title (status chip,
 * environment tag, etc.).
 *
 * Usage:
 *   <PageHeading
 *     title="Suppliers"
 *     description="Manage your supplier master."
 *     breadcrumb={[{ label: "Records", href: "/records" }]}
 *     badge={<Badge variant="outline">Beta</Badge>}
 *     actions={<Button onClick={handleNew}>New supplier</Button>}
 *   />
 */

import { type ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb";

export interface PageHeadingProps {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  /** Right-side slot — pass buttons, dropdowns, etc. */
  actions?: ReactNode;
  /** Inline badge/chip beside the title (status, tag). */
  badge?: ReactNode;
  className?: string;
}

export function PageHeading({
  title,
  description,
  breadcrumb,
  actions,
  badge,
  className,
}: PageHeadingProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb items={breadcrumb} className="mb-1" />
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-medium tracking-tight text-foreground">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

