/**
 * Approval Workflow Module
 *
 * This module provides a comprehensive approval workflow system including:
 *
 * Design-Time (Template Configuration):
 * - Template management (create, update, version, publish)
 * - Step configuration (sequential, parallel, conditional)
 * - Approver resolution (role, user, dynamic, group, expression)
 * - Conditions and thresholds (amount, risk, expressions)
 * - SLA and escalation rules
 * - Action configuration (approve, reject, delegate, etc.)
 *
 * Run-Time (Instance Management):
 * - Instance creation triggered by business events
 * - Step materialization with dynamic approver resolution
 * - Entity state locking during approval
 * - Action recording and history
 *
 * Task Management:
 * - Task creation per approver with SLA tracking
 * - Inbox with filtering and work queue prioritization
 * - Task delegation and reassignment
 * - Multi-channel notifications (email, in-app, push, SMS, webhook)
 * - Notification preferences and templates
 *
 * Action Execution:
 * - Approve, reject, request changes, delegate actions
 * - Parallel approval handling (any, all, majority, quorum)
 * - Conditional branching and step skipping
 * - SLA monitoring and escalation execution
 * - Workflow completion with hooks and events
 *
 * Audit & Governance:
 * - Step-wise action history and audit trail
 * - Approver identity and decision timestamps
 * - Comments and attachments tracking
 * - Compliance reporting (cycle duration, SLA breaches, escalations)
 * - Approver workload analytics
 *
 * Error Handling & Recovery:
 * - Missing approver detection and handling
 * - Deactivated user and role mismatch handling
 * - Workflow pause and resume capabilities
 * - Retry and reprocessing mechanisms
 * - Admin override and workflow cancellation
 *
 * Admin & Governance Controls:
 * - Force approve/reject actions
 * - Approver reassignment
 * - Workflow cancellation and restart
 * - Deadline modification
 *
 * Version Control:
 * - Workflow version history
 * - Active vs deprecated vs retired workflows
 * - Impact analysis for template changes
 * - Version comparison and migration
 *
 * @module approval
 */

// Types
export type {
  // Entity and trigger types
  ApprovalEntityType,
  ApprovalTriggerEvent,
  ApprovalTrigger,

  // Template types
  ApprovalWorkflowTemplate,
  StoredApprovalWorkflowTemplate,
  CreateApprovalWorkflowInput,
  UpdateApprovalWorkflowInput,
  ApprovalWorkflowQueryOptions,

  // Step types
  ApprovalStepType,
  ApprovalRequirement,
  QuorumConfig,
  ApprovalStep,

  // Approver types
  ApproverResolutionType,
  DynamicApproverStrategy,
  HierarchyOptions,
  ApproverRule,
  ResolvedApprover,
  ApproverResolutionContext,

  // Condition types
  ConditionOperator,
  LogicalOperator,
  ApprovalConditionRule,
  ApprovalCondition,
  AmountThreshold,
  AmountRange,
  RiskRule,
  SkipLogic,

  // SLA types
  DurationUnit,
  SlaDuration,
  EscalationTargetType,
  EscalationActionType,
  EscalationRule,
  ReminderConfig,
  SlaConfiguration,

  // Action types
  ApprovalActionType,
  ApprovalActionConfig,
  ActionField,
  ActionHook,

  // Validation types
  TemplateValidationResult,
  TemplateValidationError,
  TemplateValidationWarning,

  // Repository interface
  IApprovalWorkflowRepository,

  // Service interface
  IApprovalWorkflowService,
} from "./types.js";

// Validation
export {
  validateApprovalWorkflowTemplate,
  validateBasicFields,
  validateTriggers,
  validateSteps,
  validateStepDependencies,
  validateApproverRule,
  validateCondition,
  validateSlaConfiguration,
  validateAllowedActions,
} from "./validation.js";

