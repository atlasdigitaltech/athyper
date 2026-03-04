/**
 * NotificationDelivery — One delivery attempt per channel per recipient.
 *
 * Each delivery tracks the status of sending a single message
 * through a specific channel to a specific recipient.
 */

import type {
    DeliveryId,
    MessageId,
    ChannelCode,
    DeliveryStatus,
    ErrorCategory,
} from "../types.js";

export interface NotificationDelivery {
    id: DeliveryId;
    messageId: MessageId;
    tenantId: string;
    channel: ChannelCode;
    providerCode: string;
    recipientId: string | null;
    recipientAddr: string;
    status: DeliveryStatus;
    attemptCount: number;
    maxAttempts: number;
    lastError: string | null;
    errorCategory: ErrorCategory | null;
    externalId: string | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    openedAt: Date | null;
    clickedAt: Date | null;
    bouncedAt: Date | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date | null;
}

export interface CreateDeliveryInput {
    messageId: MessageId;
    tenantId: string;
    channel: ChannelCode;
    providerCode: string;
    recipientId?: string;
    recipientAddr: string;
    maxAttempts?: number;
    metadata?: Record<string, unknown>;
}

export interface UpdateDeliveryInput {
    status?: DeliveryStatus;
    attemptCount?: number;
    lastError?: string;
    errorCategory?: ErrorCategory;
    externalId?: string;
    sentAt?: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    bouncedAt?: Date;
    metadata?: Record<string, unknown>;
}
