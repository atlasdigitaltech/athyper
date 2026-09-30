import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type {
  ConnectorInstance,
  ConnectorType,
  Delivery,
  DeliveryAttemptEvidence,
  DeliveryFailure,
  EndpointDefinition,
  InboundAdmission,
  IntegrationDlqReplayReceipt,
  IntegrationRepository,
  RetryPolicy,
} from "@athyper/server-contract-integration";
import { sql, type Kysely, type Transaction } from "kysely";

type Database = Record<string, never>;
type Row = Record<string, unknown>;
type Evidence = {
  readonly audit: AuditRecorder<Transaction<Database>>;
  readonly outbox: OutboxWriter<Transaction<Database>>;
};

export class KyselyIntegrationRepository implements IntegrationRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly evidence?: Evidence,
  ) {}

  async listTypes(categoryCode?: string): Promise<readonly ConnectorType[]> {
    const result = categoryCode
      ? await sql<Row>`SELECT * FROM control.connector_type WHERE status='active' AND category_code=${categoryCode} ORDER BY name`.execute(
          this.db,
        )
      : await sql<Row>`SELECT * FROM control.connector_type WHERE status='active' ORDER BY name`.execute(
          this.db,
        );
    return result.rows.map(typeRow);
  }
  async getType(id: string): Promise<ConnectorType | undefined> {
    return optional(
      (
        await sql<Row>`SELECT * FROM control.connector_type WHERE id=${id}::uuid`.execute(
          this.db,
        )
      ).rows[0],
      typeRow,
    );
  }
  async getInstance(
    tenantId: string,
    id: string,
  ): Promise<ConnectorInstance | undefined> {
    return optional(
      (
        await sql<Row>`SELECT * FROM control.connector_instance WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`.execute(
          this.db,
        )
      ).rows[0],
      instanceRow,
    );
  }
  async getEndpoint(
    tenantId: string,
    id: string,
  ): Promise<EndpointDefinition | undefined> {
    return optional(
      (
        await sql<Row>`SELECT * FROM control.integration_endpoint WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`.execute(
          this.db,
        )
      ).rows[0],
      endpointRow,
    );
  }
  async createDelivery(
    input: Omit<Delivery, "id" | "status" | "attemptCount">,
    actorPrincipalId: string,
  ): Promise<Delivery> {
    const result =
      await sql<Row>`INSERT INTO event.integration_delivery(tenant_id,endpoint_id,invocation_plan,payload,payload_hash,idempotency_key,created_by) VALUES(${input.tenantId}::uuid,${input.endpointId}::uuid,${JSON.stringify(input.plan)}::jsonb,${JSON.stringify(input.payload)}::jsonb,${input.payloadHash},${input.idempotencyKey},${actorPrincipalId}::uuid) ON CONFLICT(tenant_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key WHERE event.integration_delivery.payload_hash=EXCLUDED.payload_hash RETURNING *`.execute(
        this.db,
      );
    if (!result.rows[0]) throw coded("INTEGRATION_IDEMPOTENCY_CONFLICT", 409);
    return deliveryRow(result.rows[0]);
  }
  async getDelivery(
    tenantId: string,
    id: string,
  ): Promise<Delivery | undefined> {
    return optional(
      (
        await sql<Row>`SELECT * FROM event.integration_delivery WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`.execute(
          this.db,
        )
      ).rows[0],
      deliveryRow,
    );
  }
  async beginAttempt(tenantId: string, id: string): Promise<Delivery> {
    const result =
      await sql<Row>`UPDATE event.integration_delivery SET status='processing',attempt_count=attempt_count+1,next_attempt_at=NULL WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND status IN ('pending','failed','processing') RETURNING *`.execute(
        this.db,
      );
    if (!result.rows[0]) throw coded("INTEGRATION_DELIVERY_NOT_CLAIMABLE", 409);
    return deliveryRow(result.rows[0]);
  }

  async appendAttempt(e: DeliveryAttemptEvidence): Promise<void> {
    const error = e.redactedError
      ? {
          code: e.redactedError.code,
          ...(e.redactedError.fields ? { fields: e.redactedError.fields } : {}),
        }
      : undefined;
    await sql`INSERT INTO log.integration_delivery_attempt(tenant_id,delivery_id,attempt,started_at,completed_at,request_url,request_method,request_headers,request_body_hash,response_status,response_headers,response_body_hash,response_error,response_error_classification,response_error_purge_after,duration_ms,disposition,error_code,created_by) SELECT ${e.tenantId}::uuid,${e.deliveryId}::uuid,${e.attempt},${e.startedAt}::timestamptz,${e.completedAt}::timestamptz,${e.requestUrl},${e.requestMethod},${JSON.stringify(e.requestHeaders)}::jsonb,${e.requestBodyHash},${e.responseStatus ?? null},${JSON.stringify(e.responseHeaders)}::jsonb,${e.responseBodyHash ?? null},${error ? JSON.stringify(error) : null}::jsonb,${e.redactedError?.classification ?? null},${e.redactedError?.purgeAfter ?? null}::timestamptz,${e.durationMs},${e.disposition},${e.errorCode ?? null},d.created_by FROM event.integration_delivery d WHERE d.tenant_id=${e.tenantId}::uuid AND d.id=${e.deliveryId}::uuid`.execute(
      this.db,
    );
  }
  async markDelivered(tenantId: string, id: string): Promise<void> {
    await sql`UPDATE event.integration_delivery SET status='delivered',delivered_at=now(),last_error_code=NULL,last_error_message=NULL WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`.execute(
      this.db,
    );
  }
  async scheduleRetry(
    tenantId: string,
    id: string,
    next: string,
    failure: DeliveryFailure,
  ): Promise<void> {
    await sql`UPDATE event.integration_delivery SET status='failed',next_attempt_at=${next}::timestamptz,last_error_code=${failure.code},last_error_message=${failure.message} WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`.execute(
      this.db,
    );
  }
  async moveToDlq(
    tenantId: string,
    id: string,
    failure: DeliveryFailure,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await sql`UPDATE event.integration_delivery SET status='dead_letter',next_attempt_at=NULL,last_error_code=${failure.code},last_error_message=${failure.message} WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`.execute(
        tx,
      );
      await sql`INSERT INTO log.integration_dlq(tenant_id,delivery_id,failure_code,failure_message,attempt_count) SELECT tenant_id,id,${failure.code},${failure.message},attempt_count FROM event.integration_delivery WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid ON CONFLICT(tenant_id,delivery_id) DO NOTHING`.execute(
        tx,
      );
    });
  }

  async prepareDlqReplay(input: {
    readonly tenantId: string;
    readonly deliveryId: string;
    readonly principalId: string;
    readonly requestId: string;
    readonly correlationId?: string;
  }): Promise<IntegrationDlqReplayReceipt> {
    return this.db.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.current_tenant_id',${input.tenantId},true),set_config('app.current_principal_id',${input.principalId},true)`.execute(
        tx,
      );
      const row = (
        await sql<Row>`SELECT q.*,d.status AS delivery_status,d.invocation_plan FROM log.integration_dlq q JOIN event.integration_delivery d ON d.tenant_id=q.tenant_id AND d.id=q.delivery_id WHERE q.tenant_id=${input.tenantId}::uuid AND q.delivery_id=${input.deliveryId}::uuid FOR UPDATE OF q,d`.execute(
          tx,
        )
      ).rows[0];
      if (!row) throw coded("INTEGRATION_DLQ_NOT_FOUND", 404);
      const dlqId = String(row["id"]),
        jobId = `integration-replay-${input.tenantId}-${input.deliveryId}-${dlqId}`,
        maxAttempts = retry(
          object(row["invocation_plan"])["retryPolicy"],
        ).maxAttempts;
      if (row["replayed_at"])
        return {
          kind: "replayed",
          tenantId: input.tenantId,
          deliveryId: input.deliveryId,
          dlqId,
          replayedAt: iso(row["replayed_at"]),
          replayedBy: String(row["replayed_by"]),
          jobId,
          maxAttempts,
        };
      if (row["delivery_status"] !== "dead_letter")
        throw coded("INTEGRATION_DLQ_NOT_REPLAYABLE", 409);
      const replayedAt = new Date().toISOString();
      await sql`UPDATE log.integration_dlq SET replayed_at=${replayedAt}::timestamptz,replayed_by=${input.principalId}::uuid WHERE id=${dlqId}::uuid`.execute(
        tx,
      );
      await sql`UPDATE event.integration_delivery SET status='pending',next_attempt_at=now(),last_error_code=NULL,last_error_message=NULL,delivered_at=NULL WHERE tenant_id=${input.tenantId}::uuid AND id=${input.deliveryId}::uuid AND status='dead_letter'`.execute(
        tx,
      );
      await this.evidence?.outbox.append(
        {
          tenantId: input.tenantId,
          topic: "integration",
          eventType: "integration.delivery.replay_requested",
          eventKey: jobId,
          aggregateType: "integration.delivery",
          aggregateId: input.deliveryId,
          actorId: input.principalId,
          ...(input.correlationId
            ? { correlationId: input.correlationId }
            : {}),
          payload: { deliveryId: input.deliveryId, dlqId, jobId },
        },
        tx,
      );
      await this.evidence?.audit.record(
        {
          eventCode: "integration.delivery.replay_requested",
          action: "replay",
          outcome: "success",
          actor: { kind: "user", principalId: input.principalId },
          tenantId: input.tenantId,
          entityType: "integration.delivery",
          entityId: input.deliveryId,
          requestId: input.requestId,
          ...(input.correlationId
            ? { correlationId: input.correlationId }
            : {}),
          metadata: { dlqId, jobId },
        },
        tx,
      );
      return {
        kind: "prepared",
        tenantId: input.tenantId,
        deliveryId: input.deliveryId,
        dlqId,
        replayedAt,
        replayedBy: input.principalId,
        jobId,
        maxAttempts,
      };
    });
  }

  async admitInbound(
    i: InboundAdmission,
  ): Promise<{ id: string; duplicate: boolean }> {
    const payload = JSON.parse(Buffer.from(i.rawBody).toString("utf8"));
    const result =
      await sql<Row>`INSERT INTO event.integration_inbound_receipt(tenant_id,subscription_id,delivery_key,timestamp_value,body_hash,payload) VALUES(${i.tenantId}::uuid,${i.subscriptionId}::uuid,${i.deliveryKey},${i.timestamp},${i.bodyHash},${JSON.stringify(payload)}::jsonb) ON CONFLICT(tenant_id,subscription_id,delivery_key) DO NOTHING RETURNING id`.execute(
        this.db,
      );
    if (result.rows[0])
      return { id: String(result.rows[0]["id"]), duplicate: false };
    const existing =
      await sql<Row>`SELECT id,body_hash FROM event.integration_inbound_receipt WHERE tenant_id=${i.tenantId}::uuid AND subscription_id=${i.subscriptionId}::uuid AND delivery_key=${i.deliveryKey}`.execute(
        this.db,
      );
    const receipt = existing.rows[0];
    if (!receipt) throw new Error("Inbound webhook receipt missing after conflict");
    if (receipt["body_hash"] !== i.bodyHash)
      throw Object.assign(new Error("INTEGRATION_WEBHOOK_IDEMPOTENCY_CONFLICT"), {
        code: "INTEGRATION_WEBHOOK_IDEMPOTENCY_CONFLICT", status: 409, retryable: false,
      });
    return { id: String(receipt["id"]), duplicate: true };
  }
}

