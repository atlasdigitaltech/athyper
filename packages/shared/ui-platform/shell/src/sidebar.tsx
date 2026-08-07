/**
 * @athyper/shell — Sidebar
 *
 * Renders the navigation sidebar with:
 *   - Athyper logo + optional collapse toggle at top
 *   - Navigation tree (provided by packages/navigation)
 *   - User section at bottom
 */
import { type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { AthyperLogo } from "@athyper/platform-brand";
import { Separator } from "@athyper/platform-ui/primitives";
import { cn } from "@athyper/platform-theme/utils";

export interface SidebarProps {
  navigation: ReactNode;
  userSection?: ReactNode;
  collapsed?: boolean;
  /** When provided, a collapse/expand button is rendered in the header. */
  onToggle?: () => void;
}

export function Sidebar({ navigation, userSection, collapsed = false, onToggle }: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header: logo + optional collapse toggle */}
      <div className={cn("flex h-14 items-center border-b border-sidebar-border px-4", collapsed && "justify-center")}>
        <AthyperLogo className="h-6 w-6 shrink-0 text-sidebar-primary" />
        {!collapsed && (
          <span className="ml-2 flex-1 text-sm font-medium text-sidebar-foreground">
            Athyper
          </span>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "ml-auto rounded p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              collapsed && "ml-0",
            )}
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform duration-200", collapsed && "rotate-180")} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {navigation}
      </nav>

      {/* User section */}
      {userSection && (
        <>
          <Separator className="bg-sidebar-border" />
          <div className="p-3">
            {userSection}
          </div>
        </>
      )}
    </div>
  );
}

