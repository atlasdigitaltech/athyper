/**
 * META Engine Service Contracts
 *
 * Pure interface definitions for all META Engine services.
 * These contracts define the public API that implementations must adhere to.
 *
 * Zero implementation - just contracts for:
 * - MetaRegistry (entity/version CRUD)
 * - MetaCompiler (schema → compiled IR)
 * - PolicyGate (policy evaluation)
 * - AuditLogger (audit trail)
 * - GenericDataAPI (generic read operations)
 */

import type {
  ActionExecutionRequest,
  ActionExecutionResult,
  EntityPageDynamicDescriptor,
  EntityPageStaticDescriptor,
  ViewMode,
} from "./descriptor-types.js";
import type {
  ApprovalAssignmentSnapshot,
  ApprovalCreationRequest,
  ApprovalCreationResult,
  ApprovalDecisionRequest,
  ApprovalDecisionResult,
  ApprovalEscalation,
  ApprovalEvent,
  ApprovalInstance,
  ApprovalTask,
  ApprovalTemplate,
  ApprovalTemplateCreateInput,
  ApprovalTemplateRule,
  ApprovalTemplateStage,
  ApprovalTemplateUpdateInput,
  AuditEvent,
  AuditEventType,
  CompiledApprovalTemplate,
  CompiledLifecycleRoute,
  CompiledModel,
  Entity,
  EntityClass,
  EntityFeatureFlags,
  EntityLifecycleEvent,
  EntityLifecycleInstance,
  EntitySchema,
  EntityVersion,
  HealthCheckResult,
  LifecycleState,
  LifecycleTimerSchedule,
  LifecycleTimerType,
  LifecycleTransitionRequest,
  LifecycleTransitionResult,
  ListOptions,
  NumberingRule,
  PaginatedResponse,
  PolicyDecision,
  RequestContext,
  TemplateValidationResult,
  ValidationResult,
} from "./types.js";
import type { JobQueue } from "../jobs/types.js";

// ============================================================================
// Meta Registry Service
// ============================================================================

/**
 * Meta Registry Service
 *
 * Manages entity definitions and versions.
 * Provides CRUD operations for entities, versions, and fields.
 */
export interface MetaRegistry {
  // ===== Entity Management =====

  /**
   * Create a new entity
   */
  createEntity(
    name: string,
    description: string | undefined,
    ctx: RequestContext,
    options?: {
      kind?: string;
      moduleId?: string;
      tableSchema?: string;
      tableName?: string;
      governanceLevel?: string;
      engineTag?: string;
    },
  ): Promise<Entity>;

  /**
   * Get entity by name
   */
  getEntity(name: string): Promise<Entity | undefined>;

  /**
   * List all entities
   */
  listEntities(options?: ListOptions): Promise<PaginatedResponse<Entity>>;

  /**
   * Update entity metadata
   */
  updateEntity(
    name: string,
    updates: Partial<Pick<Entity, "description" | "activeVersion">>,
    ctx: RequestContext,
  ): Promise<Entity>;

  /**
   * Delete entity (and all versions)
   */
  deleteEntity(name: string, ctx: RequestContext): Promise<void>;

  // ===== Version Management =====

  /**
   * Create a new version for an entity
   */
  createVersion(
    entityName: string,
    version: string,
    schema: EntitySchema,
    ctx: RequestContext,
  ): Promise<EntityVersion>;

  /**
   * Get specific version
   */
  getVersion(
    entityName: string,
    version: string,
  ): Promise<EntityVersion | undefined>;

  /**
   * Get active version for entity
   */
  getActiveVersion(entityName: string): Promise<EntityVersion | undefined>;

  /**
   * List all versions for entity
   */
  listVersions(
    entityName: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<EntityVersion>>;

  /**
   * Activate a version (makes it the active version)
   */
  activateVersion(
    entityName: string,
    version: string,
    ctx: RequestContext,
  ): Promise<EntityVersion>;

  /**
   * Deactivate a version
   */
  deactivateVersion(
    entityName: string,
    version: string,
    ctx: RequestContext,
  ): Promise<EntityVersion>;

  /**
   * Update version schema
   */
  updateVersion(
    entityName: string,
    version: string,
    schema: EntitySchema,
    ctx: RequestContext,
  ): Promise<EntityVersion>;

  /**
   * Delete version
   */
  deleteVersion(
    entityName: string,
    version: string,
    ctx: RequestContext,
  ): Promise<void>;
}

// ============================================================================
// Meta Compiler Service
// ============================================================================

/**
 * Meta Compiler Service
 *
 * Compiles entity schemas into optimized Compiled Model IR.
 * Handles caching, validation, and cache invalidation.
 */
export interface MetaCompiler {
  /**
   * Compile entity version to Compiled Model IR
   * Uses cache if available and valid
   */
  compile(entityName: string, version: string): Promise<CompiledModel>;

  /**
   * Force recompilation (bypass cache)
   */
  recompile(entityName: string, version: string): Promise<CompiledModel>;

  /**
   * Validate entity schema
   * Checks for errors before compilation
   */
  validate(schema: EntitySchema): Promise<ValidationResult>;

  /**
   * Invalidate cache for entity version
   */
  invalidateCache(entityName: string, version: string): Promise<void>;

