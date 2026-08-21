import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { ComponentSourceDocType } from "../pricing_component/component-accounting-loader.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

/** Copies ratios/dimensions and active commercial conditions, then recomputes target amounts. */
export async function inheritProcurementLineAccounting(
  db: AnyDb,
  input: {
    tenantId: string;
    sourceDocType: ComponentSourceDocType;
    sourceDocId: string;
    sourceLineId: string;
    targetDocType: ComponentSourceDocType;
    targetDocId: string;
    targetLineId: string;
    principalId: string;
  },
): Promise<{ distributions: number; components: number }> {
  const dist = await sql`
    INSERT INTO document.accounting_distribution (
      tenant_id, source_doc_type, source_doc_id, source_line_id,
      distribution_no, distribution_basis, split_pct, split_amount, split_quantity,
      distributed_amount, currency_code, amount_status,
      account_source, gl_account_id,
      cost_center_id, profit_center_id, project_id, dimension_set_id, asset_id,
      budget_allocation_id, description, metadata, created_by
    )
    SELECT ad.tenant_id, ${input.targetDocType}, ${input.targetDocId}::uuid, ${input.targetLineId}::uuid,
           ad.distribution_no, ad.distribution_basis, ad.split_pct,
           CASE WHEN ad.distribution_basis = 'AMOUNT'
             THEN tl.net_amount * ad.distributed_amount / NULLIF(sl.net_amount, 0) ELSE ad.split_amount END,
           CASE WHEN ad.distribution_basis = 'QUANTITY'
             THEN tl.${sql.raw(quantityColumn(input.targetDocType))} * ad.split_quantity / NULLIF(sl.${sql.raw(quantityColumn(input.sourceDocType))}, 0) ELSE ad.split_quantity END,
           CASE ad.distribution_basis
             WHEN 'PERCENT' THEN tl.net_amount * ad.split_pct / 100
             WHEN 'AMOUNT' THEN tl.net_amount * ad.distributed_amount / NULLIF(sl.net_amount, 0)
             WHEN 'QUANTITY' THEN tl.net_amount * ad.split_quantity / NULLIF(sl.${sql.raw(quantityColumn(input.sourceDocType))}, 0)
             ELSE tl.net_amount
           END,
           tl.currency_code, 'PROVISIONAL',
           CASE WHEN ad.account_source = 'OVERRIDE' THEN 'OVERRIDE' ELSE 'PENDING' END,
           CASE WHEN ad.account_source = 'OVERRIDE' THEN ad.gl_account_id ELSE NULL END,
           ad.cost_center_id, ad.profit_center_id, ad.project_id, ad.dimension_set_id, ad.asset_id,
           ad.budget_allocation_id, ad.description,
           COALESCE(ad.metadata, '{}'::jsonb) || jsonb_build_object(
             'inherited_from_distribution_id', ad.id,
             'inherited_from_source_doc_type', ${input.sourceDocType},
             'inherited_from_source_line_id', ${input.sourceLineId}),
           ${input.principalId}::uuid
      FROM document.accounting_distribution ad
      JOIN ${sql.raw(lineTable(input.sourceDocType))} sl ON sl.id = ${input.sourceLineId}::uuid AND sl.tenant_id = ad.tenant_id
      JOIN ${sql.raw(lineTable(input.targetDocType))} tl ON tl.id = ${input.targetLineId}::uuid AND tl.tenant_id = ad.tenant_id
     WHERE ad.tenant_id = ${input.tenantId}::uuid
       AND ad.source_doc_type = ${input.sourceDocType}
       AND ad.source_doc_id = ${input.sourceDocId}::uuid
       AND ad.source_line_id = ${input.sourceLineId}::uuid
    ON CONFLICT (source_doc_type, source_doc_id, source_line_id, distribution_no) DO NOTHING
  `.execute(db);

  if (Number(dist.numAffectedRows ?? 0) === 0) {
    await sql`
      INSERT INTO document.accounting_distribution (
        tenant_id, source_doc_type, source_doc_id, source_line_id,
        distribution_no, distribution_basis, split_pct, distributed_amount,
        currency_code, amount_status, account_source, created_by)
      SELECT tenant_id, ${input.targetDocType}, ${input.targetDocId}::uuid, id,
             1, 'PERCENT', 100, net_amount, currency_code, 'PROVISIONAL', 'PENDING', ${input.principalId}::uuid
        FROM ${sql.raw(lineTable(input.targetDocType))}
       WHERE tenant_id = ${input.tenantId}::uuid AND id = ${input.targetLineId}::uuid
      ON CONFLICT (source_doc_type, source_doc_id, source_line_id, distribution_no) DO NOTHING
    `.execute(db);
  }

  const pc = await sql`
    INSERT INTO document.pricing_component (
      tenant_id, company_code_id, source_doc_type, source_doc_id, source_line_id,
      term_type, condition_type_id, sequence, basis, rate_value, amount_value,
      base_for_calculation, computed_amount, computed_base_amount,
      entry_level, apportion_basis, is_apportioned, is_apportioned_from_id,
      origin, ref_source_doc_type, ref_source_doc_id, ref_source_line_id, ref_value,
      tax_group_id, is_inclusive, recoverable_pct, tax_section_code,
      currency_code, base_currency_code, exchange_rate, tags, metadata, created_by
    )
    SELECT pc.tenant_id, tl.company_code_id, ${input.targetDocType}, ${input.targetDocId}::uuid, ${input.targetLineId}::uuid,
           pc.term_type, pc.condition_type_id, pc.sequence, pc.basis, pc.rate_value,
           CASE WHEN pc.basis IN ('amount','flat')
             THEN pc.amount_value * tl.net_amount / NULLIF(sl.net_amount, 0) ELSE pc.amount_value END,
           tl.net_amount,
           CASE
             WHEN pc.basis = 'percent' THEN tl.net_amount * COALESCE(pc.rate_value, 0) / 100
             WHEN pc.basis = 'per_unit' THEN tl.${sql.raw(quantityColumn(input.targetDocType))} * COALESCE(pc.rate_value, 0)
             WHEN pc.basis IN ('amount','flat') THEN pc.computed_amount * tl.net_amount / NULLIF(sl.net_amount, 0)
             ELSE 0
           END,
           CASE
             WHEN pc.basis = 'percent' THEN tl.net_amount * COALESCE(pc.rate_value, 0) / 100 * COALESCE(th.exchange_rate, 1)
             WHEN pc.basis = 'per_unit' THEN tl.${sql.raw(quantityColumn(input.targetDocType))} * COALESCE(pc.rate_value, 0) * COALESCE(th.exchange_rate, 1)
             WHEN pc.basis IN ('amount','flat') THEN pc.computed_amount * tl.net_amount / NULLIF(sl.net_amount, 0) * COALESCE(th.exchange_rate, 1)
             ELSE 0
           END,
           'line', pc.apportion_basis, false, NULL,
           'inherited', ${input.sourceDocType}, ${input.sourceDocId}::uuid, ${input.sourceLineId}::uuid, pc.computed_amount,
           pc.tax_group_id, pc.is_inclusive, pc.recoverable_pct, pc.tax_section_code,
           tl.currency_code, COALESCE(th.base_currency_code, tl.currency_code), COALESCE(th.exchange_rate, 1),
           pc.tags, COALESCE(pc.metadata, '{}'::jsonb) || jsonb_build_object('inherited_from_pricing_component_id', pc.id),
           ${input.principalId}::uuid
      FROM document.pricing_component pc
      JOIN ${sql.raw(lineTable(input.sourceDocType))} sl ON sl.id = ${input.sourceLineId}::uuid AND sl.tenant_id = pc.tenant_id
      JOIN ${sql.raw(lineTable(input.targetDocType))} tl ON tl.id = ${input.targetLineId}::uuid AND tl.tenant_id = pc.tenant_id
      JOIN ${sql.raw(headerTable(input.targetDocType))} th ON th.id = ${input.targetDocId}::uuid AND th.tenant_id = pc.tenant_id
     WHERE pc.tenant_id = ${input.tenantId}::uuid
       AND pc.source_doc_type = ${input.sourceDocType}
       AND pc.source_doc_id = ${input.sourceDocId}::uuid
       AND pc.source_line_id = ${input.sourceLineId}::uuid
       AND pc.superseded_by_id IS NULL
       AND pc.entry_level = 'line'
  `.execute(db);

  return { distributions: Number(dist.numAffectedRows ?? 0), components: Number(pc.numAffectedRows ?? 0) };
}

function lineTable(type: ComponentSourceDocType): string {
  return `document.${type}`;
}

function headerTable(type: ComponentSourceDocType): string {
  switch (type) {
    case "purchase_requisition_line": return "document.purchase_requisition";
    case "commitment_line": return "document.commitment";
    case "receipt_line": return "document.receipt";
    case "service_sheet_line": return "document.service_sheet";
    case "purchase_invoice_line": return "document.purchase_invoice";
  }
}

function quantityColumn(type: ComponentSourceDocType): string {
  return type === "receipt_line" ? "accepted_quantity" : "quantity";
}
