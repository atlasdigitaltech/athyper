/**
 * Approval Instance Types (Run-Time)
 *
 * Types for managing approval instances at runtime.
 * These are created when a business event triggers an approval workflow.
 */

import type {
  ApprovalActionType,
  ApprovalCondition,
  ApprovalWorkflowTemplate,
} from "../types.js";

// ============================================================================
// 2.1 Approval Instance
// ============================================================================

/**
 * Status of an approval instance
 */
export type ApprovalInstanceStatus =
  | "pending" // Created but not yet started
  | "in_progress" // Active approval in progress
  | "approved" // All required approvals obtained
  | "rejected" // Rejected by an approver
  | "cancelled" // Cancelled by requester or admin
  | "expired" // SLA expired without completion
  | "withdrawn" // Withdrawn by requester
  | "on_hold"; // Temporarily paused

/**
 * Entity lock mode
 */
export type EntityLockMode =
  | "none" // No locking
  | "soft" // Warn on edit
  | "hard"; // Prevent edits

/**
 * Entity state during approval
 */
export type EntityApprovalState =
  | "draft" // Before approval initiated
  | "pending_approval" // Awaiting approval
  | "in_review" // Being reviewed
  | "changes_requested" // Changes requested by approver
  | "approved" // Approved
  | "rejected" // Rejected
  | "cancelled"; // Cancelled

/**
 * Approval instance - the runtime representation of an approval workflow
 */
export interface ApprovalInstance {
  /** Unique instance identifier */
  id: string;

  /** Tenant this instance belongs to */
  tenantId: string;

  /** Organization unit (optional) */
  orgId?: string;

  /** The entity being approved */
  entity: {
    /** Entity type (e.g., "purchase_order") */
    type: string;
    /** Entity unique identifier */
    id: string;
    /** Entity version at time of approval initiation */
    version: number;
    /** Reference/display code */
    referenceCode?: string;
    /** Display name for the entity */
    displayName?: string;
  };

  /** Snapshot of workflow template at time of creation */
  workflowSnapshot: {
    /** Template ID */
    templateId: string;
    /** Template code */
    templateCode: string;
    /** Template version */
    templateVersion: number;
    /** Template name */
    templateName: string;
    /** Full template definition (frozen) */
    definition: ApprovalWorkflowTemplate;
  };

  /** Current instance status */
  status: ApprovalInstanceStatus;

  /** Current entity state */
  entityState: EntityApprovalState;

  /** Entity lock mode */
  lockMode: EntityLockMode;

  /** Whether entity is currently locked */
  isLocked: boolean;

  /** Requester/initiator information */
  requester: {
    userId: string;
    displayName?: string;
    email?: string;
    departmentId?: string;
    costCenterId?: string;
    orgId?: string;
  };

  /** Trigger information */
  trigger: {
    /** Event that triggered the approval */
    event: string;
    /** Trigger timestamp */
    triggeredAt: Date;
    /** Additional trigger context */
    context?: Record<string, unknown>;
  };

  /** Current active step ID(s) */
  activeStepIds: string[];

  /** Completed step IDs */
  completedStepIds: string[];

  /** Skipped step IDs */
  skippedStepIds: string[];

  /** SLA tracking */
  sla?: {
    /** Response due date */
    responseDueAt?: Date;
    /** Completion due date */
    completionDueAt?: Date;
    /** Warning triggered */
    warningTriggered?: boolean;
    /** Escalation count */
    escalationCount: number;
    /** Last escalation at */
    lastEscalationAt?: Date;
  };

  /** Final decision information */
  decision?: {
    /** Final outcome */
    outcome: "approved" | "rejected" | "cancelled" | "expired" | "withdrawn";
    /** Decision timestamp */
    decidedAt: Date;
    /** Decision maker (if applicable) */
    decidedBy?: string;
    /** Decision reason */
    reason?: string;
  };

  /** Priority (inherited from template or overridden) */
  priority: number;

  /** Tags for filtering/grouping */
  tags?: string[];

  /** Custom metadata */
  metadata?: Record<string, unknown>;

  /** Optimistic lock version (incremented on each update) */
  version: number;

  /** Audit timestamps */
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
  completedAt?: Date;
}

// ============================================================================
// 2.2 Step Instance
// ============================================================================

/**
 * Status of a step instance
 */
export type StepInstanceStatus =
  | "pending" // Not yet active
  | "active" // Currently awaiting approval
  | "approved" // Approved
  | "rejected" // Rejected
  | "skipped" // Skipped (conditions not met or auto-skip)
  | "cancelled" // Cancelled with instance
  | "expired" // SLA expired
  | "delegated"; // Delegated to another approver

/**
 * Approver assignment status
 */
