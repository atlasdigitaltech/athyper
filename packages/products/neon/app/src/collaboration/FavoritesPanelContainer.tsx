"use client";

import { useCallback } from "react";
import {
  FavoritesPanelContainer as SharedFavoritesPanelContainer,
  type FavoriteBookmarkItem,
  type FavoriteRecentItem,
  type FavoritesPanelContainerProps as SharedFavoritesPanelContainerProps,
} from "@athyper/platform-communications-collaboration-ui/bookmarks";
import {
  useBookmarksList,
  useRecentItems,
} from "@athyper/query";

type ShellProps = Pick<
  SharedFavoritesPanelContainerProps,
  "activeTab" | "onTabChange" | "onClose" | "navigate"
>;

export function FavoritesPanelContainer({
  ...props
}: ShellProps) {
  const { groups, isLoading, error, removeBookmark, isRemoving } = useBookmarksList();
  const { items, dismiss } = useRecentItems();
  const handleRemoveBookmark = useCallback((item: FavoriteBookmarkItem) => {
    removeBookmark({ entityCode: item.entityCode, recordId: item.recordId });
  }, [removeBookmark]);

  return (
    <SharedFavoritesPanelContainer
      {...props}
      bookmarks={groups}
      bookmarksLoading={isLoading}
      bookmarksError={error}
      recentItems={items as FavoriteRecentItem[]}
      onRemoveBookmark={handleRemoveBookmark}
      bookmarkActionPending={isRemoving}
      onDismissRecent={dismiss}
    />
  );
}
