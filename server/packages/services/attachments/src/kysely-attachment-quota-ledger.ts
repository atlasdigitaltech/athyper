import { sql } from "kysely";
import type { AttachmentQuotaLedger } from "./quota.js";
import { QuotaExceededError } from "./quota.js";
import type { AttachmentTransaction } from "./kysely-attachment-repository.js";

const BYTES = "attachment_storage_bytes";
const ITEMS = "attachment_item_count";
const RESOURCE = "document.attachment";
type Metric = { id: string; code: string };
type Counter = { code: string; consumed_value: string; reserved_value: string };
type Reservation = { id: string; code: string; status: string; reserved_value: string; actual_value: string | null };

export function createKyselyAttachmentQuotaLedger(): AttachmentQuotaLedger<AttachmentTransaction> {
  return {
    async reserve(input, tx) {
      const metrics = await loadMetrics(tx);
      await ensureCounters(input.tenantId, input.principalId, metrics, tx);
      const usage = await lockCounters(input.tenantId, tx);
      const existing = await reservations(input.tenantId, input.attachmentId, tx, true);
      if (existing.length === 2) return "existing";
      if (existing.length) throw new Error("Attachment quota reservation is incomplete");
      const bytes = find(usage, BYTES), items = find(usage, ITEMS);
      if (n(bytes.consumed_value) + n(bytes.reserved_value) + input.bytes > input.policy.limitBytes
        || n(items.consumed_value) + n(items.reserved_value) + 1 > input.policy.limitItems) {
        throw new QuotaExceededError(input.policy, {
          usedBytes: n(bytes.consumed_value), reservedBytes: n(bytes.reserved_value),
          usedItems: n(items.consumed_value), reservedItems: n(items.reserved_value),
        }, input.bytes);
      }
      for (const metric of metrics) {
        const value = metric.code === BYTES ? input.bytes : 1;
        await sql`INSERT INTO runtime_meta.usage_reservation
          (tenant_id,usage_metric_id,resource_type,resource_id,reserved_value,expires_at,created_by)
          VALUES(${input.tenantId}::uuid,${metric.id}::uuid,${RESOURCE},${input.attachmentId}::uuid,${value},${input.expiresAt}::timestamptz,${input.principalId}::uuid)`.execute(tx);
        await adjust(input.tenantId, metric.id, 0, value, input.principalId, tx);
      }
      return "created";
    },
    async commit(input, tx) {
      const metrics = await loadMetrics(tx), usage = await lockCounters(input.tenantId, tx);
      const rows = await reservations(input.tenantId, input.attachmentId, tx, true);
      if (rows.length !== 2) throw new Error("Attachment quota reservation not found");
      if (rows.every(row => row.status === "committed")) return;
      if (rows.some(row => row.status !== "reserved")) throw new Error("Attachment quota reservation is not active");
      const used = find(usage, BYTES), held = find(rows, BYTES);
      if (n(used.consumed_value) + n(used.reserved_value) + Math.max(0, input.actualBytes - n(held.reserved_value)) > input.policy.limitBytes) {
        const items = find(usage, ITEMS);
        throw new QuotaExceededError(input.policy, {
          usedBytes: n(used.consumed_value), reservedBytes: n(used.reserved_value),
          usedItems: n(items.consumed_value), reservedItems: n(items.reserved_value),
        }, input.actualBytes);
      }
      for (const row of rows) {
        const metric = metrics.find(value => value.code === row.code)!;
        const actual = row.code === BYTES ? input.actualBytes : 1;
        await adjust(input.tenantId, metric.id, actual, -n(row.reserved_value), input.principalId, tx);
        await sql`UPDATE runtime_meta.usage_reservation SET status='committed',actual_value=${actual},
          committed_at=clock_timestamp(),updated_by=${input.principalId}::uuid WHERE id=${row.id}::uuid`.execute(tx);
      }
    },
    async release(identity, tx) {
      const metrics = await loadMetrics(tx);
      await ensureCounters(identity.tenantId, identity.principalId, metrics, tx);
      await lockCounters(identity.tenantId, tx);
      const rows = (await reservations(identity.tenantId, identity.attachmentId, tx, true))
        .filter(row => row.status === "reserved" || row.status === "committed");
      if (!rows.length) return false;
      for (const row of rows) {
        const metric = metrics.find(value => value.code === row.code)!;
        await adjust(identity.tenantId, metric.id,
          row.status === "committed" ? -n(row.actual_value) : 0,
          row.status === "reserved" ? -n(row.reserved_value) : 0, identity.principalId, tx);
        await sql`UPDATE runtime_meta.usage_reservation SET status='released',released_at=clock_timestamp(),
          updated_by=${identity.principalId}::uuid WHERE id=${row.id}::uuid`.execute(tx);
      }
      return true;
    },
    async expire(input, tx) {
      const metrics = await loadMetrics(tx);
      await ensureCounters(input.tenantId, input.principalId, metrics, tx);
      await lockCounters(input.tenantId, tx);
      const candidates = await sql<{ resource_id: string }>`SELECT resource_id FROM runtime_meta.usage_reservation
        WHERE tenant_id=${input.tenantId}::uuid AND resource_type=${RESOURCE} AND usage_metric_id=${metrics[0]!.id}::uuid
          AND status='reserved' AND expires_at<=clock_timestamp()
        ORDER BY expires_at,resource_id FOR UPDATE SKIP LOCKED LIMIT ${input.limit}`.execute(tx);
      for (const candidate of candidates.rows) for (const row of await reservations(input.tenantId, candidate.resource_id, tx, true)) {
        if (row.status !== "reserved") continue;
        const metric = metrics.find(value => value.code === row.code)!;
        await adjust(input.tenantId, metric.id, 0, -n(row.reserved_value), input.principalId, tx);
        await sql`UPDATE runtime_meta.usage_reservation SET status='expired',released_at=clock_timestamp(),
          updated_by=${input.principalId}::uuid WHERE id=${row.id}::uuid AND status='reserved'`.execute(tx);
      }
      return candidates.rows.map(row => row.resource_id);
    },
  };
}

