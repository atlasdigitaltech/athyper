/**
 * WorkflowAuditRepository — Kysely-backed implementation of IAuditRepository
 *
 * Replaces InMemoryAuditRepository with durable PostgreSQL storage.
 * Follows the NotificationDeliveryRepo pattern for Kysely usage.
 */

import { getDefaultSeverity } from "../domain/event-taxonomy.js";

import type {
  AuditEvent,
  AuditEventQueryOptions,
  AuditEventSeverity,
  AuditEventType,
  IAuditRepository,
  InstanceAuditTrail,
  ReportOptions,
  StepAuditSummary,
} from "../../workflow-engine/audit/types.js";
import type { ApprovalActionType } from "../../workflow-engine/types.js";
import type { AuditColumnEncryptionService } from "../domain/column-encryption.service.js";
import type { AuditHashChainService } from "../domain/hash-chain.service.js";
import type {
  AuditRedactionPipeline,
  RedactionResult,
} from "../domain/redaction-pipeline.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Trace context resolver (optional — no hard dep on telemetry adapter)
// ============================================================================

export type TraceContextResolver = () => { traceId: string } | undefined;

// ============================================================================
// Constants
// ============================================================================

const TABLE = "audit.workflow_event_log" as keyof DB & string;
const CURRENT_SCHEMA_VERSION = 1;

// ============================================================================
// Repository
// ============================================================================

