import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";
import { resolveSemanticColors, type SemanticIntent } from "@athyper/platform-theme/semantic-colors";

export interface BoundaryBannerProps {
  title: string;
  children?: ReactNode;
  /** Semantic intent — drives colors and default aria role. Default: "warning". */
  intent?: SemanticIntent;
  /** Overrides the inferred aria role. */
  role?: string;
  className?: string;
}

export function BoundaryBanner({
  title,
  children,
  intent = "warning",
  role,
  className,
}: BoundaryBannerProps) {
  const colors = resolveSemanticColors(intent);
  const ariaRole = role ?? (intent === "error" || intent === "warning" ? "alert" : "status");

  return (
    <div
      role={ariaRole}
      className={cn(
        "flex items-baseline gap-2 rounded-md border px-3 py-2 text-xs",
        colors.subtleBadge,
        className,
      )}
    >
      <span className="shrink-0 font-medium">{title}</span>
      {children && <span>{children}</span>}
    </div>
  );
}
