/**
 * DecisionGridService — Phase 2.3
 *
 * Evaluates multi-dimensional decision grids stored in control.policy_rule
 * where conditions are row/column lookup tables rather than arbitrary JSONLogic.
 *
 * A decision grid is a policy_definition with evaluation_mode = 'grid'.
 * Rules have conditions structured as:
 *   { "grid": { "rows": [...matchers], "columns": [...matchers] } }
 *
 * The service finds the matching cell (row ∩ column) and returns its action.
 *
 * Use cases:
 *   - Credit limit approval matrix (amount × entity_type → approve/escalate/deny)
 *   - Discount approval grid (discount_pct × customer_tier → approve/require_workflow)
 *   - Tax rate lookup (jurisdiction × commodity_code → tax_rate)
 *
 * Grid rule conditions format:
 *   {
 *     "grid_row": { "field": "amount", "op": "between", "min": 0, "max": 10000 },
 *     "grid_col": { "field": "customer_tier", "op": "=", "value": "gold" }
 *   }
 */

import type { Kysely } from "kysely";
import type { PolicyAction } from "../../../framework/runtime/services/policy/engine.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GridDimension {
  field:   string;
  op:      "=" | "!=" | "in" | "between" | ">" | ">=" | "<" | "<=";
  value?:  unknown;
  values?: unknown[];
  min?:    number;
  max?:    number;
}

export interface GridRule {
  id:          string;
  priority:    number;
  gridRow:     GridDimension | null;
  gridCol:     GridDimension | null;
  action:      PolicyAction;
  score:       number | null;
  explanation: string | null;
  metadata:    Record<string, unknown> | null;
}

export interface GridEvaluateParams {
  tenantId:   string;
  policyId:   string;
  rowContext:  Record<string, unknown>;
  colContext:  Record<string, unknown>;
}

export interface GridEvaluateResult {
  matched:     boolean;
  action:      PolicyAction | "none";
  permitted:   boolean;
  rule?:       GridRule;
  explanation: string | null;
  evaluationMs: number;
}

// ── DecisionGridService ───────────────────────────────────────────────────────

export class DecisionGridService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  private readonly cache = new Map<string, { rules: GridRule[]; fetchedAt: number }>();
  private readonly TTL_MS = 5 * 60_000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  async evaluate(params: GridEvaluateParams): Promise<GridEvaluateResult> {
    const start = Date.now();
    const rules = await this.loadRules(params.policyId);

    for (const rule of rules) {
      const rowMatch = rule.gridRow
        ? this.matchDimension(rule.gridRow, params.rowContext)
        : true;
      const colMatch = rule.gridCol
        ? this.matchDimension(rule.gridCol, params.colContext)
        : true;

      if (rowMatch && colMatch) {
        return {
          matched:      true,
          action:       rule.action,
          permitted:    rule.action !== "deny",
          rule,
          explanation:  rule.explanation,
          evaluationMs: Date.now() - start,
        };
      }
    }

    return {
      matched:      false,
      action:       "none",
      permitted:    true,
      explanation:  null,
      evaluationMs: Date.now() - start,
    };
  }

  invalidate(policyId: string): void {
    this.cache.delete(policyId);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async loadRules(policyId: string): Promise<GridRule[]> {
    const now = Date.now();
    const cached = this.cache.get(policyId);
    if (cached && (now - cached.fetchedAt) < this.TTL_MS) return cached.rules;

    const rows = await this.db
      .selectFrom("control.policy_rule as pr" as never)
      .selectAll("pr" as never)
      .where("pr.policy_id" as never, "=", policyId as never)
      .orderBy("pr.priority" as never, "asc")
      .execute() as Record<string, unknown>[];

    const rules: GridRule[] = rows.map((r) => {
      const cond = r["conditions"] as Record<string, unknown> | null;
      return {
        id:          r["id"] as string,
        priority:    r["priority"] as number,
        gridRow:     cond?.["grid_row"] as GridDimension | null ?? null,
        gridCol:     cond?.["grid_col"] as GridDimension | null ?? null,
        action:      r["action"] as PolicyAction,
        score:       r["score"] != null ? Number(r["score"]) : null,
        explanation: r["explanation"] as string | null,
        metadata:    null,
      };
    });

    this.cache.set(policyId, { rules, fetchedAt: now });
    return rules;
  }

  private matchDimension(dim: GridDimension, ctx: Record<string, unknown>): boolean {
    const val = ctx[dim.field];
    switch (dim.op) {
      case "=":       return val === dim.value;
      case "!=":      return val !== dim.value;
      case ">":       return typeof val === "number" && val > (dim.value as number);
      case ">=":      return typeof val === "number" && val >= (dim.value as number);
      case "<":       return typeof val === "number" && val < (dim.value as number);
      case "<=":      return typeof val === "number" && val <= (dim.value as number);
      case "in":      return Array.isArray(dim.values) && dim.values.includes(val);
      case "between":
        return typeof val === "number"
          && val >= (dim.min ?? -Infinity)
          && val <= (dim.max ?? Infinity);
      default:
        return false;
    }
  }
}

export function createDecisionGridService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>
): DecisionGridService {
  return new DecisionGridService(db);
}
