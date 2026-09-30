import { FinanceContractError } from "@athyper/server-contract-finance";
import { sql, type Kysely } from "kysely";
import { decimalUnits } from "../shared/decimal.js";
import type {
  ExternalClaimSource,
  ServiceSheetSourceAllocation,
  ServiceSheetSourceAllocationCommand,
  ServiceSheetSourceAllocationRepository,
} from "./service-sheet-source-service.js";

type Database = Record<string, never>;
type Row = Record<string, unknown>;

export class KyselyServiceSheetSourceAllocationRepository
implements ServiceSheetSourceAllocationRepository<Kysely<Database>> {
  async append(command: ServiceSheetSourceAllocationCommand, transaction: Kysely<Database>): Promise<ServiceSheetSourceAllocation> {
    const source = columns(command.source);
    const row = (await sql<Row>`
      INSERT INTO document.service_sheet_source_allocation(
        tenant_id,service_sheet_line_id,external_time_sheet_id,external_expense_sheet_id,
        statement_of_work_item_id,allocation_kind,accepted_quantity,accepted_amount,
        currency_code,reverses_allocation_id,source_snapshot,source_snapshot_hash,
        idempotency_key,allocated_by,created_by
      ) VALUES(
        ${command.actor.tenantId}::uuid,${command.serviceSheetLineId}::uuid,
        ${source.timeSheetId}::uuid,${source.expenseSheetId}::uuid,${source.sowItemId}::uuid,
        ${command.reversesAllocationId ? "reversal" : "acceptance"},
        ${command.acceptedQuantity ?? null}::numeric,${command.acceptedAmount}::numeric,
        ${command.currencyCode}::char(3),${command.reversesAllocationId ?? null}::uuid,
        ${JSON.stringify(command.sourceSnapshot)}::jsonb,${command.sourceSnapshotHash}::char(64),
        ${command.idempotencyKey},${command.actor.principalId}::uuid,${command.actor.principalId}::uuid
      ) ON CONFLICT (tenant_id,idempotency_key) DO NOTHING
      RETURNING *
    `.execute(transaction)).rows[0] ?? (await sql<Row>`
      SELECT * FROM document.service_sheet_source_allocation
       WHERE tenant_id=${command.actor.tenantId}::uuid AND idempotency_key=${command.idempotencyKey}
    `.execute(transaction)).rows[0];
    if (!row) throw new FinanceContractError("FINANCE_EXPECTED_VERSION_CONFLICT", "Allocation could not be persisted");
    const persisted = map(row);
    if (persisted.serviceSheetLineId !== command.serviceSheetLineId
        || persisted.source.kind !== command.source.kind || persisted.source.id !== command.source.id
        || decimalUnits(persisted.acceptedAmount, 4) !== decimalUnits(command.acceptedAmount, 4)
        || (persisted.acceptedQuantity === undefined) !== (command.acceptedQuantity === undefined)
        || (persisted.acceptedQuantity !== undefined && command.acceptedQuantity !== undefined
          && decimalUnits(persisted.acceptedQuantity, 4) !== decimalUnits(command.acceptedQuantity, 4))
        || persisted.currencyCode !== command.currencyCode
        || persisted.reversesAllocationId !== command.reversesAllocationId
        || String(row["source_snapshot_hash"]).trim() !== command.sourceSnapshotHash) {
      throw new FinanceContractError("FINANCE_EXPECTED_VERSION_CONFLICT", "Idempotency key was already used for a different allocation");
    }
    return persisted;
  }
}

function columns(source: ExternalClaimSource) {
  return {
    timeSheetId: source.kind === "external_time_sheet" ? source.id : null,
    expenseSheetId: source.kind === "external_expense_sheet" ? source.id : null,
    sowItemId: source.kind === "statement_of_work_item" ? source.id : null,
  };
}

function map(row: Row): ServiceSheetSourceAllocation {
  const source: ExternalClaimSource = row["external_time_sheet_id"]
    ? { kind: "external_time_sheet", id: String(row["external_time_sheet_id"]) }
    : row["external_expense_sheet_id"]
      ? { kind: "external_expense_sheet", id: String(row["external_expense_sheet_id"]) }
      : { kind: "statement_of_work_item", id: String(row["statement_of_work_item_id"]) };
  return {
    id: String(row["id"]), serviceSheetLineId: String(row["service_sheet_line_id"]), source,
    ...(row["accepted_quantity"] !== null ? { acceptedQuantity: String(row["accepted_quantity"]) } : {}),
    acceptedAmount: String(row["accepted_amount"]), currencyCode: String(row["currency_code"]).trim(),
    ...(row["reverses_allocation_id"] ? { reversesAllocationId: String(row["reverses_allocation_id"]) } : {}),
    idempotencyKey: String(row["idempotency_key"]),
  };
}
