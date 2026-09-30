import type { PlaneKey } from "@athyper/server-foundation/context";
import type { HealthContribution } from "@athyper/server-foundation/observability";
import type { NotificationTransportAttachment } from "./attachments.js";

export type NotificationChannel =
  | "in_app"
  | "email"
  | "sms"
  | "whatsapp"
  | "push"
  | "webhook";

export type ExternalNotificationChannel = Exclude<NotificationChannel, "in_app">;

/** Provider-neutral, already-rendered notification delivery request. */
export interface NotificationDeliveryRequest {
  /** Durable delivery coordinate used for provider correlation tags. */
  readonly deliveryId?: string;
  readonly channel: NotificationChannel;
  readonly recipientAddress: string;
  readonly templateKey: string;
  readonly subject?: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly planeKey: PlaneKey;
  readonly tenantId?: string;
  readonly recipientId?: string;
  readonly senderOverride?: string;
  readonly attachments?: readonly NotificationTransportAttachment[];
}

export interface NotificationDeliveryResult {
  readonly externalId?: string;
  /** Omit for synchronous transports; SES must return provider_accepted. */
  readonly confirmation?: "delivered" | "provider_accepted";
}

/** A single-channel transport port. Implementations must not resolve templates or recipients. */
export interface NotificationChannelHandler {
  readonly channel: NotificationChannel;
  send(request: NotificationDeliveryRequest): Promise<NotificationDeliveryResult>;
  health(): Promise<HealthContribution>;
  close?(): void | Promise<void>;
}

export interface NotificationRecipient {
  readonly principalId: string;
  readonly addresses: Readonly<Partial<Record<NotificationChannel, string>>>;
}

export interface NotificationRecipientResolver {
  resolve(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
  }): Promise<NotificationRecipient>;
}

export interface NotificationDeliveryRecord {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
  readonly channel: NotificationChannel;
  readonly templateKey: string;
  readonly status: "delivered" | "failed" | "skipped";
  readonly externalId?: string;
  readonly error?: string;
}

export interface NotificationDeliveryLedger {
  record(delivery: NotificationDeliveryRecord): Promise<void>;
}

export interface DispatchNotificationCommand {
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: PlaneKey;
  readonly channels: readonly NotificationChannel[];
  readonly templateKey: string;
  readonly subject?: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}
export interface DispatchNotificationResult { readonly deliveries: readonly NotificationDeliveryRecord[]; }
export interface NotificationDispatcher { dispatch(command:DispatchNotificationCommand):Promise<DispatchNotificationResult>; }