// Repository
export {
  InMemoryApprovalWorkflowRepository,
  DatabaseApprovalWorkflowRepository,
  createInMemoryApprovalWorkflowRepository,
  createDatabaseApprovalWorkflowRepository,
} from "./repository.js";

// Service
export {
  ApprovalWorkflowDefinitionService,
  ApprovalWorkflowError,
  DefaultUserResolver,
  createApprovalWorkflowDefinitionService,
  type IUserResolver,
} from "./workflow-definition.service.js";

// API
export {
  ApprovalWorkflowApiController,
  getApprovalWorkflowRoutes,
  createApprovalWorkflowApiController,
  type CreateTemplateRequest,
  type CreateTemplateResponse,
  type UpdateTemplateRequest,
  type UpdateTemplateResponse,
  type ListTemplatesRequest,
  type ListTemplatesResponse,
  type GetTemplateResponse,
  type PublishTemplateResponse,
  type CloneTemplateRequest,
  type CloneTemplateResponse,
  type ValidateTemplateRequest,
  type ValidateTemplateResponse,
  type ResolveApproversRequest,
  type ResolveApproversResponse,
  type FindTemplatesRequest,
  type FindTemplatesResponse,
  type RouteDefinition,
} from "./api.js";

// =============================================================================
// Action Execution
// =============================================================================

// Re-export action module
export * from "./action/index.js";

// =============================================================================
// Admin & Governance Controls
// =============================================================================

// Re-export admin module (force actions, reassignments, workflow control)
export * from "./admin/index.js";

// =============================================================================
// Audit & Governance
// =============================================================================

// Re-export audit module (audit trail, compliance reporting)
export * from "./audit/index.js";

// =============================================================================
// Run-Time (Instance Management)
// =============================================================================

// Re-export instance module
export * from "./instance/index.js";

// =============================================================================
// Error Handling & Recovery
// =============================================================================

// Re-export recovery module (error detection, retry, recovery actions)
export * from "./recovery/index.js";

// =============================================================================
// Task Management
// =============================================================================

// Re-export task module
export * from "./task/index.js";

// =============================================================================
// Version Control
// =============================================================================

// Re-export version module (version history, lifecycle, impact analysis)
export * from "./version/index.js";

// =============================================================================
// Governance API
// =============================================================================

// Re-export governance API (audit, recovery, admin, version endpoints)
export {
  GovernanceApiController,
  getGovernanceRoutes,
  createGovernanceApiController,
  type GetAuditTrailRequest,
  type GetAuditTrailResponse,
  type ExportAuditTrailRequest,
  type ExportAuditTrailResponse,
  type GetComplianceReportRequest,
  type GetComplianceReportResponse,
  type GetWorkflowHealthRequest,
  type GetWorkflowHealthResponse,
  type GetActiveErrorsResponse,
  type ExecuteRecoveryActionRequest,
  type ExecuteRecoveryActionResponse,
  type PauseWorkflowRequest,
  type PauseWorkflowResponse,
  type ResumeWorkflowRequest,
  type ResumeWorkflowResponse,
  type ForceApproveRequest,
  type ForceApproveResponse,
  type ForceRejectRequest,
  type ForceRejectResponse,
  type ReassignApproversRequest,
  type ReassignApproversResponse,
  type SkipStepRequest,
  type SkipStepResponse,
  type CancelWorkflowRequest,
  type CancelWorkflowResponse,
  type RestartFromStepRequest,
  type RestartFromStepResponse,
  type ModifyDeadlineRequest,
  type ModifyDeadlineResponse,
  type CreateVersionRequest,
  type CreateVersionResponse,
  type PublishVersionRequest,
  type PublishVersionResponse,
  type DeprecateVersionRequest,
  type DeprecateVersionResponse,
  type GetVersionHistoryRequest,
  type GetVersionHistoryResponse,
  type CompareVersionsRequest,
  type CompareVersionsResponse,
  type AnalyzeImpactRequest,
  type AnalyzeImpactResponse,
} from "./governance-api.js";
