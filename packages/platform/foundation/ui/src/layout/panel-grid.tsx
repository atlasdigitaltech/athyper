import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface PanelGridProps {
  children?: ReactNode;
  className?: string;
}

export function PanelGrid({ children, className }: PanelGridProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>
  );
}
