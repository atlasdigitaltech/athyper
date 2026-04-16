import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@athyper/theme/utils";

export interface ActionLinkCardProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind text-color class for the icon, e.g. "text-primary". */
  iconClass?: string;
  /** Tailwind bg class for the icon container, e.g. "bg-primary/10". */
  iconBgClass?: string;
  /**
   * "horizontal" (default) — icon left, text right. Used for workspace launchers.
   * "vertical" — icon top, text below. Used for wide-grid workbench cards.
   */
  layout?: "horizontal" | "vertical";
}

export function ActionLinkCard({
  href,
  title,
  description,
  icon: Icon,
  iconClass = "text-muted-foreground",
  iconBgClass = "bg-muted",
  layout = "horizontal",
}: ActionLinkCardProps) {
  const isVertical = layout === "vertical";

  return (
    <Link
      href={href}
      className={cn(
        "group rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 hover:border-border/80",
        isVertical ? "flex flex-col gap-3" : "flex items-start gap-3",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md",
          isVertical ? "h-10 w-10" : "mt-0.5 h-9 w-9",
          iconBgClass,
        )}
      >
        <Icon className={cn("h-5 w-5", iconClass)} />
      </div>

      <div className={cn("min-w-0", !isVertical && "flex-1")}>
        <p className="text-sm font-medium">{title}</p>
        <p className={cn("mt-0.5 text-xs text-muted-foreground", isVertical && "leading-relaxed")}>
          {description}
        </p>
      </div>

      <ArrowRight
        className={cn(
          "h-3.5 w-3.5 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100",
          isVertical ? "mt-auto" : "mt-1 shrink-0",
        )}
      />
    </Link>
  );
}
