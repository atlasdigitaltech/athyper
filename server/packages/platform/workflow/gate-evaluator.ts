import { evaluateJsonLogic } from "@athyper/platform-rules";
import { WorkflowRuntimeError } from "./runtime-errors.js";
import type { WorkflowRuntimeDb } from "./runtime.types.js";

export interface TransitionGate {
  transitionId: string;
  requiredOperations?: unknown;
  conditions?: unknown;
  thresholdRules?: unknown;
  resolvesVia?: string | null;
  workflowDefinitionId?: string | null;
}

export interface GateEvaluationParams {
  db: WorkflowRuntimeDb;
  tenantId: string;
  entityName: string;
  entityId: string;
  payload: Record<string, unknown>;
  gate?: TransitionGate | null;
}

export interface GateEvaluationResult {
  allowed: boolean;
  reasons: string[];
}

export class GateEvaluator {
  async evaluate(params: GateEvaluationParams): Promise<GateEvaluationResult> {
    const gate = params.gate;
    if (!gate) return { allowed: true, reasons: [] };

    const reasons: string[] = [];

    try {
      if (gate.conditions != null && !evaluateRuntimeCondition(gate.conditions, params.payload)) {
        reasons.push("condition_not_matched");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new WorkflowRuntimeError("GATE_DENIED", message, 422, {
        transition_id: gate.transitionId,
      });
    }

    const requiredOps = normalizeRequiredOperations(gate.requiredOperations);
    for (const operationCode of requiredOps) {
      const existing = await params.db
        .selectFrom("log.entity_lifecycle_log as ell" as never)
        .select(["ell.id"] as never[])
        .where("ell.tenant_id" as never, "=" as never, params.tenantId as never)
        .where("ell.entity_type" as never, "=" as never, params.entityName as never)
        .where("ell.entity_id" as never, "=" as never, params.entityId as never)
        .where("ell.operation_code" as never, "=" as never, operationCode as never)
        .limit(1)
        .executeTakeFirst();

      if (!existing) reasons.push(`missing_required_operation:${operationCode}`);
    }

    if (gate.thresholdRules != null) {
      throw new WorkflowRuntimeError(
        "GATE_NOT_IMPLEMENTED",
        "Threshold rules are not yet supported. Remove the threshold_rules gate condition or contact support.",
        422,
        { transition_id: gate.transitionId, prior_reasons: reasons },
      );
    }

    return {
      allowed: reasons.length === 0,
      reasons,
    };
  }

  async assertAllowed(params: GateEvaluationParams): Promise<void> {
    const result = await this.evaluate(params);
    if (!result.allowed) {
      throw new WorkflowRuntimeError("GATE_DENIED", "Lifecycle transition gate denied the operation", 422, {
        reasons: result.reasons,
        transition_id: params.gate?.transitionId,
      });
    }
  }
}

export function evaluateRuntimeCondition(condition: unknown, payload: Record<string, unknown>): boolean {
  const normalized = normalizeLegacyCondition(condition);
  return evaluateJsonLogic(normalized, payload);
}

export function normalizeLegacyCondition(condition: unknown): unknown {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return condition;
  const obj = condition as Record<string, unknown>;
  if (typeof obj["field"] !== "string" || typeof obj["operator"] !== "string") return condition;

  const field = { var: obj["field"] };
  const value = obj["value"];
  switch (obj["operator"]) {
    case "eq":
    case "equals":
      return { "==": [field, value] };
    case "neq":
    case "not_equals":
      return { "!=": [field, value] };
    case "gt":
      return { ">": [field, value] };
    case "gte":
      return { ">=": [field, value] };
    case "lt":
      return { "<": [field, value] };
    case "lte":
      return { "<=": [field, value] };
    case "in":
      return { in: [field, value] };
    default:
      return condition;
  }
}

function normalizeRequiredOperations(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const code = (item as Record<string, unknown>)["code"];
        return typeof code === "string" ? code : null;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}
