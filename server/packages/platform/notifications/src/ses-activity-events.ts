import type {
  NotificationEventPublisher,
  SesEventApplyResult,
} from "@athyper/server-contract-notifications";
import type { SesDeliveryEventApplier } from "./ses-event-message-handler.js";

const ACTIVITY_STATUSES = new Set(["sent", "delivered", "bounced", "failed"] as const);

/**
 * Publishes a principal-scoped Activity Center refresh after durable projection.
 * Duplicate provider events publish again deliberately: this repairs the narrow
 * commit/publish crash window while remaining harmless to state-based clients.
 */
export function createSesActivityEventApplier(
  delegate: SesDeliveryEventApplier,
  publisher: NotificationEventPublisher,
): SesDeliveryEventApplier {
  return {
    async apply(input: unknown): Promise<SesEventApplyResult> {
      const result = await delegate.apply(input);
      if ((result.outcome === "applied" || result.outcome === "duplicate")
        && result.delivery.principalId
        && isActivityStatus(result.transition.status)) {
        await publisher.publish({
          type: "notification.delivery",
          tenantId: result.delivery.tenantId,
          principalId: result.delivery.principalId,
          deliveryId: result.delivery.deliveryId,
          deliveryStatus: result.transition.status,
          occurredAt: new Date().toISOString(),
        });
      }
      return result;
    },
  };
}

function isActivityStatus(value: string): value is "sent" | "delivered" | "bounced" | "failed" {
  return ACTIVITY_STATUSES.has(value as "sent" | "delivered" | "bounced" | "failed");
}
