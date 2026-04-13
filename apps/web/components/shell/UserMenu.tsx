"use client";

/**
 * UserMenu — sidebar bottom user widget with dropdown.
 *
 * Shows initials avatar + display name. Clicking opens a dropdown with:
 *   - User info block (name + email)
 *   - Settings link
 *   - Help / keyboard shortcuts (placeholder)
 *   - Sign out
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2,
  HelpCircle,
  LogOut,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { useShellSession } from "@/components/providers/SessionProvider";

export function UserMenu() {
  const { bff } = useShellSession();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initials = bff.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n.charAt(0).toUpperCase())
    .join("");

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Parse the active org alias into a readable label: "athyper--main" → "athyper / main"
  const orgLabel = bff.activeOrg ? bff.activeOrg.replace("--", " / ") : null;

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Dropdown — opens downward (topbar placement) */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl border bg-popover shadow-xl">
          {/* Identity block */}
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{bff.displayName}</p>
              {bff.email && (
                <p className="truncate text-[11px] text-muted-foreground">{bff.email}</p>
              )}
            </div>
          </div>

          {/* Org context */}
          {orgLabel && (
            <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-[11px] text-muted-foreground">{orgLabel}</span>
            </div>
          )}

          {/* Menu items */}
          <div className="py-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-muted/60"
            >
              <User className="h-4 w-4 text-muted-foreground" />
              Profile &amp; Settings
            </Link>
            <Link
              href="/settings?section=identity"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-muted/60"
            >
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Identity &amp; Access
            </Link>
            <Link
              href="/settings?section=preferences"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-muted/60"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              Preferences
            </Link>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-muted/60"
              onClick={() => setOpen(false)}
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              Help &amp; Shortcuts
            </button>
          </div>

          <div className="border-t py-1">
            <a
              href="/logout"
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/5"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </a>
          </div>
        </div>
      )}

      {/* Trigger — compact avatar for topbar placement */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground outline-none transition-all hover:opacity-80",
          open && "ring-2 ring-inset ring-white/25",
        )}
      >
        {initials}
      </button>
    </div>
  );
}
