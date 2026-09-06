import { sql, type Transaction } from "kysely";
import type {
  NotificationAttachmentReference,
  NotificationPlanner,
  NotificationSourceEvent,
} from "@athyper/server-contract-notifications";
import type {
  JobExecutionResult,
  JobHandler,
} from "@athyper/server-contract-jobs";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

export const PLAN_NOTIFICATION_OUTBOX_JOB = "notifications.plan-outbox";
export interface NotificationOutboxSweepRequest {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
  readonly workerId: string;
  readonly batchSize?: number;
}
export interface NotificationPlanningMeasurement {
  readonly outcome: "completed" | "retry" | "dead_letter";
  readonly eventCode: string;
  readonly attemptCount: number;
  readonly durationMs: number;
}
interface ClaimedOutbox {
  readonly stateId: string;
  readonly event: NotificationSourceEvent;
  readonly attemptCount: number;
}
interface NotificationOutboxRepository {
  claim(
    input: NotificationOutboxSweepRequest,
  ): Promise<readonly ClaimedOutbox[]>;
  complete(
    input: NotificationOutboxSweepRequest,
    stateId: string,
    messageCount: number,
  ): Promise<void>;
  fail(
    input: NotificationOutboxSweepRequest,
    item: ClaimedOutbox,
    error: string,
  ): Promise<void>;
}

export function createKyselyNotificationOutboxRepository(options: {
  readonly transactions: PlaneTransactionCoordinator<
    Transaction<Record<string, never>>
  >;
}): NotificationOutboxRepository {
  return {
    async claim(input) {
      return options.transactions.run(input.planeKey, input, async (tx) => {
        const batch = bounded(input.batchSize ?? 50, 1, 250);
        await stampTenantWorker(tx, input.tenantId);
        await sql`INSERT INTO event.notification_outbox_state (tenant_id,outbox_id,status,created_by) SELECT outbox.tenant_id,outbox.id,'pending',COALESCE(outbox.actor_id,(SELECT principal.id FROM master.principal principal WHERE principal.tenant_id=outbox.tenant_id AND principal.status='active' ORDER BY (principal.principal_type='service_account') DESC,principal.created_at,principal.id LIMIT 1)) FROM event.outbox outbox WHERE outbox.tenant_id=${input.tenantId}::uuid AND outbox.event_type IS NOT NULL AND COALESCE(outbox.actor_id,(SELECT principal.id FROM master.principal principal WHERE principal.tenant_id=outbox.tenant_id AND principal.status='active' ORDER BY (principal.principal_type='service_account') DESC,principal.created_at,principal.id LIMIT 1)) IS NOT NULL AND EXISTS (SELECT 1 FROM control.notification_routing_rule rule WHERE rule.event_type=outbox.event_type AND rule.is_enabled AND (rule.tenant_id IS NULL OR rule.tenant_id=outbox.tenant_id)) AND NOT EXISTS (SELECT 1 FROM event.notification_outbox_state state WHERE state.tenant_id=outbox.tenant_id AND state.outbox_id=outbox.id) ORDER BY outbox.created_at LIMIT ${batch * 4} ON CONFLICT (tenant_id,outbox_id) DO NOTHING`.execute(
          tx,
        );
        const result = await sql<
          Record<string, unknown>
        >`WITH candidates AS (SELECT state.id FROM event.notification_outbox_state state WHERE state.tenant_id=${input.tenantId}::uuid AND (state.status IN ('pending','failed') OR (state.status='processing' AND state.locked_until<=now())) AND (state.next_retry_at IS NULL OR state.next_retry_at<=now()) ORDER BY state.created_at FOR UPDATE SKIP LOCKED LIMIT ${batch}),claimed AS (UPDATE event.notification_outbox_state state SET status='processing',attempt_count=attempt_count+1,locked_at=now(),locked_by=${input.workerId},locked_until=now()+interval '60 seconds',updated_at=now(),updated_by=state.created_by FROM candidates WHERE state.id=candidates.id RETURNING state.*) SELECT claimed.id AS state_id,claimed.attempt_count,outbox.* FROM claimed JOIN event.outbox outbox ON outbox.tenant_id=claimed.tenant_id AND outbox.id=claimed.outbox_id`.execute(
          tx,
        );
        return result.rows.map((row) => map(row, input));
      });
    },
    async complete(input, stateId, messageCount) {
      await options.transactions.run(input.planeKey, input, async (tx) => {
        await stampTenantWorker(tx, input.tenantId);
        await sql`UPDATE event.notification_outbox_state SET status='completed',message_count=${messageCount},processed_at=now(),locked_at=NULL,locked_by=NULL,locked_until=NULL,last_error=NULL,next_retry_at=NULL,updated_at=now(),updated_by=created_by WHERE tenant_id=${input.tenantId}::uuid AND id=${stateId}::uuid AND status='processing' AND locked_by=${input.workerId}`.execute(
          tx,
        );
      });
    },
    async fail(input, item, error) {
      await options.transactions.run(input.planeKey, input, async (tx) => {
        await stampTenantWorker(tx, input.tenantId);
        const terminal =
          notificationPlanningFailureDisposition(item.attemptCount) ===
          "dead_letter";
        await sql`UPDATE event.notification_outbox_state SET status=${terminal ? "dead_letter" : "failed"},last_error=${error.slice(0, 4000)},next_retry_at=${terminal ? null : new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.max(0, item.attemptCount - 1))).toISOString()}::timestamptz,locked_at=NULL,locked_by=NULL,locked_until=NULL,updated_at=now(),updated_by=created_by WHERE tenant_id=${input.tenantId}::uuid AND id=${item.stateId}::uuid AND locked_by=${input.workerId}`.execute(
          tx,
        );
        if (terminal)
          await sql`INSERT INTO log.notification_dlq (tenant_id,queue_name,job_name,payload,error_message,retry_count,last_attempted_at) VALUES (${input.tenantId}::uuid,'notifications.planning','outbox',${JSON.stringify({ stateId: item.stateId, eventId: item.event.id, eventCode: item.event.eventCode })}::jsonb,${error.slice(0, 4000)},${item.attemptCount},now())`.execute(
            tx,
          );
      });
    },
  };
}
export function createNotificationOutboxSweepHandler(options: {
  readonly repository: NotificationOutboxRepository;
  readonly planner: NotificationPlanner;
  readonly telemetry?: (measurement: NotificationPlanningMeasurement) => void;
}): JobHandler<
  typeof PLAN_NOTIFICATION_OUTBOX_JOB,
  NotificationOutboxSweepRequest
