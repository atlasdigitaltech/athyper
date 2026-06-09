"use client";

import { useCallback } from "react";
import {
  FavoritesPanel,
  type FavoritesPanelTab,
  type FavoriteBookmarkItem,
  type FavoriteRecentItem,
} from "@athyper/collaboration-ui/bookmarks";
import { useBookmarksList, useRecentItems } from "@athyper/query";

interface FavoritesPanelContainerProps {
  activeTab: FavoritesPanelTab;
  onTabChange: (tab: FavoritesPanelTab) => void;
  onClose: () => void;
}

export function FavoritesPanelContainer({
  activeTab,
  onTabChange,
  onClose,
}: FavoritesPanelContainerProps) {
  const { groups, isLoading, error, removeBookmark, isRemoving } = useBookmarksList();
  const { items: recentItems, dismiss } = useRecentItems();

  const handleNavigate = useCallback(
    (href: string) => {
      window.location.assign(href);
      onClose();
    },
    [onClose],
  );

  const handleRemoveBookmark = useCallback(
    (item: FavoriteBookmarkItem) => {
      removeBookmark({ entityCode: item.entityCode, recordId: item.recordId });
    },
    [removeBookmark],
  );

  return (
    <FavoritesPanel
      activeTab={activeTab}
      onTabChange={onTabChange}
      onClose={onClose}
      bookmarks={groups}
      bookmarksLoading={isLoading}
      bookmarksError={error}
      recentItems={recentItems as FavoriteRecentItem[]}
      onNavigate={handleNavigate}
      onRemoveBookmark={handleRemoveBookmark}
      bookmarkActionPending={isRemoving}
      onDismissRecent={dismiss}
    />
  );
}
