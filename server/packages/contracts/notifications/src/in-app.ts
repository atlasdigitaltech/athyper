import type { PlaneKey } from "@athyper/server-foundation/context";

export interface InAppNotification {
  readonly id: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: PlaneKey;
  readonly templateKey: string;
  readonly eventCode: string;
  readonly title: string;
  readonly body?: string;
  readonly priority: "low" | "normal" | "high" | "urgent";
  readonly entityType?: string;
  readonly entityId?: string;
  readonly href?: string;
  readonly subject?: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly readAt?: string;
  readonly dismissedAt?: string;
}

export interface NewInAppNotification {
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: PlaneKey;
  readonly templateKey: string;
  readonly subject?: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface InAppNotificationRepository {
  create(notification: NewInAppNotification): Promise<InAppNotification>;
  list(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly limit?: number;
    readonly cursor?: string;
    readonly unreadOnly?: boolean;
  }): Promise<readonly InAppNotification[]>;
  countUnread(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
  }): Promise<number>;
  markRead(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly notificationId: string;
    readonly readAt: string;
  }): Promise<boolean>;
  markAllRead(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly readAt: string;
  }): Promise<number>;
  dismiss(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly notificationId: string;
    readonly dismissedAt: string;
  }): Promise<boolean>;
}

export interface NotificationStreamEvent {
  readonly type: "notification.created" | "notification.read" | "notification.refresh" | "notification.delivery";
  readonly tenantId: string;
  readonly principalId: string;
  readonly notificationId?: string;
  readonly deliveryId?: string;
  readonly deliveryStatus?: "sent" | "delivered" | "bounced" | "failed";
  readonly occurredAt: string;
  readonly notification?: InAppNotification;
}

export type NotificationStreamListener = (
  event: NotificationStreamEvent,
) => void | Promise<void>;

export interface NotificationEventPublisher {
  publish(event: NotificationStreamEvent): Promise<void>;
}

export interface NotificationEventSubscriber {
  subscribe(
    scope: { readonly tenantId: string; readonly principalId: string },
    listener: NotificationStreamListener,
  ): () => void;
}
