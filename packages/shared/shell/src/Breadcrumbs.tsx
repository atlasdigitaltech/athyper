import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  /** Stable key for React rendering; falls back to href then label. */
  id?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  const lastIndex = items.length - 1;

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-sm", className)}>
      {items.map((item, i) => {
        const isCurrent = i === lastIndex;
        return (
          <Fragment key={item.id ?? item.href ?? item.label}>
            {i > 0 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            {item.href && !isCurrent ? (
              <a href={item.href} className="text-muted-foreground transition-colors hover:text-foreground">
                {item.label}
              </a>
            ) : (
              <span aria-current={isCurrent ? "page" : undefined} className="font-medium text-foreground">
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
