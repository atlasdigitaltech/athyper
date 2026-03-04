"use client";

/**
 * useNotifications hook
 *
 * Fetches and manages notifications with SWR.
 * Provides optimistic updates for read/dismiss actions.
 */

import { listNotifications, markAsRead, markAllAsRead, dismissNotification } from "@athyper/api-client";
import { useCallback } from "react";
import useSWR from "swr";

import type { ListNotificationsQuery, ListNotificationsResult } from "@athyper/api-client";

interface UseNotificationsOptions extends ListNotificationsQuery {
    /**
     * Poll interval in milliseconds (default: 30000ms = 30s)
     */
    refreshInterval?: number;
}

export function useNotifications(options?: UseNotificationsOptions) {
    const {
        limit = 50,
        offset = 0,
        unreadOnly,
        category,
        refreshInterval = 30000,
    } = options ?? {};

    // Build cache key from query params
    const cacheKey = ["/api/notifications", limit, offset, unreadOnly, category].filter(Boolean).join(":");

    const { data, error, mutate, isLoading } = useSWR<ListNotificationsResult>(
        cacheKey,
        () => listNotifications({ limit, offset, unreadOnly, category }),
        {
            refreshInterval,
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
        }
    );

    /**
     * Mark a notification as read with optimistic update
     */
    const markRead = useCallback(
        async (notificationId: string) => {
            if (!data) return;

            // Optimistic update
            await mutate(
                {
                    ...data,
                    items: data.items.map((item) =>
                        item.id === notificationId
                            ? { ...item, isRead: true, readAt: new Date() }
                            : item
                    ),
                },
                false
            );

            try {
                await markAsRead(notificationId);
                // Revalidate to ensure consistency
                await mutate();
            } catch (err) {
                // Revert on error
                await mutate();
                throw err;
            }
        },
        [data, mutate]
    );

    /**
     * Mark all notifications as read with optimistic update
     */
    const markAllRead = useCallback(async () => {
        if (!data) return;

        const now = new Date();

        // Optimistic update
        await mutate(
            {
                ...data,
                items: data.items.map((item) => ({
                    ...item,
                    isRead: true,
                    readAt: now,
                })),
            },
            false
        );

        try {
            await markAllAsRead();
            // Revalidate to ensure consistency
            await mutate();
        } catch (err) {
            // Revert on error
            await mutate();
            throw err;
        }
    }, [data, mutate]);

    /**
     * Dismiss a notification with optimistic update
     */
    const dismiss = useCallback(
        async (notificationId: string) => {
            if (!data) return;

            // Optimistic update - remove from list
            await mutate(
                {
                    ...data,
                    items: data.items.filter((item) => item.id !== notificationId),
                    pagination: {
                        ...data.pagination,
                        count: data.pagination.count - 1,
                    },
                },
                false
            );

            try {
                await dismissNotification(notificationId);
                // Revalidate to ensure consistency
                await mutate();
            } catch (err) {
                // Revert on error
                await mutate();
                throw err;
            }
        },
        [data, mutate]
    );

    /**
     * Refresh notifications manually
     */
    const refresh = useCallback(() => mutate(), [mutate]);

    return {
        notifications: data?.items ?? [],
        pagination: data?.pagination,
        isLoading,
        error,
        markRead,
        markAllRead,
        dismiss,
        refresh,
    };
}
