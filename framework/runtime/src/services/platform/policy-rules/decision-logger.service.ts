/**
 * Decision Logger Service
 *
 * A5: Decision Logging + Audit
 * Logs authorization decisions for compliance and debugging
 *
 * Features:
 * - Writes to audit.permission_decision_log table
 * - Optionally writes to audit.audit_log for compliance
 * - Supports batch logging for performance
 * - Includes correlation IDs for request tracing
 */

import type {
  AuthorizationDecision,
  AuthorizationRequest,
  SubjectSnapshot,
} from "./types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Decision log entry
 */
export type DecisionLogEntry = {
  id: string;
  tenantId: string;
  occurredAt: Date;
  actorPrincipalId: string | null;
  subjectSnapshot: SubjectSnapshot | null;
  entityName: string | null;
  entityId: string | null;
  entityVersionId: string | null;
  operationCode: string;
  effect: string;
  matchedRuleId: string | null;
  matchedPolicyVersionId: string | null;
  reason: string | null;
  correlationId: string | null;
};

/**
 * Logger configuration
 */
export type DecisionLoggerConfig = {
  /** Enable decision logging (default: true) */
  enabled: boolean;

  /** Enable audit logging for compliance (default: false) */
  auditEnabled: boolean;

  /** Batch size for flushing logs (default: 100) */
  batchSize: number;

  /** Flush interval in milliseconds (default: 5000) */
  flushIntervalMs: number;

  /** Log denied decisions only (default: false) */
  denyOnly: boolean;

  /** Include subject snapshot in logs (default: true) */
  includeSubjectSnapshot: boolean;
};

const DEFAULT_CONFIG: DecisionLoggerConfig = {
  enabled: true,
  auditEnabled: false,
  batchSize: 100,
  flushIntervalMs: 5000,
  denyOnly: false,
  includeSubjectSnapshot: true,
};

/**
 * Decision Logger Service
 */
