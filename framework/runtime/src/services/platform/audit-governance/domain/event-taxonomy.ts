/**
 * Audit Event Taxonomy Registry
 *
 * Single source of truth for all audit event types: severity defaults,
 * required fields, redaction rules, privileged flags, and schema versions.
 * Tested as part of CI to prevent event payload drift.
 */

import type { AuditEventType, AuditEventSeverity } from "../../workflow-engine/audit/types.js";

// ============================================================================
// Types
// ============================================================================

export type EventCategory =
  | "workflow"
  | "step"
  | "action"
  | "admin"
  | "sla"
  | "entity"
  | "error"
  | "recovery";

export interface EventTaxonomyEntry {
  /** Default severity for this event type */
  severity: AuditEventSeverity;

  /** Logical category */
  category: EventCategory;

  /** Fields that must be present on the event */
  requiredFields: string[];

  /** Whether viewing this event requires elevated audit access */
  privileged: boolean;

  /** Field paths in `details` JSONB to redact at ingestion time */
  redactionRules: string[];

  /** Current schema version for this event type's payload shape */
  schemaVersion: number;
}

// ============================================================================
// Base required fields (shared by all events)
// ============================================================================

const BASE_FIELDS = ["instanceId", "entity", "workflow", "actor"] as const;

// ============================================================================
// Taxonomy Registry
// ============================================================================

