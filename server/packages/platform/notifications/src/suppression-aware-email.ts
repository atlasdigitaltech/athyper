import type {
  NotificationChannelHandler,
  NotificationDeliveryRequest,
} from "@athyper/server-contract-notifications";

export interface EmailSuppressionReader {
  isSuppressed(input: {
    readonly planeKey: NotificationDeliveryRequest["planeKey"];
    readonly tenantId: string;
    readonly principalId: string;
    readonly address: string;
  }): Promise<boolean>;
}

/** Fail-closed guard applied immediately before the provider transport. */
export function createSuppressionAwareEmailHandler(
  delegate: NotificationChannelHandler,
  suppressions: EmailSuppressionReader,
): NotificationChannelHandler {
  if (delegate.channel !== "email") throw new TypeError("Suppression guard requires an email handler");
  return {
    channel: "email",
    async send(request) {
      const tenantId = request.tenantId?.trim();
      const principalId = request.recipientId?.trim();
      if (!tenantId || !principalId) throw permanent("Email delivery suppression scope is missing");
      if (await suppressions.isSuppressed({
        planeKey: request.planeKey,
        tenantId,
        principalId,
        address: request.recipientAddress,
      })) throw permanent("Email recipient is suppressed");
      return delegate.send(request);
    },
    health: () => delegate.health(),
    close: () => delegate.close?.(),
  };
}

function permanent(message: string) {
  const error = new Error(message);
  Object.assign(error, { retryable: false, code: "EMAIL_RECIPIENT_SUPPRESSED" });
  return error;
}