export class WorkflowAuditRepository implements IAuditRepository {
  private encryption?: AuditColumnEncryptionService;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly hashChain?: AuditHashChainService,
    private readonly redaction?: AuditRedactionPipeline,
    private readonly traceContextResolver?: TraceContextResolver,
  ) {}

  /**
   * Enable column-level encryption for sensitive fields.
   * Called after construction when encryption is enabled via feature flags.
   */
  setEncryption(encryption: AuditColumnEncryptionService): void {
    this.encryption = encryption;
  }

  // --------------------------------------------------------------------------
  // Write
  // --------------------------------------------------------------------------

  async recordEvent(
    tenantId: string,
    event: Omit<AuditEvent, "id">,
  ): Promise<AuditEvent> {
    const id = crypto.randomUUID();

    // Run redaction pipeline if available
    let processedEvent = event;
    let isRedacted = false;
    let redactionVersion: number | undefined;

    if (this.redaction) {
      const result: RedactionResult = this.redaction.redact(event);
      processedEvent = result.event;
      isRedacted = result.wasRedacted;
      redactionVersion = result.redactionVersion;
    }

    // Compute hash chain if available
    let hashPrev: string | undefined;
    let hashCurr: string | undefined;

    if (this.hashChain) {
      const hash = await this.hashChain.computeHash(tenantId, processedEvent);
      hashPrev = hash.hash_prev;
      hashCurr = hash.hash_curr;
    }

    // Extract denormalized columns
    const actorUserId = processedEvent.actor?.userId ?? null;
    const actorIsAdmin = processedEvent.actor?.isAdmin ?? false;
    const templateCode = processedEvent.workflow?.templateCode ?? null;
    const templateVersion = processedEvent.workflow?.templateVersion ?? null;

    const now = new Date();

    // Encrypt sensitive columns if encryption is enabled
    let ipAddress: string | null = processedEvent.ipAddress ?? null;
    let userAgent: string | null = processedEvent.userAgent ?? null;
    let comment: string | null = processedEvent.comment ?? null;
    let attachmentsStr: string | null = processedEvent.attachments
      ? JSON.stringify(processedEvent.attachments)
      : null;
    let keyVersion: number | null = null;

    if (this.encryption) {
      const encrypted = await this.encryption.encryptColumns(tenantId, {
        ip_address: ipAddress,
        user_agent: userAgent,
        comment,
        attachments: attachmentsStr,
      });
      ipAddress = encrypted.ip_address;
      userAgent = encrypted.user_agent;
      comment = encrypted.comment;
      attachmentsStr = encrypted.attachments;
      keyVersion = encrypted.key_version;
    }

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: tenantId,
        event_type: processedEvent.eventType,
        severity:
          processedEvent.severity ??
          getDefaultSeverity(processedEvent.eventType),
        schema_version: CURRENT_SCHEMA_VERSION,
        instance_id: processedEvent.instanceId,
        step_instance_id: processedEvent.stepInstanceId ?? null,
        entity_type: processedEvent.entity?.type ?? "unknown",
        entity_id: processedEvent.entity?.id ?? "unknown",
        entity: JSON.stringify(processedEvent.entity),
        workflow: JSON.stringify(processedEvent.workflow),
        workflow_template_code: templateCode,
        workflow_template_version: templateVersion,
        actor: JSON.stringify(processedEvent.actor),
        actor_user_id: actorUserId,
        actor_is_admin: actorIsAdmin,
        module_code: "WF",
        action: processedEvent.action ?? null,
        previous_state: processedEvent.previousState
          ? JSON.stringify(processedEvent.previousState)
          : null,
        new_state: processedEvent.newState
          ? JSON.stringify(processedEvent.newState)
          : null,
        comment,
        attachments: attachmentsStr,
        details: processedEvent.details
          ? JSON.stringify(processedEvent.details)
          : null,
        ip_address: ipAddress,
        user_agent: userAgent,
        correlation_id: processedEvent.correlationId ?? null,
        session_id: processedEvent.sessionId ?? null,
        trace_id: processedEvent.correlationId
          ? null // already correlated via correlation_id
          : (this.traceContextResolver?.()?.traceId ?? null),
        hash_prev: hashPrev ?? null,
        hash_curr: hashCurr ?? null,
        is_redacted: isRedacted,
        redaction_version: redactionVersion ?? null,
        key_version: keyVersion,
        event_timestamp: processedEvent.timestamp ?? now,
        created_at: now,
      })
      .execute();

    return { ...processedEvent, id } as AuditEvent;
  }

  // --------------------------------------------------------------------------
  // Read — getEventById (single event lookup with tenant isolation)
  // --------------------------------------------------------------------------

  async getEventById(
    tenantId: string,
    eventId: string,
  ): Promise<AuditEvent | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", eventId)
      .executeTakeFirst();

    if (!row) return undefined;

    if (this.encryption) {
      return this.mapRowDecrypted(row as any, tenantId);
    }
    return this.mapRow(row as any);
  }

  // --------------------------------------------------------------------------
  // Read — getEvents with full filter support
  // --------------------------------------------------------------------------

  async getEvents(
    tenantId: string,
    options?: AuditEventQueryOptions,
  ): Promise<AuditEvent[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (options?.instanceId) {
      query = query.where("instance_id", "=", options.instanceId);
    }
    if (options?.stepInstanceId) {
      query = query.where("step_instance_id", "=", options.stepInstanceId);
    }
    if (options?.entityType) {
      query = query.where("entity_type", "=", options.entityType);
    }
    if (options?.entityId) {
      query = query.where("entity_id", "=", options.entityId);
    }
    if (options?.templateCode) {
      query = query.where("workflow_template_code", "=", options.templateCode);
    }
    if (options?.eventTypes && options.eventTypes.length > 0) {
      query = query.where("event_type", "in", options.eventTypes);
    }
    if (options?.severity && options.severity.length > 0) {
      query = query.where("severity", "in", options.severity);
    }
    if (options?.actorUserId) {
      query = query.where("actor_user_id", "=", options.actorUserId);
    }
    if (options?.adminActionsOnly) {
      query = query.where("actor_is_admin", "=", true);
    }
    if (options?.startDate) {
      query = query.where("event_timestamp", ">=", options.startDate);
    }
    if (options?.endDate) {
      query = query.where("event_timestamp", "<=", options.endDate);
    }

    // Sort
    const sortDir = options?.sortDirection === "asc" ? "asc" : "desc";
    switch (options?.sortBy) {
      case "eventType":
        query = query.orderBy("event_type", sortDir);
        break;
      case "severity":
        query = query.orderBy("severity", sortDir);
        break;
      default:
        query = query.orderBy("event_timestamp", sortDir);
    }

    // Pagination
    const limit = options?.limit ?? 1000;
    const offset = options?.offset ?? 0;
    query = query.limit(limit).offset(offset);

    const rows = await query.execute();

    // Use decryption-aware mapping when encryption is enabled
    if (this.encryption) {
      return Promise.all(
        rows.map((r: any) => this.mapRowDecrypted(r, tenantId)),
      );
    }
    return rows.map((r: any) => this.mapRow(r));
  }

  // --------------------------------------------------------------------------
  // Read — Instance audit trail (ported from InMemoryAuditRepository)
  // --------------------------------------------------------------------------

  async getInstanceAuditTrail(
    tenantId: string,
    instanceId: string,
  ): Promise<InstanceAuditTrail> {
    const events = await this.getEvents(tenantId, {
      instanceId,
      sortBy: "timestamp",
      sortDirection: "asc",
    });

    if (events.length === 0) {
      throw new Error(`No audit events found for instance: ${instanceId}`);
    }

    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    // Group events by step
    const stepEvents = new Map<string, AuditEvent[]>();
    for (const event of events) {
      if (event.stepInstanceId) {
        if (!stepEvents.has(event.stepInstanceId)) {
          stepEvents.set(event.stepInstanceId, []);
        }
        stepEvents.get(event.stepInstanceId)!.push(event);
      }
    }

    // Build step summaries
    const steps: StepAuditSummary[] = [];
    for (const [stepId, stepEvts] of stepEvents) {
      const activatedEvent = stepEvts.find(
        (e) => e.eventType === "step.activated",
      );
      const completedEvent = stepEvts.find(
        (e) => e.eventType === "step.completed",
      );
      const skippedEvent = stepEvts.find((e) => e.eventType === "step.skipped");

      const approverActions = stepEvts
        .filter((e) => e.eventType.startsWith("action."))
        .map((e) => ({
          userId: e.actor.userId,
          displayName: e.actor.displayName,
          action: e.action as ApprovalActionType | undefined,
          actionTimestamp: e.timestamp,
          comment: e.comment,
          delegatedTo: e.details?.delegatedTo as string | undefined,
          responseTimeMs: activatedEvent
            ? e.timestamp.getTime() - activatedEvent.timestamp.getTime()
            : undefined,
        }));

      steps.push({
        stepInstanceId: stepId,
        stepName: (activatedEvent?.details?.stepName as string) || stepId,
        stepLevel: (activatedEvent?.details?.stepLevel as number) || 0,
        status: completedEvent
          ? (completedEvent.newState?.stepStatus as string) || "completed"
          : skippedEvent
            ? "skipped"
            : "pending",
        activatedAt: activatedEvent?.timestamp,
        completedAt: completedEvent?.timestamp || skippedEvent?.timestamp,
        durationMs:
          activatedEvent && (completedEvent || skippedEvent)
            ? (completedEvent?.timestamp ||
                skippedEvent?.timestamp)!.getTime() -
              activatedEvent.timestamp.getTime()
            : undefined,
        approverActions,
        escalationCount: stepEvts.filter(
          (e) => e.eventType === "step.escalated",
        ).length,
        slaStatus: stepEvts.some((e) => e.eventType === "sla.breach")
          ? "breached"
          : stepEvts.some((e) => e.eventType === "sla.warning")
            ? "warning"
            : "on_track",
        autoApproved: stepEvts.some(
          (e) => e.eventType === "step.auto_approved",
        ),
        skipped: !!skippedEvent,
        skipReason: skippedEvent?.details?.reason as string | undefined,
      });
    }

    // Calculate statistics
    const statistics = {
      totalSteps: steps.length,
      completedSteps: steps.filter(
        (s) => s.status === "completed" || s.status === "approved",
      ).length,
      skippedSteps: steps.filter((s) => s.skipped).length,
      totalApprovers: steps.reduce(
        (sum, s) => sum + s.approverActions.length,
        0,
      ),
      approvedCount: events.filter((e) => e.eventType === "action.approve")
        .length,
      rejectedCount: events.filter((e) => e.eventType === "action.reject")
        .length,
      delegatedCount: events.filter((e) => e.eventType === "action.delegate")
        .length,
      escalationCount: events.filter((e) => e.eventType === "step.escalated")
        .length,
      slaBreachCount: events.filter((e) => e.eventType === "sla.breach").length,
    };

    // Find final decision
    const finalDecisionEvent = events.find(
      (e) =>
        e.eventType === "workflow.approved" ||
        e.eventType === "workflow.rejected" ||
        e.eventType === "workflow.cancelled",
    );

    return {
      instanceId,
      entity: firstEvent.entity,
      workflow: firstEvent.workflow,
      requester: firstEvent.actor,
      currentStatus:
        (lastEvent.newState?.instanceStatus as any) || "in_progress",
      currentEntityState:
        (lastEvent.newState?.entityState as any) || "pending_approval",
      createdAt: firstEvent.timestamp,
      completedAt: finalDecisionEvent?.timestamp,
      totalDurationMs: finalDecisionEvent
        ? finalDecisionEvent.timestamp.getTime() -
          firstEvent.timestamp.getTime()
        : undefined,
      finalDecision: finalDecisionEvent
        ? {
            outcome: finalDecisionEvent.eventType.replace("workflow.", ""),
            decidedBy: finalDecisionEvent.actor.userId,
            decidedAt: finalDecisionEvent.timestamp,
            reason: finalDecisionEvent.comment,
          }
        : undefined,
      steps,
      events,
      statistics,
    };
  }

  // --------------------------------------------------------------------------
  // Read — Step audit summary (ported from InMemoryAuditRepository)
  // --------------------------------------------------------------------------

  async getStepAuditSummary(
    tenantId: string,
    stepInstanceId: string,
  ): Promise<StepAuditSummary> {
    const events = await this.getEvents(tenantId, {
      stepInstanceId,
      sortBy: "timestamp",
      sortDirection: "asc",
    });

    if (events.length === 0) {
      throw new Error(`No audit events found for step: ${stepInstanceId}`);
    }

    const activatedEvent = events.find((e) => e.eventType === "step.activated");
    const completedEvent = events.find((e) => e.eventType === "step.completed");
    const skippedEvent = events.find((e) => e.eventType === "step.skipped");

    const approverActions = events
      .filter((e) => e.eventType.startsWith("action."))
      .map((e) => ({
        userId: e.actor.userId,
        displayName: e.actor.displayName,
        action: e.action as ApprovalActionType | undefined,
        actionTimestamp: e.timestamp,
        comment: e.comment,
        delegatedTo: e.details?.delegatedTo as string | undefined,
        responseTimeMs: activatedEvent
          ? e.timestamp.getTime() - activatedEvent.timestamp.getTime()
          : undefined,
      }));

    return {
      stepInstanceId,
      stepName: (activatedEvent?.details?.stepName as string) || stepInstanceId,
      stepLevel: (activatedEvent?.details?.stepLevel as number) || 0,
      status: completedEvent
        ? (completedEvent.newState?.stepStatus as string) || "completed"
        : skippedEvent
          ? "skipped"
          : "pending",
      activatedAt: activatedEvent?.timestamp,
      completedAt: completedEvent?.timestamp || skippedEvent?.timestamp,
      durationMs:
        activatedEvent && (completedEvent || skippedEvent)
          ? (completedEvent?.timestamp || skippedEvent?.timestamp)!.getTime() -
            activatedEvent.timestamp.getTime()
          : undefined,
      approverActions,
      escalationCount: events.filter((e) => e.eventType === "step.escalated")
        .length,
      slaStatus: events.some((e) => e.eventType === "sla.breach")
        ? "breached"
        : events.some((e) => e.eventType === "sla.warning")
          ? "warning"
          : "on_track",
      autoApproved: events.some((e) => e.eventType === "step.auto_approved"),
      skipped: !!skippedEvent,
      skipReason: skippedEvent?.details?.reason as string | undefined,
    };
  }

  // --------------------------------------------------------------------------
  // Read — Count
  // --------------------------------------------------------------------------

  async countEvents(
    tenantId: string,
    options?: AuditEventQueryOptions,
  ): Promise<number> {
    let query = this.db
      .selectFrom(TABLE as any)
      .select(this.db.fn.countAll().as("count"))
      .where("tenant_id", "=", tenantId);

    if (options?.instanceId)
      query = query.where("instance_id", "=", options.instanceId);
    if (options?.stepInstanceId)
      query = query.where("step_instance_id", "=", options.stepInstanceId);
    if (options?.entityType)
      query = query.where("entity_type", "=", options.entityType);
    if (options?.entityId)
      query = query.where("entity_id", "=", options.entityId);
    if (options?.templateCode)
      query = query.where("workflow_template_code", "=", options.templateCode);
    if (options?.eventTypes && options.eventTypes.length > 0)
      query = query.where("event_type", "in", options.eventTypes);
    if (options?.severity && options.severity.length > 0)
      query = query.where("severity", "in", options.severity);
    if (options?.actorUserId)
      query = query.where("actor_user_id", "=", options.actorUserId);
    if (options?.adminActionsOnly)
      query = query.where("actor_is_admin", "=", true);
    if (options?.startDate)
      query = query.where("event_timestamp", ">=", options.startDate);
    if (options?.endDate)
      query = query.where("event_timestamp", "<=", options.endDate);

    const result = (await query.executeTakeFirst()) as
      | { count: string | number }
      | undefined;
    return Number(result?.count ?? 0);
  }

  // --------------------------------------------------------------------------
  // Read — Correlation
  // --------------------------------------------------------------------------

  async getEventsByCorrelationId(
    tenantId: string,
    correlationId: string,
  ): Promise<AuditEvent[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("correlation_id", "=", correlationId)
      .orderBy("event_timestamp", "asc")
      .execute();

    if (this.encryption) {
      return Promise.all(
        rows.map((r: any) => this.mapRowDecrypted(r, tenantId)),
      );
    }
    return rows.map((r: any) => this.mapRow(r));
  }

  // --------------------------------------------------------------------------
  // Aggregation — for compliance reporting
  // --------------------------------------------------------------------------

  async aggregateForReport(
    tenantId: string,
    reportType: string,
    options: ReportOptions,
  ): Promise<Record<string, unknown>> {
    const events = await this.getEvents(tenantId, {
      startDate: options.period.startDate,
      endDate: options.period.endDate,
    });

    return {
      totalEvents: events.length,
      eventTypes: events.reduce(
        (acc, e) => {
          acc[e.eventType] = (acc[e.eventType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  // --------------------------------------------------------------------------
  // Row mapping
  // --------------------------------------------------------------------------

  private mapRow(row: any): AuditEvent {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      eventType: row.event_type as AuditEventType,
      severity: row.severity as AuditEventSeverity,
      instanceId: row.instance_id,
      stepInstanceId: row.step_instance_id ?? undefined,
      entity: this.parseJson(row.entity) ?? { type: "unknown", id: "unknown" },
      workflow: this.parseJson(row.workflow) ?? {
        templateId: "unknown",
        templateCode: "unknown",
        templateVersion: 0,
        templateName: "Unknown",
      },
      actor: this.parseJson(row.actor) ?? { userId: "unknown" },
      action: row.action ?? undefined,
      previousState: this.parseJson(row.previous_state) ?? undefined,
      newState: this.parseJson(row.new_state) ?? undefined,
      comment: row.comment ?? undefined,
      attachments: this.parseJson(row.attachments) ?? undefined,
      details: this.parseJson(row.details) ?? undefined,
      timestamp:
        row.event_timestamp instanceof Date
          ? row.event_timestamp
          : new Date(row.event_timestamp),
      ipAddress: row.ip_address ?? undefined,
      userAgent: row.user_agent ?? undefined,
      correlationId: row.correlation_id ?? undefined,
      sessionId: row.session_id ?? undefined,
    };
  }

  /**
   * Map a row with decryption of encrypted columns.
   * Used when encryption is enabled to transparently decrypt on read.
   */
  private async mapRowDecrypted(
    row: any,
    tenantId: string,
  ): Promise<AuditEvent> {
    // Only decrypt if row has a key_version (was encrypted)
    if (this.encryption && row.key_version != null) {
      const decrypted = await this.encryption.decryptColumns(tenantId, {
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        comment: row.comment,
        attachments: row.attachments,
      });

      return {
        ...this.mapRow({
          ...row,
          ip_address: decrypted.ip_address,
          user_agent: decrypted.user_agent,
          comment: decrypted.comment,
          attachments: decrypted.attachments,
        }),
      };
    }

    return this.mapRow(row);
  }

  private parseJson<T>(value: unknown): T | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "object") return value as T;
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createWorkflowAuditRepository(
  db: Kysely<DB>,
  hashChain?: AuditHashChainService,
  redaction?: AuditRedactionPipeline,
  traceContextResolver?: TraceContextResolver,
  encryption?: AuditColumnEncryptionService,
): WorkflowAuditRepository {
  const repo = new WorkflowAuditRepository(
    db,
    hashChain,
    redaction,
    traceContextResolver,
  );
  if (encryption) {
    repo.setEncryption(encryption);
  }
  return repo;
}
