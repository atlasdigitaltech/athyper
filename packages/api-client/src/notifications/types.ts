/**
 * Notification types for API client
 */

export interface Notification {
    id: string;
    tenantId: string;
    recipientId: string;
    senderId: string | null;
    channel: string;
    category: string | null;
    priority: string;
    title: string;
    body: string | null;
    icon: string | null;
    actionUrl: string | null;
    entityType: string | null;
    entityId: string | null;
    isRead: boolean;
    readAt: Date | null;
    isDismissed: boolean;
    dismissedAt: Date | null;
    expiresAt: Date | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    createdBy: string;
}

export interface ListNotificationsQuery {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    category?: string;
}

export interface ListNotificationsResult {
    items: Notification[];
    pagination: {
        limit: number;
        offset: number;
        count: number;
    };
}

export interface UnreadCountResult {
    count: number;
}
