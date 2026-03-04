/**
 * SMS Provider Adapter — abstract interface for SMS sending/receiving.
 * Implementations: TwilioSmsAdapter.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface SmsSendParams {
    from: string;
    to: string;
    body: string;
    tenantId: string;
    metadata?: Record<string, string>;
}

export interface SmsSendResult {
    messageRef: string;
    provider: string;
    status: string;
}

export interface SmsInboundEvent {
    messageRef: string;
    from: string;
    to: string;
    body: string;
    timestamp: string;
    rawPayload?: Record<string, unknown>;
}

// ── Interface ────────────────────────────────────────────────────────

export interface ISmsProviderAdapter {
    readonly provider: string;

    send(params: SmsSendParams): Promise<SmsSendResult>;

    parseInboundWebhook(rawBody: Record<string, unknown>): SmsInboundEvent;

    validateWebhookSignature(
        rawBody: string,
        signature: string,
        url: string,
    ): boolean;

    healthCheck(): Promise<{ healthy: boolean; message?: string }>;
}
