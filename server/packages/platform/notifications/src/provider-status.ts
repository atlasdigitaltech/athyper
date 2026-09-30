import type { NotificationChannel } from "@athyper/server-contract-notifications";
export type NotificationProviderStatus =
  "sent" | "delivered" | "failed" | "bounced";
/** Mapping boundary for verified provider adapters and local callback mocks.
 * Provider authentication/signature verification must happen before applying a status.
 * Device receipt is never inferred from provider acceptance. */
export function mapNotificationProviderStatus(
  channel: NotificationChannel,
  status: string,
): NotificationProviderStatus | undefined {
  const normalized = status.toLowerCase().replace(/[ -]/g, "_");
  const statuses: Partial<
    Record<
      NotificationChannel,
      Readonly<Record<string, NotificationProviderStatus>>
    >
  > = {
    sms: {
      queued: "sent",
      accepted: "sent",
      sending: "sent",
      sent: "sent",
      delivered: "delivered",
      undelivered: "failed",
      failed: "failed",
    },
    whatsapp: {
      accepted: "sent",
      sent: "sent",
      delivered: "delivered",
      read: "delivered",
      failed: "failed",
    },
    email: {
      accepted: "sent",
      send: "sent",
      delivery: "delivered",
      delivered: "delivered",
      bounce: "bounced",
      reject: "failed",
      rendering_failure: "failed",
    },
    push: {
      accepted: "sent",
      delivered: "delivered",
      unregistered: "failed",
      expired: "failed",
      invalid_token: "failed",
    },
  };
  const mapping = Object.hasOwn(statuses, channel)
    ? statuses[channel]
    : undefined;
  return mapping && Object.hasOwn(mapping, normalized)
    ? mapping[normalized]
    : undefined;
}
/** Idempotent local/provider callback ordering: late acceptance cannot undo a terminal result. */
export function nextNotificationProviderStatus(
  current: NotificationProviderStatus,
  incoming: NotificationProviderStatus,
): NotificationProviderStatus {
  if (current === "delivered" || current === "bounced" || current === "failed")
    return current;
  return incoming;
}

export interface VerifiedNotificationCallback {
  readonly channel: NotificationChannel;
  readonly providerMessageId: string;
  readonly deliveryId: string;
  readonly tenantId: string;
  readonly planeKey: "neon" | "studio" | "mesh";
  readonly status: string;
}
/** Shared application boundary for trusted adapter callbacks, including mocks.
 * Matching the provider message prevents an old attempt's callback changing a retry. */
export function createNotificationCallbackApplier(repository: {
  apply(
    event: VerifiedNotificationCallback,
    status: NotificationProviderStatus,
  ): Promise<"applied" | "ignored" | "not_found">;
}) {
  return {
    async apply(event: VerifiedNotificationCallback) {
      const status = mapNotificationProviderStatus(event.channel, event.status);
      if (!status) return "ignored" as const;
      if (
        !event.providerMessageId.trim() ||
        ![event.tenantId, event.deliveryId].every((v) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            v,
          ),
        )
      )
        throw new TypeError("Invalid notification callback coordinates");
      return repository.apply(event, status);
    },
  };
}