async function loadMetrics(tx: AttachmentTransaction): Promise<Metric[]> {
  const result = await sql<Metric>`SELECT id,code FROM control.usage_metric_catalog WHERE code IN(${BYTES},${ITEMS}) AND status='active' ORDER BY id`.execute(tx);
  if (result.rows.length !== 2) throw new Error("Attachment quota metrics are not provisioned");
  return result.rows;
}
async function ensureCounters(tenant: string, actor: string, metrics: Metric[], tx: AttachmentTransaction) {
  for (const metric of metrics) await sql`INSERT INTO runtime_meta.tenant_usage_counter(tenant_id,usage_metric_id,updated_by)
    VALUES(${tenant}::uuid,${metric.id}::uuid,${actor}::uuid) ON CONFLICT DO NOTHING`.execute(tx);
}
async function lockCounters(tenant: string, tx: AttachmentTransaction): Promise<Counter[]> {
  const result = await sql<Counter>`SELECT metric.code,counter.consumed_value,counter.reserved_value
    FROM runtime_meta.tenant_usage_counter counter JOIN control.usage_metric_catalog metric ON metric.id=counter.usage_metric_id
    WHERE counter.tenant_id=${tenant}::uuid AND counter.dimension_code='*' AND metric.code IN(${BYTES},${ITEMS})
    ORDER BY counter.usage_metric_id FOR UPDATE OF counter`.execute(tx);
  if (result.rows.length !== 2) throw new Error("Attachment quota counters are unavailable");
  return result.rows;
}
async function reservations(tenant: string, resource: string, tx: AttachmentTransaction, lock: boolean): Promise<Reservation[]> {
  const query = sql<Reservation>`SELECT reservation.id,metric.code,reservation.status,reservation.reserved_value,reservation.actual_value
    FROM runtime_meta.usage_reservation reservation JOIN control.usage_metric_catalog metric ON metric.id=reservation.usage_metric_id
    WHERE reservation.tenant_id=${tenant}::uuid AND reservation.resource_type=${RESOURCE} AND reservation.resource_id=${resource}::uuid
      AND metric.code IN(${BYTES},${ITEMS}) ORDER BY reservation.usage_metric_id ${lock ? sql`FOR UPDATE OF reservation` : sql``}`;
  return (await query.execute(tx)).rows;
}
async function adjust(tenant: string, metric: string, consumed: number, reserved: number, actor: string, tx: AttachmentTransaction) {
  await sql`UPDATE runtime_meta.tenant_usage_counter SET consumed_value=consumed_value+${consumed},reserved_value=reserved_value+${reserved},updated_by=${actor}::uuid
    WHERE tenant_id=${tenant}::uuid AND usage_metric_id=${metric}::uuid AND dimension_code='*'`.execute(tx);
}
function find<T extends { code: string }>(rows: readonly T[], code: string): T { const row = rows.find(value => value.code === code); if (!row) throw new Error(`${code} is unavailable`); return row; }
function n(value: string | null | undefined): number { return Number(value ?? 0); }
