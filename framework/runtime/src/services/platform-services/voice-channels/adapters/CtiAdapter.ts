/**
 * CTI Adapter — abstract interface for Computer-Telephony Integration.
 * Implementations: TwilioCtiAdapter, future SIP adapters.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface CallInitiateParams {
    from: string;
    to: string;
    callbackUrl?: string;
    tenantId: string;
    metadata?: Record<string, string>;
}

export interface CallInitiateResult {
    sessionRef: string;
    provider: string;
    status: string;
}

export interface CtiStatusEvent {
    sessionRef: string;
    status: string;
    durationSeconds?: number;
    timestamp: string;
    rawPayload?: Record<string, unknown>;
}

// ── Interface ────────────────────────────────────────────────────────

export interface ICtiAdapter {
    readonly provider: string;

    initiateCall(params: CallInitiateParams): Promise<CallInitiateResult>;

    endCall(sessionRef: string): Promise<void>;

    parseWebhookEvent(rawBody: Record<string, unknown>): CtiStatusEvent;

    validateWebhookSignature(
        rawBody: string,
        signature: string,
        url: string,
    ): boolean;

    healthCheck(): Promise<{ healthy: boolean; message?: string }>;
}
