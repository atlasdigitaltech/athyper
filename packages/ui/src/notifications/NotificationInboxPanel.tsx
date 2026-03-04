/**
 * NotificationInboxPanel Component
 *
 * Sheet/drawer panel for displaying notification inbox.
 */

"use client";

import { useState } from "react";

import { ScrollArea } from "../primitives/ScrollArea";
import { Separator } from "../primitives/Separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../primitives/Sheet";

import { MarkAllReadButton } from "./MarkAllReadButton";
import { NotificationFilters } from "./NotificationFilters";
import { NotificationList } from "./NotificationList";

import type { Notification } from "@athyper/api-client";

export interface NotificationInboxPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: Notification[];
  isLoading?: boolean;
  unreadCount?: number;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => Promise<void>;
  onDismiss?: (id: string) => void;
  onNotificationClick?: (notification: Notification) => void;
  onRefresh?: () => void;
}

export function NotificationInboxPanel({
  open,
  onOpenChange,
  notifications,
  isLoading = false,
  unreadCount = 0,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  onNotificationClick,
}: NotificationInboxPanelProps) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<string | undefined>(undefined);

  // Extract unique categories from notifications
  const categories = Array.from(
    new Set(
      notifications
        .map((n) => n.category)
        .filter((c): c is string => c !== null && c !== undefined),
    ),
  );

  // Filter notifications based on current filters
  const filteredNotifications = notifications.filter((n) => {
    if (unreadOnly && n.isRead) return false;
    if (category && n.category !== category) return false;
    return true;
  });

  const hasUnread = unreadCount > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0">
        <SheetHeader className="px-4 pt-4 pb-3">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            {hasUnread
              ? `You have ${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}`
              : "You're all caught up"}
          </SheetDescription>
        </SheetHeader>

        <Separator />

        {/* Filters */}
        <NotificationFilters
          unreadOnly={unreadOnly}
          onUnreadOnlyChange={setUnreadOnly}
          category={category}
          onCategoryChange={setCategory}
          categories={categories}
        />

        <Separator />

        {/* Mark All Read Button */}
        {hasUnread && onMarkAllRead && (
          <div className="px-4 py-2 border-b border-border">
            <MarkAllReadButton
              onMarkAllRead={onMarkAllRead}
              disabled={isLoading}
            />
          </div>
        )}

        {/* Notification List */}
        <ScrollArea className="flex-1 h-[calc(100vh-200px)]">
          <NotificationList
            notifications={filteredNotifications}
            isLoading={isLoading}
            onMarkRead={onMarkRead}
            onDismiss={onDismiss}
            onNotificationClick={onNotificationClick}
            emptyMessage={
              unreadOnly
                ? "No unread notifications"
                : category
                  ? `No ${category} notifications`
                  : "No notifications"
            }
          />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
