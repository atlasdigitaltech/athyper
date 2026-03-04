/**
 * Approval Audit & Governance Types
 *
 * Types for audit trails, compliance reporting, and governance controls.
 */

import type {
  ApprovalInstance,
  ApprovalInstanceStatus,
  ApprovalStepInstance,
  EntityApprovalState,
} from "../instance/types.js";
import type { ApprovalActionType } from "../types.js";

// ============================================================================
// 8.1 Approval Audit Trail
// ============================================================================

/**
 * Audit event types
 */
export type AuditEventType =
  | "workflow.created"
  | "workflow.started"
  | "workflow.approved"
  | "workflow.rejected"
  | "workflow.cancelled"
  | "workflow.withdrawn"
  | "workflow.expired"
  | "workflow.on_hold"
  | "workflow.resumed"
  | "step.activated"
  | "step.completed"
  | "step.skipped"
  | "step.escalated"
  | "step.auto_approved"
  | "action.approve"
  | "action.reject"
  | "action.request_changes"
  | "action.delegate"
  | "action.escalate"
  | "action.reassign"
  | "action.comment"
  | "admin.force_approve"
  | "admin.force_reject"
  | "admin.reassign"
  | "admin.cancel"
  | "admin.restart"
  | "admin.override"
  | "sla.warning"
  | "sla.breach"
  | "sla.escalation"
  | "entity.locked"
  | "entity.unlocked"
  | "entity.state_changed"
  | "error.approver_missing"
  | "error.user_deactivated"
  | "error.role_mismatch"
  | "recovery.retry"
  | "recovery.pause"
  | "recovery.resume";

/**
 * Audit event severity
 */
export type AuditEventSeverity = "info" | "warning" | "error" | "critical";

/**
 * Audit attachment
 */
export interface AuditAttachment {
  /** Attachment ID */
  id: string;

  /** File name */
  fileName: string;

  /** File type/MIME */
  fileType: string;

  /** File size in bytes */
  fileSize: number;

  /** Storage URL/path */
  url: string;

  /** Checksum for integrity */
  checksum?: string;

  /** Upload timestamp */
  uploadedAt: Date;

  /** Uploaded by */
  uploadedBy: string;
}

/**
 * Actor information for audit
 */
export interface AuditActor {
  /** User ID */
  userId: string;

  /** Display name */
  displayName?: string;

  /** Email */
  email?: string;

  /** Roles at time of action */
  roles?: string[];

  /** Department */
  departmentId?: string;

  /** Whether this is a system action */
  isSystem?: boolean;

  /** Whether this is an admin action */
  isAdmin?: boolean;
}

/**
 * Audit event record
 */
export interface AuditEvent {
  /** Event ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Event type */
  eventType: AuditEventType;

  /** Event severity */
  severity: AuditEventSeverity;

  /** Approval instance ID */
  instanceId: string;

  /** Step instance ID (if applicable) */
  stepInstanceId?: string;

  /** Entity information */
  entity: {
    type: string;
    id: string;
    referenceCode?: string;
    displayName?: string;
  };

  /** Workflow information */
  workflow: {
    templateId: string;
    templateCode: string;
    templateVersion: number;
    templateName: string;
  };

  /** Actor who triggered the event */
  actor: AuditActor;

  /** Action taken (if applicable) */
  action?: ApprovalActionType | string;

  /** Previous state */
  previousState?: {
    instanceStatus?: ApprovalInstanceStatus;
    stepStatus?: string;
    entityState?: EntityApprovalState;
  };

  /** New state */
  newState?: {
    instanceStatus?: ApprovalInstanceStatus;
    stepStatus?: string;
    entityState?: EntityApprovalState;
  };

  /** Comment/reason */
  comment?: string;

  /** Attachments */
  attachments?: AuditAttachment[];

  /** Additional details */
  details?: Record<string, unknown>;

  /** Event timestamp */
  timestamp: Date;

  /** IP address */
  ipAddress?: string;

  /** User agent */
  userAgent?: string;

  /** Correlation ID for tracing */
  correlationId?: string;

  /** Session ID */
  sessionId?: string;
}

/**
 * Step-wise audit summary
 */
export interface StepAuditSummary {
  /** Step instance ID */
  stepInstanceId: string;

  /** Step name */
  stepName: string;

  /** Step level */
  stepLevel: number;

