/**
 * Messaging Event Emitter
 *
 * Simple in-memory event emitter for broadcasting messaging events.
 * Single-node only. For multi-node deployments, upgrade to Redis pub/sub.
 */

import { EventEmitter } from "events";

export type MessagingEventType =
    | "message.sent"
    | "message.edited"
    | "message.deleted"
    | "message.read"
    | "conversation.created"
    | "conversation.updated"
    | "participant.added"
    | "participant.removed"
    | "typing.started"
    | "typing.stopped";

export interface MessagingEvent {
    type: MessagingEventType;
    tenantId: string;
    conversationId: string;
    userId: string; // User who triggered the event
    messageId?: string;
    participantIds?: string[]; // Recipients who should receive this event
    timestamp: string;
    data?: Record<string, unknown>;
}

class MessagingEventEmitter extends EventEmitter {
    /**
     * Broadcast a messaging event to all participants in a conversation
     */
    broadcast(event: MessagingEvent): void {
        // If specific participants are provided, only emit to them
        if (event.participantIds && event.participantIds.length > 0) {
            event.participantIds.forEach(userId => {
                const userChannel = `${event.tenantId}:${userId}`;
                this.emit(userChannel, event);
            });
        } else {
            // Otherwise, emit to conversation channel (all connected participants will receive it)
            const conversationChannel = `conversation:${event.tenantId}:${event.conversationId}`;
            this.emit(conversationChannel, event);
        }

        // Also emit to tenant channel for admin dashboards (future use)
        const tenantChannel = `tenant:${event.tenantId}`;
        this.emit(tenantChannel, event);
    }

    /**
     * Subscribe to messaging events for a specific user
     * User will receive events from all their conversations
     */
    subscribeUser(tenantId: string, userId: string, handler: (event: MessagingEvent) => void): () => void {
        const channel = `${tenantId}:${userId}`;
        this.on(channel, handler);

        // Return unsubscribe function
        return () => {
            this.off(channel, handler);
        };
    }

    /**
     * Subscribe to events for a specific conversation
     * Useful for conversation-specific UI updates
     */
    subscribeConversation(
        tenantId: string,
        conversationId: string,
        handler: (event: MessagingEvent) => void
    ): () => void {
        const channel = `conversation:${tenantId}:${conversationId}`;
        this.on(channel, handler);

        // Return unsubscribe function
        return () => {
            this.off(channel, handler);
        };
    }
}

// Singleton instance
export const messagingEvents = new MessagingEventEmitter();

// Increase max listeners to handle many concurrent SSE connections
messagingEvents.setMaxListeners(1000);
