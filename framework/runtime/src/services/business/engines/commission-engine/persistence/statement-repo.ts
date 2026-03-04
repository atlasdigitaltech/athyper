/**
 * Commission Engine — Statement Repository
 *
 * Persistence layer for periodic commission statements.
 */

import type { Container } from "../../../../../kernel/container.js";
import type { StatementStatus, CommissionStatement } from "../domain/types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CommissionStatementRepo {
  findById(id: string): Promise<CommissionStatement | null>;
  findByPartner(
    tenantId: string,
    partnerId: string,
  ): Promise<CommissionStatement[]>;
  findByPartnerAndPeriod(
    tenantId: string,
    partnerId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<CommissionStatement | null>;
  findByStatus(
    tenantId: string,
    status: StatementStatus,
  ): Promise<CommissionStatement[]>;
  create(input: CreateStatementRow): Promise<CommissionStatement>;
  updateStatus(
    id: string,
    status: StatementStatus,
  ): Promise<CommissionStatement>;
  updateTotals(
    id: string,
    totals: UpdateStatementTotals,
  ): Promise<CommissionStatement>;
}

export interface CreateStatementRow {
  tenantId: string;
  entityCode: string;
  partnerId: string;
  periodStart: Date;
  periodEnd: Date;
  totalCalculated: string;
  totalAccrued: string;
  totalSettled: string;
  totalClawedBack: string;
  netPayable: string;
  currencyCode: string;
}

export interface UpdateStatementTotals {
  totalCalculated: string;
  totalAccrued: string;
  totalSettled: string;
  totalClawedBack: string;
  netPayable: string;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultCommissionStatementRepo implements CommissionStatementRepo {
  constructor(private readonly container: Container) {}

  async findById(id: string): Promise<CommissionStatement | null> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `SELECT * FROM fin.commission_statement WHERE id = $1`,
      [id],
    );
    return row ? mapRowToStatement(row) : null;
  }

  async findByPartner(
    tenantId: string,
    partnerId: string,
  ): Promise<CommissionStatement[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.commission_statement
       WHERE tenant_id = $1 AND partner_id = $2
       ORDER BY period_start DESC`,
      [tenantId, partnerId],
    );
    return rows.map(mapRowToStatement);
  }

  async findByPartnerAndPeriod(
    tenantId: string,
    partnerId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<CommissionStatement | null> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `SELECT * FROM fin.commission_statement
       WHERE tenant_id = $1
         AND partner_id = $2
         AND period_start = $3
         AND period_end = $4`,
      [tenantId, partnerId, periodStart, periodEnd],
    );
    return row ? mapRowToStatement(row) : null;
  }

  async findByStatus(
    tenantId: string,
    status: StatementStatus,
  ): Promise<CommissionStatement[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.commission_statement
       WHERE tenant_id = $1 AND status = $2
       ORDER BY period_start DESC`,
      [tenantId, status],
    );
    return rows.map(mapRowToStatement);
  }

  async create(input: CreateStatementRow): Promise<CommissionStatement> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `INSERT INTO fin.commission_statement
         (tenant_id, entity_code, partner_id, period_start, period_end,
          total_calculated, total_accrued, total_settled, total_clawed_back,
          net_payable, currency_code, status, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'GENERATED', now())
       RETURNING *`,
      [
        input.tenantId,
        input.entityCode,
        input.partnerId,
        input.periodStart,
        input.periodEnd,
        input.totalCalculated,
        input.totalAccrued,
        input.totalSettled,
        input.totalClawedBack,
        input.netPayable,
        input.currencyCode,
      ],
    );
    return mapRowToStatement(row);
  }

  async updateStatus(
    id: string,
    status: StatementStatus,
  ): Promise<CommissionStatement> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `UPDATE fin.commission_statement
       SET status = $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [status, id],
    );
    return mapRowToStatement(row);
  }

  async updateTotals(
    id: string,
    totals: UpdateStatementTotals,
  ): Promise<CommissionStatement> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `UPDATE fin.commission_statement
       SET total_calculated = $1,
           total_accrued = $2,
           total_settled = $3,
           total_clawed_back = $4,
           net_payable = $5,
           updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [
        totals.totalCalculated,
        totals.totalAccrued,
        totals.totalSettled,
        totals.totalClawedBack,
        totals.netPayable,
        id,
      ],
    );
    return mapRowToStatement(row);
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRowToStatement(row: any): CommissionStatement {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityCode: row.entity_code,
    partnerId: row.partner_id,
    periodStart: new Date(row.period_start),
    periodEnd: new Date(row.period_end),
    totalCalculated: String(row.total_calculated),
    totalAccrued: String(row.total_accrued),
    totalSettled: String(row.total_settled),
    totalClawedBack: String(row.total_clawed_back),
    netPayable: String(row.net_payable),
    currencyCode: row.currency_code,
    status: row.status,
    generatedAt: row.generated_at ? new Date(row.generated_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
