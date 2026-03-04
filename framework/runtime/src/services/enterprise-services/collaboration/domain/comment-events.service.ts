/**
 * Comment Events Service
 *
 * Manages Server-Sent Events (SSE) for real-time comment updates.
 * Broadcasts comment creation, updates, and deletions to connected clients.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type { EntityComment } from "../types.js";

/**
 * SSE Client Connection
 */
interface SSEClient {
  id: string;
  tenantId: string;
  userId: string;
  entityType?: string;
  entityId?: string;
  response: any; // Express Response object
  lastEventId?: string;
}

/**
 * Comment Event Type
 */
export type CommentEventType = "comment_created" | "comment_updated" | "comment_deleted" | "reply_created";

/**
 * Comment Event Payload
 */
export interface CommentEvent {
  type: CommentEventType;
  tenantId: string;
  entityType: string;
  entityId: string;
  commentId: string;
  parentCommentId?: string;
  comment?: Partial<EntityComment>;
  timestamp: string;
}

/**
 * Comment Events Service
 *
 * Manages SSE connections and broadcasts comment events.
 */
export class CommentEventsService {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(private readonly logger: Logger) {
    // Start heartbeat to keep connections alive
    this.startHeartbeat();
  }

  /**
   * Register a new SSE client
   */
  registerClient(
    tenantId: string,
    userId: string,
    response: any,
    options?: {
      entityType?: string;
      entityId?: string;
    }
  ): string {
    const clientId = crypto.randomUUID();

    // Set SSE headers
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    });

    // Send initial connection event
    this.sendEvent(response, {
      type: "connected",
      data: { clientId, timestamp: new Date().toISOString() },
    });

    const client: SSEClient = {
      id: clientId,
      tenantId,
      userId,
      entityType: options?.entityType,
      entityId: options?.entityId,
      response,
    };

    this.clients.set(clientId, client);

    this.logger.info(
      {
        clientId,
        tenantId,
        userId,
        entityType: options?.entityType,
        entityId: options?.entityId,
        totalClients: this.clients.size,
      },
      "[collab] SSE client connected"
    );

    // Handle client disconnect
    response.on("close", () => {
      this.unregisterClient(clientId);
    });

    return clientId;
  }

  /**
   * Unregister an SSE client
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);

    this.logger.info(
      {
        clientId,
        totalClients: this.clients.size,
      },
      "[collab] SSE client disconnected"
    );
  }

  /**
   * Broadcast comment event to relevant clients
   */
  broadcast(event: CommentEvent): void {
    let sentCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      // Filter by tenant
      if (client.tenantId !== event.tenantId) continue;

      // Filter by entity (if client is subscribed to specific entity)
      if (client.entityType && client.entityType !== event.entityType) continue;
      if (client.entityId && client.entityId !== event.entityId) continue;

      try {
        this.sendEvent(client.response, {
          type: event.type,
          data: event,
        });
        sentCount++;
      } catch (err) {
        this.logger.error(
          { clientId, error: String(err) },
          "[collab] Failed to send SSE event"
        );
        // Remove failed client
        this.unregisterClient(clientId);
      }
    }

    this.logger.debug(
      {
        eventType: event.type,
        commentId: event.commentId,
        sentCount,
        totalClients: this.clients.size,
      },
      "[collab] Comment event broadcasted"
    );
  }

  /**
   * Send SSE event to a client
   */
  private sendEvent(response: any, event: { type: string; data: any }): void {
    const eventId = crypto.randomUUID();
    response.write(`id: ${eventId}\n`);
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event.data)}\n\n`);
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      for (const [clientId, client] of this.clients.entries()) {
        try {
          this.sendEvent(client.response, {
            type: "heartbeat",
            data: { timestamp: new Date().toISOString() },
          });
        } catch (err) {
          this.logger.warn(
            { clientId, error: String(err) },
            "[collab] Heartbeat failed, removing client"
          );
          this.unregisterClient(clientId);
        }
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop heartbeat (cleanup on shutdown)
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get active client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients for a specific entity
   */
  getEntityClientCount(tenantId: string, entityType: string, entityId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (
        client.tenantId === tenantId &&
        client.entityType === entityType &&
        client.entityId === entityId
      ) {
        count++;
      }
    }
    return count;
  }
}
