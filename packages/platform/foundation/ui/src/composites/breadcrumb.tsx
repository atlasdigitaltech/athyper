/**
 * Breadcrumb — horizontal navigation trail with chevron separators.
 *
 * Last item renders as plain text (current page); earlier items render as
 * anchor links when `href` is provided, or as plain text when omitted.
 *
 * Usage:
 *   <Breadcrumb items={[
 *     { label: "Setup",   href: "/setup" },
 *     { label: "Groups",  href: "/setup/groups" },
 *     { label: "Finance Approvers" },
 *   ]} />
 */

import { ChevronRight } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb" className={cn("flex items-center gap-1 text-sm", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.href ?? item.label} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
            )}
            {isLast || !item.href ? (
              <span
                className={cn(
                  isLast
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            ) : (
              <a
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            )}
          </span>
        );
      })}
    </nav>
  );
}
