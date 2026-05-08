"use client";

/**
 * WorkbenchToggle — inline workbench switcher in the topbar
 *
 * Renders only when the active org has 2+ allowed workbenches.
 * Displays as a compact pill-group (segmented control style).
 *
 * On toggle: calls SessionProvider.switchContext(activeOrg, newWorkbench)
 * which PATCHes the BFF session and re-fetches the runtime session.
 */

import { useState } from "react";
import { cn } from "@athyper/theme/utils";
import { getWorkbenchLabel } from "@/lib/auth/workbench-config";
import { useShellSession } from "@/components/providers/SessionProvider";

const WORKBENCH_ORDER: Record<string, number> = {
  user:    0,
  partner: 1,
  admin:   2,
};

export function WorkbenchToggle() {
  const { bff, switchContext } = useShellSession();
  const { organizations, activeOrg, activeWorkbench } = bff;

  const [switching, setSwitching] = useState(false);

  // Only render when there are 2+ workbenches for the active org
  if (!activeOrg) return null;
  const org = organizations[activeOrg];
  if (!org || org.roles.length < 2) return null;
  const orderedRoles = [...org.roles].sort(
    (a, b) => (WORKBENCH_ORDER[a] ?? 99) - (WORKBENCH_ORDER[b] ?? 99),
  );

  async function handleSwitch(workbench: string) {
    if (!activeOrg || workbench === activeWorkbench || switching) return;
    setSwitching(true);
    try {
      await switchContext(activeOrg, workbench);
    } catch {
      // Revert is automatic — context stays unchanged on error
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div
      role="group"
      aria-label="Switch workbench"
      className={cn(
        "flex items-center rounded-md border bg-muted/40 p-0.5",
        switching && "opacity-60 pointer-events-none",
      )}
    >
      {orderedRoles.map((role) => {
        const isActive = role === activeWorkbench;
        return (
          <button
            key={role}
            role="radio"
            aria-checked={isActive}
            onClick={() => handleSwitch(role)}
            className={cn(
              "rounded px-2.5 py-0.5 text-xs font-medium transition-all duration-150",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {getWorkbenchLabel(role)}
          </button>
        );
      })}
    </div>
  );
}
