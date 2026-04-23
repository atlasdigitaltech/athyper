"use client";

/**
 * ListOverflowMenu — ⋯ overflow for list-level navigation shortcuts.
 *
 * Renders: Manage Access | Permission Log
 *
 * These are navigation shortcuts that open the entity's IAM/policy admin pages.
 * No state mutation — pure navigation.
 */

import { useState } from "react";
import { MoreHorizontal, Shield, ScrollText } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@athyper/theme/utils";

export interface ListOverflowMenuProps {
  entityCode: string;
  className?: string;
}

export function ListOverflowMenu({ entityCode, className }: ListOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const nav = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More list options"
        aria-expanded={open}
        className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[176px] rounded-lg border bg-popover py-1 shadow-md">
            <button
              onClick={() => nav(`/setup/policies?entity=${entityCode}`)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Shield className="h-3.5 w-3.5 shrink-0" />
              Manage Access
            </button>
            <button
              onClick={() => nav(`/setup/audit/events?entity=${entityCode}`)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ScrollText className="h-3.5 w-3.5 shrink-0" />
              Permission Log
            </button>
          </div>
        </>
      )}
    </div>
  );
}
