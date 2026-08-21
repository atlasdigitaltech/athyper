import type {
  NotificationChannel,
  NotificationChannelHandler,
  NotificationDeliveryLedger,
  NotificationDeliveryRecord,
  NotificationRecipientResolver,
  NotificationDispatcher,
} from "@athyper/server-contract-notifications";

export function createNotificationOrchestrator(dependencies: {
  readonly recipients: NotificationRecipientResolver;
  readonly ledger: NotificationDeliveryLedger;
  readonly handlers: ReadonlyMap<NotificationChannel, NotificationChannelHandler>;
}): NotificationDispatcher {
  return {
    async dispatch(command) {
      const recipient = await dependencies.recipients.resolve(command);
      const deliveries: NotificationDeliveryRecord[] = [];
      for (const channel of [...new Set(command.channels)]) {
        const handler = dependencies.handlers.get(channel);
        const address = recipient.addresses[channel];
        if (!handler || !address) {
          const skipped: NotificationDeliveryRecord = {
            planeKey: command.planeKey,
            tenantId: command.tenantId,
            principalId: command.principalId,
            channel,
            templateKey: command.templateKey,
            status: "skipped",
            error: !handler ? "handler_unavailable" : "recipient_address_unavailable",
          };
          await dependencies.ledger.record(skipped);
          deliveries.push(skipped);
          continue;
        }
        try {
          const result = await handler.send({
            channel,
            recipientAddress: address,
            recipientId: command.principalId,
            tenantId: command.tenantId,
            planeKey: command.planeKey,
            templateKey: command.templateKey,
            ...(command.subject !== undefined ? { subject: command.subject } : {}),
            payload: command.payload,
          });
          const delivered: NotificationDeliveryRecord = {
            planeKey: command.planeKey,
            tenantId: command.tenantId,
            principalId: command.principalId,
            channel,
            templateKey: command.templateKey,
            status: "delivered",
            ...(result.externalId ? { externalId: result.externalId } : {}),
          };
          await dependencies.ledger.record(delivered);
          deliveries.push(delivered);
        } catch (error) {
          const failed: NotificationDeliveryRecord = {
            planeKey: command.planeKey,
            tenantId: command.tenantId,
            principalId: command.principalId,
            channel,
            templateKey: command.templateKey,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          };
          await dependencies.ledger.record(failed);
          deliveries.push(failed);
        }
      }
      return { deliveries };
    },
  };
}
