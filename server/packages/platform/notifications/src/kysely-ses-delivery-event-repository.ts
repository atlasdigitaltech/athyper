import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  NotificationProviderDeliverySnapshot,
  SesDeliveryCorrelation,
  SesDeliveryEventRepository,
} from "@athyper/server-contract-notifications";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";
type DatabaseTransaction = Transaction<Record<string, never>>;

export interface EmailSuppressionQuery {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
  readonly address: string;
}

/**
 * Exact-plane SES persistence. Provider events and the resulting delivery and
 * suppression projections are committed in one tenant transaction.
 */
export class KyselySesDeliveryEventRepository implements SesDeliveryEventRepository {
  constructor(private readonly transactions: PlaneTransactionCoordinator<DatabaseTransaction>) {}

  async findByProviderMessageId(
    providerMessageId: string,
    correlation: SesDeliveryCorrelation,
  ): Promise<NotificationProviderDeliverySnapshot | undefined> {
    return this.transactions.run(correlation.planeKey, actor(correlation), async transaction => {
      const result = await sql<Record<string, unknown>>`
        SELECT delivery.id,delivery.tenant_id,delivery.recipient_id,delivery.status,
          delivery.provider_code,delivery.external_id,message.plane_key
        FROM event.notification_delivery delivery
        JOIN event.notification_message message
          ON message.tenant_id=delivery.tenant_id AND message.id=delivery.message_id
        WHERE delivery.tenant_id=${correlation.tenantId}::uuid
          AND delivery.id=${correlation.deliveryId}::uuid
          AND delivery.external_id=${providerMessageId}
          AND message.plane_key=${correlation.planeKey}
        LIMIT 1`.execute(transaction);
      return result.rows[0] ? snapshot(result.rows[0]) : undefined;
    });
  }

  async recordAndApply(input: Parameters<SesDeliveryEventRepository["recordAndApply"]>[0]) {
    const { event, expectedStatus, transition } = input;
    return this.transactions.run(event.correlation.planeKey, actor(event.correlation), async transaction => {
      const locked = await sql<Record<string, unknown>>`
        SELECT delivery.id,delivery.tenant_id,delivery.recipient_id,delivery.status,
          delivery.provider_code,delivery.external_id,message.id AS message_id,message.plane_key,
          delivery.recipient_addr
        FROM event.notification_delivery delivery
        JOIN event.notification_message message
          ON message.tenant_id=delivery.tenant_id AND message.id=delivery.message_id
        WHERE delivery.tenant_id=${event.correlation.tenantId}::uuid
          AND delivery.id=${event.correlation.deliveryId}::uuid
          AND delivery.external_id=${event.providerMessageId}
          AND message.plane_key=${event.correlation.planeKey}
        FOR UPDATE OF delivery`.execute(transaction);
      const row = locked.rows[0];
      if (!row || String(row["status"]) !== expectedStatus) return "conflict" as const;

      const diagnostic = JSON.stringify(event.diagnostic);
      const payloadHash = createHash("sha256").update(JSON.stringify(event)).digest("hex");
      const recorded = await sql<{id:string}>`
        INSERT INTO event.notification_provider_event
          (tenant_id,delivery_id,provider_code,provider_event_id,provider_message_id,event_type,
           occurred_at,diagnostic,payload_sha256,previous_status,projected_status,transition_applied,
           is_redacted,created_by)
        VALUES (${event.correlation.tenantId}::uuid,${event.correlation.deliveryId}::uuid,
          'amazon_ses',${event.providerEventId},${event.providerMessageId},${event.type},
          ${event.occurredAt}::timestamptz,${diagnostic}::jsonb,${payloadHash},${expectedStatus},
          ${transition.status},true,true,${SYSTEM_ACTOR_ID}::uuid)
        ON CONFLICT (provider_code,provider_event_id) DO NOTHING
        RETURNING id`.execute(transaction);
      if (!recorded.rows[0]) return "duplicate" as const;

      await sql`
        UPDATE event.notification_delivery SET
          status=${transition.status},
          provider_code=COALESCE(provider_code,'amazon_ses'),
          sent_at=CASE WHEN ${transition.setSentAt === true} THEN COALESCE(sent_at,${event.occurredAt}::timestamptz) ELSE sent_at END,
          delivered_at=CASE WHEN ${transition.setDeliveredAt === true} THEN COALESCE(delivered_at,${event.occurredAt}::timestamptz) ELSE delivered_at END,
          bounced_at=CASE WHEN ${transition.setBouncedAt === true} THEN COALESCE(bounced_at,${event.occurredAt}::timestamptz) ELSE bounced_at END,
          last_error=${transition.diagnostic ?? null},error_category=${transition.errorCategory ?? null},
          next_retry_at=NULL,locked_until=NULL,updated_at=clock_timestamp(),updated_by=${SYSTEM_ACTOR_ID}::uuid
        WHERE tenant_id=${event.correlation.tenantId}::uuid AND id=${event.correlation.deliveryId}::uuid`.execute(transaction);

      if (mustSuppress(event.type, event.diagnostic.subcategory)) {
        await sql`
          INSERT INTO event.notification_email_suppression
            (tenant_id,scope,address_hash,reason,provider_code,source_provider_event_id,created_by)
          SELECT delivery.tenant_id,'tenant',
            encode(public.digest(convert_to(lower(btrim(delivery.recipient_addr)),'UTF8'),'sha256'),'hex'),
            ${event.type === "complaint" ? "complaint" : "permanent_bounce"},'amazon_ses',provider_event.id,
            ${SYSTEM_ACTOR_ID}::uuid
          FROM event.notification_delivery delivery
          JOIN event.notification_provider_event provider_event
            ON provider_event.provider_code='amazon_ses' AND provider_event.provider_event_id=${event.providerEventId}
          WHERE delivery.tenant_id=${event.correlation.tenantId}::uuid
            AND delivery.id=${event.correlation.deliveryId}::uuid
          ON CONFLICT (tenant_id,address_hash) WHERE scope='tenant' AND released_at IS NULL
          DO UPDATE SET reason=EXCLUDED.reason,provider_code=EXCLUDED.provider_code,
            source_provider_event_id=EXCLUDED.source_provider_event_id,updated_at=clock_timestamp(),
            updated_by=${SYSTEM_ACTOR_ID}::uuid`.execute(transaction);
      }
      await updateMessageProjection(transaction, event.correlation.tenantId, String(row["message_id"]));
      return "applied" as const;
    });
  }

