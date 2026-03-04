/**
 * Audit Trail Service
 *
 * Records and queries approval workflow audit events.
 */

import type {
  AuditActor,
  AuditAttachment,
  AuditEvent,
  AuditEventQueryOptions,
  AuditEventSeverity,
  AuditEventType,
  IAuditRepository,
  IAuditTrailService,
  InstanceAuditTrail,
  SimpleAuditEventInput,
  StepAuditSummary,
} from "./types.js";
import type {
  ApprovalInstance,
  ApprovalStepInstance,
  IApprovalInstanceRepository,
} from "../instance/types.js";
import type { ApprovalActionType } from "../types.js";

/**
 * Generate unique ID
 */
function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Map event type to severity
 */
function getEventSeverity(eventType: AuditEventType): AuditEventSeverity {
  const severityMap: Record<string, AuditEventSeverity> = {
    // Info events
    "workflow.created": "info",
    "workflow.started": "info",
    "workflow.approved": "info",
    "workflow.rejected": "info",
    "step.activated": "info",
    "step.completed": "info",
    "action.approve": "info",
    "action.reject": "info",
    "action.comment": "info",

    // Warning events
    "workflow.cancelled": "warning",
    "workflow.withdrawn": "warning",
    "workflow.on_hold": "warning",
    "step.skipped": "warning",
    "step.escalated": "warning",
    "action.delegate": "warning",
    "action.escalate": "warning",
    "sla.warning": "warning",
    "admin.reassign": "warning",

    // Error events
    "workflow.expired": "error",
    "sla.breach": "error",
    "error.approver_missing": "error",
    "error.user_deactivated": "error",
    "error.role_mismatch": "error",

    // Critical events (admin overrides)
    "admin.force_approve": "critical",
    "admin.force_reject": "critical",
    "admin.cancel": "critical",
    "admin.restart": "critical",
    "admin.override": "critical",
  };

  return severityMap[eventType] || "info";
}

/**
 * In-memory audit repository implementation
 */
export class InMemoryAuditRepository implements IAuditRepository {
  private events: Map<string, AuditEvent[]> = new Map();

  async recordEvent(tenantId: string, event: Omit<AuditEvent, "id">): Promise<AuditEvent> {
    const fullEvent: AuditEvent = {
      ...event,
      id: generateId("aud"),
    };

    if (!this.events.has(tenantId)) {
      this.events.set(tenantId, []);
    }
    this.events.get(tenantId)!.push(fullEvent);

    return fullEvent;
  }