export class DecisionLoggerService {
  private config: DecisionLoggerConfig;
  private buffer: Array<{
    request: AuthorizationRequest;
    decision: AuthorizationDecision;
    subject: SubjectSnapshot | null;
  }> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: Kysely<DB>,
    config?: Partial<DecisionLoggerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start flush timer if batching
    if (this.config.enabled && this.config.batchSize > 1) {
      this.startFlushTimer();
    }
  }

  /**
   * Log a decision
   */
  async log(
    request: AuthorizationRequest,
    decision: AuthorizationDecision,
    subject: SubjectSnapshot | null,
  ): Promise<void> {
    if (!this.config.enabled) return;

    // Skip allowed decisions if denyOnly is set
    if (this.config.denyOnly && decision.effect === "allow") return;

    // Add to buffer
    this.buffer.push({ request, decision, subject });

    // Flush if buffer is full
    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Log decision immediately (bypass batching)
   */
  async logImmediate(
    request: AuthorizationRequest,
    decision: AuthorizationDecision,
    subject: SubjectSnapshot | null,
  ): Promise<void> {
    if (!this.config.enabled) return;

    // Skip allowed decisions if denyOnly is set
    if (this.config.denyOnly && decision.effect === "allow") return;

    await this.writeDecisionLog(request, decision, subject);

    if (this.config.auditEnabled) {
      await this.writeAuditLog(request, decision);
    }
  }

  /**
   * Flush buffered logs
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      // Batch insert decision logs
      const decisionLogs = entries.map(({ request, decision, subject }) =>
        this.buildDecisionLogEntry(request, decision, subject),
      );

      await this.db
        .insertInto("audit.permission_decision_log")
        .values(decisionLogs)
        .execute();

      // Batch insert audit logs if enabled
      if (this.config.auditEnabled) {
        const auditLogs = entries.map(({ request, decision }) =>
          this.buildAuditLogEntry(request, decision),
        );

        await this.db.insertInto("audit.audit_log").values(auditLogs).execute();
      }

      console.log(
        JSON.stringify({
          msg: "decision_logs_flushed",
          count: entries.length,
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "decision_log_flush_error",
          error: String(error),
          count: entries.length,
        }),
      );

      // Put entries back in buffer for retry
      this.buffer.unshift(...entries);
    }
  }

  /**
   * Write a single decision log
   */
  private async writeDecisionLog(
    request: AuthorizationRequest,
    decision: AuthorizationDecision,
    subject: SubjectSnapshot | null,
  ): Promise<void> {
    const entry = this.buildDecisionLogEntry(request, decision, subject);

    await this.db
      .insertInto("audit.permission_decision_log")
      .values(entry)
      .execute();
  }

  /**
   * Write a single audit log
   */
  private async writeAuditLog(
    request: AuthorizationRequest,
    decision: AuthorizationDecision,
  ): Promise<void> {
    const entry = this.buildAuditLogEntry(request, decision);

    await this.db.insertInto("audit.audit_log").values(entry).execute();
  }

  /**
   * Build decision log entry
   */
  private buildDecisionLogEntry(
    request: AuthorizationRequest,
    decision: AuthorizationDecision,
    subject: SubjectSnapshot | null,
  ): {
    id: string;
    tenant_id: string;
    actor_principal_id: string | null;
    subject_snapshot: unknown | null;
    entity_name: string | null;
    entity_id: string | null;
    entity_version_id: string | null;
    operation_code: string;
    effect: string;
    matched_rule_id: string | null;
    matched_policy_version_id: string | null;
    reason: string | null;
    correlation_id: string | null;
  } {
    return {
      id: crypto.randomUUID(),
      tenant_id: request.tenantId,
      actor_principal_id: request.principalId,
      subject_snapshot:
        this.config.includeSubjectSnapshot && subject
          ? JSON.stringify(subject)
          : null,
      entity_name: request.resource.entityCode,
      entity_id: request.resource.recordId ?? null,
      entity_version_id: request.resource.entityVersionId ?? null,
      operation_code: request.operationCode,
      effect: decision.effect,
      matched_rule_id: decision.matchedRuleId ?? null,
      matched_policy_version_id: decision.matchedPolicyVersionId ?? null,
      reason: decision.reason,
      correlation_id: (request.context?.correlationId as string) ?? null,
    };
  }

  /**
   * Build audit log entry
   */
  private buildAuditLogEntry(
    request: AuthorizationRequest,
    decision: AuthorizationDecision,
  ): {
    id: string;
    tenant_id: string;
    actor_id: string | null;
    actor_type: string;
    action: string;
    entity_name: string | null;
    entity_id: string | null;
    entity_version_id: string | null;
    correlation_id: string | null;
    ip_address: string | null;
    user_agent: string | null;
    payload: unknown | null;
  } {
    return {
      id: crypto.randomUUID(),
      tenant_id: request.tenantId,
      actor_id: request.principalId,
      actor_type: "user",
      action: request.operationCode,
      entity_name: request.resource.entityCode ?? null,
      entity_id: request.resource.recordId ?? null,
      entity_version_id: request.resource.entityVersionId ?? null,
      correlation_id: (request.context?.correlationId as string) ?? null,
      ip_address: null,
      user_agent: null,
      payload: {
        effect: decision.effect,
        moduleCode: request.resource.moduleCode,
        matchedRuleId: decision.matchedRuleId,
        matchedPolicyVersionId: decision.matchedPolicyVersionId,
        evaluationTimeMs: decision.evaluationTimeMs,
        reason: decision.effect === "deny" ? decision.reason : undefined,
      },
    };
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        console.error(
          JSON.stringify({
            msg: "decision_log_timer_flush_error",
            error: String(error),
          }),
        );
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * Stop flush timer
   */
  stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Shutdown - flush remaining logs and stop timer
   */
  async shutdown(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
  }

  /**
   * Get recent decision logs for a principal
   */
  async getRecentLogs(
    tenantId: string,
    principalId: string,
    limit: number = 100,
  ): Promise<DecisionLogEntry[]> {
    const results = await this.db
      .selectFrom("audit.permission_decision_log")
      .select([
        "id",
        "tenant_id",
        "occurred_at",
        "actor_principal_id",
        "subject_snapshot",
        "entity_name",
        "entity_id",
        "entity_version_id",
        "operation_code",
        "effect",
        "matched_rule_id",
        "matched_policy_version_id",
        "reason",
        "correlation_id",
      ])
      .where("tenant_id", "=", tenantId)
      .where("actor_principal_id", "=", principalId)
      .orderBy("occurred_at", "desc")
      .limit(limit)
      .execute();

    return results.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      occurredAt: row.occurred_at,
      actorPrincipalId: row.actor_principal_id,
      subjectSnapshot: row.subject_snapshot as SubjectSnapshot | null,
      entityName: row.entity_name,
      entityId: row.entity_id,
      entityVersionId: row.entity_version_id,
      operationCode: row.operation_code,
      effect: row.effect,
      matchedRuleId: row.matched_rule_id,
      matchedPolicyVersionId: row.matched_policy_version_id,
      reason: row.reason,
      correlationId: row.correlation_id,
    }));
  }

  /**
   * Get decision logs by correlation ID
   */
  async getLogsByCorrelation(
    correlationId: string,
  ): Promise<DecisionLogEntry[]> {
    const results = await this.db
      .selectFrom("audit.permission_decision_log")
      .select([
        "id",
        "tenant_id",
        "occurred_at",
        "actor_principal_id",
        "subject_snapshot",
        "entity_name",
        "entity_id",
        "entity_version_id",
        "operation_code",
        "effect",
        "matched_rule_id",
        "matched_policy_version_id",
        "reason",
        "correlation_id",
      ])
      .where("correlation_id", "=", correlationId)
      .orderBy("occurred_at", "asc")
      .execute();

    return results.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      occurredAt: row.occurred_at,
      actorPrincipalId: row.actor_principal_id,
      subjectSnapshot: row.subject_snapshot as SubjectSnapshot | null,
      entityName: row.entity_name,
      entityId: row.entity_id,
      entityVersionId: row.entity_version_id,
      operationCode: row.operation_code,
      effect: row.effect,
      matchedRuleId: row.matched_rule_id,
      matchedPolicyVersionId: row.matched_policy_version_id,
      reason: row.reason,
      correlationId: row.correlation_id,
    }));
  }

  /**
   * Get decision statistics
   */
  async getStats(
    tenantId: string,
    since: Date,
  ): Promise<{
    total: number;
    allowed: number;
    denied: number;
    byOperation: Record<string, { allowed: number; denied: number }>;
  }> {
    // Get counts by operation and effect
    const results = await this.db
      .selectFrom("audit.permission_decision_log")
      .select(["operation_code", "effect"])
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("occurred_at", ">=", since)
      .groupBy(["operation_code", "effect"])
      .execute();

    const stats = {
      total: 0,
      allowed: 0,
      denied: 0,
      byOperation: {} as Record<string, { allowed: number; denied: number }>,
    };

    for (const row of results) {
      const count = Number(row.count);
      stats.total += count;

      if (row.effect === "allow") {
        stats.allowed += count;
      } else {
        stats.denied += count;
      }

      if (!stats.byOperation[row.operation_code]) {
        stats.byOperation[row.operation_code] = { allowed: 0, denied: 0 };
      }

      if (row.effect === "allow") {
        stats.byOperation[row.operation_code].allowed += count;
      } else {
        stats.byOperation[row.operation_code].denied += count;
      }
    }

    return stats;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DecisionLoggerConfig>): void {
    const _wasEnabled = this.config.enabled;
    const _wasBatching = this.config.batchSize > 1;

    this.config = { ...this.config, ...config };

    // Handle timer based on config changes
    const isBatching = this.config.batchSize > 1;

    if (this.config.enabled && isBatching && !this.flushTimer) {
      this.startFlushTimer();
    } else if ((!this.config.enabled || !isBatching) && this.flushTimer) {
      this.stopFlushTimer();
    }
  }
}
