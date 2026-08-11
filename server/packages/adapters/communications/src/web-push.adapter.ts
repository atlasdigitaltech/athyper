import webPush from "web-push";
import type { PushTransport } from "@athyper/server-contract-notifications";

export interface WebPushAdapterConfig {
  readonly subject: string;
  readonly publicKey: string;
  readonly privateKey: string;
  readonly ttlSeconds?: number;
}

export interface WebPushAdapterDependencies {
  send(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: {
      TTL: number;
      vapidDetails: { subject: string; publicKey: string; privateKey: string };
    },
  ): Promise<{ statusCode: number }>;
}

const DEFAULT_DEPENDENCIES: WebPushAdapterDependencies = {
  send: (subscription, payload, options) =>
    webPush.sendNotification(subscription, payload, options),
};

export function createWebPushAdapter(
  config: WebPushAdapterConfig,
  dependencies: WebPushAdapterDependencies = DEFAULT_DEPENDENCIES,
): PushTransport {
  const subject = required(config.subject, "VAPID subject");
  const publicKey = required(config.publicKey, "VAPID public key");
  const privateKey = required(config.privateKey, "VAPID private key");
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    throw new Error("VAPID subject must be a mailto: or https:// URI");
  }
  const ttlSeconds = config.ttlSeconds ?? 300;
  return {
    platforms: ["web"],
    async send(subscription, message) {
      if (!subscription.p256dhKey || !subscription.authKey) {
        throw new Error("Web Push subscription is missing encryption keys");
      }
      try {
        const result = await dependencies.send(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
          },
          JSON.stringify(message),
          { TTL: ttlSeconds, vapidDetails: { subject, publicKey, privateKey } },
        );
        return { externalId: String(result.statusCode) };
      } catch (error) {
        const statusCode = readStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          return { subscriptionExpired: true };
        }
        throw error;
      }
    },
  };
}

function readStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : undefined;
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}