  async getEvents(tenantId: string, options?: AuditEventQueryOptions): Promise<AuditEvent[]> {
    let events = this.events.get(tenantId) || [];

    // Apply filters
    if (options?.instanceId) {
      events = events.filter((e) => e.instanceId === options.instanceId);
    }
    if (options?.stepInstanceId) {
      events = events.filter((e) => e.stepInstanceId === options.stepInstanceId);
    }
    if (options?.entityType) {
      events = events.filter((e) => e.entity.type === options.entityType);
    }
    if (options?.entityId) {
      events = events.filter((e) => e.entity.id === options.entityId);
    }
    if (options?.templateCode) {
      events = events.filter((e) => e.workflow.templateCode === options.templateCode);
    }
    if (options?.eventTypes && options.eventTypes.length > 0) {
      events = events.filter((e) => options.eventTypes!.includes(e.eventType));
    }
    if (options?.severity && options.severity.length > 0) {
      events = events.filter((e) => options.severity!.includes(e.severity));
    }
    if (options?.actorUserId) {
      events = events.filter((e) => e.actor.userId === options.actorUserId);
    }
    if (options?.adminActionsOnly) {
      events = events.filter((e) => e.actor.isAdmin);
    }
    if (options?.startDate) {
      events = events.filter((e) => e.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      events = events.filter((e) => e.timestamp <= options.endDate!);
    }

    // Sort
    const sortDir = options?.sortDirection === "asc" ? 1 : -1;
    events.sort((a, b) => {
      switch (options?.sortBy) {
        case "eventType":
          return a.eventType.localeCompare(b.eventType) * sortDir;
        case "severity": {
          const severityOrder = { info: 0, warning: 1, error: 2, critical: 3 };
          return (severityOrder[a.severity] - severityOrder[b.severity]) * sortDir;
        }
        default:
          return (a.timestamp.getTime() - b.timestamp.getTime()) * sortDir;
      }
    });

    // Pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || events.length;
    return events.slice(offset, offset + limit);
  }

  async getInstanceAuditTrail(tenantId: string, instanceId: string): Promise<InstanceAuditTrail> {
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
      const activatedEvent = stepEvts.find((e) => e.eventType === "step.activated");
      const completedEvent = stepEvts.find((e) => e.eventType === "step.completed");
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
            ? (completedEvent?.timestamp || skippedEvent?.timestamp)!.getTime() -
              activatedEvent.timestamp.getTime()
            : undefined,
        approverActions,
        escalationCount: stepEvts.filter((e) => e.eventType === "step.escalated").length,
        slaStatus: stepEvts.some((e) => e.eventType === "sla.breach")
          ? "breached"
          : stepEvts.some((e) => e.eventType === "sla.warning")
            ? "warning"
            : "on_track",
        autoApproved: stepEvts.some((e) => e.eventType === "step.auto_approved"),
        skipped: !!skippedEvent,
        skipReason: skippedEvent?.details?.reason as string | undefined,
      });
    }

    // Calculate statistics
    const statistics = {
      totalSteps: steps.length,
      completedSteps: steps.filter((s) => s.status === "completed" || s.status === "approved").length,
      skippedSteps: steps.filter((s) => s.skipped).length,
      totalApprovers: steps.reduce((sum, s) => sum + s.approverActions.length, 0),
      approvedCount: events.filter((e) => e.eventType === "action.approve").length,
      rejectedCount: events.filter((e) => e.eventType === "action.reject").length,
      delegatedCount: events.filter((e) => e.eventType === "action.delegate").length,
      escalationCount: events.filter((e) => e.eventType === "step.escalated").length,
      slaBreachCount: events.filter((e) => e.eventType === "sla.breach").length,
    };

    // Find final decision
    const finalDecisionEvent = events.find(
      (e) =>
        e.eventType === "workflow.approved" ||
        e.eventType === "workflow.rejected" ||
        e.eventType === "workflow.cancelled"
    );

    return {
      instanceId,
      entity: firstEvent.entity,
      workflow: firstEvent.workflow,
      requester: firstEvent.actor,
      currentStatus: (lastEvent.newState?.instanceStatus as any) || "in_progress",
      currentEntityState: (lastEvent.newState?.entityState as any) || "pending_approval",
      createdAt: firstEvent.timestamp,
      completedAt: finalDecisionEvent?.timestamp,
      totalDurationMs: finalDecisionEvent
        ? finalDecisionEvent.timestamp.getTime() - firstEvent.timestamp.getTime()
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

  async getStepAuditSummary(tenantId: string, stepInstanceId: string): Promise<StepAuditSummary> {
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
      escalationCount: events.filter((e) => e.eventType === "step.escalated").length,
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

  async countEvents(tenantId: string, options?: AuditEventQueryOptions): Promise<number> {
    const events = await this.getEvents(tenantId, { ...options, limit: undefined, offset: undefined });
    return events.length;
  }

  async getEventsByCorrelationId(tenantId: string, correlationId: string): Promise<AuditEvent[]> {
    const allEvents = this.events.get(tenantId) || [];
    return allEvents.filter((e) => e.correlationId === correlationId);
  }

  async aggregateForReport(
    tenantId: string,
    reportType: string,
    options: any
  ): Promise<Record<string, unknown>> {
    // Basic aggregation - real implementation would use database aggregation
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
        {} as Record<string, number>
      ),
    };
  }
}

/**
 * Audit Trail Service Implementation
 */
export class AuditTrailService implements IAuditTrailService {
  constructor(
    private readonly auditRepository: IAuditRepository,
    private readonly instanceRepository?: IApprovalInstanceRepository
  ) {}

  /**
   * Record an audit event (supports both full and simplified signatures)
   */
  async recordEvent(
    tenantId: string,
    eventTypeOrEvent: AuditEventType | SimpleAuditEventInput,
    instance?: ApprovalInstance,
    actor?: AuditActor,
    details?: {
      stepInstance?: ApprovalStepInstance;
      action?: ApprovalActionType | string;
      comment?: string;
      attachments?: AuditAttachment[];
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
      sessionId?: string;
    }
  ): Promise<AuditEvent> {
    // Check if using simplified signature (object as second arg)
    if (typeof eventTypeOrEvent === "object" && "instanceId" in eventTypeOrEvent) {
      const simpleEvent = eventTypeOrEvent as SimpleAuditEventInput;
      const event: Omit<AuditEvent, "id"> = {
        tenantId,
        eventType: simpleEvent.eventType as AuditEventType,
        severity: simpleEvent.severity || "info",
        instanceId: simpleEvent.instanceId,
        stepInstanceId: simpleEvent.stepInstanceId,
        // Placeholder entity/workflow for simplified events (admin/recovery actions)
        entity: {
          type: "unknown",
          id: simpleEvent.instanceId,
        },
        workflow: {
          templateId: "unknown",
          templateCode: "unknown",
          templateVersion: 0,
          templateName: "Unknown",
        },
        actor: {
          userId: simpleEvent.actor.id,
        },
        details: {
          description: simpleEvent.description,
          actorType: simpleEvent.actor.type,
          ...simpleEvent.metadata,
        },
        timestamp: simpleEvent.timestamp || new Date(),
      };
      return this.auditRepository.recordEvent(tenantId, event);
    }

    // Full signature
    const eventType = eventTypeOrEvent as AuditEventType;
    if (!instance || !actor) {
      throw new Error("instance and actor are required for full recordEvent signature");
    }

    const event: Omit<AuditEvent, "id"> = {
      tenantId,
      eventType,
      severity: getEventSeverity(eventType),
      instanceId: instance.id,
      stepInstanceId: details?.stepInstance?.id,
      entity: {
        type: instance.entity.type,
        id: instance.entity.id,
        referenceCode: instance.entity.referenceCode,
        displayName: instance.entity.displayName,
      },
      workflow: {
        templateId: instance.workflowSnapshot.templateId,
        templateCode: instance.workflowSnapshot.templateCode,
        templateVersion: instance.workflowSnapshot.templateVersion,
        templateName: instance.workflowSnapshot.templateName,
      },
      actor,
      action: details?.action,
      previousState: details?.previousState
        ? {
            instanceStatus: details.previousState.instanceStatus as any,
            stepStatus: details.previousState.stepStatus as string,
            entityState: details.previousState.entityState as any,
          }
        : undefined,
      newState: details?.newState
        ? {
            instanceStatus: details.newState.instanceStatus as any,
            stepStatus: details.newState.stepStatus as string,
            entityState: details.newState.entityState as any,
          }
        : undefined,
      comment: details?.comment,
      attachments: details?.attachments,
      details: {
        ...details?.metadata,
        stepName: details?.stepInstance?.name,
        stepLevel: details?.stepInstance?.level,
      },
      timestamp: new Date(),
      ipAddress: details?.ipAddress,
      userAgent: details?.userAgent,
      correlationId: details?.correlationId,
      sessionId: details?.sessionId,
    };

    return this.auditRepository.recordEvent(tenantId, event);
  }

