/**
 * NotificationDlqEntry — Dead-letter queue entry for failed deliveries.
 *
 * Contains the full delivery payload for replay, tracks replay attempts.
 */

import type {
    DlqEntryId,
    ChannelCode,
    ErrorCategory,
} from "../types.js";

export interface NotificationDlqEntry {
    id: DlqEntryId;
    tenantId: string;
    deliveryId: string;
    messageId: string;
    channel: ChannelCode;
    providerCode: string;
    recipientId: string | null;
    recipientAddr: string;
    lastError: string | null;
    errorCategory: ErrorCategory | null;
    attemptCount: number;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    deadAt: Date;
    replayedAt: Date | null;
    replayedBy: string | null;
    replayCount: number;
    createdAt: Date;
}

export interface CreateDlqEntryInput {
    tenantId: string;
    deliveryId: string;
    messageId: string;
    channel: ChannelCode;
    providerCode: string;
    recipientId?: string;
    recipientAddr: string;
    lastError?: string;
    errorCategory?: ErrorCategory;
    attemptCount: number;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
