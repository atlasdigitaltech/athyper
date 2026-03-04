// framework/runtime/src/services/business/engines/decision-grid/domain/types.ts

import type { Money } from "../../shared/money.js";

// --- Pipeline ---

export type PipelineStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type PipelineStatus =
  | "INTAKE"
  | "OU_VALIDATION"
  | "INTENT_RESOLUTION"
  | "SMART_DEFAULTS"
  | "FUNDING_CHECK"
  | "COMMITMENT_CREATION"
  | "POLICY_EVALUATION"
  | "RISK_SCORING"
  | "WORKFLOW_ASSEMBLY"
  | "TAX_CALCULATION"
  | "AI_ENHANCEMENT"
  | "FINALIZATION"
  | "COMPLETED"
  | "FAILED";

export type WorkflowPath =
  | "ZERO_APPROVAL"
  | "STANDARD"
  | "ENHANCED"
  | "EXECUTIVE"
  | "BLOCKED";
export type PolicyAction = "APPROVE" | "REVIEW" | "ESCALATE" | "BLOCK";

export const STEP_TO_STATUS: Record<PipelineStep, PipelineStatus> = {
  1: "INTAKE",
  2: "OU_VALIDATION",
  3: "INTENT_RESOLUTION",
  4: "SMART_DEFAULTS",
  5: "FUNDING_CHECK",
  6: "COMMITMENT_CREATION",
  7: "POLICY_EVALUATION",
  8: "RISK_SCORING",
  9: "WORKFLOW_ASSEMBLY",
  10: "TAX_CALCULATION",
  11: "AI_ENHANCEMENT",
  12: "FINALIZATION",
};

export interface TransactionPipeline {
  id: string;
  tenantId: string;
  txnId: string;
  docId: string;
  docType: string;
  ouId: string;
  intentId: string | null;
  status: PipelineStatus;
  currentStep: PipelineStep;
  compositeScore: number | null;
  workflowPath: WorkflowPath | null;
  rejectionReason: string | null;
  remediationGuidance: string | null;
  finalizationSeq: number;
  resolvedGlAccount: string | null;
  resolvedCostCenter: string | null;
  resolvedProfitCenter: string | null;
  resolvedFundCenter: string | null;
  resolvedFpId: string | null;
  resolvedTaxProfile: Record<string, unknown> | null;
  resolvedAssetProfile: Record<string, unknown> | null;
  resolvedAccountingProfileId: string | null;
  smartDefaultsConfidence: number | null;
  policyDecisions: PolicyDecision[] | null;
  riskScores: Record<string, unknown> | null;
  aiAdvisory: Record<string, unknown> | null;
  submittedBy: string;
  submittedAt: Date;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Transaction Submission ---

export interface SubmitTransactionInput {
  tenantId: string;
  docId: string;
  docType: string;
  ouId: string;
  entityCode: string;
  amount: Money;
  category: string;
  description?: string;
  vendorId?: string;
  customerId?: string;
  lineItems: TransactionLineItem[];
  submittedBy: string;
}

export interface TransactionLineItem {
  itemCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
  uomCode: string;
  glAccount?: string;
  taxCode?: string;
}

// --- Policy Decision ---

export interface PolicyDecision {
  moduleId: string;
  moduleVersion: string;
  configHash: string;
  score: number;
  action: PolicyAction;
  conditions: PolicyCondition[];
  approvers: PolicyApprover[];
  slaHours: number;
  explanation: string;
  confidence: number;
}

export interface PolicyCondition {
  field: string;
  operator: string;
  value: unknown;
  met: boolean;
}

export interface PolicyApprover {
  userId: string;
  role: string;
  level: number;
}

// --- Composite Scoring ---

export interface CompositeScoreThresholds {
  zeroApprovalMin: number; // 0.90 default
  standardMin: number; // 0.75 default
  enhancedMin: number; // 0.50 default
  executiveMin: number; // 0.25 default
  // Below executiveMin = BLOCKED
}

export const DEFAULT_SCORE_THRESHOLDS: CompositeScoreThresholds = {
  zeroApprovalMin: 0.9,
  standardMin: 0.75,
  enhancedMin: 0.5,
  executiveMin: 0.25,
};

// --- Smart Default Rule ---

export interface SmartDefaultRule {
  id: string;
  tenantId: string;
  fieldName: string;
  source: string;
  method: "RULES_ENGINE" | "ML_FALLBACK" | "DIRECT_LOOKUP";
  priority: number;
  conditions: Record<string, unknown>;
  resolution: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
}

// --- Exception/Override ---

export type ExceptionScopeType =
  | "txn_id"
  | "doc_id"
  | "ou_id"
  | "funding_profile_id"
  | "policy_module_id"
  | "vendor_id";
export type ExceptionStatus =
  | "REQUESTED"
  | "REVIEWED"
  | "APPROVED"
  | "REJECTED"
  | "APPLIED"
  | "EXPIRED"
  | "REVOKED";

export interface Exception {
  id: string;
  tenantId: string;
  exceptionId: string;
  scopeType: ExceptionScopeType;
  scopeId: string;
  txnId: string | null;
  requestedBy: string;
  requestedAt: Date;
  reasonCode: string;
  reasonText: string;
  policyOverrides: Record<string, unknown>[];
  fundingOverride: Record<string, unknown> | null;
  validFrom: Date;
  validTo: Date;
  status: ExceptionStatus;
  approvers: Record<string, unknown>[];
  auditTags: string[];
  appliedAt: Date | null;
  expiredAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  createdAt: Date;
}

// --- Pipeline Step Result ---

export interface StepResult {
  success: boolean;
  nextStep: PipelineStep | null;
  updates: Partial<TransactionPipeline>;
  error?: string;
}
