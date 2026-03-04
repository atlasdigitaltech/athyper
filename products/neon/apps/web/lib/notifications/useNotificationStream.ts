"use client";

/**
 * useNotificationStream hook
 *
 * Subscribes to SSE stream for real-time notification events.
 * Automatically reconnects on disconnect.
 */

import { useEffect, useRef, useCallback } from "react";

export type NotificationEventType = "notification.new" | "notification.read" | "notification.dismissed";

export interface NotificationStreamEvent {
    type: NotificationEventType;
    tenantId: string;
    userId: string;
    notificationId?: string;
    timestamp: string;
}

export interface UseNotificationStreamOptions {
    /**
     * Called when a new notification is received
     */
    onNotificationNew?: () => void;

    /**
     * Called when a notification is marked as read
     */
    onNotificationRead?: (notificationId: string) => void;

    /**
     * Called when a notification is dismissed
     */
    onNotificationDismissed?: (notificationId: string) => void;

    /**
     * Called on any event (for debugging)
     */
    onEvent?: (event: NotificationStreamEvent) => void;

    /**
     * Enable/disable the stream
     */
    enabled?: boolean;
}

export function useNotificationStream(options: UseNotificationStreamOptions = {}) {
    const {
        onNotificationNew,
        onNotificationRead,
        onNotificationDismissed,
        onEvent,
        enabled = true,
    } = options;

    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef(0);

    const connect = useCallback(() => {
        if (!enabled) return;

        // Clean up existing connection
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource("/api/stream/notifications");
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            console.log("[NotificationStream] Connected");
            reconnectAttemptsRef.current = 0;
        };

        eventSource.addEventListener("notification.new", (e) => {
            try {
                const event = JSON.parse(e.data) as NotificationStreamEvent;
                onEvent?.(event);
                onNotificationNew?.();
            } catch (err) {
                console.error("[NotificationStream] Failed to parse notification.new event:", err);
            }
        });

        eventSource.addEventListener("notification.read", (e) => {
            try {
                const event = JSON.parse(e.data) as NotificationStreamEvent;
                onEvent?.(event);
                if (event.notificationId) {
                    onNotificationRead?.(event.notificationId);
                }
            } catch (err) {
                console.error("[NotificationStream] Failed to parse notification.read event:", err);
            }
        });

        eventSource.addEventListener("notification.dismissed", (e) => {
            try {
                const event = JSON.parse(e.data) as NotificationStreamEvent;
                onEvent?.(event);
                if (event.notificationId) {
                    onNotificationDismissed?.(event.notificationId);
                }
            } catch (err) {
                console.error("[NotificationStream] Failed to parse notification.dismissed event:", err);
            }
        });

        eventSource.addEventListener("heartbeat", () => {
            // Heartbeat to keep connection alive - no action needed
        });

        eventSource.onerror = () => {
            console.warn("[NotificationStream] Connection error");
            eventSource.close();

            // Exponential backoff reconnect (max 30 seconds)
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
            reconnectAttemptsRef.current += 1;

            console.warn(`[NotificationStream] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

            reconnectTimeoutRef.current = setTimeout(() => {
                connect();
            }, delay);
        };
    }, [enabled, onNotificationNew, onNotificationRead, onNotificationDismissed, onEvent]);

    useEffect(() => {
        if (enabled) {
            connect();
        }

        return () => {
            // Clean up on unmount
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };
    }, [connect, enabled]);

    return {
        disconnect: () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        },
    };
}
