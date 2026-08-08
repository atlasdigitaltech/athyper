/**
 * Audit event code namespaces — derived from 12_reference_seed.sql (22 contracts).
 *
 * Grouped by contract prefix so callers import by domain:
 *   import { Record, Period, Iam } from "@athyper/svc-audit";
 *   event_code: Record.POSTED
 *
 * The DB trigger (trg_capture_row_change) owns record.row_created/updated/deleted.
 * Those three codes are intentionally absent — application code never emits them.
 *
 * Contract → prefix mapping (priority order):
 *   pci_event             (1)  → Pci.*
 *   pii_access_event      (2)  → Pii.ACCESSED, Pii.BULK_ACCESSED
 *   pii_modification_event(3)  → Pii.MODIFIED
 *   audit_system_event    (4)  → Audit.*
 *   iam_authentication_event(5)→ Iam.Auth.*
 *   iam_session_event     (6)  → Iam.Session.*
 *   iam_authorization_event(7) → Iam.Authz.*
 *   iam_general_event     (9)  → Iam.General.*
 *   entity_access_event   (15) → Record.Access.*
 *   finance_period_event  (22) → Period.*   [reason_required]
 *   entity_business_event (25) → Record.*
 *   inbox_routing_event   (26) → Inbox.*
 *   integration_event     (28) → Integration.*
 *   data_import_event     (29) → Import.*
 *   ai_support_event      (30) → Ai.Support.*  [reason_required, support actor only]
 *   ai_event              (31) → Ai.*
 *   schema_authoring_event(35) → Schema.*
 *   notification_event    (38) → Notification.*
 *   config_change_event   (48) → Config.*   [reason_required]
 *   platform_system_event (50) → System.*   [3-part codes only]
 *   generic_action_event  (55) → Action.*
 */

// ── PCI (pci_event — priority 1) ─────────────────────────────────────────────
// Pattern: ^pci\.[a-z][a-z0-9_]*$   ops: create|update|delete|execute|import|export
export const Pci = {
  ACCESSED:  "pci.accessed",
  MODIFIED:  "pci.modified",
  EXPORTED:  "pci.exported",
} as const;
export type PciEventCode = typeof Pci[keyof typeof Pci];

// ── PII (pii_access_event p2, pii_modification_event p3) ─────────────────────
// Access  pattern: ^pii\.(accessed|bulk_accessed)$   ops: execute|export
// Modify  pattern: ^pii\.modified$                   ops: create|update|delete
export const Pii = {
  ACCESSED:      "pii.accessed",
  BULK_ACCESSED: "pii.bulk_accessed",
  MODIFIED:      "pii.modified",
} as const;
export type PiiEventCode = typeof Pii[keyof typeof Pii];

// ── Audit self-integrity (audit_system_event — priority 4) ───────────────────
// Pattern: ^audit\.[a-z][a-z0-9_]*$   ops: create|update|delete|execute|export
// reason_required = true
export const Audit = {
  EXPORT_REQUESTED:   "audit.export_requested",
  INTEGRITY_CHECKED:  "audit.integrity_checked",
  HOLD_APPLIED:       "audit.hold_applied",
  HOLD_RELEASED:      "audit.hold_released",
  PARTITION_ARCHIVED: "audit.partition_archived",
} as const;
export type AuditSelfEventCode = typeof Audit[keyof typeof Audit];

// ── IAM (priorities 5–9) ─────────────────────────────────────────────────────

/** iam_authentication_event (p5) — pattern: ^iam\.(login|logout|mfa)[_a-z0-9]*$  ops: login|logout|execute */
export const IamAuth = {
  LOGIN:       "iam.login",
  LOGOUT:      "iam.logout",
  MFA_VERIFIED:"iam.mfa_verified",
  MFA_FAILED:  "iam.mfa_failed",
  MFA_ENROLLED:"iam.mfa_enrolled",
  MFA_REMOVED: "iam.mfa_removed",
} as const;
export type IamAuthEventCode = typeof IamAuth[keyof typeof IamAuth];

