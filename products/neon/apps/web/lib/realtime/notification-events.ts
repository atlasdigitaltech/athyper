/**
 * Notification Event Emitter
 *
 * Simple in-memory event emitter for broadcasting notification events.
 * Single-node only. For multi-node deployments, upgrade to Redis pub/sub.
 */

import { EventEmitter } from "events";

export type NotificationEventType = "notification.new" | "notification.read" | "notification.dismissed";

export interface NotificationEvent {
    type: NotificationEventType;
    tenantId: string;
    userId: string;
    notificationId?: string;
    timestamp: string;
}

class NotificationEventEmitter extends EventEmitter {
    /**
     * Broadcast a notification event to all listeners
     */
    broadcast(event: NotificationEvent): void {
        // Emit to specific user channel
        const userChannel = `${event.tenantId}:${event.userId}`;
        this.emit(userChannel, event);

        // Also emit to tenant channel for admin dashboards (future use)
        const tenantChannel = `tenant:${event.tenantId}`;
        this.emit(tenantChannel, event);
    }

    /**
     * Subscribe to events for a specific user
     */
    subscribeUser(tenantId: string, userId: string, handler: (event: NotificationEvent) => void): () => void {
        const channel = `${tenantId}:${userId}`;
        this.on(channel, handler);

        // Return unsubscribe function
        return () => {
            this.off(channel, handler);
        };
    }
}

// Singleton instance
export const notificationEvents = new NotificationEventEmitter();

// Increase max listeners to handle many concurrent SSE connections
notificationEvents.setMaxListeners(1000);
