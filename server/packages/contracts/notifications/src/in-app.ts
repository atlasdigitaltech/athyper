import type { PlaneKey } from "@athyper/server-foundation/context";

export interface InAppNotification {
  readonly id: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: PlaneKey;
  readonly templateKey: string;
  readonly subject?: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface NewInAppNotification extends Omit<InAppNotification, "id" | "createdAt"> {}

export interface InAppNotificationRepository {
  create(notification: NewInAppNotification): Promise<InAppNotification>;
  list(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly limit?: number;
  }): Promise<readonly InAppNotification[]>;
  markRead(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly notificationId: string;
    readonly readAt: string;
  }): Promise<boolean>;
}

export interface NotificationStreamEvent {
  readonly type: "notification.created" | "notification.read";
  readonly tenantId: string;
  readonly principalId: string;
  readonly notificationId: string;
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
