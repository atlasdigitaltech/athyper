import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface DrawerHeaderTitleProps {
  title: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  count?: number | null;
  className?: string;
}

/**
 * Canonical title treatment for list and record drawers.
 *
 * DrawerShell owns the header geometry; this component keeps icon, label,
 * count, typography, and colour identical across drawer families.
 */
export function DrawerHeaderTitle({
  title,
  icon: Icon,
  count,
  className,
}: DrawerHeaderTitleProps) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2 text-base font-medium leading-tight text-foreground",
        className,
      )}
    >
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
      <span className="truncate">{title}</span>
      {count != null && count > 0 && (
        <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border/60 bg-muted px-1.5 text-xs font-medium leading-none text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </span>
  );
}
