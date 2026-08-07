"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface StudioScreenProps {
  /**
   * Left-hand sidebar — layers, entity tree, field palette, or component list.
   * Visible from ≥lg.
   */
  sidebar?: ReactNode;
  /**
   * Width of the sidebar panel. Accepts any CSS length value.
   * Default: "240px". Narrower than the properties panel by design —
   * studio sidebars list items while properties panels edit them.
   */
  sidebarWidth?: string;
  /**
   * Right-hand properties panel — field properties, style overrides, preview.
   * Visible from ≥xl (one breakpoint wider than sidebar so the canvas gets
   * maximum space at laptop widths).
   */
  properties?: ReactNode;
  /** Width of the properties panel. Default: "280px". */
  propertiesWidth?: string;
  /**
   * Central canvas — design surface, schema diagram, report preview.
   * Uses overflow-hidden; the canvas manages its own pan/zoom viewport.
   */
  children: ReactNode;
  className?: string;
}

export function StudioScreen({
  sidebar,
  sidebarWidth = "240px",
  properties,
  propertiesWidth = "280px",
  children,
  className,
}: StudioScreenProps) {
  // Memoized to avoid creating new style objects on every render — style prop
  // identity changes force DOM style writes even when values are unchanged.
  const sidebarStyle = useMemo<CSSProperties>(
    () => ({ width: sidebarWidth, minWidth: sidebarWidth }),
    [sidebarWidth],
  );
  const propertiesStyle = useMemo<CSSProperties>(
    () => ({ width: propertiesWidth, minWidth: propertiesWidth }),
    [propertiesWidth],
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-row", className)}>
      {sidebar && (
        <aside
          style={sidebarStyle}
          className="hidden shrink-0 overflow-y-auto border-r bg-background lg:flex lg:flex-col"
        >
          {sidebar}
        </aside>
      )}

      {/* overflow-hidden: the canvas manages its own scroll/zoom transform. */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>

      {properties && (
        <aside
          style={propertiesStyle}
          className="hidden shrink-0 overflow-y-auto border-l bg-background xl:flex xl:flex-col"
        >
          {properties}
        </aside>
      )}
    </div>
  );
}
