/**
 * NotificationMessage — One logical notification (fan-out root).
 *
 * A message is created when a domain event matches a notification rule.
 * It fans out to N deliveries (recipients × channels).
 */

import type {
    MessageId,
    RuleId,
    MessageStatus,
    NotificationPriority,
} from "../types.js";

export interface NotificationMessage {
    id: MessageId;
    tenantId: string;
    eventId: string;
    eventCode: string;
    ruleId: RuleId | null;
    templateKey: string;
    templateVersion: number;
    subject: string | null;
    payload: Record<string, unknown>;
    priority: NotificationPriority;
    status: MessageStatus;
    recipientCount: number;
    deliveredCount: number;
    failedCount: number;
    entityType: string | null;
    entityId: string | null;
    correlationId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    completedAt: Date | null;
    expiresAt: Date | null;
}

export interface CreateMessageInput {
    tenantId: string;
    eventId: string;
    eventCode: string;
    ruleId: RuleId | null;
    templateKey: string;
    templateVersion: number;
    subject: string | null;
    payload: Record<string, unknown>;
    priority: NotificationPriority;
    recipientCount: number;
    entityType?: string;
    entityId?: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
    expiresAt?: Date;
}

export interface UpdateMessageInput {
    status?: MessageStatus;
    deliveredCount?: number;
    failedCount?: number;
    completedAt?: Date;
    metadata?: Record<string, unknown>;
}
