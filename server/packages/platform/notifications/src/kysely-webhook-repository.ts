import { sql, type Transaction } from "kysely";
import type {
  WebhookDeliveryCoordinate,
  WebhookDeliveryOutcome,
  WebhookDeliveryRepository,
} from "@athyper/server-contract-notifications";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

type NotificationTransaction = Transaction<Record<string, never>>;

export function createKyselyWebhookDeliveryRepository(options: {
  readonly transactions: PlaneTransactionCoordinator<NotificationTransaction>;
}): WebhookDeliveryRepository {
  return {
    async loadDue(coordinate) {
      return options.transactions.run(coordinate.planeKey, coordinate, async (transaction) => {
        const claimed = await sql<Record<string, unknown>>`
          UPDATE event.notification_delivery
          SET status='sending', attempt_count=attempt_count+1,
              locked_until=now()+interval '60 seconds', updated_at=now(),
              updated_by=${coordinate.principalId}::uuid
          WHERE tenant_id=${coordinate.tenantId}::uuid
            AND id=${coordinate.deliveryId}::uuid
            AND channel='webhook'
            AND (status IN ('pending','failed','queued')
              OR (status='sending' AND locked_until<=now()))
            AND attempt_count<max_attempts
          RETURNING *
        `.execute(transaction);
        const row = claimed.rows[0];
        if (!row) return undefined;
        const detail = object(row["channel_detail"]);
        const message = await sql<Record<string, unknown>>`
          SELECT event_code,payload
          FROM event.notification_message
          WHERE tenant_id=${coordinate.tenantId}::uuid
            AND id=${String(row["message_id"])}::uuid
        `.execute(transaction);
        const subscriptionId = typeof row["subscription_id"] === "string"
          ? row["subscription_id"]
          : typeof detail["subscriptionId"] === "string"
            ? detail["subscriptionId"]
            : undefined;
        const subscription = subscriptionId
          ? await sql<Record<string, unknown>>`
              SELECT target_url,signing_secret,timeout_ms
              FROM event.webhook_subscription
              WHERE tenant_id=${coordinate.tenantId}::uuid
                AND id=${subscriptionId}::uuid AND is_active
            `.execute(transaction)
          : undefined;
        const target = subscription?.rows[0];
        if (!target) {
          await sql`
            UPDATE event.notification_delivery
            SET status='failed', attempt_count=max_attempts,
                last_error='Webhook subscription is unavailable',
                error_category='permanent', next_retry_at=NULL, locked_until=NULL,
                updated_at=now(), updated_by=${coordinate.principalId}::uuid
            WHERE tenant_id=${coordinate.tenantId}::uuid
              AND id=${coordinate.deliveryId}::uuid
          `.execute(transaction);
          await recordAttempt(transaction, coordinate, {
            delivered:false,
            retryable:false,
            errorCategory:"permanent",
          });
          await sql`
            INSERT INTO log.notification_dlq
              (tenant_id,queue_name,job_name,payload,error_message,retry_count,last_attempted_at)
            VALUES (${coordinate.tenantId}::uuid,'webhooks','webhook.deliver',
              ${JSON.stringify({ deliveryId:coordinate.deliveryId })}::jsonb,
              'Webhook subscription is unavailable',${Number(row["max_attempts"])},now())
          `.execute(transaction);
          if (typeof row["message_id"] === "string") {
            await aggregateMessage(transaction, coordinate, row["message_id"]);
          }
          return undefined;
        }
        return {
          deliveryId: coordinate.deliveryId,
          tenantId: coordinate.tenantId,
          topic: String(message.rows[0]?.["event_code"] ?? "notification"),
          targetUrl: String(target["target_url"]),
          payload: Object.keys(detail).length ? detail : object(message.rows[0]?.["payload"]),
          ...(typeof target["signing_secret"] === "string"
            ? { signingSecret: target["signing_secret"] }
            : {}),
          ...(typeof target["timeout_ms"] === "number"
            ? { timeoutMs: target["timeout_ms"] }
            : {}),
        };
      });
    },

    async complete(coordinate, outcome) {
      await options.transactions.run(coordinate.planeKey, coordinate, async (transaction) => {
        const current = await sql<{
          attempt_count:number;
          max_attempts:number;
          message_id:string|null;
        }>`
          SELECT attempt_count,max_attempts,message_id
          FROM event.notification_delivery
          WHERE tenant_id=${coordinate.tenantId}::uuid
            AND id=${coordinate.deliveryId}::uuid
          FOR UPDATE
        `.execute(transaction);
        const row = current.rows[0];
        if (!row) return;
        const terminal = !outcome.delivered
          && (!outcome.retryable || row.attempt_count >= row.max_attempts);
        const nextRetry = outcome.retryable && !terminal
          ? new Date(Date.now() + (outcome.retryAfterMs
            ?? Math.min(3_600_000, 30_000 * 2 ** Math.max(0, row.attempt_count - 1))))
            .toISOString()
          : null;
        await sql`
          UPDATE event.notification_delivery
          SET status=${outcome.delivered ? "delivered" : "failed"},
              delivered_at=${outcome.delivered ? new Date().toISOString() : null}::timestamptz,
              last_error=${outcome.delivered ? null : `webhook_http_${outcome.statusCode ?? "network"}`},
              error_category=${outcome.errorCategory ?? null},
              next_retry_at=${nextRetry}::timestamptz, locked_until=NULL,
              updated_at=now(), updated_by=${coordinate.principalId}::uuid
          WHERE tenant_id=${coordinate.tenantId}::uuid
            AND id=${coordinate.deliveryId}::uuid
        `.execute(transaction);
        await recordAttempt(transaction, coordinate, outcome);
        if (terminal) {
          await sql`
            INSERT INTO log.notification_dlq
              (tenant_id,queue_name,job_name,payload,error_message,retry_count,last_attempted_at)
            VALUES (${coordinate.tenantId}::uuid,'webhooks','webhook.deliver',
              ${JSON.stringify({ deliveryId:coordinate.deliveryId })}::jsonb,
              ${`webhook delivery failed: ${outcome.errorCategory ?? "unknown"}`},
              ${row.attempt_count},now())
          `.execute(transaction);
        }
        if (row.message_id) {
          await aggregateMessage(transaction, coordinate, row.message_id);
        }
      });
    },
  };
}

