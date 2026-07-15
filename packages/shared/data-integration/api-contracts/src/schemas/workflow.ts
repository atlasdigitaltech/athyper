/**
 * @athyper/api-contracts — Workflow Schemas
 *
 * Shapes for workflow inbox, approval panels, delegation.
 * Mirrors: document.workflow_request, document.workflow_stage, work items.
 */
import { z } from "zod";
import { UuidSchema, AuditSchema } from "./common";

export const WorkflowRequestSchema = z.object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  entity_type: z.string(),
  entity_id: z.string(),
  workflow_type: z.string(),
  status: z.string(),
  submitted_by: UuidSchema,
  submitted_at: z.string().datetime(),
  entity_snapshot: z.record(z.string(), z.unknown()).nullable(),
  current_stage_id: UuidSchema.nullable(),
}).merge(AuditSchema);

export type WorkflowRequest = z.infer<typeof WorkflowRequestSchema>;

export const WorkItemSchema = z.object({
  id: UuidSchema,
  workflow_request_id: UuidSchema,
  stage_id: UuidSchema,
  assignee_id: UuidSchema,
  assignee_name: z.string().nullable(),
  assignee_type: z.enum(["principal", "group", "role"]),
  status: z.enum(["pending", "approved", "rejected", "delegated", "timed_out"]),
  decision_at: z.string().datetime().nullable(),
  remarks: z.string().nullable(),
  delegated_to: UuidSchema.nullable(),
  delegated_to_name: z.string().nullable(),
}).merge(AuditSchema);

export type WorkItem = z.infer<typeof WorkItemSchema>;

/** Inbox item — enriched work item for display. */
export const InboxItemSchema = z.object({
  work_item: WorkItemSchema,
  entity_type: z.string(),
  entity_id: z.string(),
  entity_title: z.string(),
  workflow_type: z.string(),
  stage_label: z.string().nullable(),
  submitted_by_name: z.string(),
  submitted_at: z.string().datetime(),
  priority: z.number().int().optional(),
});

export type InboxItem = z.infer<typeof InboxItemSchema>;

/** Approval action request. */
export const ApprovalActionSchema = z.object({
  action: z.enum(["approve", "reject", "delegate", "request_info"]),
  remarks: z.string().optional(),
  delegate_to: UuidSchema.optional(),
});

export type ApprovalAction = z.infer<typeof ApprovalActionSchema>;

// ═══════════════════════════════════════════════════════════════
// WORKFLOW STAGE — for approval panel (Rec 14)
// Source: document.workflow_stage + event.work_item
// ═══════════════════════════════════════════════════════════════

export const QuorumRuleSchema = z.object({
  strategy: z.enum(["unanimous", "count", "percentage", "any_one", "weighted"]),
  required: z.number().nullable(),
});
export type QuorumRule = z.infer<typeof QuorumRuleSchema>;

export const QuorumProgressSchema = z.object({
  is_met: z.boolean(),
  is_rejected: z.boolean(),
  approved_count: z.number().int(),
  rejected_count: z.number().int(),
  pending_count: z.number().int(),
  total_count: z.number().int(),
});
export type QuorumProgress = z.infer<typeof QuorumProgressSchema>;

export const WorkflowStageDetailSchema = z.object({
  id: UuidSchema,
  stage_name: z.string(),
  stage_order: z.number().int(),
  stage_mode: z.enum(["SERIAL", "PARALLEL"]),
  quorum: QuorumRuleSchema,
  quorum_progress: QuorumProgressSchema.nullable(),
  status: z.enum(["pending", "active", "completed", "skipped", "rejected"]),
  work_items: z.array(WorkItemSchema),
}).merge(AuditSchema);
export type WorkflowStageDetail = z.infer<typeof WorkflowStageDetailSchema>;

/** Workflow behavior flags from control.workflow_template */
export const WorkflowBehaviorsSchema = z.object({
  allow_self_approval: z.boolean().default(false),
  require_all_stages: z.boolean().default(true),
  allow_reassignment: z.boolean().default(true),
  require_reason_on_reject: z.boolean().default(true),
  early_reject_on_quorum_fail: z.boolean().default(false),
});
export type WorkflowBehaviors = z.infer<typeof WorkflowBehaviorsSchema>;

/** Full approval context for a document */
export const ApprovalContextSchema = z.object({
  workflow_request: WorkflowRequestSchema,
  stages: z.array(WorkflowStageDetailSchema),
  behaviors: WorkflowBehaviorsSchema,
  current_stage_index: z.number().int().nullable(),
});
export type ApprovalContext = z.infer<typeof ApprovalContextSchema>;

// ═══════════════════════════════════════════════════════════════
// WORKFLOW EVENT LOG — reassignment, escalation trail (Rec 14)
// Source: log.workflow_event_log (append-only, hash-chained)
// ═══════════════════════════════════════════════════════════════

export const WorkflowEventSchema = z.object({
  id: UuidSchema,
  stage_id: UuidSchema.nullable(),
  event_type: z.string(),
  from_status: z.string().nullable(),
  to_status: z.string().nullable(),
  action: z.string().nullable(),
  actor_id: UuidSchema.nullable(),
  actor_name: z.string().nullable(),
  comment: z.string().nullable(),
  severity: z.enum(["info", "warn", "error"]).default("info"),
  created_at: z.string().datetime(),
});
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;

// ═══════════════════════════════════════════════════════════════
// ACTIVITY LOG — filtered process ledger (Rec 15)
// Source: log.activity_log + log.entity_lifecycle_log
// ═══════════════════════════════════════════════════════════════

export const ActivityDomainSchema = z.enum([
  "all", "document", "workflow", "accounting", "payment", "system",
]);
export type ActivityDomain = z.infer<typeof ActivityDomainSchema>;

export const ActivityEntrySchema = z.object({
  id: UuidSchema,
  domain: ActivityDomainSchema,
  activity_type: z.string(),
  description: z.string(),
  actor_name: z.string().nullable(),
  from_state: z.string().nullable(),
  to_state: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string().datetime(),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;
