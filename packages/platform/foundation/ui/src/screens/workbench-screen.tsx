"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface WorkbenchScreenProps {
  /**
   * Right-hand inspector / properties panel.
   * Hidden on narrow viewports; visible from ≥lg.
   */
  inspector?: ReactNode;
  /**
   * Width of the inspector panel. Accepts any CSS length value.
   * Default: "320px". Override per-workbench (e.g. "400px" for a wide grid).
   */
  inspectorWidth?: string;
  /** Primary editing canvas — occupies all remaining space. */
  children: ReactNode;
  className?: string;
}

export function WorkbenchScreen({
  inspector,
  inspectorWidth = "320px",
  children,
  className,
}: WorkbenchScreenProps) {
  // Memoized to avoid creating a new style object on every render — style
  // prop identity changes force a DOM style write even when values are equal.
  const inspectorStyle = useMemo<CSSProperties>(
    () => ({ width: inspectorWidth, minWidth: inspectorWidth }),
    [inspectorWidth],
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-row", className)}>
      <div className="flex-1 overflow-auto">
        {children}
      </div>

      {inspector && (
        <aside
          style={inspectorStyle}
          className="hidden shrink-0 overflow-y-auto border-l bg-background lg:flex lg:flex-col"
        >
          {inspector}
        </aside>
      )}
    </div>
  );
}