  async isSuppressed(input: EmailSuppressionQuery): Promise<boolean> {
    return this.transactions.run(input.planeKey, input, async transaction => {
      const result = await sql<{suppressed:boolean}>`
        SELECT EXISTS(
          SELECT 1 FROM event.notification_email_suppression
          WHERE released_at IS NULL AND (tenant_id IS NULL OR tenant_id=${input.tenantId}::uuid)
            AND address_hash=encode(public.digest(convert_to(lower(btrim(${input.address})),'UTF8'),'sha256'),'hex')
        ) suppressed`.execute(transaction);
      return result.rows[0]?.suppressed === true;
    });
  }

}

async function updateMessageProjection(transaction: DatabaseTransaction, tenantId: string, messageId: string) {
  await sql`
    UPDATE event.notification_message message SET
      delivered_count=aggregate.delivered,failed_count=aggregate.failed,
      status=CASE WHEN aggregate.pending>0 THEN 'delivering' WHEN aggregate.failed=0 THEN 'completed'
        WHEN aggregate.delivered=0 THEN 'failed' ELSE 'partially_sent' END,
      completed_at=CASE WHEN aggregate.pending=0 THEN COALESCE(message.completed_at,clock_timestamp()) ELSE NULL END,
      updated_at=clock_timestamp(),updated_by=${SYSTEM_ACTOR_ID}::uuid
    FROM (
      SELECT message_id,count(*) FILTER(WHERE status='delivered')::int delivered,
        count(*) FILTER(WHERE status IN ('failed','bounced') AND error_category='permanent')::int failed,
        count(*) FILTER(WHERE status IN ('pending','queued','claimed','sending','sent')
          OR (status='failed' AND error_category IS DISTINCT FROM 'permanent'))::int pending
      FROM event.notification_delivery
      WHERE tenant_id=${tenantId}::uuid AND message_id=${messageId}::uuid GROUP BY message_id
    ) aggregate
    WHERE message.tenant_id=${tenantId}::uuid AND message.id=aggregate.message_id`.execute(transaction);
}

function snapshot(row: Record<string, unknown>): NotificationProviderDeliverySnapshot {
  return {
    deliveryId: String(row["id"]),tenantId:String(row["tenant_id"]),planeKey:row["plane_key"] as PlaneKey,
    status:row["status"] as NotificationProviderDeliverySnapshot["status"],
    ...(typeof row["recipient_id"] === "string" ? { principalId: row["recipient_id"] } : {}),
    ...(typeof row["provider_code"] === "string" ? { providerCode: row["provider_code"] } : {}),
    externalId:String(row["external_id"]),
  };
}
function actor(input: SesDeliveryCorrelation) { return { tenantId: input.tenantId, principalId: SYSTEM_ACTOR_ID }; }
function mustSuppress(type: string, subcategory?: string) {
  return type === "complaint" || (type === "bounce" && subcategory?.startsWith("permanent") === true);
}
