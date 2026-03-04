/**
 * Helper function to broadcast messaging events
 *
 * Emits events to the in-memory EventEmitter for SSE delivery.
 */

import { messagingEvents, type MessagingEventType } from "./messaging-events";

export function broadcastMessagingEvent(
    type: MessagingEventType,
    tenantId: string,
    conversationId: string,
    userId: string,
    data?: {
        messageId?: string;
        participantIds?: string[];
        payload?: Record<string, unknown>;
    }
): void {
    messagingEvents.broadcast({
        type,
        tenantId,
        conversationId,
        userId,
        messageId: data?.messageId,
        participantIds: data?.participantIds,
        timestamp: new Date().toISOString(),
        data: data?.payload,
    });
}
