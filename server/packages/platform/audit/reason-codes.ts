/**
 * Audit reason code constants — derived from master.seed_audit_reason_catalog()
 * in 07_functions.sql (35 platform-seeded codes, sort_order 10–350).
 *
 * These codes are provisioned per-tenant on onboarding. Tenants may add their
 * own codes; this file covers only platform_seed codes (origin='platform_seed').
 *
 * Usage:
 *   await appendRequiredAuditEvent(db, {
 *     event_code:            Period.CLOSED,
 *     audit_reason_code_id:  resolvedReasonId,   // UUID looked up from DB
 *     reason_comment:        "Q4 close approved by CFO",
 *   });
 *
 * The reason code ID (UUID) must be resolved from master.audit_reason_code
 * for the current tenant. Use ReasonCode.* strings as the lookup key (code column).
 */

// ── Category and severity mirrors (audit.reason_category_d / reason_severity_d) ──

export type ReasonCategory =
  | "workflow"
  | "accounting"
  | "financial"
  | "snapshot"
  | "security"
  | "authorization"
  | "configuration"
  | "integration"
  | "data_correction";

export type ReasonSeverity = "normal" | "elevated" | "critical";

// ── Platform-seeded reason codes grouped by category ─────────────────────────

/** category: data_correction */
export const DataCorrectionReason = {
  MANUAL_CORRECTION:  "manual_correction",   // requires_comment=true
  DUPLICATE_RESOLUTION:"duplicate_resolution", // requires_comment=false
  PII_SUBJECT_REQUEST:"pii_subject_request", // GDPR / data subject right request — requires_comment=true
  PII_RETENTION_PURGE:"pii_retention_purge", // Retention-policy expiry — requires_comment=false
} as const;

/** category: accounting */
export const AccountingReason = {
  INCORRECT_ACCOUNT_ASSIGNMENT: "incorrect_account_assignment", // requires_comment=true
  MANUAL_ACCOUNT_OVERRIDE:      "manual_account_override",      // requires_comment=true
  TAX_RECALCULATION:            "tax_recalculation",            // requires_comment=true
  LATE_JOURNAL_ENTRY:           "late_journal_entry",           // requires_comment=true
} as const;

/** category: financial */
export const FinancialReason = {
  REGULATORY_REQUIREMENT: "regulatory_requirement",  // requires_comment=true
  POSTING_ADJUSTMENT:     "posting_adjustment",      // requires_comment=true  severity=critical
  PERIOD_MONTH_END_CLOSE: "period_month_end_close",  // requires_comment=false severity=normal
  PERIOD_YEAR_END_CLOSE:  "period_year_end_close",   // requires_comment=true
  PERIOD_REOPEN_CORRECTION:"period_reopen_correction", // requires_comment=true severity=critical
  BUDGET_VARIANCE_OVERRIDE:"budget_variance_override", // requires_comment=true severity=critical
} as const;

/** category: workflow */
export const WorkflowReason = {
  CUSTOMER_REQUEST:   "customer_request",    // requires_comment=true
  REQUEST_REVISION:   "request_revision",    // Approver returned for revision — requires_comment=true
  APPROVER_CORRECTION:"approver_correction", // Approver corrected in-flight — requires_comment=true
  WORKFLOW_BYPASS:    "workflow_bypass",      // Step bypassed under exception — requires_comment=true severity=critical
} as const;

/** category: security */
export const SecurityReason = {
  SECURITY_RESPONSE:       "security_response",        // Incident/threat response — requires_comment=true severity=critical
  PII_ACCESS_AUTHORIZED:   "pii_access_authorized",    // Documented lawful access — requires_comment=true
  AUDIT_INTEGRITY_CHECK:   "audit_integrity_check",    // Routine/on-demand check — requires_comment=false
  AUDIT_TAMPER_RESPONSE:   "audit_tamper_response",    // Tamper detected — requires_comment=true severity=critical
  SESSION_SECURITY_LOCKOUT:"session_security_lockout", // Security threat — requires_comment=true
  SESSION_DEVICE_LOST:     "session_device_lost",      // Lost/stolen device — requires_comment=true
  SUPPORT_ESCALATION:      "support_escalation",       // Formal escalation approval — requires_comment=true severity=critical
  EMERGENCY_ACCESS:        "emergency_access",          // Break-glass — requires_comment=true severity=critical
} as const;

/** category: authorization */
export const AuthorizationReason = {
  AUTHORIZATION_EXCEPTION: "authorization_exception", // requires_comment=true severity=critical
} as const;

/** category: configuration */
export const ConfigurationReason = {
  POLICY_EXCEPTION:        "policy_exception",         // requires_comment=true severity=critical
  CONFIG_COMPLIANCE_UPDATE:"config_compliance_update", // Regulatory requirement — requires_comment=true
  CONFIG_MAINTENANCE_UPDATE:"config_maintenance_update",// Scheduled maintenance — requires_comment=false
  SCHEMA_ROLLBACK:         "schema_rollback",           // Schema change rolled back — requires_comment=true
} as const;

/** category: integration */
export const IntegrationReason = {
  INTEGRATION_RECONCILIATION:"integration_reconciliation", // External system reconcile — requires_comment=true
  IMPORT_REPROCESS:          "import_reprocess",           // Failed import retry — requires_comment=false
} as const;

/** category: snapshot */
export const SnapshotReason = {
  DATA_RESTORATION: "data_restoration",  // State restored for recovery — requires_comment=true
  RESTORE_SNAPSHOT: "restore_snapshot",  // Snapshot-based restore — requires_comment=true
} as const;

// ── Flat index — all 35 platform reason codes ─────────────────────────────────

export const ReasonCode = {
  ...DataCorrectionReason,
  ...AccountingReason,
  ...FinancialReason,
  ...WorkflowReason,
  ...SecurityReason,
  ...AuthorizationReason,
  ...ConfigurationReason,
  ...IntegrationReason,
  ...SnapshotReason,
} as const;

export type ReasonCodeValue = typeof ReasonCode[keyof typeof ReasonCode];

// ── Contract → suggested reason category mapping ──────────────────────────────
// Informs UI reason picker: pre-filter categories by the event the user is justifying.

export const CONTRACT_REASON_CATEGORIES: Record<string, ReasonCategory[]> = {
  pci_event:             ["security", "configuration", "financial"],
  pii_access_event:      ["security", "data_correction"],
  pii_modification_event:["security", "data_correction"],
  audit_system_event:    ["security"],
  iam_session_event:     ["security"],
  iam_authorization_event:["authorization", "security"],
  finance_period_event:  ["financial", "accounting"],
  config_change_event:   ["configuration", "security"],
  ai_support_event:      ["security"],
};