export type ApproverAssignmentStatus =
  | "pending" // Awaiting action
  | "approved" // Approved
  | "rejected" // Rejected
  | "delegated" // Delegated to someone else
  | "escalated" // Escalated
  | "expired" // Did not respond in time
  | "withdrawn"; // Withdrawn

/**
 * Assigned approver in a step instance
 */
export interface AssignedApprover {
  /** Assignment ID */
  id: string;

  /** User ID of the approver */
  userId: string;

  /** Display name */
  displayName?: string;

  /** Email */
  email?: string;

  /** How this approver was resolved */
  resolvedBy: string;

  /** Resolution strategy used */
  resolutionStrategy: string;

  /** Whether this is a fallback approver */
  isFallback: boolean;

  /** Assignment status */
  status: ApproverAssignmentStatus;

  /** Assignment timestamp */
  assignedAt: Date;

  /** Response timestamp */
  respondedAt?: Date;

  /** Action taken */
  actionTaken?: ApprovalActionType;

  /** Comment/reason provided */
  comment?: string;

  /** If delegated, to whom */
  delegatedTo?: {
    userId: string;
    displayName?: string;
    reason?: string;
    delegatedAt: Date;
  };

  /** Reminder count */
  reminderCount: number;

  /** Last reminder sent */
  lastReminderAt?: Date;
}

/**
 * Step instance - materialized approval step at runtime
 */
export interface ApprovalStepInstance {
  /** Step instance ID */
  id: string;

  /** Parent approval instance ID */
  instanceId: string;

  /** Original step definition ID */
  stepDefinitionId: string;

  /** Step name */
  name: string;

  /** Step level (L1, L2, etc.) */
  level: number;

  /** Step order */
  order: number;

  /** Step type */
  type: "sequential" | "parallel" | "conditional";

  /** Approval requirement */
  requirement: "any" | "all" | "majority" | "quorum";

  /** Quorum configuration */
  quorum?: {
    type: "count" | "percentage";
    value: number;
    /** Calculated required count */
    requiredCount: number;
  };

  /** Step status */
  status: StepInstanceStatus;

  /** Resolved and assigned approvers */
  approvers: AssignedApprover[];

  /** Dependencies (step IDs that must complete first) */
  dependsOn: string[];

  /** Whether all dependencies are satisfied */
  dependenciesSatisfied: boolean;

  /** Conditions for this step (from definition) */
  conditions?: ApprovalCondition[];

  /** Whether conditions were evaluated as true */
  conditionsMet?: boolean;

  /** Skip reason if skipped */
  skipReason?: string;

  /** Whether step was auto-approved */
  autoApproved?: boolean;

  /** Auto-approve reason */
  autoApproveReason?: string;

  /** Step-specific SLA */
  sla?: {
    responseDueAt?: Date;
    completionDueAt?: Date;
    warningTriggered?: boolean;
    escalationCount: number;
  };

  /** Approval counts */
  approvalCounts: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    delegated: number;
  };

  /** Timestamps */
  activatedAt?: Date;
  completedAt?: Date;
}

// ============================================================================
// Approval Actions (recorded actions)
// ============================================================================

/**
 * Recorded approval action
 */
export interface ApprovalActionRecord {
  /** Action record ID */
  id: string;

  /** Approval instance ID */
  instanceId: string;

  /** Step instance ID */
  stepInstanceId: string;

  /** Approver assignment ID */
  assignmentId: string;

  /** User who performed the action */
  userId: string;

  /** User display name */
  userDisplayName?: string;

  /** Action type */
  action: ApprovalActionType;

  /** Comment/reason */
  comment?: string;

  /** Additional fields provided with action */
  additionalFields?: Record<string, unknown>;

  /** Delegation target (for delegate action) */
  delegationTarget?: {
    userId: string;
    displayName?: string;
    reason?: string;
  };

  /** Action timestamp */
  performedAt: Date;

  /** IP address (for audit) */
  ipAddress?: string;

  /** User agent (for audit) */
  userAgent?: string;
}

// ============================================================================
// 2.3 Entity State Management
// ============================================================================

/**
 * Entity lock record
 */
export interface EntityLock {
  /** Lock ID */
  id: string;

  /** Entity type */
  entityType: string;

  /** Entity ID */
  entityId: string;

  /** Tenant ID */
  tenantId: string;

  /** Approval instance that holds the lock */
  approvalInstanceId: string;

  /** Lock mode */
  mode: EntityLockMode;

  /** Lock acquired at */
  lockedAt: Date;

  /** Lock expires at (optional, for soft locks) */
  expiresAt?: Date;

  /** Who acquired the lock */
  lockedBy: string;
}

/**
 * Entity state transition record
 */
export interface EntityStateTransition {
  /** Transition ID */
  id: string;

  /** Entity type */
  entityType: string;

