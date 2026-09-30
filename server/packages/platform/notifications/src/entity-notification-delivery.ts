import { sql, type Transaction } from "kysely";
import type { ChannelConsentService } from "@athyper/server-contract-governance";
import type { NotificationSourceEvent } from "@athyper/server-contract-notifications";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { ClaimedNotificationDelivery } from "./durable-delivery.js";
import type { NotificationPlanningPolicy } from "./notification-planner.js";
import type { EntityNotificationRoute } from "./entity-notification-routing.js";
type Tx = Transaction<Record<string, never>>;
/** Recheck current admission, policy and consent immediately before transport. */
export function createEntityNotificationDeliveryGuard(options: {
  transactions: PlaneTransactionCoordinator<Tx>;
  consent: ChannelConsentService<Tx>;
  policy: NotificationPlanningPolicy;
  route: (
    source: NotificationSourceEvent,
    tx: Tx,
  ) => Promise<EntityNotificationRoute | null | undefined>;
  fallback: (
    delivery: ClaimedNotificationDelivery,
  ) => Promise<{ allowed: boolean; reason?: string }>;
}) {
  return async (delivery: ClaimedNotificationDelivery) => {
    const raw = delivery.payload.data;
    const data =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : delivery.payload;
    if (
      typeof data.parent_entity_code !== "string" ||
      typeof data.parent_record_id !== "string"
    )
      return options.fallback(delivery);
    const denied = {
      allowed: false,
      reason: "NOTIFICATION_RECIPIENT_NO_LONGER_ELIGIBLE",
    };
    if (
      typeof data.notification_event_code !== "string" ||
      typeof data.resource_id !== "string"
    )
      return denied;
    const source: NotificationSourceEvent = {
      id: delivery.id,
      planeKey: delivery.planeKey,
      tenantId: delivery.tenantId,
      actorPrincipalId: delivery.actorPrincipalId,
      eventCode: data.notification_event_code,
      entityId: data.resource_id,
      payload: data,
    };
    return options.transactions.run(
      delivery.planeKey,
      { tenantId: delivery.tenantId, principalId: delivery.principalId },
      async (tx) => {
        const route = await options.route(source, tx);
        if (
          !route ||
          !route.rule.channels.includes(delivery.channel) ||
          !(await options.policy.authorizeRecipient(
            source,
            delivery.principalId,
            delivery.channel,
            tx,
          ))
        )
          return denied;
        const pref = (
          await sql<{
            is_enabled: boolean;
          }>`SELECT is_enabled FROM master.principal_notification_preference WHERE tenant_id=${delivery.tenantId}::uuid AND principal_id=${delivery.principalId}::uuid AND event_code=${source.eventCode} AND channel=${delivery.channel} AND status='active'`.execute(
            tx,
          )
        ).rows[0];
        if (pref?.is_enabled === false) return denied;
        if (delivery.channel === "in_app") return { allowed: true };
        if (delivery.channel === "webhook") return denied;
        const consent = await options.consent.checkAt(
          {
            planeKey: delivery.planeKey,
            tenantId: delivery.tenantId,
            subjectType: "principal",
            subjectId: delivery.principalId,
            channel: delivery.channel,
            destination: delivery.recipientAddress,
            at: new Date().toISOString(),
          },
          tx,
        );
        return consent?.consented ? { allowed: true } : denied;
      },
    );
  };
}
