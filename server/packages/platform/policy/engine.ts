/**
 * PolicyEngine — core policy & rules evaluation service.
 *
 * Responsibilities:
 *   - evaluate:    run all matching policy_definition rows against a payload,
 *                  return the first/accumulated action outcome
 *   - listDefinitions / getDefinition: admin reads
 *   - createDefinition / updateDefinition: admin writes
 *   - listRules / createRule / updateRule / deleteRule: per-policy rule management
 *   - queryLog: read audit.audit_log (event_code='policy.evaluated') for a tenant
 *
 * DB tables used:
 *   control.policy_definition  — policy containers
 *   control.policy_rule        — individual JSONLogic rules
 *   audit.audit_log            — evaluation events (via audit.append_event)
 *
 * Evaluation algorithm:
 *   1. Load all is_active policy_definitions for (tenant_id, entity_type) effective today,
 *      ordered by priority ASC. Platform-global (tenant_id IS NULL) policies are included
 *      and evaluated after tenant-specific ones of the same priority.
 *   2. For each policy, load rules ordered by priority ASC.
 *   3. Evaluate each rule's conditions (JSONLogic) against the enriched payload.
 *   4. evaluation_mode = first_match: stop at first matching rule within the policy.
 *      evaluation_mode = accumulate:  merge all matching rule outcomes (deny wins over warn/allow).
 *      evaluation_mode = all:         collect all outcomes.
 *   5. If any definition produces a 'deny', the overall result is deny.
 *      If none deny and any requires_workflow, result is require_workflow.
 *      If none of the above, and any warns, result is warn.
 *      Otherwise result is allow (or null if no rule matched).
 *   6. Emit to audit.audit_log via appendAuditEvent (generic_action_event contract).
 */

import { sql, type Kysely } from "kysely";
import { evaluateJsonLogic } from "@athyper/platform-rules";
import { appendAuditEvent } from "@athyper/svc-audit";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PolicyEngineDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    info?(event: string, fields?: Record<string, unknown>): void;
  };
}

export type PolicyAction = "allow" | "deny" | "warn" | "require_workflow" | "escalate";
export type EvaluationMode = "first_match" | "accumulate" | "all";

export interface EvaluateParams {
  tenantId: string;
  entityType: string;
  entityId?: string;
  payload: Record<string, unknown>;
  /** Optional org-context injected into payload for JSONLogic */
  companyCodeId?: string;
  legalEntityId?: string;
  /** Identifies the calling pipeline — stored in audit context.pipeline_id */
  pipelineId?: string;
  /** Correlation txn — stored as audit correlation_id */
  txnId?: string;
  /** The principal making the request (for the log created_by) */
  requestedBy: string;
}

export interface RuleOutcome {
  ruleId: string;
  policyId: string;
  policyName: string;
  action: PolicyAction;
  score?: number | null;
  confidence?: number | null;
  explanation?: string | null;
  approvers?: unknown[] | null;
  slaHours?: number | null;
}

export interface EvaluateResult {
  /** Final resolved action — the highest-priority outcome across all policies */
  action: PolicyAction | "none";
  /** Whether the operation is permitted to proceed */
  permitted: boolean;
  /** All individual rule outcomes that matched */
  outcomes: RuleOutcome[];
  /** The winning outcome (if any) */
  winning?: RuleOutcome;
  /** How long evaluation took in milliseconds */
  evaluationMs: number;
}

