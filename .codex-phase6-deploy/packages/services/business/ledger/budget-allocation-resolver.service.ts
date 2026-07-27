/**
 * Budget Allocation Resolver (audit P0-S3)
 *
 * Given a source document (PR / PO / PI) and its set of lines, returns the
 * `master.budget_allocation` rows that the budget-transaction service must
 * write against, grouped by allocation with the per-allocation amount.
 *
 * Today's source of truth is `document.accounting_distribution.budget_allocation_id`,
 * already populated by the distribution layer at line write time. If a line's
 * AD rows have no `budget_allocation_id`, the allocation is "unresolved" and
 * the caller's `BUDGET_NO_MATCH_POLICY` decides whether that aborts the
 * transition (hard_fail) or logs and continues (warn_continue).
 *
 * Dimension-key fallback resolution (cost_center+account+fiscal_year lookup)
 * is a deliberate non-goal here — when AD layer is doing its job that field
 * is non-null, and adding a second resolution path would mask AD-writer bugs.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export type LineEntityCode =
  | "purchase_requisition_line"
  | "commitment_line"
  | "purchase_invoice_line";

export interface ResolveAllocationsInput {
  tenantId:       string;
  lineEntityCode: LineEntityCode;
  /** All line ids belonging to the parent document (PR / PO / PI). */
  lineIds:        string[];
}

export interface AllocationGroup {
  allocationId:  string;
  amount:        number;   // sum of distributed_amount across AD rows mapping to this allocation
  currencyCode:  string;
  lineCount:     number;   // distinct line ids contributing to this group (audit aid)
}

export interface ResolveAllocationsResult {
  groups:           AllocationGroup[];
  /** True when at least one AD row could not be mapped to an allocation. */
  unresolved:       boolean;
  /** Lines that produced no AD rows at all (data integrity problem). */
  linesWithoutAd:   string[];
  /** Lines whose AD rows had no budget_allocation_id (the "no match" case). */
  linesWithoutAllocation: string[];
}

const AD_SOURCE_DOC_TYPE: Record<LineEntityCode, string> = {
  purchase_requisition_line: "purchase_requisition_line",
  commitment_line:           "commitment_line",
  purchase_invoice_line:     "purchase_invoice_line",
};

interface AdRow {
  source_line_id:       string;
  budget_allocation_id: string | null;
  distributed_amount:   number;
  currency_code:        string;
}

export async function resolveAllocationsForLines(
  db:    AnyDb,
  input: ResolveAllocationsInput,
): Promise<ResolveAllocationsResult> {
  if (input.lineIds.length === 0) {
    return { groups: [], unresolved: false, linesWithoutAd: [], linesWithoutAllocation: [] };
  }

  const sourceDocType = AD_SOURCE_DOC_TYPE[input.lineEntityCode];

  // Read all AD rows for the supplied lines in one shot. The line could have
  // 1 default AD row (typical) or N split rows; we sum across the split.
  const adRows = await sql<AdRow>`
    SELECT source_line_id,
           budget_allocation_id,
           distributed_amount,
           currency_code
      FROM document.accounting_distribution
     WHERE tenant_id      = ${input.tenantId}::uuid
       AND source_doc_type = ${sourceDocType}::text
       AND source_line_id   = ANY(${input.lineIds}::uuid[])
  `.execute(db);

  const seenLineIds          = new Set<string>();
  const linesWithoutAllocSet = new Set<string>();
  const groupMap             = new Map<string, AllocationGroup>();
  let unresolved             = false;

  for (const row of adRows.rows) {
    seenLineIds.add(row.source_line_id);
    if (!row.budget_allocation_id) {
      unresolved = true;
      linesWithoutAllocSet.add(row.source_line_id);
      continue;
    }

    const amt = Number(row.distributed_amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;

    const existing = groupMap.get(row.budget_allocation_id);
    if (existing) {
      existing.amount   += amt;
      existing.lineCount = existing.lineCount + (existing.amount > 0 ? 0 : 1);
    } else {
      groupMap.set(row.budget_allocation_id, {
        allocationId: row.budget_allocation_id,
        amount:       amt,
        currencyCode: row.currency_code,
        lineCount:    1,
      });
    }
  }

  // Lines that had no AD row at all are a data-integrity problem — surface
  // them so the caller can decide. The line write path is expected to insert
  // at least one default AD row per line.
  const linesWithoutAd = input.lineIds.filter((id) => !seenLineIds.has(id));

  // Recompute distinct line counts properly (the running counter above is
  // approximate when multiple AD rows share an allocation per line).
  for (const group of groupMap.values()) {
    const distinct = new Set(
      adRows.rows
        .filter((r) => r.budget_allocation_id === group.allocationId)
        .map((r) => r.source_line_id),
    );
    group.lineCount = distinct.size;
  }

  return {
    groups:                 Array.from(groupMap.values()),
    unresolved,
    linesWithoutAd,
    linesWithoutAllocation: Array.from(linesWithoutAllocSet),
  };
}

/**
 * Reads the line ids for a parent document. Used by the budget-transaction
 * service before calling resolveAllocationsForLines.
 */
export async function fetchLineIdsForDocument(
  db:           AnyDb,
  tenantId:     string,
  lineEntityCode: LineEntityCode,
  parentId:     string,
): Promise<string[]> {
  let table:   string;
  let parentColumn: string;
  switch (lineEntityCode) {
    case "purchase_requisition_line":
      table        = "document.purchase_requisition_line";
      parentColumn = "purchase_requisition_id";
      break;
    case "commitment_line":
      table        = "document.commitment_line";
      parentColumn = "commitment_id";
      break;
    case "purchase_invoice_line":
      table        = "document.purchase_invoice_line";
      parentColumn = "purchase_invoice_id";
      break;
  }

  // sql.raw on table + column is safe — the values come from the typed
  // LineEntityCode union, not from user input.
  const result = await sql<{ id: string }>`
    SELECT id
      FROM ${sql.raw(table)}
     WHERE tenant_id          = ${tenantId}::uuid
       AND ${sql.raw(parentColumn)} = ${parentId}::uuid
  `.execute(db);

  return result.rows.map((r) => r.id);
}