const retry = (value: unknown): RetryPolicy => {
  const item = object(value);
  return {
    maxAttempts: number(item["maxAttempts"] ?? item["max_attempts"], 3),
    initialDelayMs: number(
      item["initialDelayMs"] ?? item["initial_delay_ms"],
      1000,
    ),
    maxDelayMs: number(item["maxDelayMs"] ?? item["max_delay_ms"], 60000),
    multiplier: number(item["multiplier"], 2),
    retryStatuses: Array.isArray(item["retryStatuses"])
      ? item["retryStatuses"].map(Number)
      : [408, 425, 429, 500, 502, 503, 504],
  };
};
const typeRow = (row: Row): ConnectorType => ({
  id: String(row["id"]),
  code: String(row["code"]),
  name: String(row["name"]),
  categoryCode: String(row["category_code"]),
  configSchema: object(row["config_schema"]),
  authTypes: array(row["auth_types"]),
  capabilities: array(row["capabilities"]),
  healthCheckConfig: object(row["health_check_config"]),
  status: row["status"] as ConnectorType["status"],
});
const instanceRow = (row: Row): ConnectorInstance => ({
  id: String(row["id"]),
  tenantId: String(row["tenant_id"]),
  connectorTypeId: String(row["connector_type_id"]),
  code: String(row["code"]),
  name: String(row["name"]),
  ...(row["base_url"] ? { baseUrl: String(row["base_url"]) } : {}),
  ...(row["credential_reference"]
    ? { credentialReference: String(row["credential_reference"]) }
    : {}),
  credentialRevision: number(row["credential_revision"], 1),
  config: object(row["config"]),
  status: row["status"] as ConnectorInstance["status"],
});
const endpointRow = (row: Row): EndpointDefinition => ({
  id: String(row["id"]),
  tenantId: String(row["tenant_id"]),
  connectorInstanceId: String(row["connector_instance_id"]),
  code: String(row["code"]),
  name: String(row["name"]),
  kind: String(row["endpoint_kind_code"]),
  path: String(row["path"]),
  method: row["http_method"] as EndpointDefinition["method"],
  requestContentType: String(row["request_content_type"]),
  timeoutMs: number(row["timeout_ms"], 10000),
  headers: object(row["headers"]) as Record<string, string>,
  requestSchema: object(row["request_schema"]),
  maxPayloadBytes: number(row["max_payload_bytes"], 1048576),
  retryPolicy: retry(row["retry_policy"]),
  version: number(row["definition_version"], 1),
  status: row["status"] as EndpointDefinition["status"],
});
const deliveryRow = (row: Row): Delivery => ({
  id: String(row["id"]),
  tenantId: String(row["tenant_id"]),
  endpointId: String(row["endpoint_id"]),
  plan: object(row["invocation_plan"]) as unknown as Delivery["plan"],
  payload: object(row["payload"]),
  payloadHash: String(row["payload_hash"]),
  idempotencyKey: String(row["idempotency_key"]),
  status: row["status"] as Delivery["status"],
  attemptCount: number(row["attempt_count"], 0),
  ...(row["next_attempt_at"]
    ? { nextAttemptAt: iso(row["next_attempt_at"]) }
    : {}),
});
function optional<T>(
  row: Row | undefined,
  map: (value: Row) => T,
): T | undefined {
  return row ? map(row) : undefined;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function array(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}
function number(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function iso(value: unknown): string {
  return new Date(String(value)).toISOString();
}
function coded(code: string, status: number): Error {
  return Object.assign(new Error(code), { code, status, retryable: false });
}
