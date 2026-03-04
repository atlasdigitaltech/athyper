/**
 * Finance Module — GL Inquiry Service
 *
 * Read-only service for General Ledger reporting: GL summary, GL detail,
 * and trial balance. All queries filter on journal_entry.status = 'POSTED'
 * by default (excludes CREATED, REVERSED from totals).
 *
 * Reversal handling modes:
 *   NETTED   — reversals netted into original amounts (default)
 *   SEPARATE — reversals shown as separate rows
 *   EXCLUDED — reversal JEs excluded entirely
 *
 * MC-4 compliant: all monetary results are string (DECIMAL in DB).
 */

import type { Container } from "../../../../../kernel/container.js";
import type { OperationContext } from "../../../engines/shared/engine-base.js";
import type {
  GLSummaryRow,
  GLDetailRow,
  TrialBalanceRow,
  GLSummaryFilters,
  GLDetailFilters,
  TrialBalanceFilters,
  ReversalHandlingMode,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GLInquiryService {
  getGLSummary(
    ctx: OperationContext,
    filters: GLSummaryFilters,
  ): Promise<GLSummaryRow[]>;

  getGLDetail(
    ctx: OperationContext,
    filters: GLDetailFilters,
  ): Promise<GLDetailRow[]>;

  getTrialBalance(
    ctx: OperationContext,
    filters: TrialBalanceFilters,
  ): Promise<TrialBalanceRow[]>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultGLInquiryService implements GLInquiryService {
  constructor(private readonly container: Container) {}

  // -----------------------------------------------------------------------
  // GL Summary — reads directly from fin.gl_balance (pre-aggregated)
  // -----------------------------------------------------------------------

  async getGLSummary(
    ctx: OperationContext,
    filters: GLSummaryFilters,
  ): Promise<GLSummaryRow[]> {
    const db = await this.container.resolve<any>("db");

    const whereClauses: string[] = [
      "b.tenant_id = $1",
      "b.entity_code = $2",
      "b.fiscal_year = $3",
    ];
    const params: unknown[] = [
      filters.tenantId,
      filters.entityCode,
      filters.fiscalYear,
    ];
    let paramIdx = 4;

    if (filters.periodNumber != null) {
      whereClauses.push(`b.period_number = $${paramIdx++}`);
      params.push(filters.periodNumber);
    }
    if (filters.accountId) {
      whereClauses.push(`b.account_id = $${paramIdx++}`);
      params.push(filters.accountId);
    }
    if (filters.costCenterId) {
      whereClauses.push(`b.cost_center_id = $${paramIdx++}`);
      params.push(filters.costCenterId);
    }
    if (filters.accountType) {
      whereClauses.push(`a.account_type = $${paramIdx++}`);
      params.push(filters.accountType);
    }

    const whereSQL = whereClauses.join(" AND ");

    const rows = await db.query(
      `SELECT
               a.id AS account_id,
               a.account_code,
               a.account_name,
               a.account_type,
               COALESCE(b.opening_debit, '0')  AS opening_debit,
               COALESCE(b.opening_credit, '0') AS opening_credit,
               COALESCE(b.period_debit, '0')   AS period_debit,
               COALESCE(b.period_credit, '0')  AS period_credit,
               COALESCE(b.closing_debit, '0')  AS closing_debit,
               COALESCE(b.closing_credit, '0') AS closing_credit
             FROM fin.gl_balance b
             JOIN fin.chart_of_accounts a ON a.id = b.account_id AND a.tenant_id = b.tenant_id
             WHERE ${whereSQL}
             ORDER BY a.account_code`,
      params,
    );

    return rows.map(mapRowToGLSummary);
  }

  // -----------------------------------------------------------------------
  // GL Detail — journal lines joined with journal entries
  // -----------------------------------------------------------------------

  async getGLDetail(
    ctx: OperationContext,
    filters: GLDetailFilters,
  ): Promise<GLDetailRow[]> {
    const db = await this.container.resolve<any>("db");
    const reversalMode: ReversalHandlingMode = filters.reversalMode ?? "NETTED";

    const whereClauses: string[] = [
      "je.tenant_id = $1",
      "je.entity_code = $2",
      "jl.account_id = $3",
      "je.fiscal_year = $4",
    ];
    const params: unknown[] = [
      filters.tenantId,
      filters.entityCode,
      filters.accountId,
      filters.fiscalYear,
    ];
    let paramIdx = 5;

    if (filters.periodNumber != null) {
      whereClauses.push(`je.period_number = $${paramIdx++}`);
      params.push(filters.periodNumber);
    }

    // Reversal handling determines which JE statuses to include
    switch (reversalMode) {
      case "NETTED":
        // Include POSTED (reversals are separate POSTED JEs with swapped
        // debit/credit, so they naturally net out in aggregation)
        whereClauses.push(`je.status = 'POSTED'`);
        break;
      case "SEPARATE":
        // Include POSTED + REVERSED so both original and reversal show
        whereClauses.push(`je.status IN ('POSTED', 'REVERSED')`);
        break;
      case "EXCLUDED":
        // Only POSTED, and exclude any JE that has been reversed
        whereClauses.push(`je.status = 'POSTED'`);
        whereClauses.push(`je.reversed_by_id IS NULL`);
        break;
    }

    const whereSQL = whereClauses.join(" AND ");

    const rows = await db.query(
      `SELECT
               je.id            AS je_id,
               je.je_number,
               je.posting_date,
               je.doc_id,
               je.doc_type,
               jl.line_no,
               jl.debit_amount,
               jl.credit_amount,
               jl.description,
               jl.source_doc_line_id,
               jl.cost_center_id
             FROM fin.journal_line jl
             JOIN fin.journal_entry je ON je.id = jl.je_id AND je.tenant_id = jl.tenant_id
             WHERE ${whereSQL}
             ORDER BY je.posting_date, je.je_number, jl.line_no`,
      params,
    );

    return rows.map(mapRowToGLDetail);
  }

  // -----------------------------------------------------------------------
  // Trial Balance — aggregated debit/credit per account for a period
  // -----------------------------------------------------------------------

  async getTrialBalance(
    ctx: OperationContext,
    filters: TrialBalanceFilters,
  ): Promise<TrialBalanceRow[]> {
    const db = await this.container.resolve<any>("db");
    const reversalMode: ReversalHandlingMode = filters.reversalMode ?? "NETTED";

    // Build status filter based on reversal handling
    let statusFilter: string;
    let excludeReversed = false;

    switch (reversalMode) {
      case "NETTED":
        statusFilter = `je.status = 'POSTED'`;
        break;
      case "SEPARATE":
        statusFilter = `je.status IN ('POSTED', 'REVERSED')`;
        break;
      case "EXCLUDED":
        statusFilter = `je.status = 'POSTED'`;
        excludeReversed = true;
        break;
    }

    const params: unknown[] = [
      filters.tenantId,
      filters.entityCode,
      filters.fiscalYear,
      filters.periodNumber,
    ];

    const reversedClause = excludeReversed
      ? `AND je.reversed_by_id IS NULL`
      : "";

    const rows = await db.query(
      `SELECT
               a.id AS account_id,
               a.account_code,
               a.account_name,
               a.account_type,
               COALESCE(SUM(jl.debit_amount), 0)::text  AS debit_balance,
               COALESCE(SUM(jl.credit_amount), 0)::text AS credit_balance
             FROM fin.journal_line jl
             JOIN fin.journal_entry je
               ON je.id = jl.je_id AND je.tenant_id = jl.tenant_id
             JOIN fin.chart_of_accounts a
               ON a.id = jl.account_id AND a.tenant_id = jl.tenant_id
             WHERE je.tenant_id = $1
               AND je.entity_code = $2
               AND je.fiscal_year = $3
               AND je.period_number <= $4
               AND ${statusFilter}
               ${reversedClause}
             GROUP BY a.id, a.account_code, a.account_name, a.account_type
             HAVING COALESCE(SUM(jl.debit_amount), 0) != 0
                 OR COALESCE(SUM(jl.credit_amount), 0) != 0
             ORDER BY a.account_code`,
      params,
    );

    return rows.map(mapRowToTrialBalance);
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapRowToGLSummary(row: any): GLSummaryRow {
  return {
    accountId: row.account_id,
    accountCode: row.account_code,
    accountName: row.account_name,
    accountType: row.account_type,
    openingDebit: String(row.opening_debit),
    openingCredit: String(row.opening_credit),
    periodDebit: String(row.period_debit),
    periodCredit: String(row.period_credit),
    closingDebit: String(row.closing_debit),
    closingCredit: String(row.closing_credit),
  };
}

function mapRowToGLDetail(row: any): GLDetailRow {
  return {
    jeId: row.je_id,
    jeNumber: row.je_number,
    postingDate: new Date(row.posting_date),
    docId: row.doc_id,
    docType: row.doc_type,
    lineNo: row.line_no,
    debitAmount: String(row.debit_amount),
    creditAmount: String(row.credit_amount),
    description: row.description ?? null,
    sourceDocLineId: row.source_doc_line_id ?? null,
    costCenterId: row.cost_center_id ?? null,
  };
}

function mapRowToTrialBalance(row: any): TrialBalanceRow {
  return {
    accountId: row.account_id,
    accountCode: row.account_code,
    accountName: row.account_name,
    accountType: row.account_type,
    debitBalance: String(row.debit_balance),
    creditBalance: String(row.credit_balance),
  };
}