  /** Step status */
  status: string;

  /** Activated at */
  activatedAt?: Date;

  /** Completed at */
  completedAt?: Date;

  /** Duration in ms */
  durationMs?: number;

  /** Approvers with their actions */
  approverActions: Array<{
    userId: string;
    displayName?: string;
    action?: ApprovalActionType;
    actionTimestamp?: Date;
    comment?: string;
    delegatedTo?: string;
    responseTimeMs?: number;
  }>;

  /** Escalation count */
  escalationCount: number;

  /** SLA status */
  slaStatus?: "on_track" | "warning" | "breached";

  /** Was auto-approved */
  autoApproved?: boolean;

  /** Was skipped */
  skipped?: boolean;

  /** Skip reason */
  skipReason?: string;
}

/**
 * Complete audit trail for an instance
 */
export interface InstanceAuditTrail {
  /** Instance ID */
  instanceId: string;

  /** Entity information */
  entity: {
    type: string;
    id: string;
    referenceCode?: string;
    displayName?: string;
  };

  /** Workflow information */
  workflow: {
    templateId: string;
    templateCode: string;
    templateVersion: number;
    templateName: string;
  };

  /** Requester */
  requester: AuditActor;

  /** Current status */
  currentStatus: ApprovalInstanceStatus;

  /** Current entity state */
  currentEntityState: EntityApprovalState;

  /** Created at */
  createdAt: Date;

  /** Completed at */
  completedAt?: Date;

  /** Total duration in ms */
  totalDurationMs?: number;

  /** Final decision */
  finalDecision?: {
    outcome: string;
    decidedBy?: string;
    decidedAt?: Date;
    reason?: string;
  };

  /** Step summaries */
  steps: StepAuditSummary[];

  /** All audit events */
  events: AuditEvent[];

  /** Statistics */
  statistics: {
    totalSteps: number;
    completedSteps: number;
    skippedSteps: number;
    totalApprovers: number;
    approvedCount: number;
    rejectedCount: number;
    delegatedCount: number;
    escalationCount: number;
    slaBreachCount: number;
  };
}

// ============================================================================
// 8.2 Compliance Reporting
// ============================================================================

/**
 * Time period for reports
 */
export interface ReportPeriod {
  /** Start date */
  startDate: Date;

  /** End date */
  endDate: Date;
}

/**
 * Report grouping options
 */
export type ReportGroupBy =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "workflow"
  | "entity_type"
  | "department"
  | "approver";

/**
 * Approval cycle duration report
 */
export interface CycleDurationReport {
  /** Report period */
  period: ReportPeriod;

  /** Grouping */
  groupBy: ReportGroupBy;

  /** Overall statistics */
  overall: {
    totalInstances: number;
    completedInstances: number;
    avgDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
    medianDurationMs: number;
    p95DurationMs: number;
  };

  /** Breakdown by group */
  breakdown: Array<{
    groupKey: string;
    groupLabel?: string;
    instanceCount: number;
    avgDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
  }>;

  /** Duration distribution */
  distribution: Array<{
    bucket: string; // e.g., "0-1h", "1-4h", "4-24h", "1-3d", "3-7d", "7d+"
    count: number;
    percentage: number;
  }>;

  /** Trends over time */
  trends: Array<{
    date: Date;
    avgDurationMs: number;
    instanceCount: number;
  }>;
}

/**
 * SLA breach report
 */
export interface SlaBreachReport {
  /** Report period */
  period: ReportPeriod;

  /** Overall statistics */
  overall: {
    totalInstances: number;
    breachedInstances: number;
    breachRate: number; // percentage
    avgBreachDurationMs: number;
    totalBreaches: number;
  };

  /** Breach types */
  breachTypes: {
    responseBreaches: number;
    completionBreaches: number;
  };

  /** Breakdown by workflow */
  byWorkflow: Array<{
    templateCode: string;
    templateName: string;
    totalInstances: number;
    breachedInstances: number;
    breachRate: number;
  }>;

  /** Breakdown by step */
  byStep: Array<{
    stepName: string;
    stepLevel: number;
    totalActivations: number;
    breaches: number;
    breachRate: number;
    avgBreachDurationMs: number;
  }>;

  /** Trends over time */
  trends: Array<{
    date: Date;
    totalInstances: number;
    breachedInstances: number;
    breachRate: number;
  }>;

