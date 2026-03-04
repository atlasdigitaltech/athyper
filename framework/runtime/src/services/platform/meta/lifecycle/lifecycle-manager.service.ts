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

import {
  evaluateConditionGroup,
  resolveFieldValue,
  type ConditionGroup,
} from "../../shared/condition-evaluator.js";
import { now, uuid } from "../data/db-helpers.js";
import { META_SPANS, withSpan } from "../observability/tracing.js";

import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type { MetaMetrics } from "../observability/metrics.js";
import type {
  ApprovalService,
  AvailableTransition,
  EntityLifecycleEvent,
  EntityLifecycleInstance,
  HealthCheckResult,
  LifecycleManager,
  LifecycleRouteCompiler,
  LifecycleState,
  LifecycleTimerService,
  LifecycleTransition,
  LifecycleTransitionGate,
  LifecycleTransitionRequest,
  LifecycleTransitionResult,
  ListOptions,
  PaginatedResponse,
  PolicyGate,
  RequestContext,
  ThresholdRule,
} from "@athyper/core/meta";


export class LifecycleManagerService implements LifecycleManager {
  private approvalService?: ApprovalService;
  private timerService?: LifecycleTimerService;
  private metrics?: MetaMetrics;

  constructor(
    private readonly db: LifecycleDB_Type,
    private readonly routeCompiler: LifecycleRouteCompiler,
    private readonly policyGate: PolicyGate,
  ) {}

  /** Set metrics collector for observability (late binding). */
  setMetrics(metrics: MetaMetrics): void {
    this.metrics = metrics;
  }

  /**
   * Set approval service for circular dependency resolution.
   * Called by factory after both services are constructed.
   */
  setApprovalService(svc: ApprovalService): void {
    this.approvalService = svc;
  }

  /**
   * Set timer service for timer lifecycle management.
   * Called by factory after both services are constructed.
   */
  setTimerService(svc: LifecycleTimerService): void {
    this.timerService = svc;
  }

  // ============================================================================
  // Instance Management
  // ============================================================================

