import type {
  NotificationChannelHandler,
  PushMessage,
  PushSubscriptionRepository,
  PushTransport,
} from "@athyper/server-contract-notifications";

export function createPushNotificationHandler(dependencies: {
  readonly subscriptions: PushSubscriptionRepository;
  readonly transports: readonly PushTransport[];
}): NotificationChannelHandler {
  const transports = new Map(
    dependencies.transports.flatMap((transport) =>
      transport.platforms.map((platform) => [platform, transport] as const),
    ),
  );
  return {
    channel: "push",
    async send(request) {
      if (request.channel !== "push") {
        throw new Error(`push handler cannot deliver channel ${request.channel}`);
      }
      if (!request.tenantId || !request.recipientId) {
        throw new Error("Push delivery requires tenantId and recipientId");
      }
      const subscriptions = await dependencies.subscriptions.listActive({
        tenantId: request.tenantId,
        principalId: request.recipientId,
        planeKey: request.planeKey,
      });
      if (subscriptions.length === 0) {
        throw new Error("No active push subscriptions");
      }
      const message = toPushMessage(request.subject, request.payload);
      let delivered = 0;
      let firstExternalId: string | undefined;
      const failures: unknown[] = [];
      for (const subscription of subscriptions) {
        const transport = transports.get(subscription.platform);
        if (!transport) continue;
        try {
          const result = await transport.send(subscription, message);
          if (result.subscriptionExpired) {
            await dependencies.subscriptions.deactivate({
              tenantId: request.tenantId,
              principalId: request.recipientId,
              planeKey: request.planeKey,
              subscriptionId: subscription.id,
              reason: "provider_expired",
            });
            continue;
          }
          delivered++;
          firstExternalId ??= result.externalId;
        } catch (error) {
          failures.push(error);
        }
      }
      if (delivered === 0) {
        throw new AggregateError(failures, "Push delivery failed for every subscription");
      }
      return firstExternalId ? { externalId: firstExternalId } : {};
    },
    async health() {
      return transports.size > 0
        ? { status: "healthy" }
        : { status: "unhealthy", message: "No push transports registered" };
    },
  };
}

function toPushMessage(
  subject: string | null | undefined,
  payload: Readonly<Record<string, unknown>>,
): PushMessage {
  const rawBody = payload["renderedText"] ?? payload["rendered_text"] ?? payload["body"];
  const rawData = payload["data"];
  const data = rawData && typeof rawData === "object" && !Array.isArray(rawData)
    ? Object.fromEntries(
        Object.entries(rawData as Record<string, unknown>).map(([key, value]) => [
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        ]),
      )
    : undefined;
  return {
    ...(subject ? { title: subject } : {}),
    ...(typeof rawBody === "string" ? { body: rawBody } : {}),
    ...(data ? { data } : {}),
  };
}
