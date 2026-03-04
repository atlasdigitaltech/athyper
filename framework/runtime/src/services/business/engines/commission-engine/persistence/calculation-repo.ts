/**
 * Commission Engine — Calculation Repository
 *
 * Persistence layer for individual commission calculation records.
 */

import { CommissionStatus } from "../domain/types.js";

import type { Container } from "../../../../../kernel/container.js";
import type { CommissionCalculation } from "../domain/types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CommissionCalculationRepo {
  findById(id: string): Promise<CommissionCalculation | null>;
  findByPartner(
    tenantId: string,
    partnerId: string,
    status?: CommissionStatus,
  ): Promise<CommissionCalculation[]>;
  findByPartnerAndPeriod(
    tenantId: string,
    partnerId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<CommissionCalculation[]>;
  findByTransaction(
    tenantId: string,
    txnId: string,
  ): Promise<CommissionCalculation[]>;
  findByDocument(
    tenantId: string,
    docId: string,
  ): Promise<CommissionCalculation[]>;
  create(input: CreateCalculationRow): Promise<CommissionCalculation>;
  updateStatus(
    id: string,
    update: UpdateCalculationStatus,
  ): Promise<CommissionCalculation>;
}

export interface CreateCalculationRow {
  tenantId: string;
  entityCode: string;
  partnerId: string;
  planId: string;
  txnId?: string;
  docId?: string;
  baseAmount: string;
  commissionRate: string;
  commissionAmount: string;
  currencyCode: string;
  splitPct: string;
}

export interface UpdateCalculationStatus {
  status: CommissionStatus;
  accrualJeId?: string;
  settlementJeId?: string;
  clawbackJeId?: string;
  clawbackReason?: string;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultCommissionCalculationRepo implements CommissionCalculationRepo {
  constructor(private readonly container: Container) {}

  async findById(id: string): Promise<CommissionCalculation | null> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `SELECT * FROM fin.commission_calculation WHERE id = $1`,
      [id],
    );
    return row ? mapRowToCalculation(row) : null;
  }

  async findByPartner(
    tenantId: string,
    partnerId: string,
    status?: CommissionStatus,
  ): Promise<CommissionCalculation[]> {
    const db = await this.container.resolve<any>("db");
    if (status) {
      const rows = await db.query(
        `SELECT * FROM fin.commission_calculation
         WHERE tenant_id = $1 AND partner_id = $2 AND status = $3
         ORDER BY calculated_at DESC`,
        [tenantId, partnerId, status],
      );
      return rows.map(mapRowToCalculation);
    }
    const rows = await db.query(
      `SELECT * FROM fin.commission_calculation
       WHERE tenant_id = $1 AND partner_id = $2
       ORDER BY calculated_at DESC`,
      [tenantId, partnerId],
    );
    return rows.map(mapRowToCalculation);
  }

  async findByPartnerAndPeriod(
    tenantId: string,
    partnerId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<CommissionCalculation[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.commission_calculation
       WHERE tenant_id = $1
         AND partner_id = $2
         AND calculated_at >= $3
         AND calculated_at < $4
       ORDER BY calculated_at DESC`,
      [tenantId, partnerId, periodStart, periodEnd],
    );
    return rows.map(mapRowToCalculation);
  }

  async findByTransaction(
    tenantId: string,
    txnId: string,
  ): Promise<CommissionCalculation[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.commission_calculation
       WHERE tenant_id = $1 AND txn_id = $2
       ORDER BY calculated_at DESC`,
      [tenantId, txnId],
    );
    return rows.map(mapRowToCalculation);
  }

  async findByDocument(
    tenantId: string,
    docId: string,
  ): Promise<CommissionCalculation[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.commission_calculation
       WHERE tenant_id = $1 AND doc_id = $2
       ORDER BY calculated_at DESC`,
      [tenantId, docId],
    );
    return rows.map(mapRowToCalculation);
  }

  async create(input: CreateCalculationRow): Promise<CommissionCalculation> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `INSERT INTO fin.commission_calculation
         (tenant_id, entity_code, partner_id, plan_id, txn_id, doc_id,
          base_amount, commission_rate, commission_amount, currency_code,
          split_pct, status, calculated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'CALCULATED', now())
       RETURNING *`,
      [
        input.tenantId,
        input.entityCode,
        input.partnerId,
        input.planId,
        input.txnId ?? null,
        input.docId ?? null,
        input.baseAmount,
        input.commissionRate,
        input.commissionAmount,
        input.currencyCode,
        input.splitPct,
      ],
    );
    return mapRowToCalculation(row);
  }

  async updateStatus(
    id: string,
    update: UpdateCalculationStatus,
  ): Promise<CommissionCalculation> {
    const db = await this.container.resolve<any>("db");
    const setClauses: string[] = [`status = $1`, `updated_at = now()`];
    const params: unknown[] = [update.status];
    let paramIdx = 2;

    // Set the corresponding timestamp based on new status
    switch (update.status) {
      case CommissionStatus.ACCRUED:
        setClauses.push(`accrued_at = now()`);
        if (update.accrualJeId) {
          setClauses.push(`accrual_je_id = $${paramIdx++}`);
          params.push(update.accrualJeId);
        }
        break;
      case CommissionStatus.APPROVED:
        setClauses.push(`approved_at = now()`);
        break;
      case CommissionStatus.SETTLED:
        setClauses.push(`settled_at = now()`);
        if (update.settlementJeId) {
          setClauses.push(`settlement_je_id = $${paramIdx++}`);
          params.push(update.settlementJeId);
        }
        break;
      case CommissionStatus.CLAWED_BACK:
        setClauses.push(`clawed_back_at = now()`);
        if (update.clawbackJeId) {
          setClauses.push(`clawback_je_id = $${paramIdx++}`);
          params.push(update.clawbackJeId);
        }
        if (update.clawbackReason) {
          setClauses.push(`clawback_reason = $${paramIdx++}`);
          params.push(update.clawbackReason);
        }
        break;
    }

    params.push(id);

    const row = await db.queryOne(
      `UPDATE fin.commission_calculation
       SET ${setClauses.join(", ")}
       WHERE id = $${paramIdx}
       RETURNING *`,
      params,
    );
    return mapRowToCalculation(row);
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRowToCalculation(row: any): CommissionCalculation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityCode: row.entity_code,
    partnerId: row.partner_id,
    planId: row.plan_id,
    txnId: row.txn_id ?? null,
    docId: row.doc_id ?? null,
    baseAmount: String(row.base_amount),
    commissionRate: String(row.commission_rate),
    commissionAmount: String(row.commission_amount),
    currencyCode: row.currency_code,
    splitPct: String(row.split_pct),
    status: row.status,
    accrualJeId: row.accrual_je_id ?? null,
    settlementJeId: row.settlement_je_id ?? null,
    clawbackJeId: row.clawback_je_id ?? null,
    clawbackReason: row.clawback_reason ?? null,
    calculatedAt: new Date(row.calculated_at),
    accruedAt: row.accrued_at ? new Date(row.accrued_at) : null,
    approvedAt: row.approved_at ? new Date(row.approved_at) : null,
    settledAt: row.settled_at ? new Date(row.settled_at) : null,
    clawedBackAt: row.clawed_back_at ? new Date(row.clawed_back_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
