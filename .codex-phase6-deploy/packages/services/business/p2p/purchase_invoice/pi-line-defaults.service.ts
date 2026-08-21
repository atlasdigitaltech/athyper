/**
 * Purchase Invoice line default resolvers.
 *
 * These functions are the service-layer owner for user-visible defaults that
 * used to be created by DB triggers. They are intentionally idempotent so both
 * AP-specific and generic runtime line writers can call them safely.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { createBillingMilestoneSchedulesForPiLine } from "../schedule-line.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface ApplyPiLineDefaultsInput {
  tenantId: string;
  invoiceId: string;
  lineId: string;
  principalId: string | null;
}

export async function applyPurchaseInvoiceLineDefaults(
  db: AnyDb,
  input: ApplyPiLineDefaultsInput,
): Promise<void> {
  await applyPiLineShippingDefaults(db, input);
  await createDefaultAccountingDistribution(db, input);
  await createDefaultSchedulesFromPaymentTerms(db, input);
  await createDefaultSchedulesFromReference(db, input);
}

export async function applyPiLineShippingDefaults(
  db: AnyDb,
  input: ApplyPiLineDefaultsInput,
): Promise<void> {
  await sql`
    WITH line_ctx AS (
      SELECT pil.id,
             pil.tenant_id,
             pil.purchase_invoice_id,
             pil.site_id,
             pil.shipto_address_id,
             pil.shipfrom_address_id,
             pil.commitment_line_id,
             pil.receipt_line_id,
             pil.service_sheet_line_id,
             pi.supplier_id,
             COALESCE(
               pil.site_id,
               cl.site_id,
               rcpl.site_id,
               sshl.site_id
             ) AS resolved_site_id,
             COALESCE(
               pil.shipto_address_id,
               cl.shipto_address_id,
               sshl.shipto_address_id,
               site_shipto.address_id
             ) AS resolved_shipto_address_id,
             COALESCE(
               pil.shipfrom_address_id,
               cl.shipfrom_address_id,
               sshl.shipfrom_address_id,
               supplier_shipfrom.address_id
             ) AS resolved_shipfrom_address_id
        FROM document.purchase_invoice_line pil
        JOIN document.purchase_invoice pi
          ON pi.id = pil.purchase_invoice_id
         AND pi.tenant_id = pil.tenant_id
        LEFT JOIN document.commitment_line cl
          ON cl.id = pil.commitment_line_id
         AND cl.tenant_id = pil.tenant_id
        LEFT JOIN document.receipt_line rcpl
          ON rcpl.id = pil.receipt_line_id
         AND rcpl.tenant_id = pil.tenant_id
        LEFT JOIN document.service_sheet_line sshl
          ON sshl.id = pil.service_sheet_line_id
         AND sshl.tenant_id = pil.tenant_id
        LEFT JOIN LATERAL (
          SELECT vsa.address_id
            FROM master.v_site_address vsa
           WHERE vsa.tenant_id = pil.tenant_id
             AND vsa.site_id = COALESCE(pil.site_id, cl.site_id, rcpl.site_id, sshl.site_id)
             AND vsa.purpose IN ('ship_to','default')
           ORDER BY (vsa.purpose = 'ship_to') DESC,
                    vsa.is_primary DESC,
                    vsa.effective_from DESC
           LIMIT 1
        ) site_shipto ON true
        LEFT JOIN LATERAL (
          SELECT vsa.address_id
            FROM master.v_supplier_address vsa
           WHERE vsa.tenant_id = pil.tenant_id
             AND vsa.supplier_id = pi.supplier_id
             AND vsa.purpose IN ('ship_from','default')
           ORDER BY (vsa.purpose = 'ship_from') DESC,
                    vsa.is_primary DESC,
                    vsa.effective_from DESC
           LIMIT 1
        ) supplier_shipfrom ON true
       WHERE pil.id = ${input.lineId}::uuid
         AND pil.tenant_id = ${input.tenantId}::uuid
         AND pil.purchase_invoice_id = ${input.invoiceId}::uuid
    )
    UPDATE document.purchase_invoice_line pil
       SET site_id = COALESCE(pil.site_id, line_ctx.resolved_site_id),
           shipto_address_id = COALESCE(pil.shipto_address_id, line_ctx.resolved_shipto_address_id),
           shipfrom_address_id = COALESCE(pil.shipfrom_address_id, line_ctx.resolved_shipfrom_address_id),
           updated_at = CASE
             WHEN pil.site_id IS DISTINCT FROM COALESCE(pil.site_id, line_ctx.resolved_site_id)
               OR pil.shipto_address_id IS DISTINCT FROM COALESCE(pil.shipto_address_id, line_ctx.resolved_shipto_address_id)
               OR pil.shipfrom_address_id IS DISTINCT FROM COALESCE(pil.shipfrom_address_id, line_ctx.resolved_shipfrom_address_id)
             THEN now()
             ELSE pil.updated_at
           END,
           updated_by = CASE
             WHEN pil.site_id IS DISTINCT FROM COALESCE(pil.site_id, line_ctx.resolved_site_id)
               OR pil.shipto_address_id IS DISTINCT FROM COALESCE(pil.shipto_address_id, line_ctx.resolved_shipto_address_id)
               OR pil.shipfrom_address_id IS DISTINCT FROM COALESCE(pil.shipfrom_address_id, line_ctx.resolved_shipfrom_address_id)
             THEN ${input.principalId ?? "00000000-0000-0000-0000-000000000000"}::uuid
             ELSE pil.updated_by
           END
      FROM line_ctx
     WHERE pil.id = line_ctx.id
       AND (
         pil.site_id IS NULL AND line_ctx.resolved_site_id IS NOT NULL
         OR pil.shipto_address_id IS NULL AND line_ctx.resolved_shipto_address_id IS NOT NULL
         OR pil.shipfrom_address_id IS NULL AND line_ctx.resolved_shipfrom_address_id IS NOT NULL
       )
  `.execute(db);
}

export async function createDefaultAccountingDistribution(
  db: AnyDb,
  input: ApplyPiLineDefaultsInput,
): Promise<void> {
  await sql`
    INSERT INTO document.accounting_distribution (
      tenant_id,
      source_doc_type, source_doc_id, source_line_id,
      distribution_no, distribution_basis, split_pct,
      distributed_amount, currency_code,
      account_source,
      cost_center_id, profit_center_id, project_id, budget_allocation_id,
      created_by
    )
    SELECT pil.tenant_id,
           'purchase_invoice_line', pil.purchase_invoice_id, pil.id,
           1, 'PERCENT', 100,
           COALESCE(pil.gross_amount, 0), COALESCE(pi.currency_code, ''),
           'PENDING',
           NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid,
           ${input.principalId ?? "00000000-0000-0000-0000-000000000000"}::uuid
      FROM document.purchase_invoice_line pil
      JOIN document.purchase_invoice pi
        ON pi.id = pil.purchase_invoice_id
       AND pi.tenant_id = pil.tenant_id
     WHERE pil.id = ${input.lineId}::uuid
       AND pil.tenant_id = ${input.tenantId}::uuid
       AND pil.purchase_invoice_id = ${input.invoiceId}::uuid
    ON CONFLICT (source_doc_type, source_doc_id, source_line_id, distribution_no) DO NOTHING
  `.execute(db);
}

export async function createDefaultSchedulesFromPaymentTerms(
  _db: AnyDb,
  _input: ApplyPiLineDefaultsInput,
): Promise<void> {
  // Header payment terms currently drive payment_term_application, not
  // line-level schedule_line rows. Kept as an explicit resolver seam so
  // payment-term schedule creation can move here without reintroducing triggers.
}

export async function createDefaultSchedulesFromReference(
  db: AnyDb,
  input: ApplyPiLineDefaultsInput,
): Promise<void> {
  const row = await sql<{
    invoice_source: string | null;
    quantity: number;
    net_amount: number;
    milestone_date: string | null;
  }>`
    SELECT pi.invoice_source,
           pil.quantity,
           pil.net_amount,
           NULL::text AS milestone_date
      FROM document.purchase_invoice_line pil
      JOIN document.purchase_invoice pi
        ON pi.id = pil.purchase_invoice_id
       AND pi.tenant_id = pil.tenant_id
     WHERE pil.id = ${input.lineId}::uuid
       AND pil.tenant_id = ${input.tenantId}::uuid
       AND pil.purchase_invoice_id = ${input.invoiceId}::uuid
  `.execute(db);

  const line = row.rows[0];
  if (!line || line.invoice_source !== "non_po" || !line.milestone_date) return;

  const existing = await sql<{ id: string }>`
    SELECT id
      FROM document.schedule_line
     WHERE tenant_id = ${input.tenantId}::uuid
       AND source_doc_type = 'purchase_invoice_line'
       AND source_line_id = ${input.lineId}::uuid
       AND is_current_version = true
     LIMIT 1
  `.execute(db);
  if (existing.rows[0]) return;

  await createBillingMilestoneSchedulesForPiLine(db, {
    tenantId: input.tenantId,
    purchaseInvoiceId: input.invoiceId,
    piLineId: input.lineId,
    principalId: input.principalId ?? "00000000-0000-0000-0000-000000000000",
    specs: [{
      scheduleNo: 1,
      scheduleKind: "billing_milestone",
      scheduledQuantity: Number(line.quantity),
      scheduledAmount: Number(line.net_amount),
      scheduledDate: String(line.milestone_date),
      metadata: { source: "resolver_default", resolver: "schedule.from_reference" },
    }],
  });
}
