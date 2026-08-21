import type {
  InAppNotificationRepository,
  NotificationChannelHandler,
  NotificationEventPublisher,
} from "@athyper/server-contract-notifications";

export function createInAppNotificationHandler(dependencies: {
  readonly repository: InAppNotificationRepository;
  readonly publisher: NotificationEventPublisher;
  readonly now?: () => Date;
}): NotificationChannelHandler {
  const now = dependencies.now ?? (() => new Date());
  return {
    channel: "in_app",
    async send(request) {
      if (request.channel !== "in_app") {
        throw new Error(`in_app handler cannot deliver channel ${request.channel}`);
      }
      if (!request.tenantId || !request.recipientId) {
        throw new Error("In-app delivery requires tenantId and recipientId");
      }
      const notification = await dependencies.repository.create({
        tenantId: request.tenantId,
        principalId: request.recipientId,
        planeKey: request.planeKey,
        templateKey: request.templateKey,
        ...(request.subject !== undefined ? { subject: request.subject } : {}),
        payload: request.payload,
      });
      await dependencies.publisher.publish({
        type: "notification.created",
        tenantId: request.tenantId,
        principalId: request.recipientId,
        notificationId: notification.id,
        occurredAt: now().toISOString(),
        notification,
      });
      return { externalId: notification.id };
    },
    async health() {
      return { status: "healthy" };
    },
  };
}
