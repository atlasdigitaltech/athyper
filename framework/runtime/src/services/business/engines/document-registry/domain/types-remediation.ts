// framework/runtime/src/services/business/engines/document-registry/domain/types-remediation.ts
//
// Re-exports Phase 8C remediation types from close-command-center.ts
// for cleaner import paths in the service layer.

export type {
  RemediationAction,
  RemediationActionType,
  RemediationSourceType,
  RemediationPriority,
  RemediationStatus,
  RemediationSummary,
} from "./close-command-center.js";

export type { FinancialDocType } from "./types.js";