export interface PolicyDefinition {
  id: string;
  tenantId: string | null;
  moduleId: string | null;
  entityType: string;
  name: string;
  description: string | null;
  priority: number;
  evaluationMode: EvaluationMode;
  effectiveFrom: string;
  effectiveUntil: string | null;
  versionNo: number;
  status: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface PolicyRule {
  id: string;
  policyId: string;
  priority: number;
  conditions: unknown | null;
  action: PolicyAction;
  score: number | null;
  confidence: number | null;
  explanation: string | null;
  approvers: unknown[] | null;
  slaHours: number | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface CreateDefinitionParams {
  tenantId: string;
  moduleId?: string;
  entityType: string;
  name: string;
  description?: string;
  priority?: number;
  evaluationMode?: EvaluationMode;
  effectiveFrom?: string;
  effectiveUntil?: string;
  createdBy: string;
}

export interface UpdateDefinitionParams {
  name?: string;
  description?: string;
  priority?: number;
  evaluationMode?: EvaluationMode;
  effectiveFrom?: string;
  effectiveUntil?: string;
  status?: string;
  updatedBy: string;
}

export interface CreateRuleParams {
  priority?: number;
  conditions?: unknown;
  action: PolicyAction;
  score?: number;
  confidence?: number;
  explanation?: string;
  approvers?: unknown[];
  slaHours?: number;
  createdBy: string;
}

export interface UpdateRuleParams {
  priority?: number;
  conditions?: unknown;
  action?: PolicyAction;
  score?: number | null;
  confidence?: number | null;
  explanation?: string | null;
  approvers?: unknown[] | null;
  slaHours?: number | null;
  updatedBy: string;
}

// Action precedence: higher index = higher priority (wins in accumulate mode)
const ACTION_PRECEDENCE: Record<PolicyAction, number> = {
  allow:            0,
  escalate:         1,
  warn:             2,
  require_workflow: 3,
  deny:             4,
};

// ── PolicyEngine ─────────────────────────────────────────────────────────────

export class PolicyEngine {
  private readonly db: Kysely<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  private readonly logger: PolicyEngineDeps["logger"];

  constructor(deps: PolicyEngineDeps) {
    this.db     = deps.db;
    this.logger = deps.logger;
  }

  // ── Evaluation ─────────────────────────────────────────────────────────────

  async evaluate(params: EvaluateParams): Promise<EvaluateResult> {
    const start = Date.now();
    const {
      tenantId,
      entityType,
      payload,
      companyCodeId,
      legalEntityId,
      pipelineId,
      txnId,
      requestedBy,
    } = params;

    const today = new Date().toISOString().slice(0, 10);

    // Enrich evaluation payload with org context
    const evalPayload: Record<string, unknown> = {
      ...payload,
      tenant_id: tenantId,
      ...(companyCodeId  ? { company_code_id:  companyCodeId  } : {}),
      ...(legalEntityId  ? { legal_entity_id:  legalEntityId  } : {}),
    };

    // Load active policy definitions (tenant-specific + platform-global)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const definitions = await (this.db.selectFrom("control.policy_definition as pd") as any)
      .selectAll("pd")
      .where((eb: any) => eb.or([
        eb("pd.tenant_id", "=", tenantId),
        eb("pd.tenant_id", "is", null),
      ]))
      .where("pd.entity_type", "=", entityType)
      .where("pd.is_active", "=", true)
      .where("pd.effective_from", "<=", today)
      .where((eb: any) => eb.or([
        eb("pd.effective_until", "is", null),
        eb("pd.effective_until", ">=", today),
      ]))
      .orderBy(["pd.tenant_id", "pd.priority"])
      .execute();

    const allOutcomes: RuleOutcome[] = [];

    for (const defRow of definitions) {
      const mode = (defRow.evaluation_mode ?? "first_match") as EvaluationMode;

      // Load rules for this policy ordered by priority ASC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rules = await (this.db.selectFrom("control.policy_rule as pr") as any)
        .selectAll("pr")
        .where("pr.policy_id", "=", defRow.id)
        .orderBy("pr.priority", "asc")
        .execute();

      const policyOutcomes: RuleOutcome[] = [];

      for (const rule of rules) {
        const matches = evaluateJsonLogic(rule.conditions ?? null, evalPayload);
        if (!matches) continue;

        const outcome: RuleOutcome = {
          ruleId:      rule.id,
          policyId:    defRow.id,
          policyName:  defRow.name,
          action:      rule.action as PolicyAction,
          score:       rule.score != null ? Number(rule.score) : null,
          confidence:  rule.confidence != null ? Number(rule.confidence) : null,
          explanation: rule.explanation ?? null,
          approvers:   rule.approvers ?? null,
          slaHours:    rule.sla_hours ?? null,
        };

        policyOutcomes.push(outcome);

        if (mode === "first_match") break;
      }

      allOutcomes.push(...policyOutcomes);
    }

    // Resolve winning action across all outcomes
    const winning = allOutcomes.length > 0
      ? allOutcomes.reduce((best, cur) =>
          ACTION_PRECEDENCE[cur.action] > ACTION_PRECEDENCE[best.action] ? cur : best
        )
      : undefined;

    const action: PolicyAction | "none" = winning?.action ?? "none";
    const permitted = action !== "deny";
    const evaluationMs = Date.now() - start;

    // Emit evaluation event (best-effort, non-fatal — appendAuditEvent swallows errors)
    void appendAuditEvent(this.db, {
      event_code:     "policy.evaluated",
      operation:      "execute",
      entity_type:    entityType,
      entity_id:      params.entityId ?? null,
      outcome:        action === "deny" ? "failure"
                      : action === "none" || action === "allow" ? "success"
                      : "partial",
      correlation_id: txnId ?? null,
      context: {
        policy_action:   action,
        pipeline_id:     pipelineId    ?? null,
        evaluation_ms:   evaluationMs,
        outcomes_count:  allOutcomes.length,
        winning_rule_id: winning?.ruleId       ?? null,
        score:           winning?.score        ?? null,
        confidence:      winning?.confidence   ?? null,
        explanation:     winning?.explanation  ?? null,
      },
    });

    return { action, permitted, outcomes: allOutcomes, winning, evaluationMs };
  }

  // ── Policy Definitions ─────────────────────────────────────────────────────

  async listDefinitions(opts: {
    tenantId: string;
    entityType?: string;
    moduleId?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<PolicyDefinition[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (this.db.selectFrom("control.policy_definition as pd") as any)
      .selectAll("pd")
      .where((eb: any) => eb.or([
        eb("pd.tenant_id", "=", opts.tenantId),
        eb("pd.tenant_id", "is", null),
      ]))
      .orderBy(["pd.priority", "pd.created_at"]);

    if (opts.entityType) {
      q = q.where("pd.entity_type", "=", opts.entityType);
    }
    if (opts.moduleId) {
      q = q.where("pd.module_id", "=", opts.moduleId);
    }
    if (opts.isActive !== undefined) {
      q = q.where("pd.is_active", "=", opts.isActive);
    }

    q = q.limit(opts.limit ?? 50).offset(opts.offset ?? 0);

    const rows = await q.execute();
    return rows.map(this.mapDefinition);
  }

  async getDefinition(id: string, tenantId: string): Promise<PolicyDefinition | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (this.db.selectFrom("control.policy_definition as pd") as any)
      .selectAll("pd")
      .where("pd.id", "=", id)
      .where((eb: any) => eb.or([
        eb("pd.tenant_id", "=", tenantId),
        eb("pd.tenant_id", "is", null),
      ]))
      .executeTakeFirst();

    return row ? this.mapDefinition(row) : null;
  }

  async createDefinition(params: CreateDefinitionParams): Promise<PolicyDefinition> {
    const row = await this.db
      .insertInto("control.policy_definition" as never)
      .values({
        tenant_id:       params.tenantId,
        module_id:       params.moduleId       ?? null,
        entity_type:     params.entityType,
        name:            params.name,
        description:     params.description    ?? null,
        priority:        params.priority       ?? 100,
        evaluation_mode: params.evaluationMode ?? "first_match",
        effective_from:  params.effectiveFrom  ?? new Date().toISOString().slice(0, 10),
        effective_until: params.effectiveUntil ?? null,
        created_by:      params.createdBy,
      } as never)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapDefinition(row);
  }

  async updateDefinition(
    id: string,
    tenantId: string,
    params: UpdateDefinitionParams,
  ): Promise<PolicyDefinition | null> {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: params.updatedBy,
    };
    if (params.name            !== undefined) updates.name             = params.name;
    if (params.description     !== undefined) updates.description      = params.description;
    if (params.priority        !== undefined) updates.priority         = params.priority;
    if (params.evaluationMode  !== undefined) updates.evaluation_mode  = params.evaluationMode;
    if (params.effectiveFrom   !== undefined) updates.effective_from   = params.effectiveFrom;
    if (params.effectiveUntil  !== undefined) updates.effective_until  = params.effectiveUntil;
    if (params.status          !== undefined) updates.status           = params.status;

    // Bump version_no on every write
    updates.version_no = sql`version_no + 1` as never;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (this.db.updateTable("control.policy_definition") as any)
      .set(updates)
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .returningAll()
      .executeTakeFirst();

    return row ? this.mapDefinition(row) : null;
  }

  // ── Policy Rules ───────────────────────────────────────────────────────────

  async listRules(policyId: string, tenantId: string): Promise<PolicyRule[]> {
    // Verify tenant access first
    const def = await this.getDefinition(policyId, tenantId);
    if (!def) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (this.db.selectFrom("control.policy_rule as pr") as any)
      .selectAll("pr")
      .where("pr.policy_id", "=", policyId)
      .orderBy("pr.priority", "asc")
      .execute();

    return rows.map(this.mapRule);
  }

  async createRule(
    policyId: string,
    tenantId: string,
    params: CreateRuleParams,
  ): Promise<PolicyRule | null> {
    const def = await this.getDefinition(policyId, tenantId);
    if (!def) return null;

    const row = await this.db
      .insertInto("control.policy_rule" as never)
      .values({
        policy_id:   policyId,
        priority:    params.priority    ?? 10,
        conditions:  params.conditions  != null ? JSON.stringify(params.conditions) : null,
        action:      params.action,
        score:       params.score       ?? null,
        confidence:  params.confidence  ?? null,
        explanation: params.explanation ?? null,
        approvers:   params.approvers   != null ? JSON.stringify(params.approvers)  : null,
        sla_hours:   params.slaHours    ?? null,
        created_by:  params.createdBy,
      } as never)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRule(row);
  }

  async updateRule(
    ruleId: string,
    tenantId: string,
    params: UpdateRuleParams,
  ): Promise<PolicyRule | null> {
    // Verify tenant owns the parent policy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ruleRow = await (this.db.selectFrom("control.policy_rule as pr") as any)
      .innerJoin("control.policy_definition as pd", "pd.id", "pr.policy_id")
      .select(["pr.id", "pd.tenant_id"])
      .where("pr.id", "=", ruleId)
      .where((eb: any) => eb.or([
        eb("pd.tenant_id", "=", tenantId),
        eb("pd.tenant_id", "is", null),
      ]))
      .executeTakeFirst();

    if (!ruleRow) return null;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: params.updatedBy,
    };
    if (params.priority    !== undefined) updates.priority    = params.priority;
    if (params.conditions  !== undefined) updates.conditions  = params.conditions != null ? JSON.stringify(params.conditions) : null;
    if (params.action      !== undefined) updates.action      = params.action;
    if (params.score       !== undefined) updates.score       = params.score;
    if (params.confidence  !== undefined) updates.confidence  = params.confidence;
    if (params.explanation !== undefined) updates.explanation = params.explanation;
    if (params.approvers   !== undefined) updates.approvers   = params.approvers != null ? JSON.stringify(params.approvers) : null;
    if (params.slaHours    !== undefined) updates.sla_hours   = params.slaHours;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (this.db.updateTable("control.policy_rule") as any)
      .set(updates)
      .where("id", "=", ruleId)
      .returningAll()
      .executeTakeFirst();

    return row ? this.mapRule(row) : null;
  }

  async deleteRule(ruleId: string, tenantId: string): Promise<boolean> {
    // Verify tenant owns the parent policy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ruleRow = await (this.db.selectFrom("control.policy_rule as pr") as any)
      .innerJoin("control.policy_definition as pd", "pd.id", "pr.policy_id")
      .select(["pr.id"])
      .where("pr.id", "=", ruleId)
      .where((eb: any) => eb.or([
        eb("pd.tenant_id", "=", tenantId),
        eb("pd.tenant_id", "is", null),
      ]))
      .executeTakeFirst();

    if (!ruleRow) return false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.db.deleteFrom("control.policy_rule") as any)
      .where("id", "=", ruleId)
      .execute();

    return true;
  }

