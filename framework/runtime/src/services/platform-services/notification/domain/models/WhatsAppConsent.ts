/**
 * WhatsAppConsent — Opt-in/out tracking per phone number per tenant.
 *
 * Tracks consent status and 24-hour conversation windows
 * (Meta requires template messages outside the window).
 */

export interface WhatsAppConsent {
    id: string;
    tenantId: string;
    phoneNumber: string;
    principalId: string | null;
    optedIn: boolean;
    optedInAt: Date | null;
    optedOutAt: Date | null;
    optInMethod: string | null;
    conversationWindowStart: Date | null;
    conversationWindowEnd: Date | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date | null;
}

export interface UpsertConsentInput {
    tenantId: string;
    phoneNumber: string;
    principalId?: string;
    optedIn: boolean;
    optInMethod?: string;
    metadata?: Record<string, unknown>;
}