export const AUDIT_EVENT_TAXONOMY: Record<AuditEventType, EventTaxonomyEntry> = {
  // -- Workflow lifecycle events -----------------------------------------
  "workflow.created": {
    severity: "info",
    category: "workflow",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "workflow.started": {
    severity: "info",
    category: "workflow",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "workflow.approved": {
    severity: "info",
    category: "workflow",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "workflow.rejected": {
    severity: "info",
    category: "workflow",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "workflow.cancelled": {
    severity: "warning",
    category: "workflow",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "workflow.withdrawn": {
    severity: "warning",
    category: "workflow",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "workflow.expired": {
    severity: "error",
    category: "workflow",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "workflow.on_hold": {
    severity: "warning",
    category: "workflow",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "workflow.resumed": {
    severity: "info",
    category: "workflow",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },

  // -- Step events -------------------------------------------------------
  "step.activated": {
    severity: "info",
    category: "step",
    requiredFields: [...BASE_FIELDS, "stepInstanceId"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "step.completed": {
    severity: "info",
    category: "step",
    requiredFields: [...BASE_FIELDS, "stepInstanceId"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "step.skipped": {
    severity: "warning",
    category: "step",
    requiredFields: [...BASE_FIELDS, "stepInstanceId"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "step.escalated": {
    severity: "warning",
    category: "step",
    requiredFields: [...BASE_FIELDS, "stepInstanceId"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "step.auto_approved": {
    severity: "info",
    category: "step",
    requiredFields: [...BASE_FIELDS, "stepInstanceId"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },

  // -- Action events -----------------------------------------------------
  "action.approve": {
    severity: "info",
    category: "action",
    requiredFields: [...BASE_FIELDS, "action"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "action.reject": {
    severity: "info",
    category: "action",
    requiredFields: [...BASE_FIELDS, "action"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "action.request_changes": {
    severity: "info",
    category: "action",
    requiredFields: [...BASE_FIELDS, "action"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "action.delegate": {
    severity: "warning",
    category: "action",
    requiredFields: [...BASE_FIELDS, "action"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "action.escalate": {
    severity: "warning",
    category: "action",
    requiredFields: [...BASE_FIELDS, "action"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "action.reassign": {
    severity: "warning",
    category: "action",
    requiredFields: [...BASE_FIELDS, "action"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "action.comment": {
    severity: "info",
    category: "action",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },

  // -- Admin events (critical — always privileged) -----------------------
  "admin.force_approve": {
    severity: "critical",
    category: "admin",
    requiredFields: [...BASE_FIELDS, "comment"],
    privileged: true,
    redactionRules: ["ip_address"],
    schemaVersion: 1,
  },
  "admin.force_reject": {
    severity: "critical",
    category: "admin",
    requiredFields: [...BASE_FIELDS, "comment"],
    privileged: true,
    redactionRules: ["ip_address"],
    schemaVersion: 1,
  },
  "admin.reassign": {
    severity: "warning",
    category: "admin",
    requiredFields: [...BASE_FIELDS],
    privileged: true,
    redactionRules: [],
    schemaVersion: 1,
  },
  "admin.cancel": {
    severity: "critical",
    category: "admin",
    requiredFields: [...BASE_FIELDS, "comment"],
    privileged: true,
    redactionRules: [],
    schemaVersion: 1,
  },
  "admin.restart": {
    severity: "critical",
    category: "admin",
    requiredFields: [...BASE_FIELDS, "comment"],
    privileged: true,
    redactionRules: [],
    schemaVersion: 1,
  },
  "admin.override": {
    severity: "critical",
    category: "admin",
    requiredFields: [...BASE_FIELDS, "comment"],
    privileged: true,
    redactionRules: ["ip_address"],
    schemaVersion: 1,
  },

  // -- SLA events --------------------------------------------------------
  "sla.warning": {
    severity: "warning",
    category: "sla",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "sla.breach": {
    severity: "error",
    category: "sla",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "sla.escalation": {
    severity: "warning",
    category: "sla",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },

  // -- Entity events -----------------------------------------------------
  "entity.locked": {
    severity: "info",
    category: "entity",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "entity.unlocked": {
    severity: "info",
    category: "entity",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "entity.state_changed": {
    severity: "info",
    category: "entity",
    requiredFields: [...BASE_FIELDS, "previousState", "newState"],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },

  // -- Error events ------------------------------------------------------
  "error.approver_missing": {
    severity: "error",
    category: "error",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "error.user_deactivated": {
    severity: "error",
    category: "error",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },
  "error.role_mismatch": {
    severity: "error",
    category: "error",
    requiredFields: [...BASE_FIELDS],
    privileged: false,
    redactionRules: [],
    schemaVersion: 1,
  },

  // -- Recovery events ---------------------------------------------------
  "recovery.retry": {
    severity: "info",
    category: "recovery",
    requiredFields: [...BASE_FIELDS],
    privileged: true,
    redactionRules: [],
    schemaVersion: 1,
  },
  "recovery.pause": {
    severity: "warning",
    category: "recovery",
    requiredFields: [...BASE_FIELDS],
    privileged: true,
    redactionRules: [],
    schemaVersion: 1,
  },
  "recovery.resume": {
    severity: "info",
    category: "recovery",
    requiredFields: [...BASE_FIELDS],
    privileged: true,
    redactionRules: [],
    schemaVersion: 1,
  },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the taxonomy entry for an event type.
 * Returns undefined if the event type is not registered.
 */
export function getTaxonomyEntry(eventType: string): EventTaxonomyEntry | undefined {
  return AUDIT_EVENT_TAXONOMY[eventType as AuditEventType];
}

/**
 * Get the default severity for an event type, or "info" for unregistered types.
 */
export function getDefaultSeverity(eventType: string): AuditEventSeverity {
  return getTaxonomyEntry(eventType)?.severity ?? "info";
}

/**
 * Validate that an audit event has all required fields per the taxonomy.
 * Returns a list of missing field names, or an empty array if valid.
 */
export function validateAuditEvent(
  eventType: string,
  event: Record<string, unknown>,
): string[] {
  const entry = getTaxonomyEntry(eventType);
  if (!entry) return []; // Unknown event types pass validation (extensible)

  const missing: string[] = [];
  for (const field of entry.requiredFields) {
    const value = event[field];
    if (value === undefined || value === null) {
      missing.push(field);
    }
  }
  return missing;
}

/**
 * List all registered event types.
 */
export function listEventTypes(): AuditEventType[] {
  return Object.keys(AUDIT_EVENT_TAXONOMY) as AuditEventType[];
}

/**
 * List all event types in a category.
 */
export function listEventsByCategory(category: EventCategory): AuditEventType[] {
  return (Object.entries(AUDIT_EVENT_TAXONOMY) as [AuditEventType, EventTaxonomyEntry][])
    .filter(([, entry]) => entry.category === category)
    .map(([type]) => type);
}

/**
 * List all privileged event types (require elevated audit access to view).
 */
export function listPrivilegedEventTypes(): AuditEventType[] {
  return (Object.entries(AUDIT_EVENT_TAXONOMY) as [AuditEventType, EventTaxonomyEntry][])
    .filter(([, entry]) => entry.privileged)
    .map(([type]) => type);
}
