/**
 * Broadcast notification event helper
 *
 * Server-side utility to broadcast notification events to SSE clients.
 */

import { notificationEvents, type NotificationEventType } from "./notification-events";

export function broadcastNotificationEvent(
    type: NotificationEventType,
    tenantId: string,
    userId: string,
    notificationId?: string
): void {
    notificationEvents.broadcast({
        type,
        tenantId,
        userId,
        notificationId,
        timestamp: new Date().toISOString(),
    });
}