  // ── Evaluation Log ─────────────────────────────────────────────────────────

  async queryLog(opts: {
    tenantId: string;
    txnId?: string;
    pipelineId?: string;
    action?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = this.db
      .selectFrom("audit.audit_log as al" as never)
      .selectAll("al" as never)
      .where("al.tenant_id" as never, "=", opts.tenantId as never)
      .where("al.event_code" as never, "=", "policy.evaluated" as never)
      .orderBy("al.occurred_at" as never, "desc");

    if (opts.txnId)      q = q.where("al.correlation_id" as never, "=", opts.txnId as never);
    if (opts.pipelineId) q = q.where(sql`al.context->>'pipeline_id'` as never, "=" as never, opts.pipelineId as never);
    if (opts.action)     q = q.where(sql`al.context->>'policy_action'` as never, "=" as never, opts.action as never);

    q = q.limit(opts.limit ?? 50).offset(opts.offset ?? 0);

    return q.execute();
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private mapDefinition(row: any): PolicyDefinition { // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      id:             row.id,
      tenantId:       row.tenant_id,
      moduleId:       row.module_id,
      entityType:     row.entity_type,
      name:           row.name,
      description:    row.description,
      priority:       row.priority,
      evaluationMode: row.evaluation_mode,
      effectiveFrom:  row.effective_from,
      effectiveUntil: row.effective_until,
      versionNo:      row.version_no,
      status:         row.status,
      isActive:       row.is_active,
      createdAt:      row.created_at,
      createdBy:      row.created_by,
      updatedAt:      row.updated_at,
      updatedBy:      row.updated_by,
    };
  }

  private mapRule(row: any): PolicyRule { // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      id:          row.id,
      policyId:    row.policy_id,
      priority:    row.priority,
      conditions:  row.conditions,
      action:      row.action,
      score:       row.score != null ? Number(row.score) : null,
      confidence:  row.confidence != null ? Number(row.confidence) : null,
      explanation: row.explanation,
      approvers:   row.approvers,
      slaHours:    row.sla_hours,
      createdAt:   row.created_at,
      createdBy:   row.created_by,
      updatedAt:   row.updated_at,
      updatedBy:   row.updated_by,
    };
  }
}
