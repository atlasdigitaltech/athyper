/**
 * Delivery Policy — retry/backoff configuration + outbox item model.
 */

export interface DeliveryPolicy {
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
    timeoutMs: number;
}

export const DEFAULT_DELIVERY_POLICY: DeliveryPolicy = {
    maxRetries: 3,
    backoffMs: 1000,
    backoffMultiplier: 2,
    maxBackoffMs: 60_000,
    timeoutMs: 30_000,
};

/**
 * Compute next retry timestamp with exponential backoff + jitter.
 */
export function computeNextRetryAt(
    retryCount: number,
    policy: DeliveryPolicy,
): Date {
    const baseDelay = policy.backoffMs * Math.pow(policy.backoffMultiplier, retryCount);
    const cappedDelay = Math.min(baseDelay, policy.maxBackoffMs);
    const jitter = cappedDelay * Math.random() * 0.25;
    return new Date(Date.now() + cappedDelay + jitter);
}

export interface OutboxItem {
    id: string;
    tenantId: string;
    entityType: string;
    entityId: string;
    eventType: string;
    payload: Record<string, unknown>;
    status: "pending" | "processing" | "completed" | "failed" | "dead";
    retryCount: number;
    maxRetries: number;
    nextRetryAt: Date;
    lockedAt: Date | null;
    lockedBy: string | null;
    lastError: string | null;
    endpointId: string | null;
    createdAt: Date;
    createdBy: string;
}

export interface CreateOutboxItemInput {
    tenantId: string;
    entityType: string;
    entityId: string;
    eventType: string;
    payload: Record<string, unknown>;
    maxRetries?: number;
    endpointId?: string;
    createdBy: string;
}
