/**
 * useMessagingStream - Client-side hook for real-time messaging events
 *
 * Subscribes to SSE endpoint and handles messaging events with auto-reconnect.
 */

import { useEffect, useRef } from "react";

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
    userId: string;
    messageId?: string;
    participantIds?: string[];
    timestamp: string;
    data?: Record<string, unknown>;
}

export interface MessagingStreamCallbacks {
    onMessageSent?: (event: MessagingEvent) => void;
    onMessageEdited?: (event: MessagingEvent) => void;
    onMessageDeleted?: (event: MessagingEvent) => void;
    onMessageRead?: (event: MessagingEvent) => void;
    onConversationCreated?: (event: MessagingEvent) => void;
    onConversationUpdated?: (event: MessagingEvent) => void;
    onParticipantAdded?: (event: MessagingEvent) => void;
    onParticipantRemoved?: (event: MessagingEvent) => void;
    onTypingStarted?: (event: MessagingEvent) => void;
    onTypingStopped?: (event: MessagingEvent) => void;
    onError?: (error: Event) => void;
}

export function useMessagingStream(callbacks: MessagingStreamCallbacks) {
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const callbacksRef = useRef(callbacks);

    // Update callbacks ref when they change
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

    useEffect(() => {
        let isMounted = true;

        function connect() {
            // Clean up existing connection
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }

            // Create new SSE connection
            const eventSource = new EventSource("/api/stream/messages");
            eventSourceRef.current = eventSource;

            // Connection opened
            eventSource.onopen = () => {
                console.log("[MessagingStream] Connected");
                reconnectAttemptsRef.current = 0; // Reset reconnect attempts
            };

            // Handle specific event types
            eventSource.addEventListener("message.sent", (e) => {
                const event: MessagingEvent = JSON.parse(e.data);
                callbacksRef.current.onMessageSent?.(event);
            });

            eventSource.addEventListener("message.edited", (e) => {
                const event: MessagingEvent = JSON.parse(e.data);
                callbacksRef.current.onMessageEdited?.(event);
            });

            eventSource.addEventListener("message.deleted", (e) => {
                const event: MessagingEvent = JSON.parse(e.data);
                callbacksRef.current.onMessageDeleted?.(event);
            });

            eventSource.addEventListener("message.read", (e) => {
                const event: MessagingEvent = JSON.parse(e.data);
                callbacksRef.current.onMessageRead?.(event);
            });

            eventSource.addEventListener("conversation.created", (e) => {
                const event: MessagingEvent = JSON.parse(e.data);
                callbacksRef.current.onConversationCreated?.(event);
            });

            eventSource.addEventListener("conversation.updated", (e) => {
                const event: MessagingEvent = JSON.parse(e.data);
                callbacksRef.current.onConversationUpdated?.(event);
            });

            eventSource.addEventListener("participant.added", (e) => {
                const event: MessagingEvent = JSON.parse(e.data);
                callbacksRef.current.onParticipantAdded?.(event);
            });

            eventSource.addEventListener("participant.removed", (e) => {
                const event: MessagingEvent = JSON.parse(e.data);
                callbacksRef.current.onParticipantRemoved?.(event);
            });

            eventSource.addEventListener("typing.started", (e) => {
                const event: MessagingEvent = JSON.parse(e.data);
                callbacksRef.current.onTypingStarted?.(event);
            });

            eventSource.addEventListener("typing.stopped", (e) => {
                const event: MessagingEvent = JSON.parse(e.data);
                callbacksRef.current.onTypingStopped?.(event);
            });

            // Heartbeat (keep-alive)
            eventSource.addEventListener("heartbeat", () => {
                // Just acknowledge - keeps connection alive
            });

            // Handle errors and reconnect
            eventSource.onerror = (error) => {
                console.error("[MessagingStream] Connection error:", error);
                callbacksRef.current.onError?.(error);

                eventSource.close();
                eventSourceRef.current = null;

                // Exponential backoff reconnect (max 30 seconds)
                if (isMounted) {
                    reconnectAttemptsRef.current++;
                    const delay = Math.min(
                        1000 * Math.pow(2, reconnectAttemptsRef.current),
                        30000
                    );

                    console.log(
                        `[MessagingStream] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`
                    );

                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (isMounted) {
                            connect();
                        }
                    }, delay);
                }
            };
        }

        // Initial connection
        connect();

        // Cleanup on unmount
        return () => {
            isMounted = false;

            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }

            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }, []); // Empty deps - only connect once on mount
}