> {
  return {
    async handle(job): Promise<JobExecutionResult> {
      const request = valid(job.data);
      const claimed = await options.repository.claim(request);
      let messages = 0,
        failed = 0;
      for (const item of claimed) {
        const started = performance.now();
        try {
          const result = await options.planner.plan(item.event);
          messages += result.messages;
          await options.repository.complete(
            request,
            item.stateId,
            result.messages,
          );
          options.telemetry?.({
            outcome: "completed",
            eventCode: item.event.eventCode,
            attemptCount: item.attemptCount,
            durationMs: performance.now() - started,
          });
        } catch (error) {
          failed++;
          await options.repository.fail(
            request,
            item,
            error instanceof Error ? error.message : String(error),
          );
          options.telemetry?.({
            outcome: notificationPlanningFailureDisposition(item.attemptCount),
            eventCode: item.event.eventCode,
            attemptCount: item.attemptCount,
            durationMs: performance.now() - started,
          });
        }
      }
      return {
        status: "completed",
        output: { claimed: claimed.length, messages, failed },
      };
    },
  };
}
function map(
  row: Record<string, unknown>,
  input: NotificationOutboxSweepRequest,
): ClaimedOutbox {
  const payload = object(row["payload"]);
  const attachments = attachmentReferences(
    payload["notification_attachments"] ?? payload["attachments"],
  );
  return {
    stateId: String(row["state_id"]),
    attemptCount: Number(row["attempt_count"]),
    event: {
      id: String(row["id"]),
      planeKey: input.planeKey,
      tenantId: input.tenantId,
      actorPrincipalId:
        typeof row["actor_id"] === "string"
          ? row["actor_id"]
          : input.principalId,
      eventCode: String(row["event_type"]),
      ...(row["created_at"]
        ? { occurredAt: new Date(String(row["created_at"])).toISOString() }
        : {}),
      ...(typeof row["entity_type"] === "string"
        ? { entityType: row["entity_type"] }
        : {}),
      ...(typeof row["entity_id"] === "string"
        ? { entityId: row["entity_id"] }
        : {}),
      ...(lifecycle(payload) ? { lifecycleState: lifecycle(payload) } : {}),
      payload,
      ...(strings(payload["recipient_principal_ids"]).length
        ? { recipientPrincipalIds: strings(payload["recipient_principal_ids"]) }
        : {}),
      ...(attachments.length ? { attachments } : {}),
      ...(typeof row["correlation_id"] === "string"
        ? { correlationId: row["correlation_id"] }
        : {}),
    },
  };
}
function attachmentReferences(
  value: unknown,
): readonly NotificationAttachmentReference[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => object(item))
    .filter(
      (item) =>
        typeof item["attachmentId"] === "string" &&
        ["current", "pinned"].includes(String(item["versionPolicy"])) &&
        ["link", "embed", "auto"].includes(
          String(item["requestedDisposition"]),
        ),
    )
    .map((item) => ({
      attachmentId: String(item["attachmentId"]),
      versionPolicy: item["versionPolicy"] as "current" | "pinned",
      ...(typeof item["attachmentVersionId"] === "string"
        ? { attachmentVersionId: item["attachmentVersionId"] }
        : {}),
      requestedDisposition: item["requestedDisposition"] as
        "link" | "embed" | "auto",
      required: item["required"] !== false,
      ...(typeof item["displayName"] === "string"
        ? { displayName: item["displayName"] }
        : {}),
    }));
}
async function stampTenantWorker(
  tx: Transaction<Record<string, never>>,
  tenantId: string,
): Promise<void> {
  const result = await sql<{
    id: string | null;
  }>`SELECT event.fn_notification_worker_principal(${tenantId}::uuid)::text id`.execute(
    tx,
  );
  const principalId = result.rows[0]?.id;
  if (!principalId)
    throw new Error(
      `No active notification worker principal exists for tenant ${tenantId}`,
    );
  await sql`SELECT set_config('app.current_principal_id',${principalId},true)`.execute(
    tx,
  );
}
function lifecycle(payload: Record<string, unknown>) {
  for (const key of ["lifecycle_state", "to_status", "to_state", "status"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  }
  return {};
}
function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function bounded(value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new TypeError(`batchSize must be ${min}-${max}`);
  return value;
}
function valid(value: NotificationOutboxSweepRequest) {
  if (
    !/^[0-9a-f-]{36}$/i.test(value.tenantId) ||
    !/^[0-9a-f-]{36}$/i.test(value.principalId) ||
    !value.workerId.trim() ||
    !["studio", "neon", "mesh"].includes(value.planeKey)
  )
    throw new TypeError("Invalid notification outbox sweep request");
  return value;
}
export function notificationPlanningFailureDisposition(
  attemptCount: number,
): "retry" | "dead_letter" {
  if (!Number.isInteger(attemptCount) || attemptCount < 1)
    throw new TypeError("attemptCount must be a positive integer");
  return attemptCount >= 10 ? "dead_letter" : "retry";
}
