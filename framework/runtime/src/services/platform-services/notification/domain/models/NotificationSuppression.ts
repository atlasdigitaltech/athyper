/**
 * NotificationSuppression — Hard bounces, opt-outs, compliance blocks.
 *
 * When an address is suppressed for a channel, deliveries to that
 * address on that channel are silently skipped by PreferenceEvaluator.
 */

import type {
    SuppressionId,
    ChannelCode,
    SuppressionReason,
    SuppressionSource,
} from "../types.js";

export interface NotificationSuppression {
    id: SuppressionId;
    tenantId: string;
    channel: ChannelCode;
    address: string;
    reason: SuppressionReason;
    source: SuppressionSource | null;
    providerCode: string | null;
    metadata: Record<string, unknown> | null;
    suppressedAt: Date;
    expiresAt: Date | null;
    createdByPrincipalId: string | null;
    createdByService: string | null;
}

export interface CreateSuppressionInput {
    tenantId: string;
    channel: ChannelCode;
    address: string;
    reason: SuppressionReason;
    source?: SuppressionSource;
    providerCode?: string;
    metadata?: Record<string, unknown>;
    expiresAt?: Date;
    createdByPrincipalId?: string;
    createdByService?: string;
}