/** iam_session_event (p6) — pattern: ^iam\.session[_a-z0-9]*$   ops: execute|delete   reason_required */
export const IamSession = {
  REVOKED:     "iam.session_revoked",
  EXPIRED:     "iam.session_expired",
  ALL_REVOKED: "iam.session_all_revoked",
} as const;
export type IamSessionEventCode = typeof IamSession[keyof typeof IamSession];

/** iam_authorization_event (p7) — pattern: ^iam\.(role|permission|delegation)[_a-z0-9]*$   ops: create|update|delete|grant|revoke   reason_required */
export const IamAuthz = {
  ROLE_GRANTED:       "iam.role_granted",
  ROLE_REVOKED:       "iam.role_revoked",
  PERMISSION_GRANTED: "iam.permission_granted",
  PERMISSION_REVOKED: "iam.permission_revoked",
  DELEGATION_GRANTED: "iam.delegation_granted",
  DELEGATION_REVOKED: "iam.delegation_revoked",
} as const;
export type IamAuthzEventCode = typeof IamAuthz[keyof typeof IamAuthz];

/** iam_general_event (p9) — pattern: ^iam\.[a-z][a-z0-9_]*$   catch-all for anything not matched above */
export const IamGeneral = {
  USER_CREATED:    "iam.user_created",
  USER_SUSPENDED:  "iam.user_suspended",
  USER_RESTORED:   "iam.user_restored",
  INVITATION_SENT: "iam.invitation_sent",
} as const;
export type IamGeneralEventCode = typeof IamGeneral[keyof typeof IamGeneral];

// ── Record / entity events (priorities 15, 25) ───────────────────────────────

/**
 * entity_access_event (p15) — pattern: ^record\.(viewed|downloaded|accessed|previewed)$
 * ops: execute|export   capture_mode: metadata (no old/new values)
 * DB trigger does NOT cover these — SELECT has no trigger; app must emit explicitly.
 */
export const RecordAccess = {
  VIEWED:    "record.viewed",
  DOWNLOADED:"record.downloaded",
  ACCESSED:  "record.accessed",
  PREVIEWED: "record.previewed",
} as const;
export type RecordAccessEventCode = typeof RecordAccess[keyof typeof RecordAccess];

/**
 * entity_business_event (p25) — pattern: ^record\.[a-z][a-z0-9_]*$
 * ops: create|update|delete|restore|execute|approve|reject|import|export
 * capture_mode: safe_values
 */
export const Record = {
  // Lifecycle transitions
  SUBMITTED: "record.submitted",
  POSTED:    "record.posted",
  APPROVED:  "record.approved",
  REJECTED:  "record.rejected",
  CANCELLED: "record.cancelled",
  REVERSED:  "record.reversed",
  REOPENED:  "record.reopened",
  RESTORED:  "record.restored",
  ARCHIVED:  "record.archived",
  VOIDED:    "record.voided",
  // Finance matching / clearing
  MATCHED:   "record.matched",
  CLEARED:   "record.cleared",
  // Bulk / export
  EXPORTED:  "record.exported",
  // Semantic CRUD (when app wants a semantic event alongside the DB trigger row)
  CREATED:   "record.created",
  UPDATED:   "record.updated",
  DELETED:   "record.deleted",
} as const;
export type RecordEventCode = typeof Record[keyof typeof Record];

// ── Finance period (finance_period_event — priority 22) ──────────────────────
// Pattern: ^period\.[a-z][a-z0-9_]*$
// ops: create|update|execute|approve|reject   reason_required = true
export const Period = {
  OPENED:         "period.opened",
  CLOSED:         "period.closed",
  LOCKED:         "period.locked",
  REOPENED:       "period.reopened",
  SIGN_OFF:       "period.sign_off",
  TASK_COMPLETED: "period.task_completed",
} as const;
export type PeriodEventCode = typeof Period[keyof typeof Period];