  /**
   * Create a new lifecycle instance for an entity record
   * Called automatically on entity create via GenericDataAPI
   */
  async createInstance(
    entityName: string,
    entityId: string,
    ctx: RequestContext
  ): Promise<EntityLifecycleInstance> {
    // Resolve which lifecycle applies
    const lifecycleId = await this.routeCompiler.resolveLifecycle(
      entityName,
      ctx
    );

    if (!lifecycleId) {
      throw new Error(
        `No lifecycle defined for entity '${entityName}' in tenant ${ctx.tenantId}`
      );
    }

    // Get initial state for lifecycle
    const initialState = await this.getInitialState(lifecycleId, ctx.tenantId);

    if (!initialState) {
      throw new Error(
        `No initial state defined for lifecycle '${lifecycleId}'`
      );
    }

    // Create instance
    const result = await this.db
      .insertInto("core.entity_lifecycle_instance")
      .values({
        id: uuid(),
        tenant_id: ctx.tenantId,
        entity_name: entityName,
        entity_id: entityId,
        lifecycle_id: lifecycleId,
        state_id: initialState.id,
        updated_at: new Date(),
        updated_by: ctx.userId,
      })
      .onConflict((oc) =>
        oc.columns(["tenant_id", "entity_name", "entity_id"]).doUpdateSet({
          lifecycle_id: (eb) => eb.ref("excluded.lifecycle_id"),
          state_id: (eb) => eb.ref("excluded.state_id"),
          updated_at: now(),
          updated_by: (eb) => eb.ref("excluded.updated_by"),
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    const instance = this.mapInstanceRow(result);

    // Log lifecycle event
    await this.logEvent({
      tenantId: ctx.tenantId,
      entityName,
      entityId,
      lifecycleId,
      fromStateId: undefined,
      toStateId: initialState.id,
      operationCode: "CREATE",
      actorId: ctx.userId,
      payload: undefined,
      correlationId: undefined,
    });

    console.log(JSON.stringify({
      msg: "lifecycle_instance_created",
      entityName,
      entityId,
      tenantId: ctx.tenantId,
      lifecycleId,
      stateId: initialState.id,
      stateCode: initialState.code,
    }));

    return instance;
  }

  /**
   * Get current lifecycle instance for an entity record
   * Returns undefined if no instance exists
   */
  async getInstance(
    entityName: string,
    entityId: string,
    tenantId: string
  ): Promise<EntityLifecycleInstance | undefined> {
    const result = await this.db
      .selectFrom("core.entity_lifecycle_instance")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_name", "=", entityName)
      .where("entity_id", "=", entityId)
      .executeTakeFirst();

    if (!result) {
      return undefined;
    }

    return this.mapInstanceRow(result);
  }

  /**
   * Get lifecycle instance or throw error if not found
   */
  async getInstanceOrFail(
    entityName: string,
    entityId: string,
    tenantId: string
  ): Promise<EntityLifecycleInstance> {
    const instance = await this.getInstance(entityName, entityId, tenantId);

    if (!instance) {
      throw new Error(
        `Lifecycle instance not found for ${entityName}/${entityId} in tenant ${tenantId}`
      );
    }

    return instance;
  }

  // ============================================================================
  // Transition Execution
  // ============================================================================

  /**
   * Execute a lifecycle state transition
   * Performs authorization checks and gate validation
   * Creates lifecycle event and updates instance
   */
  async transition(
    request: LifecycleTransitionRequest
  ): Promise<LifecycleTransitionResult> {
    const { entityName, entityId, operationCode, ctx } = request;

    return withSpan(
      META_SPANS.LIFECYCLE_TRANSITION,
      { "meta.entity": entityName, "meta.operation": operationCode, "meta.tenant_id": ctx.tenantId, "meta.record_id": entityId },
      async (span) => {
        const start = Date.now();
        try {
          // Get current instance
          const instance = await this.getInstanceOrFail(
            entityName,
            entityId,
            ctx.tenantId
          );

          // Get current state
          const currentState = await this.getState(
            instance.stateId,
            ctx.tenantId
          );

          // Check if current state is terminal
          if (currentState.isTerminal) {
            this.metrics?.transitionFailed({ entity: entityName, operation: operationCode, reason: "terminal_state" });
            return {
              success: false,
              error: "Cannot transition from terminal state",
              reason: `State '${currentState.code}' is terminal`,
            };
          }

          // Find transition
          const transition = await this.findTransition(
            instance.lifecycleId,
            instance.stateId,
            operationCode,
            ctx.tenantId
          );

          if (!transition) {
            this.metrics?.transitionFailed({ entity: entityName, operation: operationCode, reason: "not_found" });
            return {
              success: false,
              error: "Transition not found",
              reason: `No transition from '${currentState.code}' via '${operationCode}'`,
            };
          }

          // Validate gates (pass entity context for approval bridge)
          const gateResult = await this.validateGates(
            transition.id,
            ctx,
            request.payload,
            { entityName, entityId }
          );

          if (!gateResult.allowed) {
            this.metrics?.transitionFailed({ entity: entityName, operation: operationCode, reason: "gate_denied" });
            return {
              success: false,
              error: "Gate validation failed",
              reason: gateResult.reason || "Access denied",
            };
          }

          // Get target state
          const targetState = await this.getState(
            transition.toStateId,
            ctx.tenantId
          );

          // Execute transition
          await this.db
            .updateTable("core.entity_lifecycle_instance")
            .set({
              state_id: transition.toStateId,
              updated_at: now(),
              updated_by: ctx.userId,
            })
            .where("tenant_id", "=", ctx.tenantId)
            .where("entity_name", "=", entityName)
            .where("entity_id", "=", entityId)
            .execute();

          // Log lifecycle event
          const event = await this.logEvent({
            tenantId: ctx.tenantId,
            entityName,
            entityId,
            lifecycleId: instance.lifecycleId,
            fromStateId: instance.stateId,
            toStateId: transition.toStateId,
            operationCode,
            actorId: ctx.userId,
            payload: request.payload,
            correlationId: undefined,
          });

          this.metrics?.transitionLatency(Date.now() - start, { entity: entityName, operation: operationCode });

          console.log(JSON.stringify({
            msg: "lifecycle_transition_success",
            entityName,
            entityId,
            tenantId: ctx.tenantId,
            operationCode,
            fromState: currentState.code,
            toState: targetState.code,
            eventId: event.id,
          }));

          // Timer lifecycle management (H4: Auto-transitions)
          if (this.timerService) {
            // Cancel old timers (prevent stale timer execution)
            await this.timerService.cancelTimers(
              entityName,
              entityId,
              ctx.tenantId,
              `transitioned_to_${targetState.code}`
            );

            // Schedule new timers for target state (if policies exist)
            await this.scheduleTimersForState(
              entityName,
              entityId,
              transition.toStateId,
              ctx,
              request.payload
            );
          }

          return {
            success: true,
            newStateId: transition.toStateId,
            newStateCode: targetState.code,
            eventId: event.id,
          };
        } catch (error) {
          this.metrics?.transitionFailed({ entity: entityName, operation: operationCode, reason: "error" });

          console.error(JSON.stringify({
            msg: "lifecycle_transition_error",
            entityName,
            entityId,
            tenantId: ctx.tenantId,
            operationCode,
            error: String(error),
          }));

          return {
            success: false,
            error: String(error),
          };
        }
      },
    );
  }

  /**
   * Check if a transition is allowed (dry-run)
   * Does not execute the transition, only validates
   */
  async canTransition(
    request: LifecycleTransitionRequest
  ): Promise<LifecycleTransitionResult> {
    const { entityName, entityId, operationCode, ctx } = request;

    try {
      // Get current instance
      const instance = await this.getInstanceOrFail(
        entityName,
        entityId,
        ctx.tenantId
      );

      // Get current state
      const currentState = await this.getState(
        instance.stateId,
        ctx.tenantId
      );

      // Check if current state is terminal
      if (currentState.isTerminal) {
        return {
          success: false,
          reason: `State '${currentState.code}' is terminal`,
        };
      }

      // Find transition
      const transition = await this.findTransition(
        instance.lifecycleId,
        instance.stateId,
        operationCode,
        ctx.tenantId
      );

      if (!transition) {
        return {
          success: false,
          reason: `No transition from '${currentState.code}' via '${operationCode}'`,
        };
      }

      // Validate gates (pass entity context for approval bridge)
      const gateResult = await this.validateGates(
        transition.id,
        ctx,
        request.payload,
        { entityName, entityId }
      );

      if (!gateResult.allowed) {
        return {
          success: false,
          reason: gateResult.reason || "Access denied",
        };
      }

      // Get target state
      const targetState = await this.getState(
        transition.toStateId,
        ctx.tenantId
      );

      return {
        success: true,
        newStateId: transition.toStateId,
        newStateCode: targetState.code,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Get all available transitions for an entity record
   * Returns list of transitions the current user can execute
   */
  async getAvailableTransitions(
    entityName: string,
    entityId: string,
    ctx: RequestContext
  ): Promise<AvailableTransition[]> {
    // Get current instance
    const instance = await this.getInstanceOrFail(
      entityName,
      entityId,
      ctx.tenantId
    );

    // Get all transitions from current state
    const transitions = await this.getTransitionsFromState(
      instance.lifecycleId,
      instance.stateId,
      ctx.tenantId
    );

    const available: AvailableTransition[] = [];

    for (const transition of transitions) {
      // Get target state
      const targetState = await this.getState(
        transition.toStateId,
        ctx.tenantId
      );

      // Validate gates
      const gateResult = await this.validateGates(
        transition.id,
        ctx,
        undefined
      );

      // Check for approval requirement
      const approvalTemplateId = await this.requiresApproval(transition.id);

      available.push({
        transitionId: transition.id,
        operationCode: transition.operationCode,
        toStateId: transition.toStateId,
        toStateCode: targetState.code,
        authorized: gateResult.allowed,
        unauthorizedReason: gateResult.reason,
        requiresApproval: !!approvalTemplateId,
        approvalTemplateId,
      });
    }

    return available;
  }

  // ============================================================================
  // Gate Validation
  // ============================================================================

  /**
   * Validate transition gates
   * Checks required operations via PolicyGate
   * Checks approval template requirements
   */
  async validateGates(
    transitionId: string,
    ctx: RequestContext,
    record?: unknown,
    entityContext?: { entityName: string; entityId: string }
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Bypass check: if _approvalBypass is set, skip all approval gate checks (loop protection)
    const bypassApproval = (ctx.metadata as Record<string, unknown> | undefined)?._approvalBypass === true;

    // Load gates for transition
    const gates = await this.getGatesForTransition(transitionId, ctx.tenantId);

    // If no gates, allow by default
    if (gates.length === 0) {
      return { allowed: true };
    }

    // Evaluate each gate
    for (const gate of gates) {
      // Check required operations
      if (gate.requiredOperations && gate.requiredOperations.length > 0) {
        for (const operation of gate.requiredOperations) {
          const decision = await this.policyGate.authorize(
            operation,
            entityContext?.entityName ?? "unknown",
            ctx,
            record
          );

          if (!decision.allowed) {
            return {
              allowed: false,
              reason: `Missing required operation: ${operation}`,
            };
          }
        }
      }

      // Check approval template (Approvable Core Engine)
      if (gate.approvalTemplateId && !bypassApproval) {
        if (!this.approvalService || !entityContext) {
          // No approval service wired or no entity context — log and skip
          console.log(JSON.stringify({
            msg: "lifecycle_gate_approval_required_but_no_service",
            transitionId,
            approvalTemplateId: gate.approvalTemplateId,
          }));
          continue;
        }

        // Check if an approval instance already exists for this entity
        const existing = await this.approvalService.getInstanceForEntity(
          entityContext.entityName,
          entityContext.entityId,
          ctx.tenantId
        );

        if (!existing) {
          // No approval instance — create one and block the transition
          const createResult = await this.approvalService.createApprovalInstance({
            entityName: entityContext.entityName,
            entityId: entityContext.entityId,
            transitionId,
            approvalTemplateId: gate.approvalTemplateId,
            ctx,
          });

          if (createResult.success) {
            return {
              allowed: false,
              reason: "Approval workflow initiated",
            };
          } else {
            return {
              allowed: false,
              reason: `Failed to create approval: ${createResult.error}`,
            };
          }
        }

        // Instance exists — check its status
        if (existing.status === "open") {
          return {
            allowed: false,
            reason: "Approval pending",
          };
        }

        if (existing.status === "rejected" || existing.status === "canceled") {
          return {
            allowed: false,
            reason: existing.status === "rejected"
              ? "Approval was rejected"
              : "Approval was canceled",
          };
        }

        // status === "completed" → allow (continue gate evaluation)
      }

      // Evaluate threshold rules (H1)
      if (gate.thresholdRules && record) {
        const thresholdResult = this.evaluateThresholds(
          gate.thresholdRules as { rules: ThresholdRule[] },
          record as Record<string, unknown>
        );
        if (!thresholdResult.allowed) {
          console.log(JSON.stringify({
            msg: "lifecycle_gate_threshold_blocked",
            transitionId,
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            reason: thresholdResult.reason,
          }));
          return {
            allowed: false,
            reason: thresholdResult.reason ?? "Threshold gate blocked",
          };
        }
      }

      // Evaluate custom conditions (H2)
      if (gate.conditions && record) {
        const conditionResult = this.evaluateGateConditions(
          gate.conditions as ConditionGroup,
          record as Record<string, unknown>,
          ctx
        );
        if (!conditionResult) {
          console.log(JSON.stringify({
            msg: "lifecycle_gate_condition_blocked",
            transitionId,
            tenantId: ctx.tenantId,
            userId: ctx.userId,
          }));
          return {
            allowed: false,
            reason: "Gate condition not met",
          };
        }
      }
    }

    // Log successful gate evaluation
    console.log(JSON.stringify({
      msg: "lifecycle_gate_evaluated",
      transitionId,
      gateCount: gates.length,
      allowed: true,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    }));

    return { allowed: true };
  }

  /**
   * Evaluate threshold rules for a gate
   * Checks numeric field values against threshold criteria
   */
  private evaluateThresholds(
    thresholdConfig: { rules: ThresholdRule[] },
    record: Record<string, unknown>
  ): { allowed: boolean; reason?: string } {
    for (const rule of thresholdConfig.rules ?? []) {
      const actual = resolveFieldValue(rule.field, record);
      const numVal = typeof actual === "number" ? actual : Number(actual);
      if (isNaN(numVal)) continue; // non-numeric field — skip rule

      let passed = true;
      switch (rule.operator) {
        case "gt":
          passed = numVal > (rule.value as number);
          break;
        case "gte":
          passed = numVal >= (rule.value as number);
          break;
        case "lt":
          passed = numVal < (rule.value as number);
          break;
        case "lte":
          passed = numVal <= (rule.value as number);
          break;
        case "eq":
          passed = numVal === (rule.value as number);
          break;
        case "ne":
          passed = numVal !== (rule.value as number);
          break;
        case "between": {
          const [lo, hi] = rule.value as [number, number];
          passed = numVal >= lo && numVal <= hi;
          break;
        }
      }

      if (!passed && rule.action === "block") {
        return {
          allowed: false,
          reason: rule.reason ??
            `Threshold blocked: ${rule.field} ${rule.operator} ${rule.value} (actual: ${numVal})`,
        };
      }
      // action === "require_approval" handled by approval template gate (future enhancement)
    }
    return { allowed: true };
  }

  /**
   * Evaluate custom condition group for a gate
   * Uses shared condition evaluator with AND/OR logic
   */
  private evaluateGateConditions(
    conditions: ConditionGroup,
    record: Record<string, unknown>,
    ctx: RequestContext
  ): boolean {
    // Build evaluation context merging record fields with request context
    const evalCtx: Record<string, unknown> = {
      ...record,
      ctx: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        roles: ctx.roles,
        realmId: ctx.realmId,
      },
    };
    return evaluateConditionGroup(conditions, evalCtx);
  }

  /**
   * Check if transition requires approval
   * Returns approval template ID if approval is required
   */
  async requiresApproval(transitionId: string): Promise<string | undefined> {
    const result = await this.db
      .selectFrom("meta.lifecycle_transition_gate")
      .select("approval_template_id")
      .where("transition_id", "=", transitionId)
      .where("approval_template_id", "is not", null)
      .limit(1)
      .executeTakeFirst();

    return result?.approval_template_id ?? undefined;
  }

  // ============================================================================
  // Lifecycle History
  // ============================================================================

  /**
   * Get lifecycle event history for an entity record
   * Returns chronological list of all state transitions
   */
  async getHistory(
    entityName: string,
    entityId: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<EntityLifecycleEvent>> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 50;
    const offset = (page - 1) * pageSize;

    // Get total count
    const countResult = await this.db
      .selectFrom("core.entity_lifecycle_event")
      .select(({ fn }) => [fn.countAll<number>().as("count")])
      .where("entity_name", "=", entityName)
      .where("entity_id", "=", entityId)
      .executeTakeFirstOrThrow();

    const total = Number(countResult.count);
    const totalPages = Math.ceil(total / pageSize);

    // Get events
    const rows = await this.db
      .selectFrom("core.entity_lifecycle_event")
      .selectAll()
      .where("entity_name", "=", entityName)
      .where("entity_id", "=", entityId)
      .orderBy("occurred_at", "desc")
      .limit(pageSize)
      .offset(offset)
      .execute();

    const data = rows.map((r) => this.mapEventRow(r as any));

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get current state information
   * Returns detailed state info for an entity record
   */
  async getCurrentState(
    entityName: string,
    entityId: string,
    tenantId: string
  ): Promise<{
    instance: EntityLifecycleInstance;
    state: LifecycleState;
    isTerminal: boolean;
  }> {
    const instance = await this.getInstanceOrFail(
      entityName,
      entityId,
      tenantId
    );

    const state = await this.getState(instance.stateId, tenantId);

    return {
      instance,
      state,
      isTerminal: state.isTerminal,
    };
  }

  // ============================================================================
  // Terminal State Enforcement
  // ============================================================================

  /**
   * Check if entity is in terminal state
   * Used by GenericDataAPI to prevent updates to terminal records
   */
  async isTerminalState(
    entityName: string,
    entityId: string,
    tenantId: string
  ): Promise<boolean> {
    const instance = await this.getInstance(entityName, entityId, tenantId);

    if (!instance) {
      return false;
    }

    const state = await this.getState(instance.stateId, tenantId);

    return state.isTerminal;
  }

  /**
   * Enforce terminal state rules
   * Throws error if entity is in terminal state and updates are not allowed
   */
  async enforceTerminalState(
    entityName: string,
    entityId: string,
    tenantId: string
  ): Promise<void> {
    const isTerminal = await this.isTerminalState(
      entityName,
      entityId,
      tenantId
    );

    if (isTerminal) {
      throw new Error(
        `Cannot update ${entityName}/${entityId}: record is in terminal state`
      );
    }
  }

  // ============================================================================
  // Timer Management (H4: Auto-Transitions)
  // ============================================================================

  /**
   * Schedule timers for a state based on timer policies.
   * Called after successful transition to schedule timers for the new state.
   *
   * @param entityName - Entity name
   * @param entityId - Entity record ID
   * @param stateId - State ID to check for timer policies
   * @param ctx - Request context
   * @param triggerData - Entity record data for field-relative delay calculation
   */
  private async scheduleTimersForState(
    entityName: string,
    entityId: string,
    stateId: string,
    ctx: RequestContext,
    triggerData?: Record<string, unknown>
  ): Promise<void> {
    if (!this.timerService) {
      return;
    }

    // Query timer policies for this tenant
    const policies = await this.db
      .selectFrom("meta.lifecycle_timer_policy")
      .selectAll()
      .where("tenant_id", "=", ctx.tenantId)
      .execute();

    for (const policyRow of policies) {
      try {
        // Parse policy rules
        const rules = JSON.parse(policyRow.rules as any);

        // Check if this state triggers the timer
        if (rules.triggerOnStateEntry?.includes(stateId)) {
          await this.timerService.scheduleTimer(
            policyRow.id,
            entityName,
            entityId,
            ctx,
            triggerData
          );
        }
      } catch (error) {
        console.error(JSON.stringify({
          msg: "lifecycle_timer_scheduling_failed",
          policyId: policyRow.id,
          entityName,
          entityId,
          stateId,
          error: String(error),
        }));
      }
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Check database connectivity
      await this.db
        .selectFrom("core.entity_lifecycle_instance")
        .select("id")
        .limit(1)
        .execute();

      return {
        healthy: true,
        message: "LifecycleManager is healthy",
      };
    } catch (error) {
      return {
        healthy: false,
        message: `LifecycleManager health check failed: ${String(error)}`,
      };
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get initial state for a lifecycle
   */
  private async getInitialState(
    lifecycleId: string,
    tenantId: string
  ): Promise<LifecycleState | undefined> {
    const result = await this.db
      .selectFrom("meta.lifecycle_state")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("lifecycle_id", "=", lifecycleId)
      .orderBy("sort_order", "asc")
      .limit(1)
      .executeTakeFirst();

    if (!result) {
      return undefined;
    }

    return this.mapStateRow(result);
  }

  /**
   * Get lifecycle state by ID
   */
  private async getState(
    stateId: string,
    tenantId: string
  ): Promise<LifecycleState> {
    const result = await this.db
      .selectFrom("meta.lifecycle_state")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", stateId)
      .executeTakeFirst();

    if (!result) {
      throw new Error(`Lifecycle state not found: ${stateId}`);
    }

    return this.mapStateRow(result);
  }

  /**
   * Find transition for operation from current state
   */
  private async findTransition(
    lifecycleId: string,
    fromStateId: string,
    operationCode: string,
    tenantId: string
  ): Promise<LifecycleTransition | undefined> {
    const result = await this.db
      .selectFrom("meta.lifecycle_transition")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("lifecycle_id", "=", lifecycleId)
      .where("from_state_id", "=", fromStateId)
      .where("operation_code", "=", operationCode)
      .where("is_active", "=", true)
      .limit(1)
      .executeTakeFirst();

    if (!result) {
      return undefined;
    }

    return this.mapTransitionRow(result);
  }

  /**
   * Get all transitions from a state
   */
  private async getTransitionsFromState(
    lifecycleId: string,
    fromStateId: string,
    tenantId: string
  ): Promise<LifecycleTransition[]> {
    const rows = await this.db
      .selectFrom("meta.lifecycle_transition")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("lifecycle_id", "=", lifecycleId)
      .where("from_state_id", "=", fromStateId)
      .where("is_active", "=", true)
      .orderBy("operation_code")
      .execute();

    return rows.map(this.mapTransitionRow);
  }

  /**
   * Get gates for a transition
   */
  private async getGatesForTransition(
    transitionId: string,
    tenantId: string
  ): Promise<LifecycleTransitionGate[]> {
    const rows = await this.db
      .selectFrom("meta.lifecycle_transition_gate")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("transition_id", "=", transitionId)
      .execute();

    return rows.map((r) => this.mapGateRow(r as any));
  }

  /**
   * Log lifecycle event
   */
  private async logEvent(event: {
    tenantId: string;
    entityName: string;
    entityId: string;
    lifecycleId: string;
    fromStateId?: string;
    toStateId: string;
    operationCode: string;
    actorId?: string;
    payload?: Record<string, unknown>;
    correlationId?: string;
  }): Promise<EntityLifecycleEvent> {
    const result = await this.db
      .insertInto("core.entity_lifecycle_event")
      .values({
        id: uuid(),
        tenant_id: event.tenantId,
        entity_name: event.entityName,
        entity_id: event.entityId,
        lifecycle_id: event.lifecycleId,
        from_state_id: event.fromStateId ?? null,
        to_state_id: event.toStateId,
        operation_code: event.operationCode,
        occurred_at: new Date(),
        actor_id: event.actorId ?? null,
        payload: event.payload ? (JSON.stringify(event.payload) as any) : null,
        correlation_id: event.correlationId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapEventRow(result as any);
  }

  // ============================================================================
  // Row Mappers
  // ============================================================================

  private mapInstanceRow(row: {
    id: string;
    tenant_id: string;
    entity_name: string;
    entity_id: string;
    lifecycle_id: string;
    state_id: string;
    updated_at: Date;
    updated_by: string;
  }): EntityLifecycleInstance {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityName: row.entity_name,
      entityId: row.entity_id,
      lifecycleId: row.lifecycle_id,
      stateId: row.state_id,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  private mapStateRow(row: {
    id: string;
    tenant_id: string;
    lifecycle_id: string;
    code: string;
    name: string;
    is_terminal: boolean;
    sort_order: number;
    created_at: Date;
    created_by: string;
  }): LifecycleState {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      lifecycleId: row.lifecycle_id,
      code: row.code,
      name: row.name,
      isTerminal: row.is_terminal,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  private mapTransitionRow(row: {
    id: string;
    tenant_id: string;
    lifecycle_id: string;
    from_state_id: string;
    to_state_id: string;
    operation_code: string;
    is_active: boolean;
    created_at: Date;
    created_by: string;
  }): LifecycleTransition {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      lifecycleId: row.lifecycle_id,
      fromStateId: row.from_state_id,
      toStateId: row.to_state_id,
      operationCode: row.operation_code,
      isActive: row.is_active,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  private mapGateRow(row: {
    id: string;
    tenant_id: string;
    transition_id: string;
    required_operations: string[] | null;
    approval_template_id: string | null;
    conditions: Record<string, unknown> | null;
    threshold_rules: Record<string, unknown> | null;
    created_at: Date;
    created_by: string;
  }): LifecycleTransitionGate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      transitionId: row.transition_id,
      requiredOperations: row.required_operations ?? undefined,
      approvalTemplateId: row.approval_template_id ?? undefined,
      conditions: row.conditions ?? undefined,
      thresholdRules: row.threshold_rules ?? undefined,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  private mapEventRow(row: {
    id: string;
    tenant_id: string;
    entity_name: string;
    entity_id: string;
    lifecycle_id: string;
    from_state_id: string | null;
    to_state_id: string;
    operation_code: string;
    occurred_at: Date;
    actor_id: string | null;
    payload: Record<string, unknown> | null;
    correlation_id: string | null;
  }): EntityLifecycleEvent {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityName: row.entity_name,
      entityId: row.entity_id,
      lifecycleId: row.lifecycle_id,
      fromStateId: row.from_state_id ?? undefined,
      toStateId: row.to_state_id,
      operationCode: row.operation_code,
      occurredAt: row.occurred_at,
      actorId: row.actor_id ?? undefined,
      payload: row.payload ?? undefined,
      correlationId: row.correlation_id ?? undefined,
    };
  }
}
