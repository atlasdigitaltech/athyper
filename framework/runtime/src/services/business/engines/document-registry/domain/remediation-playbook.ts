// framework/runtime/src/services/business/engines/document-registry/domain/remediation-playbook.ts
//
// Phase 8D — Remediation Playbook Registry
//
// Typed playbook definitions per remediation action type. Each playbook
// specifies: steps, prerequisites, side-effect declarations, validation
// rules, required roles, risk level, and rollback capability.
//
// Playbooks are pure data — no execution logic. The remediation service
// uses them for preview, validation, and execution orchestration.

import type { RemediationActionType, RemediationPriority } from "./close-command-center.js";

// ---------------------------------------------------------------------------
// Playbook Types
// ---------------------------------------------------------------------------

export type PlaybookRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type PlaybookStepType =
  | "VALIDATE"      // Pre-condition check (no mutation)
  | "QUERY"         // Data lookup (no mutation)
  | "MUTATE"        // State change (creates/updates records)
  | "NOTIFY"        // Side-effect notification
  | "AUDIT"         // Audit trail entry
  ;

export interface PlaybookStep {
  /** Step order (1-based) */
  order: number;
  /** Step identifier */
  code: string;
  /** Human-readable description */
  description: string;
  /** Step type classification */
  type: PlaybookStepType;
  /** Is this step reversible? */
  reversible: boolean;
  /** If reversible, how to undo */
  rollbackDescription?: string;
}

export interface PlaybookPrerequisite {
  /** What must be true before this playbook can run */
  description: string;
  /** Machine-readable check code */
  checkCode: string;
}

export interface PlaybookSideEffect {
  /** What this playbook will affect beyond the target document */
  description: string;
  /** Which tables/entities are affected */
  affectedEntities: string[];
  /** Severity of the side effect */
  severity: "INFO" | "WARNING" | "CAUTION";
}

export interface RemediationPlaybook {
  /** The action type this playbook handles */
  actionType: RemediationActionType;
  /** Human-readable playbook name */
  displayName: string;
  /** Detailed description of what this playbook does */
  description: string;
  /** Risk level of execution */
  riskLevel: PlaybookRiskLevel;
  /** Whether the entire playbook can be rolled back */
  isReversible: boolean;
  /** Required role to approve this action */
  requiredApprovalRole: string;
  /** Minimum priority that can skip approval (null = always requires approval) */
  autoApproveBelowPriority: RemediationPriority | null;
  /** Ordered steps */
  steps: PlaybookStep[];
  /** Prerequisites that must be satisfied before execution */
  prerequisites: PlaybookPrerequisite[];
  /** Side effects that the operator should be aware of */
  sideEffects: PlaybookSideEffect[];
  /** Estimated execution time in seconds */
  estimatedDurationSeconds: number;
  /** Whether this playbook supports batch execution */
  supportsBatch: boolean;
  /** Maximum batch size (null = unlimited) */
  maxBatchSize: number | null;
}

// ---------------------------------------------------------------------------
// Preview Types — what would happen if we execute
// ---------------------------------------------------------------------------

export interface RemediationPreview {
  /** The action being previewed */
  actionId: string;
  actionType: RemediationActionType;
  /** The playbook that would be used */
  playbook: RemediationPlaybook;
  /** Document context */
  docId: string | null;
  docNo: string | null;
  docType: string | null;
  /** Prerequisites check results */
  prerequisiteResults: PrerequisiteCheckResult[];
  /** All prerequisites passed? */
  allPrerequisitesMet: boolean;
  /** Predicted side effects */
  predictedSideEffects: PredictedSideEffect[];
  /** Impact summary (human-readable) */
  impactSummary: string;
  /** Whether execution is safe to proceed */
  canExecute: boolean;
  /** If not, why */
  blockingReasons: string[];
}

export interface PrerequisiteCheckResult {
  checkCode: string;
  description: string;
  passed: boolean;
  detail?: string;
}

export interface PredictedSideEffect {
  description: string;
  affectedEntities: string[];
  severity: "INFO" | "WARNING" | "CAUTION";
  /** Specific records that would be affected (for dry-run detail) */
  affectedRecordCount?: number;
}

