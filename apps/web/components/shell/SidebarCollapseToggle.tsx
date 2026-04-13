"use client";

/**
 * SidebarCollapseToggle — chevron button at the bottom of sidebar navigation.
 *
 * Reads and writes `sidebarCollapsed` from PreferencesStore.
 * Hidden on mobile (sidebar is drawer-based on small screens).
 */

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { usePreferencesStore } from "@/stores/preferences/usePreferencesStore";

export function SidebarCollapseToggle() {
  const { sidebarCollapsed, toggleSidebar } = usePreferencesStore();

  return (
    <div className="hidden px-3 pb-2 md:block">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs",
          "text-sidebar-foreground/50 transition-colors",
          "hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        )}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-4 w-4 shrink-0" />
        ) : (
          <>
            <PanelLeftClose className="h-4 w-4 shrink-0" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </div>
  );
}
