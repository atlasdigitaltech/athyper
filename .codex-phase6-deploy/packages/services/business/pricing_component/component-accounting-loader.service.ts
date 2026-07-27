import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  projectComponentAccounting,
  type ComponentAccountingProjection,
  type ComponentProjectionInput,
  type CostEffect,
  type DistributionPolicy,
  type DistributionProjectionInput,
  type PostingPattern,
} from "./component-accounting-resolver.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export type ComponentSourceDocType =
  | "purchase_requisition_line"
  | "commitment_line"
  | "receipt_line"
  | "service_sheet_line"
  | "purchase_invoice_line";

const SOURCE_TABLE: Record<ComponentSourceDocType, { table: string; parent: string; quantity: string }> = {
  purchase_requisition_line: { table: "document.purchase_requisition_line", parent: "purchase_requisition_id", quantity: "quantity" },
  commitment_line:           { table: "document.commitment_line",           parent: "commitment_id", quantity: "quantity" },
  receipt_line:              { table: "document.receipt_line",              parent: "receipt_id", quantity: "accepted_quantity" },
  service_sheet_line:        { table: "document.service_sheet_line",        parent: "service_sheet_id", quantity: "quantity" },
  purchase_invoice_line:     { table: "document.purchase_invoice_line",     parent: "purchase_invoice_id", quantity: "quantity" },
};

interface LineRow { id: string; net_amount: string | number; quantity: string | number }
interface ComponentRow {
  id: string; condition_type_id: string; source_line_id: string; term_type: ComponentProjectionInput["termType"];
  computed_amount: string | number; recoverable_pct: string | number | null;
  default_cost_effect: CostEffect; default_posting_pattern: PostingPattern;
  default_distribution_policy: DistributionPolicy; default_posting_role_code: string | null;
}
interface DistributionRow {
  id: string; source_line_id: string; distribution_no: number; distribution_basis: string;
  split_pct: string | number | null; split_amount: string | number | null; split_quantity: string | number | null;
  gl_account_id: string | null; cost_center_id: string | null; profit_center_id: string | null;
  project_id: string | null; asset_id: string | null; budget_allocation_id: string | null;
}

export async function loadAndProjectComponentAccounting(
  db: AnyDb,
  input: { tenantId: string; sourceDocType: ComponentSourceDocType; sourceDocId: string },
): Promise<ComponentAccountingProjection> {
  const mapping = SOURCE_TABLE[input.sourceDocType];
  const lines = await sql<LineRow>`
    SELECT id, net_amount, ${sql.raw(mapping.quantity)} AS quantity
      FROM ${sql.raw(mapping.table)}
     WHERE tenant_id = ${input.tenantId}::uuid
       AND ${sql.raw(mapping.parent)} = ${input.sourceDocId}::uuid
     ORDER BY line_no
  `.execute(db);
  const lineIds = lines.rows.map((row) => row.id);
  if (lineIds.length === 0) return projectComponentAccounting([]);

  const [components, distributions] = await Promise.all([
    sql<ComponentRow>`
      SELECT pc.id, pc.condition_type_id, pc.source_line_id, pc.term_type,
             pc.computed_amount, pc.recoverable_pct,
             ct.default_cost_effect, ct.default_posting_pattern,
             ct.default_distribution_policy, ct.default_posting_role_code
        FROM document.pricing_component pc
        JOIN master.condition_type ct ON ct.id = pc.condition_type_id
       WHERE pc.tenant_id = ${input.tenantId}::uuid
         AND pc.source_doc_type = ${input.sourceDocType}
         AND pc.source_doc_id = ${input.sourceDocId}::uuid
         AND pc.source_line_id = ANY(${lineIds}::uuid[])
         AND pc.superseded_by_id IS NULL
         AND ct.status = 'active'
       ORDER BY pc.source_line_id, pc.sequence, pc.created_at
    `.execute(db),
    sql<DistributionRow>`
      SELECT id, source_line_id, distribution_no, distribution_basis,
             split_pct, split_amount, split_quantity,
             gl_account_id, cost_center_id, profit_center_id, project_id,
             asset_id, budget_allocation_id
        FROM document.accounting_distribution
       WHERE tenant_id = ${input.tenantId}::uuid
         AND source_doc_type = ${input.sourceDocType}
         AND source_doc_id = ${input.sourceDocId}::uuid
         AND source_line_id = ANY(${lineIds}::uuid[])
       ORDER BY source_line_id, distribution_no
    `.execute(db),
  ]);

  return projectComponentAccounting(lines.rows.map((line) => ({
    id: line.id,
    baseAmount: Number(line.net_amount),
    components: components.rows.filter((row) => row.source_line_id === line.id).map((row) => ({
      id: row.id,
      conditionTypeId: row.condition_type_id,
      sourceLineId: row.source_line_id,
      termType: row.term_type,
      computedAmount: Number(row.computed_amount),
      recoverablePct: row.recoverable_pct == null ? null : Number(row.recoverable_pct),
      costEffect: row.default_cost_effect,
      postingPattern: row.default_posting_pattern,
      distributionPolicy: row.default_distribution_policy,
      postingRoleCode: row.default_posting_role_code,
    })),
    distributions: distributions.rows.filter((row) => row.source_line_id === line.id)
      .map((row) => toDistribution(row, line)),
  })));
}

function toDistribution(row: DistributionRow, line: LineRow): DistributionProjectionInput {
  const base = Number(line.net_amount);
  const quantity = Number(line.quantity);
  const ratio = row.distribution_basis === "AMOUNT"
    ? (base > 0 ? Number(row.split_amount ?? 0) / base : 0)
    : row.distribution_basis === "QUANTITY"
      ? (quantity > 0 ? Number(row.split_quantity ?? 0) / quantity : 0)
      : Number(row.split_pct ?? 0) / 100;
  return {
    id: row.id, sourceLineId: row.source_line_id, distributionNo: row.distribution_no, ratio,
    glAccountId: row.gl_account_id, costCenterId: row.cost_center_id,
    profitCenterId: row.profit_center_id, projectId: row.project_id,
    assetId: row.asset_id, budgetAllocationId: row.budget_allocation_id,
  };
}

/** Updates the cached AD cost amount from the authoritative component projection. */
export async function refreshDistributionCostBasis(
  db: AnyDb,
  input: { tenantId: string; sourceDocType: ComponentSourceDocType; sourceDocId: string; principalId: string; final?: boolean },
): Promise<ComponentAccountingProjection> {
  const projection = await loadAndProjectComponentAccounting(db, input);
  const amountByDistribution = new Map<string, number>();
  for (const row of projection.allocations) {
    if (!row.accountingDistributionId) continue;
    if (!["BASE_COST", "COST_REDUCTION", "COST_ADDITION", "NONRECOVERABLE_TAX"].includes(row.componentBucket)) continue;
    const sign = row.componentBucket === "COST_REDUCTION" ? -1 : 1;
    amountByDistribution.set(row.accountingDistributionId,
      (amountByDistribution.get(row.accountingDistributionId) ?? 0) + sign * row.amount);
  }
  for (const [id, amount] of amountByDistribution) {
    await sql`
      UPDATE document.accounting_distribution
         SET distributed_amount = ${Math.max(0, amount)},
             amount_status = ${input.final ? "FINAL" : "PROVISIONAL"},
             amount_calculated_at = now(),
             amount_calculation_hash = ${projection.calculationHash},
             updated_at = now(), updated_by = ${input.principalId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid AND id = ${id}::uuid
    `.execute(db);
  }
  return projection;
}
