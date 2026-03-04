/**
 * Notification Framework — Domain Types
 *
 * All enums, branded IDs, and shared interfaces for the notification engine.
 */

// ─── Branded IDs ─────────────────────────────────────────────────────
export type MessageId = string & { readonly __brand: "MessageId" };
export type DeliveryId = string & { readonly __brand: "DeliveryId" };
export type RuleId = string & { readonly __brand: "RuleId" };
export type TemplateId = string & { readonly __brand: "TemplateId" };
export type SuppressionId = string & { readonly __brand: "SuppressionId" };
export type ChannelDefId = string & { readonly __brand: "ChannelDefId" };
export type ProviderId = string & { readonly __brand: "ProviderId" };

// ─── Channel Codes ───────────────────────────────────────────────────
export const ChannelCode = {
    EMAIL: "EMAIL",
    TEAMS: "TEAMS",
    WHATSAPP: "WHATSAPP",
    IN_APP: "IN_APP",
    SMS: "SMS",
    WEBHOOK: "WEBHOOK",
} as const;
export type ChannelCode = (typeof ChannelCode)[keyof typeof ChannelCode];

// ─── Message Status ──────────────────────────────────────────────────
export const MessageStatus = {
    PENDING: "pending",
    PLANNING: "planning",
    DELIVERING: "delivering",
    COMPLETED: "completed",
    PARTIAL: "partial",
    FAILED: "failed",
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

// ─── Delivery Status ─────────────────────────────────────────────────
export const DeliveryStatus = {
    PENDING: "pending",
    QUEUED: "queued",
    SENT: "sent",
    DELIVERED: "delivered",
    BOUNCED: "bounced",
    FAILED: "failed",
    CANCELLED: "cancelled",
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

// ─── Priority ────────────────────────────────────────────────────────
export const NotificationPriority = {
    LOW: "low",
    NORMAL: "normal",
    HIGH: "high",
    CRITICAL: "critical",
} as const;
export type NotificationPriority =
    (typeof NotificationPriority)[keyof typeof NotificationPriority];

// ─── Template Status ─────────────────────────────────────────────────
export const TemplateStatus = {
    DRAFT: "draft",
    ACTIVE: "active",
    RETIRED: "retired",
} as const;
export type TemplateStatus = (typeof TemplateStatus)[keyof typeof TemplateStatus];

// ─── Delivery Error Category ─────────────────────────────────────────
export const ErrorCategory = {
    TRANSIENT: "transient",
    PERMANENT: "permanent",
    RATE_LIMIT: "rate_limit",
    AUTH: "auth",
} as const;
export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];

// ─── Suppression Reason ──────────────────────────────────────────────
export const SuppressionReason = {
    HARD_BOUNCE: "hard_bounce",
    COMPLAINT: "complaint",
    OPT_OUT: "opt_out",
    COMPLIANCE_BLOCK: "compliance_block",
    MANUAL: "manual",
} as const;
export type SuppressionReason =
    (typeof SuppressionReason)[keyof typeof SuppressionReason];

// ─── Suppression Source ──────────────────────────────────────────────
export const SuppressionSource = {
    PROVIDER_CALLBACK: "provider_callback",
    USER_ACTION: "user_action",
    ADMIN: "admin",
    SYSTEM: "system",
} as const;
export type SuppressionSource =
    (typeof SuppressionSource)[keyof typeof SuppressionSource];

// ─── Preference Frequency ────────────────────────────────────────────
export const PreferenceFrequency = {
    IMMEDIATE: "immediate",
    HOURLY_DIGEST: "hourly_digest",
    DAILY_DIGEST: "daily_digest",
    WEEKLY_DIGEST: "weekly_digest",
} as const;
export type PreferenceFrequency =
    (typeof PreferenceFrequency)[keyof typeof PreferenceFrequency];

// ─── Preference Scope ────────────────────────────────────────────────
export const PreferenceScope = {
    USER: "user",
    ORG_UNIT: "org_unit",
    TENANT: "tenant",
} as const;
export type PreferenceScope =
    (typeof PreferenceScope)[keyof typeof PreferenceScope];

// ─── Provider Health ─────────────────────────────────────────────────
export const ProviderHealth = {
    HEALTHY: "healthy",
    DEGRADED: "degraded",
    DOWN: "down",
} as const;
export type ProviderHealth =
    (typeof ProviderHealth)[keyof typeof ProviderHealth];

// ─── Recipient Rule Types ────────────────────────────────────────────
export const RecipientRuleType = {
    USER: "user",
    ROLE: "role",
    GROUP: "group",
    EXPRESSION: "expression",
} as const;
export type RecipientRuleType =
    (typeof RecipientRuleType)[keyof typeof RecipientRuleType];

export interface RecipientRule {
    type: RecipientRuleType;
    value: string;
}

// ─── Quiet Hours ─────────────────────────────────────────────────────
export interface QuietHours {
    enabled: boolean;
    start: string;    // "22:00"
    end: string;      // "07:00"
    timezone: string;  // "America/New_York"
}

// ─── Rate Limit Config ───────────────────────────────────────────────
export interface RateLimitConfig {
    maxPerSecond?: number;
    maxPerMinute?: number;
    maxPerHour?: number;
}

// ─── Delivery Request (adapter input) ────────────────────────────────
export interface DeliveryRequest {
    deliveryId: string;
    messageId: string;
    tenantId: string;
    channel: ChannelCode;
    recipientAddr: string;
    recipientId?: string;
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    bodyJson?: Record<string, unknown>;
    attachments?: DeliveryAttachment[];
    metadata?: Record<string, unknown>;
    correlationId?: string;
}

export interface DeliveryAttachment {
    filename: string;
    presignedUrl: string;
    contentType: string;
    size: number;
}

// ─── Delivery Result (adapter output) ────────────────────────────────
export interface DeliveryResult {
    success: boolean;
    externalId?: string;
    status: "sent" | "queued" | "failed";
    errorCategory?: ErrorCategory;
    error?: string;
    metadata?: Record<string, unknown>;
}

// ─── Channel Adapter Interface ───────────────────────────────────────
export interface IChannelAdapter {
    readonly channelCode: ChannelCode;
    readonly providerCode: string;
    deliver(request: DeliveryRequest): Promise<DeliveryResult>;
    validateConfig(): Promise<{ valid: boolean; errors?: string[] }>;
    healthCheck(): Promise<{ healthy: boolean; message?: string }>;
}

// ─── Channel Registry Interface ──────────────────────────────────────
export interface IChannelRegistry {
    register(adapter: IChannelAdapter): void;
    getAdapter(channel: ChannelCode, providerCode?: string): IChannelAdapter | undefined;
    getAdaptersForChannel(channel: ChannelCode): IChannelAdapter[];
    getAllHealthStatuses(): Promise<Record<string, { healthy: boolean }>>;
}

// ─── WhatsApp Template Component ────────────────────────────────────
export interface WhatsAppTemplateComponent {
    type: "header" | "body" | "button";
    sub_type?: string;
    index?: number;
    parameters: Array<{
        type: "text" | "currency" | "date_time" | "image" | "document" | "video";
        text?: string;
        currency?: { fallback_value: string; code: string; amount_1000: number };
        date_time?: { fallback_value: string };
        image?: { link: string };
        document?: { link: string; filename?: string };
    }>;
}

// ─── Rendered Template ───────────────────────────────────────────────
export interface RenderedTemplate {
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    bodyJson?: Record<string, unknown>;
}

// ─── Effective Preference (Scoped Resolution Result) ────────────────
export interface EffectivePreference {
    isEnabled: boolean;
    frequency: PreferenceFrequency;
    quietHours: QuietHours | null;
    resolvedFrom: PreferenceScope | "default";
}

// ─── Explainability Trace ───────────────────────────────────────────
export interface NotificationExplainTrace {
    messageId: string;
    eventCode: string;
    eventId: string;
    timestamp: string;
    steps: ExplainStep[];
}

export type ExplainPhase =
    | "rule_match"
    | "recipient_resolution"
    | "preference_check"
    | "dedup_check"
    | "quiet_hours"
    | "digest_staging"
    | "delivery";

export interface ExplainStep {
    phase: ExplainPhase;
    timestamp: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    decision: "passed" | "blocked" | "deferred" | "staged";
    reason?: string;
}

// ─── DLQ Entry ──────────────────────────────────────────────────────
export interface DlqEntryId extends String { readonly __brand: "DlqEntryId" }

// ─── Digest Staging ─────────────────────────────────────────────────
export interface DigestStagingId extends String { readonly __brand: "DigestStagingId" }

// ─── Notification Domain Events ──────────────────────────────────────
export const NotificationEventType = {
    MESSAGE_CREATED: "notification.message.created",
    MESSAGE_COMPLETED: "notification.message.completed",
    MESSAGE_FAILED: "notification.message.failed",
    DELIVERY_SENT: "notification.delivery.sent",
    DELIVERY_DELIVERED: "notification.delivery.delivered",
    DELIVERY_BOUNCED: "notification.delivery.bounced",
    DELIVERY_FAILED: "notification.delivery.failed",
    DELIVERY_OPENED: "notification.delivery.opened",
    DELIVERY_CLICKED: "notification.delivery.clicked",
    SUPPRESSION_ADDED: "notification.suppression.added",
    PREFERENCE_UPDATED: "notification.preference.updated",
} as const;
export type NotificationEventType =
    (typeof NotificationEventType)[keyof typeof NotificationEventType];
