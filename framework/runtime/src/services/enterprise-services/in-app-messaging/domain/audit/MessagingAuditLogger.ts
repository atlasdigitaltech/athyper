/**
 * MessagingAuditLogger - Audit trail for messaging operations
 *
 * Logs:
 * - Message lifecycle events (create, edit, delete)
 * - Access control decisions (grant, deny)
 * - Search queries
 * - Conversation management
 * - Participant changes
 *
 * Audit events are written to the kernel audit system for long-term retention.
 */

import type { MessageId, ConversationId } from "../types";

export type MessagingAuditEventType =
    | "message.sent"
    | "message.edited"
    | "message.deleted"
    | "message.read"
    | "conversation.created"
    | "conversation.updated"
    | "participant.added"
    | "participant.removed"
    | "search.executed"
    | "access.granted"
    | "access.denied"
    | "rate_limit.exceeded";

export interface MessagingAuditEvent {
    eventType: MessagingAuditEventType;
    tenantId: string;
    userId: string;
    timestamp: Date;
    conversationId?: ConversationId;
    messageId?: MessageId;
    metadata?: Record<string, unknown>;
    outcome: "success" | "failure";
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Audit logger interface
 * In production, this would integrate with your central audit system
 */
export class MessagingAuditLogger {
    /**
     * Log an audit event
     * In production, this should:
     * - Write to kernel audit writer
     * - Include correlation IDs for tracing
     * - Support batch writes for performance
     */
    async log(event: MessagingAuditEvent): Promise<void> {
        // TODO: Integrate with kernel audit writer
        // For now, log to console in structured format
        const auditLog = {
            service: "in-app-messaging",
            ...event,
            timestamp: event.timestamp.toISOString(),
        };

        console.log(`[AUDIT] ${JSON.stringify(auditLog)}`);

        // In production, write to audit database or stream to audit service
        // await this.kernelAuditWriter.write(auditLog);
    }

    /**
     * Log message sent event
     */
    async logMessageSent(
        tenantId: string,
        userId: string,
        conversationId: ConversationId,
        messageId: MessageId,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            eventType: "message.sent",
            tenantId,
            userId,
            conversationId,
            messageId,
            timestamp: new Date(),
            outcome: "success",
            metadata,
        });
    }

    /**
     * Log message edited event
     */
    async logMessageEdited(
        tenantId: string,
        userId: string,
        conversationId: ConversationId,
        messageId: MessageId,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            eventType: "message.edited",
            tenantId,
            userId,
            conversationId,
            messageId,
            timestamp: new Date(),
            outcome: "success",
            metadata,
        });
    }

    /**
     * Log message deleted event
     */
    async logMessageDeleted(
        tenantId: string,
        userId: string,
        conversationId: ConversationId,
        messageId: MessageId,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            eventType: "message.deleted",
            tenantId,
            userId,
            conversationId,
            messageId,
            timestamp: new Date(),
            outcome: "success",
            metadata,
        });
    }

    /**
     * Log search query
     */
    async logSearch(
        tenantId: string,
        userId: string,
        searchQuery: string,
        resultCount: number,
        conversationId?: ConversationId,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            eventType: "search.executed",
            tenantId,
            userId,
            conversationId,
            timestamp: new Date(),
            outcome: "success",
            metadata: {
                ...metadata,
                searchQuery,
                resultCount,
            },
        });
    }

    /**
     * Log access granted
     */
    async logAccessGranted(
        tenantId: string,
        userId: string,
        resource: string,
        action: string,
        conversationId?: ConversationId,
        messageId?: MessageId,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            eventType: "access.granted",
            tenantId,
            userId,
            conversationId,
            messageId,
            timestamp: new Date(),
            outcome: "success",
            metadata: {
                ...metadata,
                resource,
                action,
            },
        });
    }

    /**
     * Log access denied
     */
    async logAccessDenied(
        tenantId: string,
        userId: string,
        resource: string,
        action: string,
        reason: string,
        conversationId?: ConversationId,
        messageId?: MessageId,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            eventType: "access.denied",
            tenantId,
            userId,
            conversationId,
            messageId,
            timestamp: new Date(),
            outcome: "failure",
            reason,
            metadata: {
                ...metadata,
                resource,
                action,
            },
        });
    }

    /**
     * Log rate limit exceeded
     */
    async logRateLimitExceeded(
        tenantId: string,
        userId: string,
        limitType: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            eventType: "rate_limit.exceeded",
            tenantId,
            userId,
            timestamp: new Date(),
            outcome: "failure",
            reason: `Rate limit exceeded for ${limitType}`,
            metadata,
        });
    }

    /**
     * Log conversation created
     */
    async logConversationCreated(
        tenantId: string,
        userId: string,
        conversationId: ConversationId,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            eventType: "conversation.created",
            tenantId,
            userId,
            conversationId,
            timestamp: new Date(),
            outcome: "success",
            metadata,
        });
    }

    /**
     * Log participant added
     */
    async logParticipantAdded(
        tenantId: string,
        userId: string,
        conversationId: ConversationId,
        addedUserId: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            eventType: "participant.added",
            tenantId,
            userId,
            conversationId,
            timestamp: new Date(),
            outcome: "success",
            metadata: {
                ...metadata,
                addedUserId,
            },
        });
    }
}