  /** Most breached instances */
  topBreaches: Array<{
    instanceId: string;
    entityReference: string;
    workflowName: string;
    breachCount: number;
    totalBreachDurationMs: number;
  }>;
}

/**
 * Escalation frequency report
 */
export interface EscalationReport {
  /** Report period */
  period: ReportPeriod;

  /** Overall statistics */
  overall: {
    totalInstances: number;
    escalatedInstances: number;
    escalationRate: number;
    totalEscalations: number;
    avgEscalationsPerInstance: number;
  };

  /** Escalation reasons */
  byReason: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;

  /** Escalation actions taken */
  byAction: Array<{
    action: string;
    count: number;
    percentage: number;
  }>;

  /** By escalation level */
  byLevel: Array<{
    level: number;
    count: number;
    resolvedAtLevel: number;
    escalatedFurther: number;
  }>;

  /** Breakdown by workflow */
  byWorkflow: Array<{
    templateCode: string;
    templateName: string;
    totalInstances: number;
    escalatedInstances: number;
    escalationRate: number;
    avgEscalationLevel: number;
  }>;

  /** Trends over time */
  trends: Array<{
    date: Date;
    totalInstances: number;
    escalatedInstances: number;
    totalEscalations: number;
  }>;
}

/**
 * Approver workload analytics
 */
export interface ApproverWorkloadReport {
  /** Report period */
  period: ReportPeriod;

  /** Overall statistics */
  overall: {
    totalApprovers: number;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    avgTasksPerApprover: number;
    avgResponseTimeMs: number;
  };

  /** Per-approver breakdown */
  approvers: Array<{
    userId: string;
    displayName?: string;
    departmentId?: string;

    /** Task counts */
    totalAssigned: number;
    completed: number;
    pending: number;
    delegated: number;
    escalated: number;

    /** Performance metrics */
    avgResponseTimeMs: number;
    minResponseTimeMs: number;
    maxResponseTimeMs: number;

    /** Decision breakdown */
    approved: number;
    rejected: number;
    requestedChanges: number;

    /** SLA compliance */
    slaMet: number;
    slaBreached: number;
    slaComplianceRate: number;
  }>;

  /** Workload distribution */
  distribution: Array<{
    bucket: string; // e.g., "0-5", "6-10", "11-20", "21-50", "50+"
    approverCount: number;
    percentage: number;
  }>;

  /** Department breakdown */
  byDepartment: Array<{
    departmentId: string;
    departmentName?: string;
    approverCount: number;
    totalTasks: number;
    avgTasksPerApprover: number;
    avgResponseTimeMs: number;
  }>;
}

/**
 * Compliance summary report
 */
export interface ComplianceSummaryReport {
  /** Report period */
  period: ReportPeriod;

  /** Overall compliance score (0-100) */
  complianceScore: number;

  /** Key metrics */
  metrics: {
    slaComplianceRate: number;
    avgCycleDurationMs: number;
    escalationRate: number;
    firstTimeApprovalRate: number;
    automationRate: number; // auto-approved percentage
  };

  /** Compliance by category */
  byCategory: Array<{
    category: string;
    score: number;
    issues: number;
    recommendations: string[];
  }>;

  /** Risk indicators */
  riskIndicators: Array<{
    indicator: string;
    level: "low" | "medium" | "high" | "critical";
    description: string;
    affectedInstances: number;
  }>;

  /** Recommendations */
  recommendations: Array<{
    priority: "low" | "medium" | "high";
    category: string;
    recommendation: string;
    potentialImpact: string;
  }>;
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Audit event query options
 */
export interface AuditEventQueryOptions {
  /** Filter by instance ID */
  instanceId?: string;

  /** Filter by step instance ID */
  stepInstanceId?: string;

  /** Filter by entity type */
  entityType?: string;

  /** Filter by entity ID */
  entityId?: string;

  /** Filter by workflow template code */
  templateCode?: string;

  /** Filter by event types */
  eventTypes?: AuditEventType[];

  /** Filter by severity */
  severity?: AuditEventSeverity[];

  /** Filter by actor user ID */
  actorUserId?: string;

  /** Filter by admin actions only */
  adminActionsOnly?: boolean;

  /** Date range */
  startDate?: Date;
  endDate?: Date;

  /** Pagination */
  limit?: number;
  offset?: number;

