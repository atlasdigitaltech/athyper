/**
 * Audit Explainability Service
 *
 * Provides three modes of explainability:
 * 1. explain() — resolve a correlation_id into a full event chain
 * 2. explainDecision() — reconstruct a permission decision path
 * 3. explainEntityHistory() — timeline of all decisions affecting an entity
 * 4. generateExplainabilityReport() — batch report with filtering
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface EventExplanation {
  correlationId: string;
  events: ExplainedEvent[];
  workflowInstance?: {
    instanceId: string;
    workflowName?: string;
    status?: string;
  };
  traceUrl?: string;
}

export interface ExplainedEvent {
  id: string;
  eventType: string;
  severity: string;
  actorUserId?: string;
  timestamp: Date;
  summary: string;
  traceId?: string;
}

export interface DecisionExplanation {
  decisionId: string;
  timestamp: Date;
  principalId: string;
  resourceType: string;
  resourceId: string;
  action: string;
  effect: string;
  /** The policy that produced this decision */
  policyMatch?: {
    policyId: string;
    policyName?: string;
    ruleId?: string;
    effect: string;
    priority?: number;
  };
  /** Conditions that were evaluated */
  conditionsEvaluated: ConditionTrace[];
  /** Subject snapshot at time of decision */
  subjectSnapshot?: Record<string, unknown>;
  /** Related audit log events */
  relatedEvents: ExplainedEvent[];
  traceUrl?: string;
}

export interface ConditionTrace {
  field: string;
  operator: string;
  expectedValue: unknown;
  actualValue: unknown;
  passed: boolean;
}

export interface EntityHistoryEntry {
  decisionId: string;
  timestamp: Date;
  principalId: string;
  action: string;
  effect: string;
  policyId?: string;
  summary: string;
}

export interface EntityHistory {
  entityType: string;
  entityId: string;
  entries: EntityHistoryEntry[];
  totalCount: number;
}

export interface ExplainabilityReportOptions {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  entityType?: string;
  effect?: string;
  limit?: number;
  offset?: number;
}

export interface ExplainabilityReport {
  tenantId: string;
  generatedAt: Date;
  options: ExplainabilityReportOptions;
  decisions: DecisionSummary[];
  totalCount: number;
  statistics: {
    totalDecisions: number;
    allowCount: number;
    denyCount: number;
    uniquePrincipals: number;
    uniqueResources: number;
    topPolicies: Array<{ policyId: string; count: number }>;
  };
}

export interface DecisionSummary {
  decisionId: string;
  timestamp: Date;
  principalId: string;
  resourceType: string;
  resourceId: string;
  action: string;
  effect: string;
  policyId?: string;
  policyName?: string;
}

export interface ExplainabilityConfig {
  traceBaseUrl?: string;
}

// ============================================================================
// Service
// ============================================================================