// ── Inbox / workflow routing (inbox_routing_event — priority 26) ──────────────
// Pattern: ^inbox\.[a-z][a-z0-9_]*$   ops: create|update|execute|approve|reject
export const Inbox = {
  ASSIGNED:     "inbox.assigned",
  ESCALATED:    "inbox.escalated",
  ACTION_TAKEN: "inbox.action_taken",
  RETURNED:     "inbox.returned",
  RECALLED:     "inbox.recalled",
} as const;
export type InboxEventCode = typeof Inbox[keyof typeof Inbox];

// ── Integration (integration_event — priority 28) ────────────────────────────
// Pattern: ^integration\.[a-z][a-z0-9_]*$   ops: create|update|delete|execute|import|export
// actors: service_account|bot|integration|system only
export const Integration = {
  SYNC_STARTED:   "integration.sync_started",
  SYNC_COMPLETED: "integration.sync_completed",
  SYNC_FAILED:    "integration.sync_failed",
  WEBHOOK_SENT:   "integration.webhook_sent",
  WEBHOOK_FAILED: "integration.webhook_failed",
} as const;
export type IntegrationEventCode = typeof Integration[keyof typeof Integration];

// ── Data import pipeline (data_import_event — priority 29) ───────────────────
// Pattern: ^import\.[a-z][a-z0-9_]*$   ops: create|execute|import|reject
export const Import = {
  REQUESTED:       "import.requested",
  CHUNK_PROCESSED: "import.chunk_processed",
  COMPLETED:       "import.completed",
  FAILED:          "import.failed",
  REJECTED:        "import.rejected",
} as const;
export type ImportEventCode = typeof Import[keyof typeof Import];

// ── AI (priorities 30–31) ─────────────────────────────────────────────────────

/**
 * ai_support_event (p30) — pattern: ^ai\.support[_a-z0-9]*$
 * ops: execute|export   reason_required = true   actors: support ONLY
 * Underscore sub-separator (not dot) — must satisfy [_a-z0-9]* after "support".
 */
export const AiSupport = {
  ACCESS_STARTED: "ai.support_access_started",
  DATA_READ:      "ai.support_data_read",
  EXPORTED:       "ai.support_exported",
  ACCESS_ENDED:   "ai.support_access_ended",
  ACCESS_DENIED:  "ai.support_access_denied",
} as const;
export type AiSupportEventCode = typeof AiSupport[keyof typeof AiSupport];

/**
 * ai_event (p31) — pattern: ^ai\.[a-z][a-z0-9_]*$
 * ops: create|update|delete|execute
 * Underscore sub-separator (not dot) to stay within 2-part code.
 */
export const Ai = {
  BYOK_CREATED:      "ai.byok_created",
  BYOK_ROTATED:      "ai.byok_rotated",
  BYOK_REVOKED:      "ai.byok_revoked",
  BYOK_REENCRYPTED:  "ai.byok_reencrypted",
  BYOK_CACHE_EVICTED:"ai.byok_cache_evicted",
  INFERENCE_RUN:     "ai.inference_run",
  CAPABILITY_INVOKED:"ai.capability_invoked",
} as const;
export type AiEventCode = typeof Ai[keyof typeof Ai];

// ── Schema / metadata authoring (schema_authoring_event — priority 35) ────────
// Pattern: ^schema\.[a-z][a-z0-9_]*$   ops: create|update|delete|execute|approve|reject
// allowed_scope: either (fires in all planes)
export const Schema = {
  ENTITY_PUBLISHED: "schema.entity_published",
  ENTITY_RETIRED:   "schema.entity_retired",
  FIELD_ADDED:      "schema.field_added",
  FIELD_REMOVED:    "schema.field_removed",
  LIFECYCLE_CHANGED:"schema.lifecycle_changed",
  POLICY_APPLIED:   "schema.policy_applied",
} as const;
export type SchemaEventCode = typeof Schema[keyof typeof Schema];

