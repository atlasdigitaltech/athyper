/**
 * Entity Page Descriptor Types
 *
 * Types for the Entity Page Descriptor system.
 * The backend is authoritative for all UI orchestration:
 * what tabs to show, which actions are available, what badges to display,
 * and what view mode is resolved. React renders the descriptor output
 * without duplicating business logic.
 */

import type {
  ApprovalInstanceStatus,
  ApprovalTask,
  EntityClass,
  EntityFeatureFlags,
} from "./types.js";

// ============================================================================
// Reason Code Taxonomy
// ============================================================================

/**
 * Reason codes for view mode downgrades and action disabling.
 * Used to communicate WHY something was denied/downgraded.
 */
export type ReasonCode =
  | "ok"
  | "policy_denied"
  | "terminal_state"
  | "approval_pending"
  | "approval_rejected"
  | "approval_canceled"
  | "validation_failed"
  | "not_found"
  | "no_lifecycle";

// ============================================================================
// View Mode
// ============================================================================

/**
 * Resolved view mode for entity page.
 * Server may override requested mode (e.g., user requests edit but policy denies write).
 */
export type ViewMode = "view" | "edit" | "create";

// ============================================================================
// Badge Descriptor
// ============================================================================

/**
 * Badge descriptor for status indicators on entity page header.
 */
export type BadgeDescriptor = {
  /** Badge identifier (e.g., "lifecycle_state", "approval_status") */
  code: string;

  /** Display label */
  label: string;

  /** Badge visual variant */
  variant: "default" | "success" | "warning" | "destructive" | "outline";

  /** Optional icon identifier */
  icon?: string;
};

// ============================================================================
// Action Descriptor
// ============================================================================

/**
 * Action handler groups for dispatcher routing.
 */
export type ActionGroup = "lifecycle" | "approval" | "entity" | "posting";

/**
 * Action descriptor for entity page action bar.
 * The frontend just calls POST .../actions/:actionCode and the server routes it.
 */
export type ActionDescriptor = {
  /** Unique action code (e.g., "submit_for_approval", "approve", "delete") */
  code: string;

  /** Display label */
  label: string;

  /** Dispatcher routing key (e.g., "lifecycle.submit", "approval.approve") */
  handler: `${ActionGroup}.${string}`;

  /** Button visual variant */
  variant: "default" | "destructive" | "outline" | "ghost";

  /** Optional icon identifier */
  icon?: string;

  /** Whether action is currently executable */
  enabled: boolean;

  /** Reason why action is disabled (if !enabled) */
  disabledReason?: ReasonCode;

  /** Whether action requires user confirmation before execution */
  requiresConfirmation: boolean;

  /** Custom confirmation message (if requiresConfirmation) */
  confirmationMessage?: string;
};

// ============================================================================
// Tab Descriptor
// ============================================================================

/**
 * Tab descriptor for entity page tab bar.
 */
export type TabDescriptor = {
  /** Tab code (e.g., "details", "lifecycle", "approvals", "audit") */
  code: string;

  /** Display label */
  label: string;

  /** Optional icon identifier */
  icon?: string;

  /** Whether tab is enabled (visible) */
  enabled: boolean;

  /** Optional badge text (e.g., "3" for pending task count) */
  badge?: string;
};

// ============================================================================
// Section Descriptor
// ============================================================================

/**
 * Section descriptor for entity detail form layout.
 * Shape locked in Phase 0; actual computation deferred to Phase 1.5.
 * For MVP, the Details tab renders fields in a default 2-column layout.
 */
export type SectionDescriptor = {
  /** Section identifier */
  code: string;

  /** Display label */
  label: string;

  /** Column count for layout */
  columns: 1 | 2 | 3;

  /** Field names from CompiledModel (display order) */
  fields: string[];
};

// ============================================================================
// Static Descriptor (Cacheable)
// ============================================================================

/**
 * Static entity page descriptor.
 * Cacheable per entity type — invalidated on schema publish.
 * Contains structural information that doesn't change per-record.
 */
export type EntityPageStaticDescriptor = {
  /** Entity name */
  entityName: string;

  /** Entity classification (MASTER/CONTROL/DOCUMENT) */
  entityClass?: EntityClass;

  /** Entity feature flags */
  featureFlags: EntityFeatureFlags;

  /** Compiled model hash for cache key / ETag */
  compiledModelHash: string;

  /** Available tabs for this entity type */
  tabs: TabDescriptor[];

  /** Form layout sections (MVP: default 2-column from CompiledModel.fields) */
  sections: SectionDescriptor[];
};

// ============================================================================
// Dynamic Descriptor (Per-Request)
// ============================================================================

/**
 * Dynamic entity page descriptor.
 * Computed per-request for a specific entity instance.
 * Contains state-dependent information: view mode, badges, actions, permissions.
 */
export type EntityPageDynamicDescriptor = {
  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Resolved view mode (server may override requested mode) */
  resolvedViewMode: ViewMode;

  /** Why view mode was downgraded (if different from requested) */
  viewModeReason?: ReasonCode;

  /** Current lifecycle state (if entity has lifecycle) */
  currentState?: {
    stateId: string;
    stateCode: string;
    stateName: string;
    isTerminal: boolean;
  };

  /** Status badges for entity page header */
  badges: BadgeDescriptor[];

  /** Available actions for action bar */
  actions: ActionDescriptor[];

  /** Approval status (if entity has active approval instance) */
  approval?: {
    instanceId: string;
    status: ApprovalInstanceStatus;
    myTasks: ApprovalTask[];
  };

  /** Permission map: action code → allowed boolean */
  permissions: Record<string, boolean>;
};

// ============================================================================
// Action Execution
// ============================================================================

/**
 * Action execution request body.
 * Frontend POSTs this to execute an action.
 */
export type ActionExecutionRequest = {
  /** Action code to execute */
  actionCode: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Optional payload (e.g., reject reason, transition data) */
  payload?: Record<string, unknown>;
};

/**
 * Action execution result.
 * Structured error response with reason codes.
 */
export type ActionExecutionResult = {
  /** Whether action succeeded */
  success: boolean;

  /** Action that was executed */
  actionCode: string;

  /** Structured error (if !success) */
  error?: {
    /** Why the action failed */
    reasonCode: ReasonCode;

    /** What blocked the action (e.g., "validation", "policy", "lifecycle") */
    blockedBy: string;

    /** Field-level error details (for validation failures) */
    details?: Array<{ field?: string; message: string }>;
  };

  /** Updated descriptor after successful action (for UI refresh) */
  updatedDescriptor?: EntityPageDynamicDescriptor;
};
