import { useEffect, useState, useRef } from "react";

/**
 * Comment Event Type
 */
type CommentEventType = "comment_created" | "comment_updated" | "comment_deleted" | "reply_created";

/**
 * Comment Event
 */
interface CommentEvent {
  type: CommentEventType;
  tenantId: string;
  entityType: string;
  entityId: string;
  commentId: string;
  parentCommentId?: string;
  comment?: any;
  timestamp: string;
}

/**
 * Use Comment Events Hook
 *
 * Subscribes to Server-Sent Events (SSE) for real-time comment updates.
 */
export function useCommentEvents(entityType: string, entityId: string, onEvent?: (event: CommentEvent) => void) {
  const [hasNewComments, setHasNewComments] = useState(false);
  const [newCommentCount, setNewCommentCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Construct SSE URL
    const url = `/api/collab/events/stream?entityType=${encodeURIComponent(
      entityType
    )}&entityId=${encodeURIComponent(entityId)}`;

    // Create EventSource connection
    const eventSource = new EventSource(url, {
      withCredentials: true,
    });

    eventSourceRef.current = eventSource;

    // Handle connection opened
    eventSource.addEventListener("connected", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      console.log("[SSE] Connected:", data);
    });

    // Handle heartbeat
    eventSource.addEventListener("heartbeat", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      console.log("[SSE] Heartbeat:", data.timestamp);
    });

    // Handle comment created
    eventSource.addEventListener("comment_created", (e) => {
      const event: CommentEvent = JSON.parse((e as MessageEvent).data);
      console.log("[SSE] Comment created:", event);
      setHasNewComments(true);
      setNewCommentCount((prev) => prev + 1);
      onEvent?.(event);
    });

    // Handle reply created
    eventSource.addEventListener("reply_created", (e) => {
      const event: CommentEvent = JSON.parse((e as MessageEvent).data);
      console.log("[SSE] Reply created:", event);
      setHasNewComments(true);
      setNewCommentCount((prev) => prev + 1);
      onEvent?.(event);
    });

    // Handle comment updated
    eventSource.addEventListener("comment_updated", (e) => {
      const event: CommentEvent = JSON.parse((e as MessageEvent).data);
      console.log("[SSE] Comment updated:", event);
      onEvent?.(event);
    });

    // Handle comment deleted
    eventSource.addEventListener("comment_deleted", (e) => {
      const event: CommentEvent = JSON.parse((e as MessageEvent).data);
      console.log("[SSE] Comment deleted:", event);
      onEvent?.(event);
    });

    // Handle connection errors
    eventSource.onerror = (error) => {
      console.error("[SSE] Connection error:", error);
      // EventSource will automatically reconnect
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [entityType, entityId, onEvent]);

  /**
   * Clear "new comments" indicator
   */
  const clearNewComments = () => {
    setHasNewComments(false);
    setNewCommentCount(0);
  };

  return {
    hasNewComments,
    newCommentCount,
    clearNewComments,
  };
}