export class AuditExplainabilityService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly config: ExplainabilityConfig = {},
  ) {}

  /**
   * Explain an audit event chain by correlation_id.
   */
  async explain(tenantId: string, correlationId: string): Promise<EventExplanation> {
    const eventsResult = await sql<any>`
      SELECT id, event_type, severity, actor_user_id, event_timestamp,
             comment, instance_id, trace_id
      FROM core.workflow_event_log
      WHERE tenant_id = ${tenantId}::uuid
        AND correlation_id = ${correlationId}
      ORDER BY event_timestamp ASC
    `.execute(this.db);

    const events: ExplainedEvent[] = (eventsResult.rows ?? []).map((r: any) => ({
      id: r.id,
      eventType: r.event_type,
      severity: r.severity ?? "info",
      actorUserId: r.actor_user_id ?? undefined,
      timestamp: new Date(r.event_timestamp),
      summary: r.comment ?? r.event_type,
      traceId: r.trace_id ?? undefined,
    }));

    let workflowInstance: EventExplanation["workflowInstance"];
    if (events.length > 0) {
      const firstEvent = eventsResult.rows[0];
      if (firstEvent?.instance_id) {
        workflowInstance = await this.resolveWorkflowInstance(firstEvent.instance_id);
      }
    }

    let traceUrl: string | undefined;
    const traceId = events.find((e) => e.traceId)?.traceId;
    if (traceId && this.config.traceBaseUrl) {
      traceUrl = `${this.config.traceBaseUrl}/trace/${traceId}`;
    }

    return { correlationId, events, workflowInstance, traceUrl };
  }

  /**
   * Explain a specific permission decision by reconstructing the full
   * decision path from permission_decision_log + audit_log.
   */
  async explainDecision(tenantId: string, decisionId: string): Promise<DecisionExplanation | undefined> {
    // 1. Fetch the decision record
    const decisionResult = await sql<any>`
      SELECT id, principal_id, resource_type, resource_id, action,
             effect, policy_id, rule_id, conditions_evaluated,
             subject_snapshot, decided_at, correlation_id, trace_id
      FROM core.permission_decision_log
      WHERE tenant_id = ${tenantId}::uuid
        AND id = ${decisionId}::uuid
      LIMIT 1
    `.execute(this.db);

    const row = decisionResult.rows?.[0];
    if (!row) return undefined;

    // 2. Parse conditions evaluated (stored as JSONB)
    const conditionsEvaluated: ConditionTrace[] = Array.isArray(row.conditions_evaluated)
      ? (row.conditions_evaluated as any[]).map((c: any) => ({
          field: c.field ?? "",
          operator: c.operator ?? "",
          expectedValue: c.expected_value ?? c.expectedValue,
          actualValue: c.actual_value ?? c.actualValue,
          passed: Boolean(c.passed),
        }))
      : [];

    // 3. Resolve policy metadata if policy_id exists
    let policyMatch: DecisionExplanation["policyMatch"];
    if (row.policy_id) {
      policyMatch = await this.resolvePolicyMatch(tenantId, row.policy_id, row.rule_id, row.effect);
    }

    // 4. Fetch related audit events by correlation_id
    let relatedEvents: ExplainedEvent[] = [];
    if (row.correlation_id) {
      const explanation = await this.explain(tenantId, row.correlation_id);
      relatedEvents = explanation.events;
    }

    // 5. Build trace URL
    let traceUrl: string | undefined;
    if (row.trace_id && this.config.traceBaseUrl) {
      traceUrl = `${this.config.traceBaseUrl}/trace/${row.trace_id}`;
    }

    return {
      decisionId: row.id,
      timestamp: new Date(row.decided_at),
      principalId: row.principal_id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      action: row.action,
      effect: row.effect,
      policyMatch,
      conditionsEvaluated,
      subjectSnapshot: row.subject_snapshot ?? undefined,
      relatedEvents,
      traceUrl,
    };
  }

  /**
   * Build a timeline of all permission decisions affecting a specific entity.
   */
  async explainEntityHistory(
    tenantId: string,
    entityType: string,
    entityId: string,
    options: { startDate?: Date; endDate?: Date; limit?: number } = {},
  ): Promise<EntityHistory> {
    const { limit = 100 } = options;

    const conditions = [
      sql`tenant_id = ${tenantId}::uuid`,
      sql`resource_type = ${entityType}`,
      sql`resource_id = ${entityId}`,
    ];
    if (options.startDate) {
      conditions.push(sql`decided_at >= ${options.startDate.toISOString()}::timestamptz`);
    }
    if (options.endDate) {
      conditions.push(sql`decided_at <= ${options.endDate.toISOString()}::timestamptz`);
    }

    const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    // Count total
    const countResult = await sql<any>`
      SELECT COUNT(*) as total
      FROM core.permission_decision_log
      WHERE ${where}
    `.execute(this.db);
    const totalCount = Number(countResult.rows?.[0]?.total ?? 0);

    // Fetch entries
    const result = await sql<any>`
      SELECT id, decided_at, principal_id, action, effect, policy_id
      FROM core.permission_decision_log
      WHERE ${where}
      ORDER BY decided_at DESC
      LIMIT ${limit}
    `.execute(this.db);

    const entries: EntityHistoryEntry[] = (result.rows ?? []).map((r: any) => ({
      decisionId: r.id,
      timestamp: new Date(r.decided_at),
      principalId: r.principal_id,
      action: r.action,
      effect: r.effect,
      policyId: r.policy_id ?? undefined,
      summary: `${r.principal_id} ${r.action} → ${r.effect}`,
    }));

    return { entityType, entityId, entries, totalCount };
  }

  /**
   * Generate a batch explainability report with filtering.
   */
  async generateExplainabilityReport(
    tenantId: string,
    options: ExplainabilityReportOptions = {},
  ): Promise<ExplainabilityReport> {
    const { limit = 100, offset = 0 } = options;

    const conditions = [sql`tenant_id = ${tenantId}::uuid`];
    if (options.startDate) {
      conditions.push(sql`decided_at >= ${options.startDate.toISOString()}::timestamptz`);
    }
    if (options.endDate) {
      conditions.push(sql`decided_at <= ${options.endDate.toISOString()}::timestamptz`);
    }
    if (options.userId) {
      conditions.push(sql`principal_id = ${options.userId}`);
    }
    if (options.entityType) {
      conditions.push(sql`resource_type = ${options.entityType}`);
    }
    if (options.effect) {
      conditions.push(sql`effect = ${options.effect}`);
    }

    const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    // Fetch statistics
    const statsResult = await sql<any>`
      SELECT
        COUNT(*) as total_decisions,
        COUNT(*) FILTER (WHERE effect = 'allow') as allow_count,
        COUNT(*) FILTER (WHERE effect = 'deny') as deny_count,
        COUNT(DISTINCT principal_id) as unique_principals,
        COUNT(DISTINCT resource_type || ':' || resource_id) as unique_resources
      FROM core.permission_decision_log
      WHERE ${where}
    `.execute(this.db);

    const stats = statsResult.rows?.[0] ?? {};

    // Top policies
    const topPoliciesResult = await sql<any>`
      SELECT policy_id, COUNT(*) as count
      FROM core.permission_decision_log
      WHERE ${where} AND policy_id IS NOT NULL
      GROUP BY policy_id
      ORDER BY count DESC
      LIMIT 10
    `.execute(this.db);

    // Fetch paginated decisions
    const decisionsResult = await sql<any>`
      SELECT id, decided_at, principal_id, resource_type, resource_id,
             action, effect, policy_id
      FROM core.permission_decision_log
      WHERE ${where}
      ORDER BY decided_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(this.db);

    const decisions: DecisionSummary[] = (decisionsResult.rows ?? []).map((r: any) => ({
      decisionId: r.id,
      timestamp: new Date(r.decided_at),
      principalId: r.principal_id,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      action: r.action,
      effect: r.effect,
      policyId: r.policy_id ?? undefined,
    }));

    return {
      tenantId,
      generatedAt: new Date(),
      options,
      decisions,
      totalCount: Number(stats.total_decisions ?? 0),
      statistics: {
        totalDecisions: Number(stats.total_decisions ?? 0),
        allowCount: Number(stats.allow_count ?? 0),
        denyCount: Number(stats.deny_count ?? 0),
        uniquePrincipals: Number(stats.unique_principals ?? 0),
        uniqueResources: Number(stats.unique_resources ?? 0),
        topPolicies: (topPoliciesResult.rows ?? []).map((r: any) => ({
          policyId: r.policy_id,
          count: Number(r.count),
        })),
      },
    };
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private async resolveWorkflowInstance(
    instanceId: string,
  ): Promise<EventExplanation["workflowInstance"] | undefined> {
    try {
      const result = await sql<any>`
        SELECT id, status
        FROM core.approval_instance
        WHERE id = ${instanceId}::uuid
        LIMIT 1
      `.execute(this.db);

      const row = result.rows?.[0];
      if (!row) return undefined;

      return { instanceId: row.id, status: row.status };
    } catch {
      return undefined;
    }
  }

  private async resolvePolicyMatch(
    tenantId: string,
    policyId: string,
    ruleId?: string,
    effect?: string,
  ): Promise<DecisionExplanation["policyMatch"] | undefined> {
    try {
      const result = await sql<any>`
        SELECT id, name
        FROM core.policy
        WHERE tenant_id = ${tenantId}::uuid
          AND id = ${policyId}::uuid
        LIMIT 1
      `.execute(this.db);

      const row = result.rows?.[0];
      return {
        policyId,
        policyName: row?.name ?? undefined,
        ruleId: ruleId ?? undefined,
        effect: effect ?? "unknown",
      };
    } catch {
      return { policyId, effect: effect ?? "unknown" };
    }
  }
}
