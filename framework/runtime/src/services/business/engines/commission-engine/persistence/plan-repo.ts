/**
 * Commission Engine — Plan Repository
 *
 * Persistence layer for commission plan CRUD operations.
 */

import type { Container } from "../../../../../kernel/container.js";
import type {
  CommissionPlan,
  CreatePlanInput,
  UpdatePlanInput,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CommissionPlanRepo {
  findById(id: string): Promise<CommissionPlan | null>;
  findByCode(
    tenantId: string,
    entityCode: string,
    code: string,
  ): Promise<CommissionPlan | null>;
  findActivePlans(
    tenantId: string,
    entityCode: string,
  ): Promise<CommissionPlan[]>;
  findEffectivePlan(
    tenantId: string,
    entityCode: string,
    code: string,
    asOfDate: Date,
  ): Promise<CommissionPlan | null>;
  create(input: CreatePlanInput): Promise<CommissionPlan>;
  update(id: string, input: UpdatePlanInput): Promise<CommissionPlan>;
  deactivate(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultCommissionPlanRepo implements CommissionPlanRepo {
  constructor(private readonly container: Container) {}

  async findById(id: string): Promise<CommissionPlan | null> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `SELECT * FROM fin.commission_plan WHERE id = $1`,
      [id],
    );
    return row ? mapRowToPlan(row) : null;
  }

  async findByCode(
    tenantId: string,
    entityCode: string,
    code: string,
  ): Promise<CommissionPlan | null> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `SELECT * FROM fin.commission_plan
       WHERE tenant_id = $1 AND entity_code = $2 AND code = $3`,
      [tenantId, entityCode, code],
    );
    return row ? mapRowToPlan(row) : null;
  }

  async findActivePlans(
    tenantId: string,
    entityCode: string,
  ): Promise<CommissionPlan[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.commission_plan
       WHERE tenant_id = $1 AND entity_code = $2 AND is_active = TRUE
       ORDER BY code`,
      [tenantId, entityCode],
    );
    return rows.map(mapRowToPlan);
  }

  async findEffectivePlan(
    tenantId: string,
    entityCode: string,
    code: string,
    asOfDate: Date,
  ): Promise<CommissionPlan | null> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `SELECT * FROM fin.commission_plan
       WHERE tenant_id = $1
         AND entity_code = $2
         AND code = $3
         AND is_active = TRUE
         AND effective_from <= $4
         AND (effective_to IS NULL OR effective_to >= $4)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [tenantId, entityCode, code, asOfDate],
    );
    return row ? mapRowToPlan(row) : null;
  }

  async create(input: CreatePlanInput): Promise<CommissionPlan> {
    const db = await this.container.resolve<any>("db");
    const row = await db.queryOne(
      `INSERT INTO fin.commission_plan
         (tenant_id, entity_code, code, name, plan_type, base_metric,
          tiers, formula, effective_from, effective_to,
          clawback_window_days, clawback_triggers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        input.tenantId,
        input.entityCode,
        input.code,
        input.name,
        input.planType,
        input.baseMetric,
        input.tiers ? JSON.stringify(input.tiers) : null,
        input.formula ?? null,
        input.effectiveFrom,
        input.effectiveTo ?? null,
        input.clawbackWindowDays ?? 0,
        input.clawbackTriggers ?? [],
      ],
    );
    return mapRowToPlan(row);
  }

  async update(id: string, input: UpdatePlanInput): Promise<CommissionPlan> {
    const db = await this.container.resolve<any>("db");
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      params.push(input.name);
    }
    if (input.tiers !== undefined) {
      setClauses.push(`tiers = $${paramIdx++}`);
      params.push(JSON.stringify(input.tiers));
    }
    if (input.formula !== undefined) {
      setClauses.push(`formula = $${paramIdx++}`);
      params.push(input.formula);
    }
    if (input.effectiveTo !== undefined) {
      setClauses.push(`effective_to = $${paramIdx++}`);
      params.push(input.effectiveTo);
    }
    if (input.clawbackWindowDays !== undefined) {
      setClauses.push(`clawback_window_days = $${paramIdx++}`);
      params.push(input.clawbackWindowDays);
    }
    if (input.clawbackTriggers !== undefined) {
      setClauses.push(`clawback_triggers = $${paramIdx++}`);
      params.push(input.clawbackTriggers);
    }
    if (input.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIdx++}`);
      params.push(input.isActive);
    }

    setClauses.push(`updated_at = now()`);
    params.push(id);

    const row = await db.queryOne(
      `UPDATE fin.commission_plan
       SET ${setClauses.join(", ")}
       WHERE id = $${paramIdx}
       RETURNING *`,
      params,
    );
    return mapRowToPlan(row);
  }

  async deactivate(id: string): Promise<void> {
    const db = await this.container.resolve<any>("db");
    await db.query(
      `UPDATE fin.commission_plan SET is_active = FALSE, updated_at = now() WHERE id = $1`,
      [id],
    );
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRowToPlan(row: any): CommissionPlan {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityCode: row.entity_code,
    code: row.code,
    name: row.name,
    planType: row.plan_type,
    baseMetric: row.base_metric,
    tiers: row.tiers ?? null,
    formula: row.formula ?? null,
    effectiveFrom: new Date(row.effective_from),
    effectiveTo: row.effective_to ? new Date(row.effective_to) : null,
    clawbackWindowDays: row.clawback_window_days,
    clawbackTriggers: row.clawback_triggers ?? [],
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