  /**
   * Get audit trail for instance
   */
  async getAuditTrail(tenantId: string, instanceId: string): Promise<InstanceAuditTrail> {
    return this.auditRepository.getInstanceAuditTrail(tenantId, instanceId);
  }

  /**
   * Get audit events
   */
  async getEvents(tenantId: string, options?: AuditEventQueryOptions): Promise<AuditEvent[]> {
    return this.auditRepository.getEvents(tenantId, options);
  }

  /**
   * Get step history
   */
  async getStepHistory(tenantId: string, stepInstanceId: string): Promise<AuditEvent[]> {
    return this.auditRepository.getEvents(tenantId, {
      stepInstanceId,
      sortBy: "timestamp",
      sortDirection: "asc",
    });
  }

  /**
   * Export audit trail
   */
  async exportAuditTrail(
    tenantId: string,
    instanceId: string,
    format: "json" | "csv" | "pdf"
  ): Promise<{ content: string | Buffer; mimeType: string }> {
    const trail = await this.getAuditTrail(tenantId, instanceId);

    switch (format) {
      case "json":
        return {
          content: JSON.stringify(trail, null, 2),
          mimeType: "application/json",
        };

      case "csv": {
        const csvHeader =
          "Event ID,Timestamp,Event Type,Severity,Actor,Action,Comment,Step,Previous Status,New Status\n";
        const csvRows = trail.events
          .map(
            (e) =>
              `"${e.id}","${e.timestamp.toISOString()}","${e.eventType}","${e.severity}","${e.actor.displayName || e.actor.userId}","${e.action || ""}","${(e.comment || "").replace(/"/g, '""')}","${e.stepInstanceId || ""}","${e.previousState?.instanceStatus || ""}","${e.newState?.instanceStatus || ""}"`
          )
          .join("\n");
        return {
          content: csvHeader + csvRows,
          mimeType: "text/csv",
        };
      }

      case "pdf": {
        // In real implementation, would use a PDF library
        // For now, return a placeholder
        const pdfContent = `
APPROVAL AUDIT TRAIL
====================

Instance ID: ${trail.instanceId}
Entity: ${trail.entity.displayName || trail.entity.id} (${trail.entity.type})
Workflow: ${trail.workflow.templateName} v${trail.workflow.templateVersion}

Status: ${trail.currentStatus}
Created: ${trail.createdAt.toISOString()}
${trail.completedAt ? `Completed: ${trail.completedAt.toISOString()}` : ""}

STATISTICS
----------
Total Steps: ${trail.statistics.totalSteps}
Completed Steps: ${trail.statistics.completedSteps}
Skipped Steps: ${trail.statistics.skippedSteps}
Approvals: ${trail.statistics.approvedCount}
Rejections: ${trail.statistics.rejectedCount}
Escalations: ${trail.statistics.escalationCount}
SLA Breaches: ${trail.statistics.slaBreachCount}

EVENTS
------
${trail.events.map((e) => `[${e.timestamp.toISOString()}] ${e.eventType} by ${e.actor.displayName || e.actor.userId}${e.comment ? `: ${e.comment}` : ""}`).join("\n")}
        `;
        return {
          content: pdfContent,
          mimeType: "text/plain", // Would be application/pdf with real PDF
        };
      }

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
}

/**
 * Factory function to create audit trail service
 */
export function createAuditTrailService(
  auditRepository: IAuditRepository,
  instanceRepository?: IApprovalInstanceRepository
): IAuditTrailService {
  return new AuditTrailService(auditRepository, instanceRepository);
}

/**
 * Factory function to create in-memory audit repository
 */
export function createInMemoryAuditRepository(): IAuditRepository {
  return new InMemoryAuditRepository();
}