// ── Notification dispatch (notification_event — priority 38) ─────────────────
// Pattern: ^notification\.[a-z][a-z0-9_]*$   ops: execute only
// actors: service_account|bot|system only
export const Notification = {
  SENT:   "notification.sent",
  FAILED: "notification.failed",
} as const;
export type NotificationEventCode = typeof Notification[keyof typeof Notification];

// ── Configuration changes (config_change_event — priority 48) ────────────────
// Pattern: ^config\.[a-z][a-z0-9_]*$   ops: create|update|delete
// reason_required = true   allowed_scope: either
export const Config = {
  SETTING_CHANGED:     "config.setting_changed",
  MODULE_TOGGLED:      "config.module_toggled",
  INTEGRATION_UPDATED: "config.integration_updated",
  BLUEPRINT_APPLIED:   "config.blueprint_applied",
  BLUEPRINT_REMOVED:   "config.blueprint_removed",
} as const;
export type ConfigEventCode = typeof Config[keyof typeof Config];

// ── Platform / system lifecycle (platform_system_event — priority 50) ─────────
// Pattern: ^(system|platform)\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$  (3-part codes)
// actors: service_account|bot|system only   allowed_scope: either
export const System = {
  SERVER_BOOT:      "system.server.boot",
  SERVER_SHUTDOWN:  "system.server.shutdown",
  WORKER_START:     "system.worker.start",
  WORKER_STOP:      "system.worker.stop",
  SCHEDULER_START:  "system.scheduler.start",
  DB_MIGRATION:     "system.db.migration",
} as const;
export type SystemEventCode = typeof System[keyof typeof System];

// ── Generic action catch-all (generic_action_event — priority 55) ─────────────
// Pattern: ^action\.[a-z][a-z0-9_]*$   ops: execute|import|export
export const Action = {
  EXECUTED:      "action.executed",
  BULK_EXECUTED: "action.bulk_executed",
  EXPORTED:      "action.exported",
} as const;
export type ActionEventCode = typeof Action[keyof typeof Action];

// ── Contract code literals (sealed set — matches audit_event_contract.code) ───

export const ContractCode = {
  PCI_EVENT:              "pci_event",
  PII_ACCESS_EVENT:       "pii_access_event",
  PII_MODIFICATION_EVENT: "pii_modification_event",
  AUDIT_SYSTEM_EVENT:     "audit_system_event",
  IAM_AUTHENTICATION:     "iam_authentication_event",
  IAM_SESSION:            "iam_session_event",
  IAM_AUTHORIZATION:      "iam_authorization_event",
  IAM_GENERAL:            "iam_general_event",
  ENTITY_ROW_CHANGE:      "entity_row_change_event",
  ENTITY_ACCESS:          "entity_access_event",
  FINANCE_PERIOD:         "finance_period_event",
  ENTITY_BUSINESS:        "entity_business_event",
  INBOX_ROUTING:          "inbox_routing_event",
  INTEGRATION:            "integration_event",
  DATA_IMPORT:            "data_import_event",
  AI_SUPPORT:             "ai_support_event",
  AI:                     "ai_event",
  SCHEMA_AUTHORING:       "schema_authoring_event",
  NOTIFICATION:           "notification_event",
  CONFIG_CHANGE:          "config_change_event",
  PLATFORM_SYSTEM:        "platform_system_event",
  GENERIC_ACTION:         "generic_action_event",
} as const;
export type ContractCodeValue = typeof ContractCode[keyof typeof ContractCode];

// ── Master union of all app-emitted event codes ───────────────────────────────

export type AuditEventCode =
  | PciEventCode
  | PiiEventCode
  | AuditSelfEventCode
  | IamAuthEventCode
  | IamSessionEventCode
  | IamAuthzEventCode
  | IamGeneralEventCode
  | RecordAccessEventCode
  | RecordEventCode
  | PeriodEventCode
  | InboxEventCode
  | IntegrationEventCode
  | ImportEventCode
  | AiSupportEventCode
  | AiEventCode
  | SchemaEventCode
  | NotificationEventCode
  | ConfigEventCode
  | SystemEventCode
  | ActionEventCode;
