import type { NotificationChannelHandler, PushTransport } from "@athyper/server-contract-notifications";

/** Local simulation: SMTP acceptance means captured, never real device delivery. */
export function createCaptureChannel(
  channel: "email" | "sms" | "whatsapp",
  inbox: NotificationChannelHandler,
  domain = "dev.athyper.test",
): NotificationChannelHandler {
  return {
    channel,
    health: () => inbox.health(),
    async send(request) {
      if (request.channel !== channel) throw new Error("Capture channel mismatch");
      const result = await inbox.send({
        channel: "email",
        recipientAddress: `${channel}@capture.${domain}`,
        senderOverride: `${channel === "email" ? "noreply" : channel}@${domain}`,
        templateKey: request.templateKey,
        planeKey: request.planeKey,
        subject: `[CAPTURE:${channel}] ${request.subject ?? request.templateKey}`,
        payload: { renderedText: JSON.stringify({
          simulation: true,
          channel,
          deliveryId: request.deliveryId,
          tenantId: request.tenantId,
          recipientId: request.recipientId,
          recipientAddress: request.recipientAddress,
          payload: request.payload,
          attachments: request.attachments?.map(({ filename, contentType }) => ({ filename, contentType })),
        }, null, 2) },
      });
      return { externalId: `capture:${result.externalId ?? "accepted"}` };
    },
  };
}

export function createCapturePush(inbox: NotificationChannelHandler, domain = "dev.athyper.test"): PushTransport {
  return {
    platforms: ["web", "android", "ios"],
    async send(subscription, message) {
      const result = await inbox.send({
        channel: "email",
        recipientAddress: `push-${subscription.platform}@capture.${domain}`,
        senderOverride: `push-${subscription.platform}@${domain}`,
        templateKey: "local.push.capture",
        planeKey: subscription.planeKey,
        subject: `[CAPTURE:push:${subscription.platform}] ${message.title ?? "Notification"}`,
        payload: { renderedText: JSON.stringify({
          simulation: true,
          tenantId: subscription.tenantId,
          principalId: subscription.principalId,
          subscriptionId: subscription.id,
          platform: subscription.platform,
          message,
        }, null, 2) },
      });
      return { externalId: `capture:${result.externalId ?? "accepted"}` };
    },
  };
}