  /**
   * Get compiled model from cache (if exists)
   */
  getCached(
    entityName: string,
    version: string,
  ): Promise<CompiledModel | undefined>;

  /**
   * Precompile all active entity versions
   * Useful for warming cache on startup
   */
  precompileAll(): Promise<CompiledModel[]>;

  /**
   * Health check
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// Policy Gate Service
// ============================================================================

/**
 * Policy Gate Service
 *
 * Evaluates policies to allow or deny actions on resources.
 * Handles policy compilation, evaluation, and caching.
 *
 * Phase 11: Enhanced with explainable decisions and indexed policy structure
 */
export interface PolicyGate {
  /**
   * Check if action is allowed on resource
   * Returns true if allowed, false if denied
   *
   * @deprecated Use authorize() for explainable decisions
   */
  can(
    action: string,
    resource: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<boolean>;

  /**
   * Authorize an action with explainable decision (Phase 11.3)
   * Returns full decision with matched rule, reason, and audit trail
   *
   * This is the primary method for authorization checks in Phase 11+
   */
  authorize(
    action: string,
    resource: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<PolicyDecision>;

  /**
   * Enforce policy (throws if denied)
   * Use this to enforce policies before performing actions
   */
  enforce(
    action: string,
    resource: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<void>;

  /**
   * Get all applicable policies for action/resource
   */
  getPolicies(
    action: string,
    resource: string,
  ): Promise<Array<{ name: string; effect: string }>>;

  /**
   * Evaluate a single policy
   */
  evaluatePolicy(
    policyName: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<boolean>;

  /**
   * Get allowed fields for an action/resource
   * Returns array of field names that the context has access to
   * - Empty array = no fields accessible (should have been denied by can())
   * - Undefined/null = all fields accessible (no field-level restrictions)
   */
  getAllowedFields(
    action: string,
    resource: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<string[] | null>;

  /**
   * Batch authorize multiple action/resource pairs (Phase 0: Entity Page Descriptor)
   *
   * Optimized for page-load scenarios where multiple permissions need checking.
   * Groups by resource to minimize compile calls.
   *
   * @returns Map keyed by "action:resource" → PolicyDecision
   */
  authorizeMany(
    checks: Array<{ action: string; resource: string }>,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<Map<string, PolicyDecision>>;

  /**
   * Invalidate policy cache
   */
  invalidatePolicyCache(resource: string): Promise<void>;

  /**
   * Health check
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// Audit Logger Service
// ============================================================================

/**
 * Audit Query Filters
 */
export type AuditQueryFilters = {
  /** Filter by event type(s) */
  eventType?: AuditEventType | AuditEventType[];

  /** Filter by user ID */
  userId?: string;

  /** Filter by tenant ID */
  tenantId?: string;

  /** Filter by resource */
  resource?: string;

  /** Start date (inclusive) */
  startDate?: Date;

  /** End date (inclusive) */
  endDate?: Date;

  /** Result filter */
  result?: "success" | "failure";

  /** Pagination */
  page?: number;
  pageSize?: number;
};

/**
 * Audit Logger Service
 *
 * Logs all metadata changes and policy decisions.
 * Provides audit trail for compliance and debugging.
 */
export interface AuditLogger {
  /**
   * Log an audit event
   */
  log(event: Omit<AuditEvent, "eventId" | "timestamp">): Promise<void>;

  /**
   * Query audit events
   */
  query(filters: AuditQueryFilters): Promise<PaginatedResponse<AuditEvent>>;

  /**
   * Get audit event by ID
   */
  getEvent(eventId: string): Promise<AuditEvent | undefined>;

  /**
   * Get recent audit events (last N events)
   */
  getRecent(limit?: number): Promise<AuditEvent[]>;

  /**
   * Get audit trail for specific resource
   */
  getResourceAudit(
    resource: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<AuditEvent>>;

  /**
   * Get audit trail for specific user
   */
  getUserAudit(
    userId: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<AuditEvent>>;

  /**
   * Get audit trail for specific tenant
   */
  getTenantAudit(
    tenantId: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<AuditEvent>>;

  /**
   * Health check
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// Generic Data API Service
// ============================================================================

/**
 * Result of a bulk operation
 * Tracks both successes and failures for partial completion handling
 */
export type BulkOperationResult<T> = {
  /** Total number of items requested */
  total: number;

  /** Number of successful operations */
  succeeded: number;

  /** Number of failed operations */
  failed: number;

  /** Successfully processed items */
  success: T[];

  /** Failed items with error details */
  errors: Array<{
    index: number;
    id?: string;
    error: string;
  }>;
};

/**
 * Generic Data API Service
 *
 * Provides generic CRUD operations for all META-defined entities.
 * Uses compiled models for type-safe queries with tenant isolation.
 *
 * MVP: Read-only (list + get)
 * Future: Create, update, delete
 */
export interface GenericDataAPI {
  /**
   * List records for entity
   * Automatically filters by tenant and applies policies
   */
  list<T = unknown>(
    entityName: string,
    ctx: RequestContext,
    options?: ListOptions,
  ): Promise<PaginatedResponse<T>>;

  /**
   * Get single record by ID
   * Automatically filters by tenant and applies policies
   */
  get<T = unknown>(
    entityName: string,
    id: string,
    ctx: RequestContext,
  ): Promise<T | undefined>;

  /**
   * Count records for entity
   * Automatically filters by tenant
   */
  count(
    entityName: string,
    ctx: RequestContext,
    filters?: Record<string, unknown>,
  ): Promise<number>;

  // ===== Write Operations =====

  /**
   * Create a new record
   * Validates data against schema, checks create policy, and logs audit event
   */
  create<T = unknown>(
    entityName: string,
    data: unknown,
    ctx: RequestContext,
  ): Promise<T>;

  /**
   * Update a record
   * Validates data against schema, checks update policy, and logs audit event
   */
  update<T = unknown>(
    entityName: string,
    id: string,
    data: Partial<unknown>,
    ctx: RequestContext,
  ): Promise<T>;

  /**
   * Delete a record (soft delete)
   * Sets deleted_at timestamp instead of removing the record
   * Checks delete policy and logs audit event
   */
  delete(entityName: string, id: string, ctx: RequestContext): Promise<void>;

  /**
   * Restore a soft-deleted record
   * Clears the deleted_at timestamp
   * Checks update policy and logs audit event
   */
  restore(entityName: string, id: string, ctx: RequestContext): Promise<void>;

  /**
   * Permanently delete a record
   * Physically removes the record from database (hard delete)
   * Checks delete policy and logs audit event
   * WARNING: This cannot be undone
   */
  permanentDelete(
    entityName: string,
    id: string,
    ctx: RequestContext,
  ): Promise<void>;

  // ===== Bulk Operations =====

  /**
   * Create multiple records in a single transaction
   * All records succeed or all fail (atomic operation)
   * Validates all data against schema before processing
   * Checks create policy and logs audit events
   */
  bulkCreate<T = unknown>(
    entityName: string,
    data: unknown[],
    ctx: RequestContext,
  ): Promise<BulkOperationResult<T>>;

  /**
   * Update multiple records in a single transaction
   * All updates succeed or all fail (atomic operation)
   * Validates all data against schema before processing
   * Checks update policy and logs audit events
   * Supports optimistic locking via _version field
   */
  bulkUpdate<T = unknown>(
    entityName: string,
    updates: Array<{ id: string; data: Partial<unknown> }>,
    ctx: RequestContext,
  ): Promise<BulkOperationResult<T>>;

  /**
   * Delete multiple records in a single transaction (soft delete)
   * All deletions succeed or all fail (atomic operation)
   * Sets deleted_at timestamp instead of removing records
   * Checks delete policy and logs audit events
   */
  bulkDelete(
    entityName: string,
    ids: string[],
    ctx: RequestContext,
  ): Promise<BulkOperationResult<void>>;

  /**
   * Health check
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// Meta Store Service (Combines Registry + Compiler)
// ============================================================================

/**
 * Meta Store Service
 *
 * High-level service that combines MetaRegistry and MetaCompiler.
 * Provides convenient methods for common workflows.
 */
export interface MetaStore {
  /**
   * Get or compile entity version
   * Returns compiled model, compiling if necessary
   */
  getCompiledModel(
    entityName: string,
    version?: string, // If omitted, uses active version
  ): Promise<CompiledModel>;

  /**
   * Get entity with active version compiled
   */
  getEntityWithCompiledModel(
    entityName: string,
  ): Promise<{ entity: Entity; compiledModel: CompiledModel }>;

  /**
   * Create entity with initial version
   * Convenience method that creates entity + version in one call
   */
  createEntityWithVersion(
    name: string,
    description: string | undefined,
    schema: EntitySchema,
    ctx: RequestContext,
  ): Promise<{ entity: Entity; version: EntityVersion }>;

  /**
   * Publish new version (create + activate)
   * Convenience method for version release workflow
   */
  publishVersion(
    entityName: string,
    version: string,
    schema: EntitySchema,
    ctx: RequestContext,
  ): Promise<{ version: EntityVersion; compiledModel: CompiledModel }>;

  /**
   * Get schema for entity (active version)
   */
  getSchema(entityName: string): Promise<EntitySchema | undefined>;

  /**
   * Health check
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// Lifecycle Route Compiler Service (Phase 12.1)
// ============================================================================

/**
 * Lifecycle Route Compiler Service
 *
 * Compiles entity lifecycle routing rules into optimized lookup structures.
 * Resolves which lifecycle applies to an entity based on conditions and priority.
 *
 * Phase 12.1: Route compiler
 * - Compile meta.entity_lifecycle → meta.entity_lifecycle_route_compiled
 * - Runtime resolution: entity_name + context → lifecycle_id
 */
export interface LifecycleRouteCompiler {
  /**
   * Compile lifecycle routes for an entity
   * Builds indexed structure from meta.entity_lifecycle rules
   */
  compile(
    entityName: string,
    tenantId: string,
  ): Promise<CompiledLifecycleRoute>;

  /**
   * Force recompilation (bypass cache)
   */
  recompile(
    entityName: string,
    tenantId: string,
  ): Promise<CompiledLifecycleRoute>;

  /**
   * Resolve which lifecycle applies to an entity
   * Evaluates conditions against context and record data
   * Returns lifecycle ID or undefined if no match
   */
  resolveLifecycle(
    entityName: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<string | undefined>;

  /**
   * Get compiled route from cache (if exists)
   */
  getCached(
    entityName: string,
    tenantId: string,
  ): Promise<CompiledLifecycleRoute | undefined>;

  /**
   * Invalidate cache for entity
   */
  invalidateCache(entityName: string, tenantId: string): Promise<void>;

  /**
   * Precompile all entity lifecycle routes
   * Useful for warming cache on startup
   */
  precompileAll(tenantId: string): Promise<CompiledLifecycleRoute[]>;

  /**
   * Health check
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// Lifecycle Manager Service (Phase 12.2 & 12.3)
// ============================================================================

/**
 * Available Transition
 *
 * Represents a transition that is available to the current user.
 */
export type AvailableTransition = {
  /** Transition ID */
  transitionId: string;

  /** Operation code */
  operationCode: string;

  /** Target state ID */
  toStateId: string;

  /** Target state code */
  toStateCode: string;

  /** Whether user is authorized */
  authorized: boolean;

  /** Reason if not authorized */
  unauthorizedReason?: string;

  /** Whether approval is required */
  requiresApproval: boolean;

  /** Approval template ID (if approval required) */
  approvalTemplateId?: string;
};

/**
 * Lifecycle Manager Service
 *
 * Manages lifecycle instances and state transitions for entity records.
 * Integrates with PolicyGate for authorization and approval workflows.
 *
 * Phase 12.2: Lifecycle hooks
 * - Create lifecycle_instance on entity create
 * - Enforce terminal state rules on entity update
 * - Transition endpoint: POST /api/data/:entity/:id/transition/:operationCode
 *
 * Phase 12.3: Transition gates
 * - Check PolicyGate for required operations
 * - Check for approval_template_id
 */
export interface LifecycleManager {
  // ===== Instance Management =====

  /**
   * Create a new lifecycle instance for an entity record
   * Called automatically on entity create via GenericDataAPI
   */
  createInstance(
    entityName: string,
    entityId: string,
    ctx: RequestContext,
  ): Promise<EntityLifecycleInstance>;

  /**
   * Get current lifecycle instance for an entity record
   * Returns undefined if no instance exists
   */
  getInstance(
    entityName: string,
    entityId: string,
    tenantId: string,
  ): Promise<EntityLifecycleInstance | undefined>;

  /**
   * Get lifecycle instance or throw error if not found
   */
  getInstanceOrFail(
    entityName: string,
    entityId: string,
    tenantId: string,
  ): Promise<EntityLifecycleInstance>;

  // ===== Transition Execution =====

  /**
   * Execute a lifecycle state transition
   * Performs authorization checks and gate validation
   * Creates lifecycle event and updates instance
   *
   * Throws error if:
   * - Instance not found
   * - Transition not found
   * - Authorization failed
   * - Gate conditions not met
   * - Current state is terminal (cannot transition)
   */
  transition(
    request: LifecycleTransitionRequest,
  ): Promise<LifecycleTransitionResult>;

  /**
   * Check if a transition is allowed (dry-run)
   * Does not execute the transition, only validates
   * Returns result with success flag and error/reason if not allowed
   */
  canTransition(
    request: LifecycleTransitionRequest,
  ): Promise<LifecycleTransitionResult>;

  /**
   * Get all available transitions for an entity record
   * Returns list of transitions the current user can execute
   * Includes authorization status and approval requirements
   */
  getAvailableTransitions(
    entityName: string,
    entityId: string,
    ctx: RequestContext,
  ): Promise<AvailableTransition[]>;

  // ===== Gate Validation =====

  /**
   * Validate transition gates
   * Checks required operations via PolicyGate
   * Checks approval template requirements
   *
   * Returns true if all gates pass, false otherwise
   */
  validateGates(
    transitionId: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<{ allowed: boolean; reason?: string }>;

  /**
   * Check if transition requires approval
   * Returns approval template ID if approval is required
   */
  requiresApproval(transitionId: string): Promise<string | undefined>;

  // ===== Lifecycle History =====

  /**
   * Get lifecycle event history for an entity record
   * Returns chronological list of all state transitions
   */
  getHistory(
    entityName: string,
    entityId: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<EntityLifecycleEvent>>;

  /**
   * Get current state information
   * Returns detailed state info for an entity record
   */
  getCurrentState(
    entityName: string,
    entityId: string,
    tenantId: string,
  ): Promise<{
    instance: EntityLifecycleInstance;
    state: LifecycleState;
    isTerminal: boolean;
  }>;

  // ===== Terminal State Enforcement =====

  /**
   * Check if entity is in terminal state
   * Used by GenericDataAPI to prevent updates to terminal records
   */
  isTerminalState(
    entityName: string,
    entityId: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Enforce terminal state rules
   * Throws error if entity is in terminal state and updates are not allowed
   */
  enforceTerminalState(
    entityName: string,
    entityId: string,
    tenantId: string,
  ): Promise<void>;

  /**
   * Health check
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// Lifecycle Timer Service (Auto-Transitions)
// ============================================================================

/**
 * Lifecycle Timer Service
 *
 * Manages automatic state transitions via scheduled timers.
 * Integrates with BullMQ for delayed job execution.
 *
 * Use cases:
 * - Auto-close: Automatically close entities after inactivity period
 * - Auto-cancel: Automatically cancel stale requests
 * - Reminders: Send notifications before deadlines
 * - Auto-transition: Generic scheduled state changes
 *
 * Pattern:
 * 1. Entity enters state → scheduleTimer()
 * 2. Timer fires via BullMQ → processTimer()
 * 3. Conditions evaluated → transition executed
 * 4. Manual transition → cancelTimers() (prevent stale execution)
 */
export interface LifecycleTimerService {
  // ===== Timer Scheduling =====

  /**
   * Schedule a timer for an entity instance based on timer policy.
   * Called when entity enters a state or completes a transition.
   *
   * @param policyId - Timer policy ID from meta.lifecycle_timer_policy
   * @param entityName - Entity name
   * @param entityId - Entity record ID
   * @param ctx - Request context
   * @param triggerData - Optional record data for field-relative delay calculation
   * @returns Scheduled timer or undefined if scheduling skipped
   */
  scheduleTimer(
    policyId: string,
    entityName: string,
    entityId: string,
    ctx: RequestContext,
    triggerData?: Record<string, unknown>,
  ): Promise<LifecycleTimerSchedule | undefined>;

  // ===== Timer Cancellation =====

  /**
   * Cancel all active timers for an entity instance.
   * Called when entity transitions to prevent stale timer execution.
   *
   * @param entityName - Entity name
   * @param entityId - Entity record ID
   * @param tenantId - Tenant ID
   * @param reason - Reason for cancellation (for audit trail)
   * @returns Number of timers canceled
   */
  cancelTimers(
    entityName: string,
    entityId: string,
    tenantId: string,
    reason: string,
  ): Promise<number>;

  /**
   * Cancel specific timers by type.
   *
   * @param entityName - Entity name
   * @param entityId - Entity record ID
   * @param tenantId - Tenant ID
   * @param timerType - Type of timers to cancel
   * @returns Number of timers canceled
   */
  cancelTimersByType(
    entityName: string,
    entityId: string,
    tenantId: string,
    timerType: LifecycleTimerType,
  ): Promise<number>;

  // ===== Timer Execution =====

  /**
   * Process a timer when BullMQ job fires.
   * Verifies conditions still met, then executes the transition.
   *
   * Guard checks:
   * - Timer not already fired or canceled
   * - Entity still exists
   * - Conditions still met (if defined)
   *
   * @param scheduleId - Timer schedule ID
   * @param tenantId - Tenant ID
   */
  processTimer(scheduleId: string, tenantId: string): Promise<void>;

  /**
   * Process a reminder when BullMQ job fires.
   * Marks the schedule as fired and logs the reminder event.
   *
   * @param scheduleId - Timer schedule ID
   * @param tenantId - Tenant ID
   */
  processReminder(scheduleId: string, tenantId: string): Promise<void>;

  // ===== Timer Rehydration =====

  /**
   * Rehydrate timers after server restart.
   * Reschedules BullMQ jobs for scheduled timers with future fire dates.
   *
   * @param tenantId - Tenant ID
   * @returns Number of timers rehydrated
   */
  rehydrateTimers(tenantId: string): Promise<number>;

  // ===== Timer Queries =====

  /**
   * Get active timers for an entity instance.
   *
   * @param entityName - Entity name
   * @param entityId - Entity record ID
   * @param tenantId - Tenant ID
   * @returns List of active (scheduled) timers
   */
  getActiveTimers(
    entityName: string,
    entityId: string,
    tenantId: string,
  ): Promise<LifecycleTimerSchedule[]>;

  // ===== Dependency Injection =====

  /**
   * Set job queue (late binding to prevent circular dependencies)
   */
  setJobQueue(queue: JobQueue): void;

  /**
   * Set lifecycle manager (late binding to prevent circular dependencies)
   */
  setLifecycleManager(manager: LifecycleManager): void;

  /**
   * Set generic data API (late binding for condition evaluation)
   */
  setGenericDataAPI(api: GenericDataAPI): void;

  // ===== Health Check =====

  /**
   * Health check for timer service.
   * Checks for stale timers and job queue connectivity.
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// Approval Service (Phase 13)
// ============================================================================

/**
 * Approval Service
 *
 * Manages multi-stage approval workflows with BullMQ-based SLA timers.
 * Handles approval instance creation, task assignment, and decision processing.
 *
 * Phase 13.1: Approval instance creation
 * - Create approval_instance, stages, tasks
 * - Resolve assignees from template rules
 * - Snapshot assignment details
 *
 * Phase 13.2: SLA timers and escalations
 * - Schedule reminders using BullMQ
 * - Schedule escalations
 * - Track escalation events
 *
 * Phase 13.3: Approval decisions
 * - Process approve/reject decisions
 * - Update task/stage/instance status
 * - Trigger lifecycle transition completion
 */
export interface ApprovalService {
  // ===== Approval Instance Creation (Phase 13.1) =====

  /**
   * Create approval instance for a lifecycle transition
   * Creates instance, stages, tasks, and assignment snapshots
   * Schedules SLA timers for reminders and escalations
   */
  createApprovalInstance(
    request: ApprovalCreationRequest,
  ): Promise<ApprovalCreationResult>;

  /**
   * Get approval instance by ID
   */
  getInstance(
    instanceId: string,
    tenantId: string,
  ): Promise<ApprovalInstance | undefined>;

  /**
   * Get approval instance for an entity
   * Returns the active approval instance for an entity record
   */
  getInstanceForEntity(
    entityName: string,
    entityId: string,
    tenantId: string,
  ): Promise<ApprovalInstance | undefined>;

  // ===== Task Management =====

  /**
   * Get approval task by ID
   */
  getTask(taskId: string, tenantId: string): Promise<ApprovalTask | undefined>;

  /**
   * Get all tasks for an approval instance
   */
  getTasksForInstance(
    instanceId: string,
    tenantId: string,
  ): Promise<ApprovalTask[]>;

  /**
   * Get pending tasks for a user
   * Returns tasks assigned to the user or their groups
   */
  getTasksForUser(
    userId: string,
    tenantId: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<ApprovalTask>>;

  /**
   * Get task assignment snapshot
   * Returns the resolved assignment details for a task
   */
  getAssignmentSnapshot(
    taskId: string,
    tenantId: string,
  ): Promise<ApprovalAssignmentSnapshot | undefined>;

  // ===== Approval Decisions (Phase 13.3) =====

  /**
   * Make an approval decision (approve or reject)
   * Updates task status, evaluates stage completion, evaluates instance completion
   * Triggers lifecycle transition if all approvals are complete
   */
  makeDecision(
    request: ApprovalDecisionRequest,
  ): Promise<ApprovalDecisionResult>;

  /**
   * Check if approval instance is complete
   * Returns true if all required tasks are approved
   */
  isInstanceComplete(instanceId: string, tenantId: string): Promise<boolean>;

  /**
   * Check if stage is complete
   * Returns true if stage quorum is met
   */
  isStageComplete(stageId: string, tenantId: string): Promise<boolean>;

  // ===== SLA Timers and Escalations (Phase 13.2) =====

  /**
   * Schedule reminder for approval task
   * Creates BullMQ job to send reminder at specified time
   */
  scheduleReminder(
    taskId: string,
    fireAt: Date,
    tenantId: string,
  ): Promise<void>;

  /**
   * Schedule escalation for approval task
   * Creates BullMQ job to escalate at specified time
   */
  scheduleEscalation(
    taskId: string,
    fireAt: Date,
    escalationPayload: Record<string, unknown>,
    tenantId: string,
  ): Promise<void>;

  /**
   * Process reminder (called by BullMQ job)
   * Sends notification to assignee
   */
  processReminder(taskId: string, tenantId: string): Promise<void>;

  /**
   * Process escalation (called by BullMQ job)
   * Reassigns task or notifies manager
   */
  processEscalation(
    taskId: string,
    escalationPayload: Record<string, unknown>,
    tenantId: string,
  ): Promise<void>;

  /**
   * Cancel scheduled timers for a task
   * Removes BullMQ jobs when task is decided
   */
  cancelTimers(taskId: string, tenantId: string): Promise<void>;

  // ===== Approval History =====

  /**
   * Get approval events for an instance
   * Returns chronological audit trail
   */
  getEvents(
    instanceId: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<ApprovalEvent>>;

  /**
   * Get escalation history for an instance
   */
  getEscalations(
    instanceId: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<ApprovalEscalation>>;

  /**
   * Health check
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// DDL Generator Service (Phase 14.1)
// ============================================================================

/**
 * DDL generation options
 */
export type DdlGenerationOptions = {
  /** Schema name (default: "ent") */
  schemaName?: string;

  /** Whether to include IF NOT EXISTS (default: true) */
  ifNotExists?: boolean;

  /** Whether to include indexes (default: true) */
  includeIndexes?: boolean;

  /** Whether to include comments (default: true) */
  includeComments?: boolean;
};

/**
 * DDL generation result
 */
export type DdlGenerationResult = {
  /** Table creation SQL */
  createTableSql: string;

  /** Index creation SQL statements */
  createIndexSql: string[];

  /** Full SQL script (table + indexes) */
  fullSql: string;

  /** Entity name */
  entityName: string;

  /** Table name */
  tableName: string;
};

/**
 * DDL Generator Service
 *
 * Generates PostgreSQL DDL statements from compiled entity models.
 * Automates physical data model creation from META definitions.
 *
 * Phase 14.1: Meta-to-DB DDL generator
 * - CREATE TABLE IF NOT EXISTS with system columns
 * - Field type mapping (string→text, number→numeric, etc.)
 * - Required system columns (id, tenant_id, realm_id, timestamps, soft delete, version)
 * - Indexes for tenant_id, searchable, filterable, unique fields
 */
export interface DdlGenerator {
  /**
   * Generate DDL for a compiled entity model
   * Returns CREATE TABLE and CREATE INDEX statements
   */
  generateDdl(
    model: CompiledModel,
    options?: DdlGenerationOptions,
  ): DdlGenerationResult;

  /**
   * Generate DDL for multiple models
   * Returns array of DDL generation results
   */
  generateBatch(
    models: CompiledModel[],
    options?: DdlGenerationOptions,
  ): DdlGenerationResult[];

  /**
   * Generate full migration script for multiple models
   * Returns complete SQL script with schema creation + all tables + indexes
   */
  generateMigrationScript(
    models: CompiledModel[],
    options?: DdlGenerationOptions,
  ): string;
}

// ============================================================================
// Entity Classification Service (Approvable Core Engine)
// ============================================================================

/**
 * Entity Classification Service
 *
 * Resolves EntityClass and EntityFeatureFlags from entity metadata.
 * Reads meta.entity.kind and meta.entity.feature_flags from the database.
 *
 * Entities without classification (not in meta.entity or kind not set)
 * return undefined class and all-false default flags.
 */
export interface EntityClassificationService {
  /**
   * Resolve the EntityClass for an entity.
   * Maps DB kind: ref/mdm → MASTER, ent → CONTROL, doc → DOCUMENT.
   * Returns undefined if entity has no classification (legacy entity).
   */
  resolveClass(
    entityName: string,
    tenantId: string,
  ): Promise<EntityClass | undefined>;

  /**
   * Resolve feature flags for an entity.
   * Parses meta.entity.feature_flags JSONB column with safe defaults.
   * Returns all-false defaults if entity has no classification.
   */
  resolveFeatureFlags(
    entityName: string,
    tenantId: string,
  ): Promise<EntityFeatureFlags>;

  /**
   * Get combined classification: class + flags in one query.
   */
  getClassification(
    entityName: string,
    tenantId: string,
  ): Promise<{
    entityClass: EntityClass | undefined;
    featureFlags: EntityFeatureFlags;
  }>;
}

// ============================================================================
// Numbering Engine Service (Approvable Core Engine)
// ============================================================================

/**
 * Numbering Engine Service
 *
 * Generates unique document numbers atomically using INSERT...ON CONFLICT DO UPDATE.
 * Numbers are formatted from patterns like "INV-{YYYY}-{SEQ:6}".
 * Sequences can reset by period (yearly, monthly, daily, or never).
 */
export interface NumberingEngine {
  /**
   * Generate the next number for an entity.
   * Uses atomic INSERT...ON CONFLICT DO UPDATE for gap-free sequences.
   * Returns the formatted document number string.
   *
   * @param entityName Entity to generate number for
   * @param tenantId Tenant context
   * @param referenceDate Date used for period key and pattern tokens (default: now())
   */
  generateNumber(
    entityName: string,
    tenantId: string,
    referenceDate?: Date,
  ): Promise<string>;

  /**
   * Preview what the next number would be (best-effort, non-atomic).
   * May not reflect actual next number if concurrent requests exist.
   */
  previewNextNumber(
    entityName: string,
    tenantId: string,
    referenceDate?: Date,
  ): Promise<string | undefined>;

  /**
   * Get the numbering rule for an entity.
   * Returns undefined if numbering is not configured.
   */
  getRule(
    entityName: string,
    tenantId: string,
  ): Promise<NumberingRule | undefined>;

  /**
   * Health check.
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// Entity Page Descriptor Service (Entity Page Orchestration)
// ============================================================================

/**
 * Entity Page Descriptor Service
 *
 * Orchestrates multiple backend services into a single descriptor
 * that tells the frontend exactly what to render.
 *
 * "React is a renderer" — the backend is authoritative for all
 * UI orchestration decisions.
 */
export interface EntityPageDescriptorService {
  /**
   * Compute static descriptor for an entity type.
   * Cacheable by compiledModel.hash — invalidated on schema publish.
   * Contains structural info: tabs, sections, classification, feature flags.
   */
  describeStatic(
    entityName: string,
    ctx: RequestContext,
  ): Promise<EntityPageStaticDescriptor>;

  /**
   * Compute dynamic descriptor for a specific entity instance.
   * Per-request, never cached.
   * Contains state-dependent info: view mode, badges, actions, permissions.
   */
  describeDynamic(
    entityName: string,
    entityId: string,
    ctx: RequestContext,
    requestedViewMode?: ViewMode,
  ): Promise<EntityPageDynamicDescriptor>;
}

// ============================================================================
// Meta Event Bus (Cross-Cutting Notifications)
// ============================================================================

/**
 * Meta Event Types
 *
 * Typed events emitted by META services for cross-cutting concerns:
 * audit logging, cache invalidation, telemetry, UI refresh hints.
 */
export type MetaEvent =
  | {
      type: "lifecycle.transitioned";
      entityName: string;
      entityId: string;
      operationCode: string;
      fromStateCode: string;
      toStateCode: string;
      userId: string;
      tenantId: string;
    }
  | {
      type: "approval.decision_made";
      entityName: string;
      entityId: string;
      instanceId: string;
      decision: string;
      userId: string;
      tenantId: string;
    }
  | {
      type: "approval.instance_created";
      entityName: string;
      entityId: string;
      instanceId: string;
      tenantId: string;
    }
  | {
      type: "entity.created";
      entityName: string;
      entityId: string;
      userId: string;
      tenantId: string;
    }
  | {
      type: "entity.updated";
      entityName: string;
      entityId: string;
      userId: string;
      tenantId: string;
    }
  | {
      type: "entity.deleted";
      entityName: string;
      entityId: string;
      userId: string;
      tenantId: string;
    }
  | {
      type: "schema.published";
      entityName: string;
      version: string;
      tenantId: string;
    }
  | {
      type: "descriptor.cache_invalidated";
      entityName: string;
      tenantId: string;
    };

export type MetaEventType = MetaEvent["type"];

export type MetaEventHandler = (event: MetaEvent) => void | Promise<void>;

/**
 * Meta Event Bus
 *
 * In-process notification bus for META Engine events.
 * Subscribers receive events asynchronously (fire-and-forget).
 * Subscriber errors are logged but do not propagate.
 */
export interface MetaEventBus {
  /**
   * Subscribe to specific event types.
   * Returns an unsubscribe function.
   */
  on(eventType: MetaEventType, handler: MetaEventHandler): () => void;

  /**
   * Subscribe to all events.
   * Returns an unsubscribe function.
   */
  onAny(handler: MetaEventHandler): () => void;

  /**
   * Emit an event. Delivery is asynchronous and best-effort.
   */
  emit(event: MetaEvent): void;
}

// ============================================================================
// Action Dispatcher Service (Entity Page Actions)
// ============================================================================

/**
 * Action Dispatcher Service
 *
 * Routes action execution requests to the correct backend service
 * based on the action's handler routing key.
 */
export interface ActionDispatcher {
  /**
   * Execute an action.
   * Routes to lifecycle, approval, entity, or posting service
   * based on the action's handler prefix.
   */
  execute(
    request: ActionExecutionRequest,
    ctx: RequestContext,
  ): Promise<ActionExecutionResult>;
}

// ============================================================================
// Approval Template Service (EPIC G)
// ============================================================================

/**
 * Approval Template Service
 *
 * Manages approval workflow template authoring, validation, and versioning.
 * Provides CRUD operations for templates, stages, and routing rules.
 */
export interface ApprovalTemplateService {
  // ===== CRUD Operations =====

  /**
   * Create a new approval template with stages and rules
   */
  create(
    input: ApprovalTemplateCreateInput,
    tenantId: string,
    userId: string,
  ): Promise<ApprovalTemplate>;

  /**
   * Get a template by ID or code (returns active version by default)
   */
  get(
    idOrCode: string,
    tenantId: string,
  ): Promise<ApprovalTemplate | undefined>;

  /**
   * List all templates for a tenant
   */
  list(
    tenantId: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<ApprovalTemplate>>;

  /**
   * Update a template (creates new version)
   */
  update(
    idOrCode: string,
    input: ApprovalTemplateUpdateInput,
    tenantId: string,
    userId: string,
  ): Promise<ApprovalTemplate>;

  /**
   * Delete a template and all its versions
   */
  delete(idOrCode: string, tenantId: string): Promise<void>;

  // ===== Nested Resources =====

  /**
   * Get all stages for a template
   */
  getStages(
    templateId: string,
    tenantId: string,
  ): Promise<ApprovalTemplateStage[]>;

  /**
   * Get all routing rules for a template
   */
  getRules(
    templateId: string,
    tenantId: string,
  ): Promise<ApprovalTemplateRule[]>;

  // ===== Validation & Compilation (G2) =====

  /**
   * Validate template structure
   * Checks stage sequencing, rule syntax, and approver assignment validity
   */
  validate(
    idOrCode: string,
    tenantId: string,
  ): Promise<TemplateValidationResult>;

  /**
   * Compile template into runtime artifact
   * Produces compiled JSON with SHA-256 hash
   */
  compile(
    idOrCode: string,
    tenantId: string,
  ): Promise<CompiledApprovalTemplate>;

  // ===== Version Management (G3) =====

  /**
   * List all versions of a template by code
   */
  listVersions(code: string, tenantId: string): Promise<ApprovalTemplate[]>;

  /**
   * Rollback to a previous version (creates new version as copy)
   */
  rollback(
    code: string,
    targetVersion: number,
    tenantId: string,
    userId: string,
  ): Promise<ApprovalTemplate>;

  /**
   * Compute diff between two template versions
   */
  diff(
    code: string,
    v1: number,
    v2: number,
    tenantId: string,
  ): Promise<Record<string, unknown>>;

  /**
   * Analyze impact of template changes
   * Returns list of lifecycle transitions that reference this template
   */
  impactAnalysis(
    idOrCode: string,
    tenantId: string,
  ): Promise<{
    affectedTransitions: Array<{
      transitionId: string;
      entityName: string;
      operationCode: string;
    }>;
  }>;

  // ===== Resolution Test (G4) =====

  /**
   * Test approver resolution with sample context
   * Useful for template authors to verify routing rules
   */
  testResolution(
    idOrCode: string,
    context: Record<string, unknown>,
    tenantId: string,
  ): Promise<{
    resolvedAssignees: Array<{
      principalId?: string;
      groupId?: string;
      strategy: string;
    }>;
  }>;
}

// Note: All interfaces are already exported inline above
// No need for duplicate exports here
