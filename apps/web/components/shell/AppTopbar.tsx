"use client";

/**
 * AppTopbar — client wrapper around the shell Topbar.
 *
 * Simplified in Phase 1 (Universal Launcher):
 *   - QuickCreateMenu retired — launcher handles all create actions (Create tab)
 *   - Scope chips (Co / FY) moved out — belong in workbench context header
 *   - Help icon removed — re-add when real help content is available
 *
 * Live behaviour:
 *   - Notification unread count (polled every 60s)
 *   - ⌘K / Ctrl+K toggles universal launcher
 *   - "athyper:open-palette" custom event (from NavRail search icon)
 */

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { NeonIcon } from "@athyper/brand";
import { Topbar } from "@athyper/shell";
import { useShellSession } from "@/components/providers/SessionProvider";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { NotifPanel } from "@/components/shell/NotifPanel";

// ── Notification count ────────────────────────────────────────────────────────

function useNotificationCount(enabled: boolean) {
  return useQuery<{ count: number }>({
    queryKey: ["notifications", "unread-count"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/notifications/unread-count", {
        signal,
        cache: "no-store",
      });
      if (!res.ok) return { count: 0 };
      return res.json() as Promise<{ count: number }>;
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    throwOnError: false,
    placeholderData: { count: 0 },
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface AppTopbarProps {
  /** Entity selector dropdown slot (EntitySelector component). */
  tenantSlot?: ReactNode;
  /** Workbench toggle pills (WorkbenchToggle component). */
  workbenchToggle?: ReactNode;
  /** Delegation indicator pill (DelegationIndicator component). */
  delegationIndicator?: ReactNode;
  /** Avatar / user menu slot (UserMenu component). */
  userSlot?: ReactNode;
  /** Called when mobile hamburger is tapped. */
  onMenuToggle?: () => void;
}

export function AppTopbar({
  tenantSlot,
  workbenchToggle,
  delegationIndicator,
  userSlot,
  onMenuToggle,
}: AppTopbarProps) {
  const { bff, runtime } = useShellSession();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: unreadData } = useNotificationCount(!!bff.activeOrg);

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Custom event from NavRail "Search" icon
  useEffect(() => {
    function onOpenPalette() {
      setPaletteOpen(true);
    }
    window.addEventListener("athyper:open-palette", onOpenPalette);
    return () => window.removeEventListener("athyper:open-palette", onOpenPalette);
  }, []);

  const brandSlot = (
    <Link
      href="/home"
      className="flex items-center gap-1.5 outline-none"
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary p-1 text-primary-foreground">
        <NeonIcon className="h-full w-full" />
      </div>
      <span className="hidden text-sm font-semibold tracking-tight lg:block">neon</span>
    </Link>
  );

  return (
    <>
      <Topbar
        onMenuToggle={onMenuToggle}
        brandSlot={brandSlot}
        tenantSlot={tenantSlot}
        workbenchToggle={workbenchToggle}
        delegationIndicator={delegationIndicator}
        onSearchClick={() => setPaletteOpen(true)}
        notificationCount={unreadData?.count ?? 0}
        onNotificationClick={() => setNotifOpen((v) => !v)}
        userSlot={userSlot}
      />

      {/* Notification panel */}
      <div className="relative">
        <NotifPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      </div>

      {/* Universal launcher */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        modules={runtime?.modules ?? []}
      />
    </>
  );
}
