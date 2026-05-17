"use client";

/**
 * AppShellLayout — client wrapper around ShellLayout.
 *
 * Workspace rail clicks navigate directly to landing pages. The collapsible side
 * panel is now reserved for utility drawers such as favourites and recent items.
 *
 * Notification count is fetched here (shared by both NavRail badge and AppTopbar bell)
 * using the same React Query key — the request is deduplicated automatically.
 *
 * Workbench theme is derived from bff.activeWorkbench and passed to AppNavRail.
 */

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ShellLayout } from "@athyper/shell";
import { FavoritesPanel, type FavoritesPanelTab } from "@athyper/collaboration-ui/bookmarks";
import { useBookmarksList } from "@athyper/query";
import { AppNavRail } from "./AppNavRail";
import { usePreferencesStore } from "@/stores/preferences/usePreferencesStore";
import { useShellSession } from "@/components/providers/SessionProvider";
import { getWorkbenchTheme } from "@/lib/workbench-theme";
import { useRecentTracker } from "@/hooks/useRecentTracker";
import {
  getRecentItems,
  removeRecentItem,
  RECENT_ITEMS_CHANGED_EVENT,
  RECENT_ITEMS_STORAGE_KEY,
  type RecentItem,
} from "@/lib/recent-items";

// ── Notification count (shared query key with AppTopbar) ─────────────────────
// Reads from the same cache key that AppTopbar writes via useNotificationCount
// and the SSE stream (useNotificationStream). No redundant polling here.

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
    staleTime: 300_000,
    refetchInterval: false,  // SSE stream in AppTopbar provides live updates
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

type UtilityPanelKey = "favorites" | "recent";

export function AppShellLayout({ topbar, banner, children }: AppShellLayoutProps) {
  const { bff } = useShellSession();
  const router = useRouter();
  const { sidebarCollapsed, setSidebarCollapsed } = usePreferencesStore();

  // Track every route visit into the recent items store (feeds launcher Recent tab)
  useRecentTracker();

  // Which utility panel the rail has opened.
  const [activePanelKey, setActivePanelKey] = useState<UtilityPanelKey | null>(null);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  // Notification count — deduped by RQ with AppTopbar
  const { data: notifData } = useUnreadCount(!!bff.activeOrg);
  const inboxCount = notifData?.count ?? 0;

  // Workspace icons navigate directly; the side panel is reserved for utilities.
  const panelOpen = !!activePanelKey && !sidebarCollapsed;
  const specialPanelMode = activePanelKey;
  const favoritesTab: FavoritesPanelTab = specialPanelMode === "recent" ? "recent" : "bookmarks";

  const {
    groups: bookmarkGroups,
    isLoading: bookmarksLoading,
    error: bookmarksError,
    removeBookmark,
    isRemoving: bookmarkRemoving,
  } = useBookmarksList({ enabled: panelOpen && !!specialPanelMode });

  // Workbench accent theme — drives active bar + module highlight colors
  const theme = getWorkbenchTheme(bff.activeWorkbench);

  const refreshRecentItems = useCallback(() => {
    setRecentItems(getRecentItems());
  }, []);

  useEffect(() => {
    refreshRecentItems();

    const onRecentChange = () => refreshRecentItems();
    const onStorage = (event: StorageEvent) => {
      if (event.key === RECENT_ITEMS_STORAGE_KEY) refreshRecentItems();
    };

    window.addEventListener(RECENT_ITEMS_CHANGED_EVENT, onRecentChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(RECENT_ITEMS_CHANGED_EVENT, onRecentChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshRecentItems]);

  const handleRecentDismiss = useCallback(
    (href: string) => {
      removeRecentItem(href);
      refreshRecentItems();
    },
    [refreshRecentItems],
  );

  const handleFavoritesTabChange = useCallback((tab: FavoritesPanelTab) => {
    setActivePanelKey(tab === "recent" ? "recent" : "favorites");
    setSidebarCollapsed(false);
  }, [setSidebarCollapsed]);

  const handlePanelChange = useCallback(
    (key: UtilityPanelKey | null) => {
      if (key === null) {
        setActivePanelKey(null);
        return;
      }
      if (key === activePanelKey) {
        setSidebarCollapsed(!sidebarCollapsed);
      } else {
        setActivePanelKey(key);
        setSidebarCollapsed(false);
      }
    },
    [activePanelKey, sidebarCollapsed, setSidebarCollapsed],
  );

  return (
    <ShellLayout
      rail={
        <AppNavRail
          activePanelKey={panelOpen ? activePanelKey : null}
          onPanelChange={handlePanelChange}
          inboxCount={inboxCount}
          accentColor={theme.accent}
        />
      }
      panel={
        specialPanelMode ? (
          <FavoritesPanel
            activeTab={favoritesTab}
            onTabChange={handleFavoritesTabChange}
            onClose={() => setSidebarCollapsed(true)}
            bookmarks={bookmarkGroups}
            bookmarksLoading={bookmarksLoading}
            bookmarksError={bookmarksError}
            recentItems={recentItems}
            onNavigate={(href) => router.push(href)}
            onRemoveBookmark={(item) => removeBookmark({
              entityCode: item.entityCode,
              recordId:   item.recordId,
            })}
            bookmarkActionPending={bookmarkRemoving}
            onDismissRecent={handleRecentDismiss}
          />
        ) : null
      }
      panelOpen={panelOpen}
      topbar={topbar}
      banner={banner}
    >
      {children}
    </ShellLayout>
  );
}
