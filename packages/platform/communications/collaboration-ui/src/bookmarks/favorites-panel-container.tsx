"use client";

import { useCallback } from "react";
import {
  FavoritesPanel,
  type FavoriteBookmarkGroup,
  type FavoritesPanelTab,
  type FavoriteBookmarkItem,
  type FavoriteRecentItem,
} from "./favorites-panel";

export interface FavoritesPanelContainerProps {
  activeTab: FavoritesPanelTab;
  onTabChange: (tab: FavoritesPanelTab) => void;
  onClose: () => void;
  navigate: (href: string) => void;
  bookmarks: FavoriteBookmarkGroup[];
  bookmarksLoading?: boolean;
  bookmarksError?: unknown;
  recentItems: FavoriteRecentItem[];
  onRemoveBookmark: (item: FavoriteBookmarkItem) => void;
  bookmarkActionPending?: boolean;
  onDismissRecent: (href: string) => void;
}

/**
 * Shared controller for the shell Favorites panel. Plane apps inject routing
 * and their configured BFF request so navigation and CSRF remain plane-aware.
 */
export function FavoritesPanelContainer({
  activeTab,
  onTabChange,
  onClose,
  navigate,
  bookmarks,
  bookmarksLoading,
  bookmarksError,
  recentItems,
  onRemoveBookmark,
  bookmarkActionPending,
  onDismissRecent,
}: FavoritesPanelContainerProps) {
  const handleNavigate = useCallback((href: string) => {
    navigate(href);
    onClose();
  }, [navigate, onClose]);

  return (
    <FavoritesPanel
      activeTab={activeTab}
      onTabChange={onTabChange}
      onClose={onClose}
      bookmarks={bookmarks}
      bookmarksLoading={bookmarksLoading}
      bookmarksError={bookmarksError}
      recentItems={recentItems}
      onNavigate={handleNavigate}
      onRemoveBookmark={onRemoveBookmark}
      bookmarkActionPending={bookmarkActionPending}
      onDismissRecent={onDismissRecent}
    />
  );
}
