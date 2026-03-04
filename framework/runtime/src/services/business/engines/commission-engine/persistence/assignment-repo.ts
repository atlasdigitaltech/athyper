/**
 * Commission Engine — Assignment Repository
 *
 * Persistence layer for commission plan assignments to partners.
 */

import type { Container } from "../../../../../kernel/container.js";
import type {
  CommissionAssignment,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CommissionAssignmentRepo {
  findById(id: string): Promise<CommissionAssignment | null>;
  findByPartner(
    tenantId: string,
    partnerId: string,
  ): Promise<CommissionAssignment[]>;
  findEffectiveAssignments(
    tenantId: string,
    partnerId: string,
    asOfDate: Date,
  ): Promise<CommissionAssignment[]>;
  findByPlan(planId: string): Promise<CommissionAssignment[]>;
  create(input: CreateAssignmentInput): Promise<CommissionAssignment>;
  update(
    id: string,
    input: UpdateAssignmentInput,
  ): Promise<CommissionAssignment>;
  delete(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultCommissionAssignmentRepo implements CommissionAssignmentRepo {
  constructor(private readonly container: Container) {}

  async findById(id: string): Promise<CommissionAssignment | null> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `SELECT * FROM fin.commission_assignment WHERE id = $1`,
      [id],
    );
    return row ? mapRowToAssignment(row) : null;
  }

  async findByPartner(
    tenantId: string,
    partnerId: string,
  ): Promise<CommissionAssignment[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.commission_assignment
       WHERE tenant_id = $1 AND partner_id = $2
       ORDER BY effective_from DESC`,
      [tenantId, partnerId],
    );
    return rows.map(mapRowToAssignment);
  }

  async findEffectiveAssignments(
    tenantId: string,
    partnerId: string,
    asOfDate: Date,
  ): Promise<CommissionAssignment[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.commission_assignment
       WHERE tenant_id = $1
         AND partner_id = $2
         AND effective_from <= $3
         AND (effective_to IS NULL OR effective_to >= $3)
       ORDER BY effective_from DESC`,
      [tenantId, partnerId, asOfDate],
    );
    return rows.map(mapRowToAssignment);
  }

  async findByPlan(planId: string): Promise<CommissionAssignment[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.commission_assignment WHERE plan_id = $1 ORDER BY effective_from DESC`,
      [planId],
    );
    return rows.map(mapRowToAssignment);
  }

  async create(input: CreateAssignmentInput): Promise<CommissionAssignment> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `INSERT INTO fin.commission_assignment
         (tenant_id, entity_code, partner_id, partner_type, plan_id,
          split_pct, effective_from, effective_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.tenantId,
        input.entityCode,
        input.partnerId,
        input.partnerType,
        input.planId,
        input.splitPct ?? "100",
        input.effectiveFrom,
        input.effectiveTo ?? null,
      ],
    );
    return mapRowToAssignment(row);
  }

  async update(
    id: string,
    input: UpdateAssignmentInput,
  ): Promise<CommissionAssignment> {
    const db = await this.container.resolve<any>("db");
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (input.splitPct !== undefined) {
      setClauses.push(`split_pct = $${paramIdx++}`);
      params.push(input.splitPct);
    }
    if (input.effectiveTo !== undefined) {
      setClauses.push(`effective_to = $${paramIdx++}`);
      params.push(input.effectiveTo);
    }

    setClauses.push(`updated_at = now()`);
    params.push(id);

    const row = await db.queryOne(
      `UPDATE fin.commission_assignment
       SET ${setClauses.join(", ")}
       WHERE id = $${paramIdx}
       RETURNING *`,
      params,
    );
    return mapRowToAssignment(row);
  }

  async delete(id: string): Promise<void> {
    const db = await this.container.resolve<any>("db");
    await db.query(`DELETE FROM fin.commission_assignment WHERE id = $1`, [id]);
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRowToAssignment(row: any): CommissionAssignment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityCode: row.entity_code,
    partnerId: row.partner_id,
    partnerType: row.partner_type,
    planId: row.plan_id,
    splitPct: String(row.split_pct),
    effectiveFrom: new Date(row.effective_from),
    effectiveTo: row.effective_to ? new Date(row.effective_to) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
