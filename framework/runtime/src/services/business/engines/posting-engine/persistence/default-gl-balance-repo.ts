// framework/runtime/src/services/business/engines/posting-engine/persistence/default-gl-balance-repo.ts
//
// Concrete GLBalanceRepo implementation.
// Uses parameterized SQL via container-resolved DB.
// MC-4 compliant: all monetary fields are string (DECIMAL(18,4) in DB).

import type { Container } from "../../../../../kernel/container";
import type { GLBalance } from "../domain/types";
import type { TransactionContext } from "../services/posting-service";
import type { GLBalanceRepo } from "./gl-balance-repo";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export class DefaultGLBalanceRepo implements GLBalanceRepo {
  constructor(private readonly container: Container) {}

  async upsert(
    balance: Omit<GLBalance, "id" | "updatedAt">,
  ): Promise<GLBalance> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `INSERT INTO fin.gl_balance (
          tenant_id, entity_code, book_code, account_id,
          fiscal_year, period_number, cost_center_id,
          dimension_set_id, currency_code,
          opening_debit, opening_credit,
          period_debit, period_credit,
          closing_debit, closing_credit
       ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9,
          $10, $11,
          $12, $13,
          $14, $15
       )
       ON CONFLICT ON CONSTRAINT uq_fin_gl_balance
       DO UPDATE SET
          opening_debit  = EXCLUDED.opening_debit,
          opening_credit = EXCLUDED.opening_credit,
          period_debit   = EXCLUDED.period_debit,
          period_credit  = EXCLUDED.period_credit,
          closing_debit  = EXCLUDED.closing_debit,
          closing_credit = EXCLUDED.closing_credit,
          updated_at     = now()
       RETURNING *`,
      [
        balance.tenantId,
        balance.entityCode,
        balance.bookCode ?? "STAT",
        balance.accountId,
        balance.fiscalYear,
        balance.periodNumber,
        balance.costCenterId ?? null,
        balance.dimensionSetId ?? null,
        balance.currencyCode,
        balance.openingDebit,
        balance.openingCredit,
        balance.periodDebit,
        balance.periodCredit,
        balance.closingDebit,
        balance.closingCredit,
      ],
    );
    return mapRow(row);
  }

  async getByAccount(
    tenantId: string,
    entityCode: string,
    accountId: string,
    fiscalYear: number,
    periodNumber: number,
    costCenterId?: string,
  ): Promise<GLBalance | null> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `SELECT * FROM fin.gl_balance
       WHERE tenant_id = $1
         AND entity_code = $2
         AND account_id = $3::uuid
         AND fiscal_year = $4
         AND period_number = $5
         AND cost_center_id IS NOT DISTINCT FROM $6::uuid`,
      [tenantId, entityCode, accountId, fiscalYear, periodNumber, costCenterId ?? null],
    );
    return row ? mapRow(row) : null;
  }

  async listByPeriod(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<GLBalance[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.gl_balance
       WHERE tenant_id = $1
         AND entity_code = $2
         AND fiscal_year = $3
         AND period_number = $4
       ORDER BY account_id, cost_center_id NULLS FIRST`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );
    return rows.map(mapRow);
  }

  async listByAccount(
    tenantId: string,
    entityCode: string,
    accountId: string,
    fiscalYear: number,
  ): Promise<GLBalance[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.gl_balance
       WHERE tenant_id = $1
         AND entity_code = $2
         AND account_id = $3::uuid
         AND fiscal_year = $4
       ORDER BY period_number`,
      [tenantId, entityCode, accountId, fiscalYear],
    );
    return rows.map(mapRow);
  }

  async incrementPeriodAmounts(
    tenantId: string,
    entityCode: string,
    accountId: string,
    fiscalYear: number,
    periodNumber: number,
    costCenterId: string | null,
    currencyCode: string,
    debitDelta: string,
    creditDelta: string,
    tx?: TransactionContext,
    dimensionSetId?: string | null,
  ): Promise<void> {
    const db = await this.container.resolve<any>("db");
    const client = tx ?? db;

    // Atomic upsert: INSERT or UPDATE period amounts in a single statement.
    // Uses the v3 unique index (includes book_code + dimension_set_id)
    // via COALESCE to handle nullable columns.
    // closing = opening + period — maintained by trigger or recalc,
    // but we increment closing alongside period for real-time accuracy.
    await client.query(
      `INSERT INTO fin.gl_balance (
          tenant_id, entity_code, book_code, account_id,
          fiscal_year, period_number, cost_center_id,
          dimension_set_id, currency_code,
          opening_debit, opening_credit,
          period_debit, period_credit,
          closing_debit, closing_credit
       ) VALUES (
          $1, $2, 'STAT', $3::uuid,
          $4, $5, $6::uuid,
          $7::uuid, $8,
          0, 0,
          $9::decimal, $10::decimal,
          $9::decimal, $10::decimal
       )
       ON CONFLICT (
          tenant_id, entity_code, book_code, account_id,
          fiscal_year, period_number, currency_code,
          COALESCE(cost_center_id, '${NIL_UUID}'::uuid),
          COALESCE(dimension_set_id, '${NIL_UUID}'::uuid)
       )
       DO UPDATE SET
          period_debit   = fin.gl_balance.period_debit   + $9::decimal,
          period_credit  = fin.gl_balance.period_credit  + $10::decimal,
          closing_debit  = fin.gl_balance.closing_debit  + $9::decimal,
          closing_credit = fin.gl_balance.closing_credit + $10::decimal,
          updated_at     = now()`,
      [
        tenantId,
        entityCode,
        accountId,
        fiscalYear,
        periodNumber,
        costCenterId,
        dimensionSetId ?? null,
        currencyCode,
        debitDelta,
        creditDelta,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): GLBalance {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    entityCode: row.entity_code as string,
    bookCode: (row.book_code as string) ?? "STAT",
    accountId: row.account_id as string,
    fiscalYear: row.fiscal_year as number,
    periodNumber: row.period_number as number,
    costCenterId: (row.cost_center_id as string) ?? null,
    dimensionSetId: (row.dimension_set_id as string) ?? null,
    currencyCode: row.currency_code as string,
    openingDebit: String(row.opening_debit),
    openingCredit: String(row.opening_credit),
    periodDebit: String(row.period_debit),
    periodCredit: String(row.period_credit),
    closingDebit: String(row.closing_debit),
    closingCredit: String(row.closing_credit),
    updatedAt: row.updated_at as Date,
  };
}
