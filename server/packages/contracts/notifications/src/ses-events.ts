import type { PlaneKey } from "@athyper/server-foundation/context";

/** SES delivery lifecycle events accepted by the notification platform. */
export type SesDeliveryEventType =
  | "send"
  | "delivery"
  | "delivery_delay"
  | "bounce"
  | "complaint"
  | "reject"
  | "rendering_failure";

/** The delivery vocabulary currently persisted by event.notification_delivery. */
export type NotificationProviderDeliveryStatus =
  | "pending"
  | "queued"
  | "claimed"
  | "sending"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed"
  | "cancelled";

export interface SesDeliveryCorrelation {
  readonly deliveryId: string;
  readonly tenantId: string;
  readonly planeKey: PlaneKey;
}

/** Provider input after validation and removal of recipient/provider payload PII. */
export interface NormalizedSesDeliveryEvent {
  readonly provider: "amazon_ses";
  readonly providerEventId: string;
  readonly providerMessageId: string;
  readonly type: SesDeliveryEventType;
  readonly occurredAt: string;
  readonly correlation: SesDeliveryCorrelation;
  readonly diagnostic: {
    readonly category: string;
    readonly subcategory?: string;
  };
  readonly redacted: true;
}

export interface NotificationProviderDeliverySnapshot extends SesDeliveryCorrelation {
  readonly principalId?: string;
  readonly status: NotificationProviderDeliveryStatus;
  readonly providerCode?: string;
  readonly externalId: string;
}

export interface SesDeliveryTransition {
  readonly status: NotificationProviderDeliveryStatus;
  readonly terminal: boolean;
  readonly errorCategory?: "transient" | "permanent";
  readonly diagnostic?: string;
  readonly setSentAt?: boolean;
  readonly setDeliveredAt?: boolean;
  readonly setBouncedAt?: boolean;
}

export type SesEventApplyResult =
  | { readonly outcome: "applied"; readonly previousStatus: NotificationProviderDeliveryStatus; readonly transition: SesDeliveryTransition; readonly delivery: NotificationProviderDeliverySnapshot }
  | { readonly outcome: "duplicate"; readonly previousStatus: NotificationProviderDeliveryStatus; readonly transition: SesDeliveryTransition; readonly delivery: NotificationProviderDeliverySnapshot }
  | { readonly outcome: "ignored"; readonly previousStatus?: NotificationProviderDeliveryStatus }
  | { readonly outcome: "not_found" | "correlation_mismatch" };

/**
 * Persistence boundary for the future SQS consumer. Implementations must record
 * providerEventId uniquely and apply the transition atomically.
 */
export interface SesDeliveryEventRepository {
  findByProviderMessageId(providerMessageId: string, correlation: SesDeliveryCorrelation): Promise<NotificationProviderDeliverySnapshot | undefined>;
  recordAndApply(input: {
    readonly event: NormalizedSesDeliveryEvent;
    readonly expectedStatus: NotificationProviderDeliveryStatus;
    readonly transition: SesDeliveryTransition;
  }): Promise<"applied" | "duplicate" | "conflict">;
}