// ---------------------------------------------------------------------------
// Campaign Types — batched remediation
// ---------------------------------------------------------------------------

export type CampaignStatus =
  | "DRAFT"
  | "APPROVED"
  | "EXECUTING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "CANCELLED";

export interface RemediationCampaign {
  id: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;

  /** Campaign name (e.g., "P3 2026 Posting Gap Resolution") */
  campaignName: string;
  /** Description of campaign objective */
  description: string;

  /** Action type filter (all actions in campaign must be same type) */
  actionType: RemediationActionType;
  /** Priority filter */
  priorityFilter: RemediationPriority | null;

  status: CampaignStatus;

  /** Action IDs included in this campaign */
  actionIds: string[];
  /** Progress tracking */
  totalActions: number;
  completedActions: number;
  failedActions: number;

  /** Approval */
  createdBy: string;
  createdAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  executedAt: Date | null;
  completedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Playbook Registry — static definitions
// ---------------------------------------------------------------------------

export const PLAYBOOK_REGISTRY: Record<RemediationActionType, RemediationPlaybook> = {
  REPOST_DOCUMENT: {
    actionType: "REPOST_DOCUMENT",
    displayName: "Re-post Document",
    description: "Re-triggers the posting pipeline for a document that failed or was not posted. Creates a new journal entry and updates the document registry.",
    riskLevel: "MEDIUM",
    isReversible: true,
    requiredApprovalRole: "FINANCE_CONTROLLER",
    autoApproveBelowPriority: null,
    steps: [
      { order: 1, code: "VALIDATE_DOC_STATE", description: "Verify document is in a re-postable state (APPROVED or FAILED)", type: "VALIDATE", reversible: false },
      { order: 2, code: "CHECK_PERIOD_OPEN", description: "Confirm target fiscal period is OPEN or SOFT_CLOSE", type: "VALIDATE", reversible: false },
      { order: 3, code: "CREATE_JE", description: "Create journal entry from document posting rules", type: "MUTATE", reversible: true, rollbackDescription: "Reverse the created journal entry" },
      { order: 4, code: "UPDATE_DOC_STATUS", description: "Update document status to POSTED with JE reference", type: "MUTATE", reversible: true, rollbackDescription: "Revert document status to previous state" },
      { order: 5, code: "UPDATE_REGISTRY", description: "Sync financial document registry with new posting data", type: "MUTATE", reversible: true, rollbackDescription: "Revert registry entry" },
      { order: 6, code: "EMIT_EVENT", description: "Publish document.posted domain event via outbox", type: "NOTIFY", reversible: false },
      { order: 7, code: "LOG_AUDIT", description: "Record remediation completion in audit trail", type: "AUDIT", reversible: false },
    ],
    prerequisites: [
      { description: "Document must be in APPROVED, FAILED, or POSTING_PENDING status", checkCode: "DOC_STATUS_REPOSTABLE" },
      { description: "Target fiscal period must not be HARD_CLOSE", checkCode: "PERIOD_NOT_HARD_CLOSE" },
      { description: "No existing POSTED JE for this document (prevents double-posting)", checkCode: "NO_EXISTING_JE" },
    ],
    sideEffects: [
      { description: "Creates a new journal entry in fin.journal_entry", affectedEntities: ["fin.journal_entry", "fin.journal_entry_line"], severity: "WARNING" },
      { description: "Updates GL balances for affected accounts", affectedEntities: ["fin.gl_balance"], severity: "CAUTION" },
      { description: "Triggers post-action handlers (inventory, asset, commission)", affectedEntities: ["fin.inventory_movement", "fin.asset"], severity: "INFO" },
    ],
    estimatedDurationSeconds: 5,
    supportsBatch: true,
    maxBatchSize: 50,
  },

  GENERATE_REVERSAL_JE: {
    actionType: "GENERATE_REVERSAL_JE",
    displayName: "Generate Reversal JE",
    description: "Creates a reversing journal entry for an accrual that is due for reversal in the current period.",
    riskLevel: "MEDIUM",
    isReversible: true,
    requiredApprovalRole: "FINANCE_CONTROLLER",
    autoApproveBelowPriority: null,
    steps: [
      { order: 1, code: "VALIDATE_ACCRUAL", description: "Verify accrual is POSTED with auto_reverse=true and past reversal_date", type: "VALIDATE", reversible: false },
      { order: 2, code: "CHECK_NO_EXISTING_REVERSAL", description: "Confirm no reversal JE already exists", type: "VALIDATE", reversible: false },
      { order: 3, code: "CREATE_REVERSAL_JE", description: "Create reversing JE with swapped debit/credit amounts", type: "MUTATE", reversible: true, rollbackDescription: "Reverse the reversal JE" },
      { order: 4, code: "LINK_REVERSAL", description: "Set reversal_je_id on accrual document", type: "MUTATE", reversible: true, rollbackDescription: "Clear reversal_je_id" },
      { order: 5, code: "UPDATE_REGISTRY", description: "Sync registry with reversal linkage", type: "MUTATE", reversible: true },
      { order: 6, code: "LOG_AUDIT", description: "Record remediation in audit trail", type: "AUDIT", reversible: false },
    ],
    prerequisites: [
      { description: "Accrual must be POSTED with auto_reverse=true", checkCode: "ACCRUAL_AUTO_REVERSE" },
      { description: "Reversal date must be <= period end date", checkCode: "REVERSAL_DATE_IN_PERIOD" },
      { description: "No existing reversal JE", checkCode: "NO_EXISTING_REVERSAL" },
    ],
    sideEffects: [
      { description: "Creates a reversing journal entry", affectedEntities: ["fin.journal_entry", "fin.journal_entry_line"], severity: "WARNING" },
      { description: "Updates GL balances (nets to zero with original)", affectedEntities: ["fin.gl_balance"], severity: "INFO" },
    ],
    estimatedDurationSeconds: 3,
    supportsBatch: true,
    maxBatchSize: 100,
  },

  POST_TO_BOOK: {
    actionType: "POST_TO_BOOK",
    displayName: "Post to Secondary Book",
    description: "Posts a document to a missing secondary book (e.g., IFRS, TAX) via the book posting bridge.",
    riskLevel: "MEDIUM",
    isReversible: true,
    requiredApprovalRole: "FINANCE_CONTROLLER",
    autoApproveBelowPriority: null,
    steps: [
      { order: 1, code: "VALIDATE_PRIMARY_POSTED", description: "Verify primary book JE exists and is POSTED", type: "VALIDATE", reversible: false },
      { order: 2, code: "IDENTIFY_MISSING_BOOKS", description: "Determine which books are missing", type: "QUERY", reversible: false },
      { order: 3, code: "CREATE_BOOK_JE", description: "Create JE for each missing book using posting rules", type: "MUTATE", reversible: true, rollbackDescription: "Reverse book-specific JEs" },
      { order: 4, code: "CREATE_BRIDGE_ENTRIES", description: "Insert financial_document_posting bridge records", type: "MUTATE", reversible: true, rollbackDescription: "Remove bridge entries" },
      { order: 5, code: "LOG_AUDIT", description: "Record remediation in audit trail", type: "AUDIT", reversible: false },
    ],
    prerequisites: [
      { description: "Document must have a primary JE in POSTED status", checkCode: "PRIMARY_JE_POSTED" },
      { description: "Target books must be configured for the entity", checkCode: "BOOKS_CONFIGURED" },
    ],
    sideEffects: [
      { description: "Creates JEs in secondary books", affectedEntities: ["fin.journal_entry", "fin.financial_document_posting"], severity: "WARNING" },
      { description: "Updates GL balances in secondary books", affectedEntities: ["fin.gl_balance"], severity: "CAUTION" },
    ],
    estimatedDurationSeconds: 5,
    supportsBatch: true,
    maxBatchSize: 50,
  },

  REQUEST_REAPPROVAL: {
    actionType: "REQUEST_REAPPROVAL",
    displayName: "Request Re-approval",
    description: "Triggers a new approval workflow for a document that was previously approved but needs re-evaluation.",
    riskLevel: "LOW",
    isReversible: false,
    requiredApprovalRole: "FINANCE_LEAD",
    autoApproveBelowPriority: "LOW",
    steps: [
      { order: 1, code: "VALIDATE_DOC_APPROVED", description: "Verify document is in APPROVED or POSTED status", type: "VALIDATE", reversible: false },
      { order: 2, code: "EVALUATE_DECISION_GRID", description: "Re-run decision grid to determine approval route", type: "QUERY", reversible: false },
      { order: 3, code: "CREATE_APPROVAL_INSTANCE", description: "Create new approval workflow instance", type: "MUTATE", reversible: false },
      { order: 4, code: "NOTIFY_APPROVERS", description: "Notify assigned approvers", type: "NOTIFY", reversible: false },
      { order: 5, code: "LOG_AUDIT", description: "Record remediation in audit trail", type: "AUDIT", reversible: false },
    ],
    prerequisites: [
      { description: "Document must be in an approvable status", checkCode: "DOC_APPROVABLE" },
      { description: "No active approval instance already pending", checkCode: "NO_PENDING_APPROVAL" },
    ],
    sideEffects: [
      { description: "Creates an approval workflow instance", affectedEntities: ["wf.approval_instance", "wf.approval_task"], severity: "INFO" },
      { description: "Sends notification to approvers", affectedEntities: [], severity: "INFO" },
    ],
    estimatedDurationSeconds: 2,
    supportsBatch: true,
    maxBatchSize: 20,
  },

  FILL_APPROVAL_EVIDENCE: {
    actionType: "FILL_APPROVAL_EVIDENCE",
    displayName: "Fill Approval Evidence",
    description: "Looks up the approval instance for a document and denormalizes approval_route + decision_score onto the registry record.",
    riskLevel: "LOW",
    isReversible: true,
    requiredApprovalRole: "FINANCE_LEAD",
    autoApproveBelowPriority: "MEDIUM",
    steps: [
      { order: 1, code: "LOOKUP_APPROVAL", description: "Find approval instance linked to this document", type: "QUERY", reversible: false },
      { order: 2, code: "EXTRACT_EVIDENCE", description: "Extract approval_route, decision_score from approval instance", type: "QUERY", reversible: false },
      { order: 3, code: "UPDATE_REGISTRY", description: "Update financial_document with approval evidence fields", type: "MUTATE", reversible: true, rollbackDescription: "Clear approval evidence fields" },
      { order: 4, code: "LOG_AUDIT", description: "Record evidence fill in audit trail", type: "AUDIT", reversible: false },
    ],
    prerequisites: [
      { description: "Document must have a completed approval workflow", checkCode: "APPROVAL_COMPLETED" },
    ],
    sideEffects: [
      { description: "Updates approval evidence on financial document registry", affectedEntities: ["fin.financial_document"], severity: "INFO" },
    ],
    estimatedDurationSeconds: 1,
    supportsBatch: true,
    maxBatchSize: 200,
  },

  MARK_VOID: {
    actionType: "MARK_VOID",
    displayName: "Mark Document Void",
    description: "Marks a document as VOIDED when the JE has been reversed but the document status was not updated.",
    riskLevel: "HIGH",
    isReversible: false,
    requiredApprovalRole: "FINANCE_CONTROLLER",
    autoApproveBelowPriority: null,
    steps: [
      { order: 1, code: "VALIDATE_JE_REVERSED", description: "Confirm the linked JE is in REVERSED status", type: "VALIDATE", reversible: false },
      { order: 2, code: "UPDATE_DOC_STATUS", description: "Set document status to VOIDED with void_reason_code", type: "MUTATE", reversible: false },
      { order: 3, code: "UPDATE_REGISTRY", description: "Sync registry with voided status", type: "MUTATE", reversible: false },
      { order: 4, code: "LOG_AUDIT", description: "Record void action in audit trail", type: "AUDIT", reversible: false },
    ],
    prerequisites: [
      { description: "Linked JE must be in REVERSED status", checkCode: "JE_IS_REVERSED" },
      { description: "Document must not already be VOIDED or CANCELLED", checkCode: "DOC_NOT_TERMINAL" },
    ],
    sideEffects: [
      { description: "Permanently voids the document — this is irreversible", affectedEntities: ["fin.financial_document"], severity: "CAUTION" },
    ],
    estimatedDurationSeconds: 1,
    supportsBatch: true,
    maxBatchSize: 50,
  },

  WAIVE_DEFECT: {
    actionType: "WAIVE_DEFECT",
    displayName: "Waive Defect",
    description: "Waives a document defect as a close exception. Creates a close exception record and allows the close to proceed despite the defect.",
    riskLevel: "MEDIUM",
    isReversible: false,
    requiredApprovalRole: "FINANCE_CONTROLLER",
    autoApproveBelowPriority: null,
    steps: [
      { order: 1, code: "VALIDATE_DEFECT_EXISTS", description: "Confirm the defect is still active", type: "VALIDATE", reversible: false },
      { order: 2, code: "CREATE_EXCEPTION", description: "Create close exception record with waiver justification", type: "MUTATE", reversible: false },
      { order: 3, code: "UPDATE_REGISTRY", description: "Mark defect as waived in remediation tracking", type: "MUTATE", reversible: false },
      { order: 4, code: "LOG_AUDIT", description: "Record waiver in audit trail with full justification", type: "AUDIT", reversible: false },
    ],
    prerequisites: [
      { description: "Defect must be active (not already resolved or waived)", checkCode: "DEFECT_ACTIVE" },
      { description: "Waiver reason must be provided", checkCode: "WAIVER_REASON_PROVIDED" },
    ],
    sideEffects: [
      { description: "Creates a close exception — auditable governance deviation", affectedEntities: ["fin.close_exception"], severity: "CAUTION" },
    ],
    estimatedDurationSeconds: 1,
    supportsBatch: false,
    maxBatchSize: null,
  },

  MANUAL_CORRECTION: {
    actionType: "MANUAL_CORRECTION",
    displayName: "Manual Correction",
    description: "Tracks a manual correction that requires human intervention. The system records the correction but does not execute it automatically.",
    riskLevel: "LOW",
    isReversible: false,
    requiredApprovalRole: "FINANCE_LEAD",
    autoApproveBelowPriority: "LOW",
    steps: [
      { order: 1, code: "RECORD_INTENT", description: "Record the correction intent and instructions", type: "AUDIT", reversible: false },
      { order: 2, code: "NOTIFY_ASSIGNEE", description: "Notify the assigned person to perform the manual correction", type: "NOTIFY", reversible: false },
      { order: 3, code: "AWAIT_CONFIRMATION", description: "Wait for manual confirmation that the correction was performed", type: "VALIDATE", reversible: false },
      { order: 4, code: "LOG_AUDIT", description: "Record completion confirmation in audit trail", type: "AUDIT", reversible: false },
    ],
    prerequisites: [
      { description: "Correction instructions must be provided in action_detail", checkCode: "INSTRUCTIONS_PROVIDED" },
    ],
    sideEffects: [
      { description: "Sends notification to assigned corrector", affectedEntities: [], severity: "INFO" },
    ],
    estimatedDurationSeconds: 0,
    supportsBatch: false,
    maxBatchSize: null,
  },
};

// ---------------------------------------------------------------------------
// Registry Lookup
// ---------------------------------------------------------------------------

export function getPlaybook(actionType: RemediationActionType): RemediationPlaybook {
  return PLAYBOOK_REGISTRY[actionType];
}

export function getPlaybookRiskLevel(actionType: RemediationActionType): PlaybookRiskLevel {
  return PLAYBOOK_REGISTRY[actionType].riskLevel;
}

export function requiresApproval(
  actionType: RemediationActionType,
  priority: RemediationPriority,
): boolean {
  const playbook = PLAYBOOK_REGISTRY[actionType];
  if (!playbook.autoApproveBelowPriority) return true;

  const priorityOrder: Record<string, number> = {
    CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
  };
  return priorityOrder[priority] <= priorityOrder[playbook.autoApproveBelowPriority];
}
