/**
 * @athyper/shell — Sidebar
 *
 * Renders the navigation sidebar with:
 *   - Athyper logo at top
 *   - Navigation tree (provided by packages/navigation)
 *   - User section at bottom
 */
import { type ReactNode } from "react";
import { AthyperLogo } from "@athyper/icons";
import { Separator } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

export interface SidebarProps {
  navigation: ReactNode;
  userSection?: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ navigation, userSection, collapsed = false }: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={cn("flex h-14 items-center border-b border-sidebar-border px-4", collapsed && "justify-center")}>
        <AthyperLogo className="h-6 w-6 text-sidebar-primary" />
        {!collapsed && <span className="ml-2 text-sm font-semibold text-sidebar-foreground">Athyper</span>}
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