  /** Sort */
  sortBy?: "timestamp" | "eventType" | "severity";
  sortDirection?: "asc" | "desc";
}

/**
 * Report generation options
 */
export interface ReportOptions {
  /** Report period */
  period: ReportPeriod;

  /** Tenant ID */
  tenantId: string;

  /** Filter by workflow template codes */
  templateCodes?: string[];

  /** Filter by entity types */
  entityTypes?: string[];

  /** Filter by departments */
  departmentIds?: string[];

  /** Grouping */
  groupBy?: ReportGroupBy;

  /** Include detailed breakdown */
  includeDetails?: boolean;
}

// ============================================================================
// Repository & Service Interfaces
// ============================================================================

/**
 * Audit repository interface
 */
export interface IAuditRepository {
  /** Record an audit event */
  recordEvent(tenantId: string, event: Omit<AuditEvent, "id">): Promise<AuditEvent>;

  /** Get audit events */
  getEvents(tenantId: string, options?: AuditEventQueryOptions): Promise<AuditEvent[]>;

  /** Get audit trail for an instance */
  getInstanceAuditTrail(tenantId: string, instanceId: string): Promise<InstanceAuditTrail>;

  /** Get step audit summary */
  getStepAuditSummary(tenantId: string, stepInstanceId: string): Promise<StepAuditSummary>;

  /** Count events */
  countEvents(tenantId: string, options?: AuditEventQueryOptions): Promise<number>;

  /** Get events by correlation ID */
  getEventsByCorrelationId(tenantId: string, correlationId: string): Promise<AuditEvent[]>;

  /** Aggregate data for reporting */
  aggregateForReport(
    tenantId: string,
    reportType: string,
    options: ReportOptions
  ): Promise<Record<string, unknown>>;
}

/**
 * Simplified audit event input for admin/recovery operations
 */
export interface SimpleAuditEventInput {
  instanceId: string;
  stepInstanceId?: string;
  eventType: AuditEventType | string;
  severity?: "info" | "warning" | "error" | "critical";
  actor: { type: string; id: string };
  timestamp?: Date;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Audit trail service interface
 */
export interface IAuditTrailService {
  /** Record an audit event (full signature) */
  recordEvent(
    tenantId: string,
    eventType: AuditEventType,
    instance: ApprovalInstance,
    actor: AuditActor,
    details?: {
      stepInstance?: ApprovalStepInstance;
      action?: ApprovalActionType | string;
      comment?: string;
      attachments?: AuditAttachment[];
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AuditEvent>;

  /** Record an audit event (simplified signature for admin/recovery operations) */
  recordEvent(
    tenantId: string,
    event: SimpleAuditEventInput
  ): Promise<AuditEvent>;

  /** Get audit trail for instance */
  getAuditTrail(tenantId: string, instanceId: string): Promise<InstanceAuditTrail>;

  /** Get audit events */
  getEvents(tenantId: string, options?: AuditEventQueryOptions): Promise<AuditEvent[]>;

  /** Get step history */
  getStepHistory(tenantId: string, stepInstanceId: string): Promise<AuditEvent[]>;

  /** Export audit trail */
  exportAuditTrail(
    tenantId: string,
    instanceId: string,
    format: "json" | "csv" | "pdf"
  ): Promise<{ content: string | Buffer; mimeType: string }>;
}

/**
 * Compliance reporting service interface
 */
export interface IComplianceReportingService {
  /** Generate cycle duration report */
  generateCycleDurationReport(options: ReportOptions): Promise<CycleDurationReport>;

  /** Generate SLA breach report */
  generateSlaBreachReport(options: ReportOptions): Promise<SlaBreachReport>;

  /** Generate escalation report */
  generateEscalationReport(options: ReportOptions): Promise<EscalationReport>;

  /** Generate approver workload report */
  generateApproverWorkloadReport(options: ReportOptions): Promise<ApproverWorkloadReport>;

  /** Generate compliance summary */
  generateComplianceSummary(options: ReportOptions): Promise<ComplianceSummaryReport>;

  /** Schedule recurring report */
  scheduleReport(
    tenantId: string,
    reportType: string,
    schedule: string, // cron expression
    options: ReportOptions,
    recipients: string[]
  ): Promise<string>; // returns schedule ID

  /** Cancel scheduled report */
  cancelScheduledReport(tenantId: string, scheduleId: string): Promise<void>;
}