async function recordAttempt(
  transaction: NotificationTransaction,
  coordinate: WebhookDeliveryCoordinate,
  outcome: WebhookDeliveryOutcome,
): Promise<void> {
  await sql`
    INSERT INTO log.notification_delivery_attempt
      (tenant_id,delivery_id,request_url,request_method,response_status,duration_ms,
       is_success,error,is_redacted,redaction_version,created_by)
    VALUES (${coordinate.tenantId}::uuid,${coordinate.deliveryId}::uuid,
      'provider:webhook','POST',${outcome.statusCode ?? null},
      ${Math.max(0, Math.round(outcome.durationMs ?? 0))},${outcome.delivered},
      ${outcome.delivered ? null : outcome.errorCategory ?? "webhook delivery failed"},
      true,'notification-v1',${coordinate.principalId}::uuid)
  `.execute(transaction);
}

async function aggregateMessage(
  transaction: NotificationTransaction,
  coordinate: WebhookDeliveryCoordinate,
  messageId: string,
): Promise<void> {
  await sql`
    UPDATE event.notification_message message
    SET delivered_count=aggregate.delivered, failed_count=aggregate.failed,
        status=CASE WHEN aggregate.pending>0 THEN 'delivering'
          WHEN aggregate.failed=0 THEN 'completed'
          WHEN aggregate.delivered=0 THEN 'failed' ELSE 'partially_sent' END,
        completed_at=CASE WHEN aggregate.pending=0 THEN now() ELSE NULL END,
        updated_at=now(), updated_by=${coordinate.principalId}::uuid
    FROM (
      SELECT message_id,
        count(*) FILTER(WHERE status='delivered')::int delivered,
        count(*) FILTER(WHERE status='failed'
          AND (attempt_count>=max_attempts OR error_category IN ('permanent','auth')))::int failed,
        count(*) FILTER(WHERE status IN ('pending','queued','sending')
          OR (status='failed' AND attempt_count<max_attempts
            AND coalesce(error_category,'transient') NOT IN ('permanent','auth')))::int pending
      FROM event.notification_delivery
      WHERE tenant_id=${coordinate.tenantId}::uuid AND message_id=${messageId}::uuid
      GROUP BY message_id
    ) aggregate
    WHERE message.tenant_id=${coordinate.tenantId}::uuid
      AND message.id=aggregate.message_id
  `.execute(transaction);
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return {};
}
