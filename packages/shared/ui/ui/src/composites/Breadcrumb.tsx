import { ChevronRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";

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
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-sm", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
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
