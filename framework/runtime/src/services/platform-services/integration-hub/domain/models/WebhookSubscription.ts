/**
 * Webhook Subscription + Event models.
 */

export interface WebhookSubscription {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    endpointUrl: string;
    secretHash: string;
    eventTypes: string[];
    isActive: boolean;
    metadata: Record<string, unknown> | null;
    lastTriggeredAt: Date | null;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}

export interface CreateSubscriptionInput {
    tenantId: string;
    code: string;
    name: string;
    endpointUrl: string;
    secret: string;
    eventTypes: string[];
    metadata?: Record<string, unknown>;
    createdBy: string;
}

export interface UpdateSubscriptionInput {
    name?: string;
    endpointUrl?: string;
    eventTypes?: string[];
    isActive?: boolean;
    metadata?: Record<string, unknown> | null;
    updatedBy: string;
}

export interface WebhookEvent {
    id: string;
    tenantId: string;
    subscriptionId: string;
    eventType: string;
    payload: Record<string, unknown>;
    status: "pending" | "processing" | "delivered" | "failed" | "dead";
    attempts: number;
    lastError: string | null;
    processedAt: Date | null;
    createdAt: Date;
}
