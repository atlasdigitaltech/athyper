"use client";

/**
 * AppShellLayout — client wrapper around ShellLayout.
 *
 * Owns the workspace selection state (which workspace icon was clicked in the
 * rail) and the panel-open state (derived from workspace selection + preference).
 *
 * State rules:
 *   - Clicking a new workspace → opens panel and sets that workspace as active
 *   - Clicking the same workspace again → toggles panel closed / open
 *   - Clicking a global action (home, inbox, search, settings) → closes panel
 *   - sidebarCollapsed preference → forces panel closed regardless of selection
 *
 * Notification count is fetched here (shared by both NavRail badge and AppTopbar bell)
 * using the same React Query key — the request is deduplicated automatically.
 *
 * Workbench theme is derived from bff.activeWorkbench and passed down to both
 * AppNavRail (active bar color) and AppContextPanel (module accent + page dots).
 */

import { useState, useCallback, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShellLayout } from "@athyper/shell";
import { AppNavRail } from "./AppNavRail";
import { AppContextPanel } from "./AppContextPanel";
import { usePreferencesStore } from "@/stores/preferences/usePreferencesStore";
import { useShellSession } from "@/components/providers/SessionProvider";
import { getWorkbenchTheme } from "@/lib/workbench-theme";
import { useRecentTracker } from "@/hooks/useRecentTracker";

// ── Notification count (shared query key with AppTopbar) ─────────────────────

function useUnreadCount(enabled: boolean) {
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

export interface AppShellLayoutProps {
  topbar: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}

export function AppShellLayout({ topbar, banner, children }: AppShellLayoutProps) {
  const { bff } = useShellSession();
  const { sidebarCollapsed, setSidebarCollapsed } = usePreferencesStore();

  // Track every route visit into the recent items store (feeds launcher Recent tab)
  useRecentTracker();

  // Which workspace key the rail has last selected
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState<string | null>(null);

  // Notification count — deduped by RQ with AppTopbar
  const { data: notifData } = useUnreadCount(!!bff.activeOrg);
  const inboxCount = notifData?.count ?? 0;

  // Panel is open when a workspace is selected AND the user hasn't collapsed it
  const panelOpen = !!activeWorkspaceKey && !sidebarCollapsed;

  // Workbench accent theme — drives active bar + module highlight colors
  const theme = getWorkbenchTheme(bff.activeWorkbench);

  const handleWorkspaceChange = useCallback(
    (key: string | null) => {
      if (key === null) {
        // Global action (home / inbox / settings) → close panel
        setActiveWorkspaceKey(null);
        return;
      }
      if (key === activeWorkspaceKey) {
        // Same workspace clicked → toggle panel
        setSidebarCollapsed(!sidebarCollapsed);
      } else {
        // New workspace → expand panel
        setActiveWorkspaceKey(key);
        setSidebarCollapsed(false);
      }
    },
    [activeWorkspaceKey, sidebarCollapsed, setSidebarCollapsed],
  );

  return (
    <ShellLayout
      rail={
        <AppNavRail
          activeWorkspaceKey={panelOpen ? activeWorkspaceKey : null}
          onWorkspaceChange={handleWorkspaceChange}
          inboxCount={inboxCount}
          accentColor={theme.accent}
        />
      }
      panel={
        <AppContextPanel
          activeWorkspaceKey={activeWorkspaceKey}
          onClose={() => setSidebarCollapsed(true)}
          inboxCount={inboxCount}
          accentColor={theme.accent}
        />
      }
      panelOpen={panelOpen}
      topbar={topbar}
      banner={banner}
    >
      {children}
    </ShellLayout>
  );
}
