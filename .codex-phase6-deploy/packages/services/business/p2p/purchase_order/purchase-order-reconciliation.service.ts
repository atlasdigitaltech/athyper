import type { Kysely } from "kysely";
import { sql } from "kysely";
import { emitOutboxEvent } from "@athyper/svc-shared";
import { captureDocumentSnapshot } from "../../lifecycle/snapshot-capture.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

/** Rebuild physical fulfillment from the append-only fulfillment ledger. */
export async function reconcilePurchaseOrderFulfillment(
  db: AnyDb,
  tenantId: string,
  commitmentId: string,
  principalId: string,
): Promise<{ fulfilledAmount: number; status: string }> {
  const priorResult = await sql<{ status: string }>`
    SELECT status FROM document.commitment
     WHERE tenant_id = ${tenantId}::uuid AND id = ${commitmentId}::uuid
     FOR UPDATE
  `.execute(db);
  const priorStatus = priorResult.rows[0]?.status;
  const result = await sql<{ fulfilled_amount: string; status: string }>`
    WITH physical AS (
      SELECT GREATEST(0, COALESCE(SUM(
        CASE WHEN cf.is_reversal THEN -cf.amount ELSE cf.amount END
      ), 0)) AS amount
        FROM ledger.commitment_fulfillment cf
       WHERE cf.tenant_id = ${tenantId}::uuid
         AND cf.commitment_id = ${commitmentId}::uuid
         AND cf.fulfillment_type IN ('GRN','SERVICE_RECEIPT')
    )
    UPDATE document.commitment c
       SET fulfilled_amount = LEAST(c.total_amount, physical.amount),
           status = CASE
             WHEN c.status IN ('closed','cancelled','expired','suspended') THEN c.status
             WHEN physical.amount <= 0 THEN 'active'
             WHEN physical.amount + 0.0001 >= c.total_amount THEN 'fully_fulfilled'
             ELSE 'partially_fulfilled'
           END,
           status_source = 'derived',
           status_changed_at = CASE WHEN c.status IS DISTINCT FROM CASE
             WHEN c.status IN ('closed','cancelled','expired','suspended') THEN c.status
             WHEN physical.amount <= 0 THEN 'active'
             WHEN physical.amount + 0.0001 >= c.total_amount THEN 'fully_fulfilled'
             ELSE 'partially_fulfilled' END THEN now() ELSE c.status_changed_at END,
           status_changed_by = ${principalId}::uuid,
           updated_at = now(), updated_by = ${principalId}::uuid,
           row_version = row_version + 1
      FROM physical
     WHERE c.tenant_id = ${tenantId}::uuid
       AND c.id = ${commitmentId}::uuid
       AND c.commitment_type = 'purchase_order'
    RETURNING c.fulfilled_amount::text, c.status
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw Object.assign(new Error("PURCHASE_ORDER_NOT_FOUND"), { code: 404 });
  if (priorStatus && priorStatus !== row.status) {
    const operation = Number(row.fulfilled_amount) > 0 ? "fulfillment_reconcile" : "fulfillment_reverse";
    const detail = {
      public_entity_type: "purchase_order",
      aggregate_root_type: "commitment",
      commitment_type: "purchase_order",
      aggregate_root_id: commitmentId,
      profile_code: "po.standard",
      profile_version: 1,
      from_status: priorStatus,
      to_status: row.status,
      fulfilled_amount: Number(row.fulfilled_amount),
    };
    const activity = await sql<{ id: string }>`
      INSERT INTO log.activity_log (
        tenant_id, log_type, domain, activity_type, entity_type, entity_id,
        actor_id, actor_type, detail, created_by
      ) VALUES (
        ${tenantId}::uuid, 'business'::shared.log_type_d, 'procurement',
        ${`purchase_order.${operation}`}, 'purchase_order', ${commitmentId}::uuid,
        ${principalId}::uuid, 'principal', ${JSON.stringify(detail)}::jsonb, ${principalId}::uuid
      ) RETURNING id
    `.execute(db);
    const snapshot = await captureDocumentSnapshot(db, {
      tenantId,
      entityType: "purchase_order",
      entityId: commitmentId,
      gateEvent: operation,
      gateEventKind: operation === "fulfillment_reverse" ? "reversal" : "fulfillment",
      activityLogId: activity.rows[0]?.id,
      capturedBy: principalId,
      captureSource: "fulfillment_reconciliation",
    });
    if (!snapshot.ok) throw new Error(`${snapshot.error?.code}: ${snapshot.error?.message}`);
    await emitOutboxEvent(db, {
      tenantId,
      topic: "purchase_order.lifecycle",
      eventType: `purchase_order.${operation}`,
      eventKey: `purchase_order.${operation}:${commitmentId}:${row.status}:${row.fulfilled_amount}`,
      entityType: "purchase_order",
      entityId: commitmentId,
      aggregateType: "commitment",
      aggregateId: commitmentId,
      actorId: principalId,
      payload: detail,
    });
  }
  return { fulfilledAmount: Number(row.fulfilled_amount), status: row.status };
}

/** Rebuild invoice exposure without changing physical fulfillment status. */
export async function reconcilePurchaseOrderInvoicing(
  db: AnyDb,
  tenantId: string,
  commitmentId: string,
  principalId: string,
): Promise<number> {
  const result = await sql<{ invoiced_amount: string }>`
    WITH financial AS (
      SELECT GREATEST(0, COALESCE(SUM(
        CASE WHEN pi.invoice_type = 'credit_note' THEN -pi.net_amount ELSE pi.net_amount END
      ), 0)) AS amount
        FROM document.purchase_invoice pi
       WHERE pi.tenant_id = ${tenantId}::uuid
         AND pi.commitment_id = ${commitmentId}::uuid
         AND pi.status IN ('posted','partially_paid','fully_paid')
    )
    UPDATE document.commitment c
       SET invoiced_amount = LEAST(c.total_amount, financial.amount),
           updated_at = now(), updated_by = ${principalId}::uuid,
           row_version = row_version + 1
      FROM financial
     WHERE c.tenant_id = ${tenantId}::uuid
       AND c.id = ${commitmentId}::uuid
       AND c.commitment_type = 'purchase_order'
    RETURNING c.invoiced_amount::text
  `.execute(db);
  return Number(result.rows[0]?.invoiced_amount ?? 0);
}
