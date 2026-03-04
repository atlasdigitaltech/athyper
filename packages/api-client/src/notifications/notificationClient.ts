/**
 * Notifications API Client
 *
 * Clean wrapper around BFF notification routes.
 * Handles fetch, serialization, and error mapping.
 */

import type {
    ListNotificationsQuery,
    ListNotificationsResult,
    UnreadCountResult,
} from "./types";

type ApiResponse<T = unknown> = {
    success: boolean;
    data?: T;
    error?: { code: string; message: string };
};

export class NotificationApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public status?: number
    ) {
        super(message);
        this.name = "NotificationApiError";
    }
}

/**
 * List notifications with pagination and filters
 *
 * @param query - Query parameters
 * @returns Notifications list with pagination metadata
 * @throws NotificationApiError on failure
 */
export async function listNotifications(
    query?: ListNotificationsQuery
): Promise<ListNotificationsResult> {
    const params = new URLSearchParams();

    if (query?.limit) params.append("limit", query.limit.toString());
    if (query?.offset) params.append("offset", query.offset.toString());
    if (query?.unreadOnly) params.append("unreadOnly", "true");
    if (query?.category) params.append("category", query.category);

    const res = await fetch(`/api/notifications?${params}`, {
        method: "GET",
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse<ListNotificationsResult>;

    if (!res.ok || !data.success) {
        throw new NotificationApiError(
            data.error?.code ?? "UNKNOWN",
            data.error?.message ?? "Failed to fetch notifications",
            res.status
        );
    }

    return data.data as ListNotificationsResult;
}

/**
 * Get unread notification count
 *
 * @returns Unread count
 * @throws NotificationApiError on failure
 */
export async function getUnreadCount(): Promise<UnreadCountResult> {
    const res = await fetch("/api/notifications/unread-count", {
        method: "GET",
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse<UnreadCountResult>;

    if (!res.ok || !data.success) {
        throw new NotificationApiError(
            data.error?.code ?? "UNKNOWN",
            data.error?.message ?? "Failed to fetch unread count",
            res.status
        );
    }

    return data.data as UnreadCountResult;
}

/**
 * Mark a notification as read
 *
 * @param notificationId - Notification ID
 * @throws NotificationApiError on failure
 */
export async function markAsRead(notificationId: string): Promise<void> {
    const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "POST",
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse;

    if (!res.ok || !data.success) {
        throw new NotificationApiError(
            data.error?.code ?? "UNKNOWN",
            data.error?.message ?? "Failed to mark notification as read",
            res.status
        );
    }
}

/**
 * Mark all notifications as read
 *
 * @throws NotificationApiError on failure
 */
export async function markAllAsRead(): Promise<void> {
    const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse;

    if (!res.ok || !data.success) {
        throw new NotificationApiError(
            data.error?.code ?? "UNKNOWN",
            data.error?.message ?? "Failed to mark all notifications as read",
            res.status
        );
    }
}

/**
 * Dismiss a notification
 *
 * @param notificationId - Notification ID
 * @throws NotificationApiError on failure
 */
export async function dismissNotification(notificationId: string): Promise<void> {
    const res = await fetch(`/api/notifications/${notificationId}/dismiss`, {
        method: "POST",
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse;

    if (!res.ok || !data.success) {
        throw new NotificationApiError(
            data.error?.code ?? "UNKNOWN",
            data.error?.message ?? "Failed to dismiss notification",
            res.status
        );
    }
}
