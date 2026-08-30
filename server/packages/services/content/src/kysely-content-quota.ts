import { sql } from "kysely";
import { ContentQuotaExceededError } from "./errors.js";
import type { ContentQuotaLedger } from "./ports.js";
import type { ContentTransaction } from "./kysely-content-repository.js";

const METRIC_CODE = "content_item_count";
const RESOURCE_TYPE = "document.content_item";
interface Counter { consumed_value: string; reserved_value: string }
interface Reservation { id: string; status: string; reserved_value: string; actual_value: string | null }

export function createKyselyContentQuotaLedger(): ContentQuotaLedger<ContentTransaction> {
  return {
    async reserve(input, tx) {
      const metricId = await metric(tx);
      await ensureCounter(input.context.tenantId, input.context.principalId, metricId, input.kind, tx);
      const usage = await lockCounter(input.context.tenantId, metricId, input.kind, tx);
      if (await loadReservation(input.context.tenantId, metricId, input.kind, input.contentItemId, tx, true)) return;
      if (num(usage.consumed_value) + num(usage.reserved_value) + 1 > input.limitItems)
        throw new ContentQuotaExceededError(input.limitItems, num(usage.consumed_value), num(usage.reserved_value), input.retryAfterSeconds);
      await sql`INSERT INTO runtime_meta.usage_reservation
        (tenant_id,usage_metric_id,dimension_code,resource_type,resource_id,reserved_value,status,expires_at,created_by)
        VALUES (${input.context.tenantId}::uuid,${metricId}::uuid,${input.kind},${RESOURCE_TYPE},${input.contentItemId}::uuid,1,'reserved',${input.expiresAt}::timestamptz,${input.context.principalId}::uuid)`.execute(tx);
      await adjust(input.context.tenantId, metricId, input.kind, 0, 1, input.context.principalId, tx);
    },
    async commit(input, tx) {
      const metricId = await metric(tx);
      await lockCounter(input.context.tenantId, metricId, input.kind, tx);
      const row = await loadReservation(input.context.tenantId, metricId, input.kind, input.contentItemId, tx, true);
      if (!row || row.status === "committed") return;
      if (row.status !== "reserved") throw new Error("Content quota reservation is not active");
      await adjust(input.context.tenantId, metricId, input.kind, 1, -num(row.reserved_value), input.context.principalId, tx);
      await sql`UPDATE runtime_meta.usage_reservation SET status='committed',actual_value=1,
        committed_at=clock_timestamp(),updated_by=${input.context.principalId}::uuid WHERE id=${row.id}::uuid`.execute(tx);
    },
    async release(input, tx) {
      const metricId = await metric(tx);
      await ensureCounter(input.context.tenantId, input.context.principalId, metricId, input.kind, tx);
      await lockCounter(input.context.tenantId, metricId, input.kind, tx);
      const row = await loadReservation(input.context.tenantId, metricId, input.kind, input.contentItemId, tx, true);
      if (!row || !["reserved", "committed"].includes(row.status)) return;
      await adjust(input.context.tenantId, metricId, input.kind,
        row.status === "committed" ? -num(row.actual_value) : 0,
        row.status === "reserved" ? -num(row.reserved_value) : 0,
        input.context.principalId, tx);
      await sql`UPDATE runtime_meta.usage_reservation SET status='released',released_at=clock_timestamp(),
        updated_by=${input.context.principalId}::uuid WHERE id=${row.id}::uuid`.execute(tx);
    },
    async usage(input, tx) {
      const metricId = await metric(tx);
      const result = await sql<Counter>`SELECT consumed_value,reserved_value FROM runtime_meta.tenant_usage_counter
        WHERE tenant_id=${input.context.tenantId}::uuid AND usage_metric_id=${metricId}::uuid AND dimension_code=${input.kind}`.execute(tx);
      return { usedItems: num(result.rows[0]?.consumed_value), reservedItems: num(result.rows[0]?.reserved_value) };
    },
    async expire(input, tx) {
      const metricId = await metric(tx);
      const expired = await sql<{ id: string; dimension_code: string; reserved_value: string }>`SELECT id,dimension_code,reserved_value FROM runtime_meta.usage_reservation
        WHERE tenant_id=${input.context.tenantId}::uuid AND usage_metric_id=${metricId}::uuid
          AND resource_type=${RESOURCE_TYPE} AND status='reserved' AND expires_at<=clock_timestamp()
        ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT ${input.limit}`.execute(tx);
      for (const row of expired.rows) {
        await ensureCounter(input.context.tenantId, input.context.principalId, metricId, row.dimension_code, tx);
        await lockCounter(input.context.tenantId, metricId, row.dimension_code, tx);
        await adjust(input.context.tenantId, metricId, row.dimension_code, 0, -num(row.reserved_value), input.context.principalId, tx);
        await sql`UPDATE runtime_meta.usage_reservation SET status='expired',released_at=clock_timestamp(),
          updated_by=${input.context.principalId}::uuid WHERE id=${row.id}::uuid AND status='reserved'`.execute(tx);
      }
      return expired.rows.length;
    },
    async reconcile(input, tx) {
      const metricId = await metric(tx);
      const result = await sql<{ count: string }>`SELECT count(*) count FROM document.content_item
        WHERE tenant_id=${input.context.tenantId}::uuid AND kind=${input.kind}`.execute(tx);
      const value = num(result.rows[0]?.count);
      await sql`INSERT INTO runtime_meta.tenant_usage_counter
        (tenant_id,usage_metric_id,dimension_code,consumed_value,updated_by,reconciled_at)
        VALUES (${input.context.tenantId}::uuid,${metricId}::uuid,${input.kind},${value},${input.context.principalId}::uuid,clock_timestamp())
        ON CONFLICT(tenant_id,usage_metric_id,dimension_code) DO UPDATE
        SET consumed_value=${value},updated_by=${input.context.principalId}::uuid,reconciled_at=clock_timestamp()`.execute(tx);
      return value;
    },
  };
}