  /** Entity ID */
  entityId: string;

  /** Tenant ID */
  tenantId: string;

  /** Approval instance ID */
  approvalInstanceId: string;

  /** From state */
  fromState: EntityApprovalState;

  /** To state */
  toState: EntityApprovalState;

  /** Transition reason */
  reason: string;

  /** Transition timestamp */
  transitionedAt: Date;

  /** Who triggered the transition */
  transitionedBy: string;
}

// ============================================================================
// Concurrency Control
// ============================================================================

/**
 * Concurrency error thrown when optimistic lock fails
 */
export class ConcurrencyError extends Error {
  constructor(
    public readonly instanceId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Concurrency conflict: instance ${instanceId} was modified. ` +
      `Expected version ${expectedVersion}, found ${actualVersion}`
    );
    this.name = "ConcurrencyError";
  }
}

/**
 * Instance lock information
 */
export interface InstanceLock {
  /** Instance ID */
  instanceId: string;

  /** Lock owner (user ID or process ID) */
  lockOwner: string;

  /** Lock token for release */
  lockToken: string;

  /** Lock acquired at */
  acquiredAt: Date;

  /** Lock expires at */
  expiresAt: Date;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Input for creating an approval instance
 */
export interface CreateApprovalInstanceInput {
  /** Entity being approved */
  entity: {
    type: string;
    id: string;
    version: number;
    referenceCode?: string;
    displayName?: string;
    /** Entity data for condition evaluation */
    data?: Record<string, unknown>;
  };

  /** Requester information */
  requester: {
    userId: string;
    displayName?: string;
    email?: string;
    departmentId?: string;
    costCenterId?: string;
    orgId?: string;
    managerId?: string;
    roles?: string[];
  };

  /** Trigger event */
  triggerEvent: string;

  /** Trigger context */
  triggerContext?: Record<string, unknown>;

  /** Organization unit (optional) */
  orgId?: string;

  /** Override template code (optional, otherwise auto-detected) */
  templateCode?: string;

  /** Priority override */
  priority?: number;

  /** Tags */
  tags?: string[];

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of creating an approval instance
 */
export interface CreateApprovalInstanceResult {
  /** Whether creation succeeded */
  success: boolean;

  /** Created instance (if successful) */
  instance?: ApprovalInstance;

  /** Created step instances */
  stepInstances?: ApprovalStepInstance[];

  /** Entity lock (if created) */
  entityLock?: EntityLock;

  /** Error message (if failed) */
  error?: string;

  /** Error code */
  errorCode?: string;

  /** Warnings (non-fatal issues) */
  warnings?: string[];
}

/**
 * Query options for listing instances
 */
export interface ApprovalInstanceQueryOptions {
  /** Filter by status */
  status?: ApprovalInstanceStatus | ApprovalInstanceStatus[];

  /** Filter by entity type */
  entityType?: string;

  /** Filter by entity ID */
  entityId?: string;

  /** Filter by requester */
  requesterId?: string;

  /** Filter by approver (user has pending approval) */
  pendingApproverId?: string;

  /** Filter by template code */
  templateCode?: string;

  /** Filter by date range */
  createdAfter?: Date;
  createdBefore?: Date;

  /** Filter by completion date */
  completedAfter?: Date;
  completedBefore?: Date;

  /** Filter by priority */
  minPriority?: number;
  maxPriority?: number;

  /** Filter by tags */
  tags?: string[];

  /** Include completed instances */
  includeCompleted?: boolean;

  /** Pagination */
  limit?: number;
  offset?: number;

  /** Sort */
  sortBy?: "createdAt" | "updatedAt" | "priority" | "status";
  sortDirection?: "asc" | "desc";
}

/**
 * Approval instance repository interface
 */
export interface IApprovalInstanceRepository {
  // Instance CRUD
  getById(tenantId: string, instanceId: string): Promise<ApprovalInstance | undefined>;
  getByEntityId(tenantId: string, entityType: string, entityId: string): Promise<ApprovalInstance[]>;
  list(tenantId: string, options?: ApprovalInstanceQueryOptions): Promise<ApprovalInstance[]>;
  create(tenantId: string, instance: Omit<ApprovalInstance, "id" | "createdAt">): Promise<ApprovalInstance>;
  update(tenantId: string, instanceId: string, updates: Partial<ApprovalInstance>): Promise<ApprovalInstance>;
  delete(tenantId: string, instanceId: string): Promise<void>;

  // Step instance operations
  getStepInstances(tenantId: string, instanceId: string): Promise<ApprovalStepInstance[]>;
  getStepInstance(tenantId: string, stepInstanceId: string): Promise<ApprovalStepInstance | undefined>;
  createStepInstances(tenantId: string, steps: Omit<ApprovalStepInstance, "id">[]): Promise<ApprovalStepInstance[]>;
  updateStepInstance(tenantId: string, stepInstanceId: string, updates: Partial<ApprovalStepInstance>): Promise<ApprovalStepInstance>;

  // Action records
  recordAction(tenantId: string, action: Omit<ApprovalActionRecord, "id">): Promise<ApprovalActionRecord>;
  getActionHistory(tenantId: string, instanceId: string): Promise<ApprovalActionRecord[]>;

  // Entity locks
  acquireLock(tenantId: string, lock: Omit<EntityLock, "id">): Promise<EntityLock>;
  releaseLock(tenantId: string, entityType: string, entityId: string): Promise<void>;
  getLock(tenantId: string, entityType: string, entityId: string): Promise<EntityLock | undefined>;

  // State transitions
  recordStateTransition(tenantId: string, transition: Omit<EntityStateTransition, "id">): Promise<EntityStateTransition>;
  getStateTransitions(tenantId: string, entityType: string, entityId: string): Promise<EntityStateTransition[]>;

  // Queries for dashboards
  countByStatus(tenantId: string): Promise<Record<ApprovalInstanceStatus, number>>;
  getPendingForUser(tenantId: string, userId: string): Promise<ApprovalInstance[]>;

  // Optimistic locking
  /**
   * Update instance with optimistic lock check.
   * Throws ConcurrencyError if expectedVersion doesn't match current version.
   */
  updateWithLock?(
    tenantId: string,
    instanceId: string,
    updates: Partial<ApprovalInstance>,
    expectedVersion: number
  ): Promise<ApprovalInstance>;

  /**
   * Acquire an instance-level lock for exclusive access.
   * Returns a lock token that must be released after use.
   */
  acquireInstanceLock?(
    tenantId: string,
    instanceId: string,
    lockOwner: string,
    timeoutMs?: number
  ): Promise<{ lockToken: string; expiresAt: Date } | null>;

  /**
   * Release an instance-level lock.
   */
  releaseInstanceLock?(
    tenantId: string,
    instanceId: string,
    lockToken: string
  ): Promise<boolean>;
}

/**
 * Approval instance service interface
 */
export interface IApprovalInstanceService {
  /** Create a new approval instance */
  createInstance(tenantId: string, input: CreateApprovalInstanceInput): Promise<CreateApprovalInstanceResult>;

  /** Get instance by ID */
  getInstance(tenantId: string, instanceId: string): Promise<ApprovalInstance | undefined>;

  /** Get instances for an entity */
  getInstancesForEntity(tenantId: string, entityType: string, entityId: string): Promise<ApprovalInstance[]>;

  /** List instances */
  listInstances(tenantId: string, options?: ApprovalInstanceQueryOptions): Promise<ApprovalInstance[]>;

  /** Get step instances for an approval */
  getStepInstances(tenantId: string, instanceId: string): Promise<ApprovalStepInstance[]>;

  /** Get pending approvals for a user */
  getPendingForUser(tenantId: string, userId: string): Promise<ApprovalInstance[]>;

  /** Cancel an instance */
  cancelInstance(tenantId: string, instanceId: string, userId: string, reason?: string): Promise<ApprovalInstance>;

  /** Withdraw an instance (by requester) */
  withdrawInstance(tenantId: string, instanceId: string, userId: string, reason?: string): Promise<ApprovalInstance>;

  /** Put instance on hold */
  holdInstance(tenantId: string, instanceId: string, userId: string, reason?: string): Promise<ApprovalInstance>;

  /** Release instance from hold */
  releaseInstance(tenantId: string, instanceId: string, userId: string): Promise<ApprovalInstance>;

  /** Check entity lock */
  checkEntityLock(tenantId: string, entityType: string, entityId: string): Promise<EntityLock | undefined>;

  /** Get action history */
  getActionHistory(tenantId: string, instanceId: string): Promise<ApprovalActionRecord[]>;
}

/**
 * Entity state handler interface (to be implemented by consuming applications)
 */
export interface IEntityStateHandler {
  /** Get current entity state */
  getEntityState(tenantId: string, entityType: string, entityId: string): Promise<string | undefined>;

  /** Update entity state */
  updateEntityState(
    tenantId: string,
    entityType: string,
    entityId: string,
    newState: EntityApprovalState,
    context: { instanceId: string; reason: string }
  ): Promise<void>;

  /** Lock entity for edits */
  lockEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    mode: EntityLockMode,
    context: { instanceId: string }
  ): Promise<void>;

  /** Unlock entity */
  unlockEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    context: { instanceId: string }
  ): Promise<void>;

  /** Check if entity can be edited */
  canEditEntity(tenantId: string, entityType: string, entityId: string): Promise<{ allowed: boolean; reason?: string }>;
}
