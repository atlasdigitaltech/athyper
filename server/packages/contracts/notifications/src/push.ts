import type { PlaneKey } from "@athyper/server-foundation/context";

export type PushPlatform = "web" | "android" | "ios";

export interface PushSubscription {
  readonly id: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: PlaneKey;
  readonly platform: PushPlatform;
  readonly endpoint: string;
  readonly p256dhKey?: string;
  readonly authKey?: string;
  readonly deviceToken?: string;
}

export interface PushSubscriptionRepository {
  listActive(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
  }): Promise<readonly PushSubscription[]>;
  deactivate(input: {
    readonly tenantId: string;
    readonly principalId?: string;
    readonly planeKey: PlaneKey;
    readonly subscriptionId: string;
    readonly reason: string;
  }): Promise<void>;
  upsert(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly platform: PushPlatform;
    readonly deviceId: string;
    readonly endpoint: string;
    readonly p256dhKey?: string;
    readonly authKey?: string;
    readonly deviceToken?: string;
    readonly userAgent?: string;
  }): Promise<PushSubscription>;
}

export interface PushMessage {
  readonly title?: string;
  readonly body?: string;
  readonly data?: Readonly<Record<string, string>>;
}

export interface PushTransport {
  readonly platforms: readonly PushPlatform[];
  send(
    subscription: PushSubscription,
    message: PushMessage,
  ): Promise<{
    readonly externalId?: string;
    readonly subscriptionExpired?: boolean;
  }>;
}