async function metric(tx: ContentTransaction): Promise<string> {
  const result = await sql<{ id: string }>`SELECT id FROM control.usage_metric_catalog WHERE code=${METRIC_CODE} AND status='active'`.execute(tx);
  if (!result.rows[0]) throw new Error("Content quota metric is not provisioned");
  return result.rows[0].id;
}
async function ensureCounter(tenantId: string, principalId: string, metricId: string, dimension: string, tx: ContentTransaction): Promise<void> {
  await sql`INSERT INTO runtime_meta.tenant_usage_counter(tenant_id,usage_metric_id,dimension_code,updated_by)
    VALUES (${tenantId}::uuid,${metricId}::uuid,${dimension},${principalId}::uuid) ON CONFLICT DO NOTHING`.execute(tx);
}
async function lockCounter(tenantId: string, metricId: string, dimension: string, tx: ContentTransaction): Promise<Counter> {
  const result = await sql<Counter>`SELECT consumed_value,reserved_value FROM runtime_meta.tenant_usage_counter
    WHERE tenant_id=${tenantId}::uuid AND usage_metric_id=${metricId}::uuid AND dimension_code=${dimension} FOR UPDATE`.execute(tx);
  if (!result.rows[0]) throw new Error("Content quota counter is unavailable");
  return result.rows[0];
}
async function loadReservation(tenantId: string, metricId: string, dimension: string, resourceId: string, tx: ContentTransaction, lock: boolean): Promise<Reservation | undefined> {
  const query = sql<Reservation>`SELECT id,status,reserved_value,actual_value FROM runtime_meta.usage_reservation
    WHERE tenant_id=${tenantId}::uuid AND usage_metric_id=${metricId}::uuid AND dimension_code=${dimension}
      AND resource_type=${RESOURCE_TYPE} AND resource_id=${resourceId}::uuid ${lock ? sql`FOR UPDATE` : sql``}`;
  return (await query.execute(tx)).rows[0];
}
async function adjust(tenantId: string, metricId: string, dimension: string, consumed: number, reserved: number, principalId: string, tx: ContentTransaction): Promise<void> {
  await sql`UPDATE runtime_meta.tenant_usage_counter SET consumed_value=consumed_value+${consumed},
    reserved_value=reserved_value+${reserved},updated_by=${principalId}::uuid
    WHERE tenant_id=${tenantId}::uuid AND usage_metric_id=${metricId}::uuid AND dimension_code=${dimension}`.execute(tx);
}
function num(value: string | null | undefined): number { return Number(value ?? 0); }
