/**
 * Entity Page Descriptor Service Implementation
 *
 * Orchestrates multiple backend services into a single descriptor
 * that tells the frontend exactly what to render.
 *
 * Capability-driven: Actions and tabs derived from EntityCapabilitiesService.
 * The capabilities layer declares what each entity supports; this service
 * filters those capabilities into actionable items based on auth, lifecycle
 * state, and approval status.
 *
 * "React is a renderer" — the backend is authoritative for all
 * UI orchestration decisions.
 */


import type { EntityCapabilitiesService } from "../capabilities/entity-capabilities.service.js";
import type { EntityOperationDescriptor } from "../capabilities/types.js";
import type {
  ActionDescriptor,
  ApprovalService,
  AvailableTransition,
  BadgeDescriptor,
  CompiledModel,
  EntityClassificationService,
  EntityPageDescriptorService,
  EntityPageDynamicDescriptor,
  EntityPageStaticDescriptor,
  LifecycleManager,
  MetaCompiler,
  PolicyGate,
  ReasonCode,
  RequestContext,
  SectionDescriptor,
  TabDescriptor,
  ViewMode,
} from "@athyper/core/meta";

// ============================================================================
// Constants
// ============================================================================

// System fields that should not appear in form sections
const SYSTEM_FIELDS = new Set([
  "id",
  "tenant_id",
  "realm_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
  "version",
]);

// Operation codes that produce destructive variants / require confirmation
const DESTRUCTIVE_OPS = new Set([
  "deny", "reject", "cancel", "void", "delete", "delete_draft",
]);

// Operation codes that produce primary (default) variant
const PRIMARY_OPS = new Set([
  "submit", "approve", "create",
]);

// Category codes from core.operation_category
const WORKFLOW_CATEGORY = "workflow";
const POSTING_CATEGORY = "posting";

// ============================================================================
// Service Implementation
// ============================================================================

export class EntityPageDescriptorServiceImpl implements EntityPageDescriptorService {
  constructor(
    private readonly compiler: MetaCompiler,
    private readonly classificationService: EntityClassificationService,
    private readonly lifecycleManager: LifecycleManager,
    private readonly approvalService: ApprovalService,
    private readonly policyGate: PolicyGate,
    private readonly capabilitiesService: EntityCapabilitiesService,
  ) {}

  // ==========================================================================
  // Static Descriptor
  // ==========================================================================

  async describeStatic(
    entityName: string,
    ctx: RequestContext,
  ): Promise<EntityPageStaticDescriptor> {
    // Compile model (cached)
    const compiledModel = await this.compiler.compile(entityName, "v1");

    // Get classification
    const { entityClass, featureFlags } =
      await this.classificationService.getClassification(entityName, ctx.tenantId);

    // Get capabilities for tab hints
    const capabilities = await this.capabilitiesService.getEntityCapabilities(
      entityName,
      ctx.tenantId,
    );

    // Build tabs from capabilities (fallback to basic tabs if no capabilities)
    const tabs: TabDescriptor[] = capabilities
      ? capabilities.tabs.map((t) => ({
          code: t.code,
          label: t.label,
          enabled: t.isEnabled,
        }))
      : [
          { code: "details", label: "Details", enabled: true },
          { code: "lifecycle", label: "Lifecycle", enabled: true },
          { code: "audit", label: "Audit Log", enabled: true },
        ];

    // Build default sections from compiled fields (MVP: 2-column layout)
    const sections = this.buildDefaultSections(compiledModel);

    return {
      entityName,
      entityClass,
      featureFlags,
      compiledModelHash: compiledModel.outputHash ?? compiledModel.hash,
      tabs,
      sections,
    };
  }

  // ==========================================================================
  // Dynamic Descriptor
  // ==========================================================================

  async describeDynamic(
    entityName: string,
    entityId: string,
    ctx: RequestContext,
    requestedViewMode?: ViewMode,
  ): Promise<EntityPageDynamicDescriptor> {
    // 1. Get capabilities (cached — typically <1ms on cache hit)
    const capabilities = await this.capabilitiesService.getEntityCapabilities(
      entityName,
      ctx.tenantId,
    );

    // 2. Filter for DETAIL surface operations
    const detailOps = capabilities?.operations.filter(
      (op) => op.surface === "DETAIL" || op.surface === "BOTH",
    ) ?? [];

    // 3. Build authorization check list
    //    Always include basic CRUD for view mode resolution
    const authChecks: Array<{ action: string; resource: string }> = [
      { action: "read", resource: entityName },
      { action: "create", resource: entityName },
      { action: "update", resource: entityName },
      { action: "delete", resource: entityName },
    ];
    const basicActions = new Set(["read", "create", "update", "delete"]);
    for (const op of detailOps) {
      if (!basicActions.has(op.code)) {
        authChecks.push({ action: op.code, resource: entityName });
      }
    }

    // 4. Parallel fetch: lifecycle state, transitions, approval, permissions
    const [
      currentStateResult,
      availableTransitions,
      approvalInstance,
      userTasks,
      permissionDecisions,
    ] = await Promise.all([
      this.safeGetCurrentState(entityName, entityId, ctx.tenantId),
      this.safeGetAvailableTransitions(entityName, entityId, ctx),
      this.approvalService.getInstanceForEntity(entityName, entityId, ctx.tenantId),
      this.approvalService.getTasksForUser(ctx.userId, ctx.tenantId, { pageSize: 100 }),
      this.policyGate.authorizeMany(authChecks, ctx),
    ]);

    // 5. Build permissions map
    const permissions: Record<string, boolean> = {};
    for (const [key, decision] of permissionDecisions) {
      const action = key.split(":")[0];
      permissions[action] = decision.allowed;
    }

    // 6. Resolve view mode
    const { resolvedViewMode, viewModeReason } = this.resolveViewMode(
      requestedViewMode ?? "view",
      permissions,
      currentStateResult,
      approvalInstance?.status,
    );

    // 7. Filter user tasks to this entity
    const myTasks = userTasks.data.filter(
      (t) => t.approvalInstanceId === approvalInstance?.id,
    );

    // 8. Build badges
    const badges = this.buildBadges(currentStateResult, approvalInstance);

    // 9. Build capability-driven actions
    const actions = this.buildCapabilityDrivenActions(
      detailOps,
      availableTransitions,
      permissions,
      approvalInstance,
      myTasks,
    );

    return {
      entityName,
      entityId,
      resolvedViewMode,
      viewModeReason,
      currentState: currentStateResult
        ? {
            stateId: currentStateResult.state.id,
            stateCode: currentStateResult.state.code,
            stateName: currentStateResult.state.name,
            isTerminal: currentStateResult.state.isTerminal,
          }
        : undefined,
      badges,
      actions,
      approval: approvalInstance
        ? {
            instanceId: approvalInstance.id,
            status: approvalInstance.status,
            myTasks,
          }
        : undefined,
      permissions,
    };
  }

  // ==========================================================================
  // Private: Capability-Driven Action Building
  // ==========================================================================

  /**
   * Build ActionDescriptor[] from capability operations, filtered by:
   * - Workflow ops → only if a matching lifecycle transition exists (uses transition.authorized)
   * - Entity/utility/collaboration ops → only if policyGate authorized the operation
   * - Approval task actions → injected if user has pending tasks (from approval subsystem)
   */
  private buildCapabilityDrivenActions(
    detailOps: EntityOperationDescriptor[],
    availableTransitions: AvailableTransition[],
    permissions: Record<string, boolean>,
    approvalInstance: Awaited<ReturnType<ApprovalService["getInstanceForEntity"]>>,
    myTasks: Array<{ id: string; status: string }>,
  ): ActionDescriptor[] {
    const actions: ActionDescriptor[] = [];

    // Index lifecycle transitions by operation code for O(1) lookup
    const transitionMap = new Map(
      availableTransitions.map((t) => [t.operationCode.toLowerCase(), t]),
    );

    for (const op of detailOps) {
      if (op.categoryCode === WORKFLOW_CATEGORY) {
        // Workflow operations: only actionable if a matching lifecycle transition
        // exists from the current state. Uses transition's own authorization status.
        const transition = transitionMap.get(op.code);
        if (transition) {
          actions.push({
            code: `lifecycle.${op.code}`,
            label: op.label,
            handler: `lifecycle.${op.code}`,
            variant: this.deriveVariant(op.code),
            icon: op.icon ?? undefined,
            enabled: transition.authorized,
            disabledReason: transition.authorized
              ? undefined
              : (transition.unauthorizedReason as ReasonCode) ?? "policy_denied",
            requiresConfirmation: DESTRUCTIVE_OPS.has(op.code),
            confirmationMessage: DESTRUCTIVE_OPS.has(op.code)
              ? `Are you sure you want to ${op.label.toLowerCase()} this record?`
              : undefined,
          });
        }
      } else if (op.categoryCode === POSTING_CATEGORY) {
        // Posting operations: filter by permission
        if (permissions[op.code]) {
          actions.push(this.buildPermissionAction("posting", op));
        }
      } else {
        // Entity CRUD, utilities, collaboration: filter by permission
        if (permissions[op.code]) {
          actions.push(this.buildPermissionAction("entity", op));
        }
      }
    }

    // Approval task actions (injected from approval subsystem, not from capabilities).
    // These represent "approve/reject this approval task" — distinct from lifecycle
    // transitions that happen to be named approve/deny.
    const pendingTasks = myTasks.filter((t) => t.status === "pending");
    if (pendingTasks.length > 0 && approvalInstance?.status === "open") {
      actions.push({
        code: "approval.approve",
        label: "Approve",
        handler: "approval.approve",
        variant: "default",
        enabled: true,
        requiresConfirmation: true,
        confirmationMessage: "Are you sure you want to approve?",
      });

      actions.push({
        code: "approval.reject",
        label: "Reject",
        handler: "approval.reject",
        variant: "destructive",
        enabled: true,
        requiresConfirmation: true,
        confirmationMessage: "Please provide a reason for rejection.",
      });
    }

    return actions;
  }

  /**
   * Build an ActionDescriptor for a permission-gated operation.
   */
  private buildPermissionAction(
    group: "entity" | "posting",
    op: EntityOperationDescriptor,
  ): ActionDescriptor {
    return {
      code: `${group}.${op.code}`,
      label: op.label,
      handler: `${group}.${op.code}`,
      variant: this.deriveVariant(op.code),
      icon: op.icon ?? undefined,
      enabled: true,
      requiresConfirmation: DESTRUCTIVE_OPS.has(op.code),
      confirmationMessage: DESTRUCTIVE_OPS.has(op.code)
        ? `Are you sure you want to ${op.label.toLowerCase()} this record?`
        : undefined,
    };
  }

  // ==========================================================================
  // Private: Section Building (MVP: default 2-column)
  // ==========================================================================

  private buildDefaultSections(compiledModel: CompiledModel): SectionDescriptor[] {
    // Filter out system fields
    const userFields = compiledModel.fields
      .filter((f) => !SYSTEM_FIELDS.has(f.columnName))
      .map((f) => f.name);

    if (userFields.length === 0) {
      return [];
    }

    return [
      {
        code: "main",
        label: "Details",
        columns: 2,
        fields: userFields,
      },
    ];
  }

  // ==========================================================================
  // Private: View Mode Resolution
  // ==========================================================================

  private resolveViewMode(
    requested: ViewMode,
    permissions: Record<string, boolean>,
    currentState: Awaited<ReturnType<typeof this.safeGetCurrentState>>,
    approvalStatus: string | undefined,
  ): { resolvedViewMode: ViewMode; viewModeReason?: ReasonCode } {
    // Create mode: check create permission
    if (requested === "create") {
      if (!permissions["create"]) {
        return { resolvedViewMode: "view", viewModeReason: "policy_denied" };
      }
      return { resolvedViewMode: "create" };
    }

    // Edit mode: multiple checks
    if (requested === "edit") {
      // Check update permission
      if (!permissions["update"]) {
        return { resolvedViewMode: "view", viewModeReason: "policy_denied" };
      }

      // Check terminal state
      if (currentState?.isTerminal) {
        return { resolvedViewMode: "view", viewModeReason: "terminal_state" };
      }

      // Check approval pending
      if (approvalStatus === "open") {
        return { resolvedViewMode: "view", viewModeReason: "approval_pending" };
      }

      return { resolvedViewMode: "edit" };
    }

    // View mode: always allowed if read permission exists
    return { resolvedViewMode: "view" };
  }

  // ==========================================================================
  // Private: Badge Building
  // ==========================================================================

  private buildBadges(
    currentState: Awaited<ReturnType<typeof this.safeGetCurrentState>>,
    approvalInstance: Awaited<ReturnType<ApprovalService["getInstanceForEntity"]>>,
  ): BadgeDescriptor[] {
    const badges: BadgeDescriptor[] = [];

    // Lifecycle state badge
    if (currentState) {
      badges.push({
        code: "lifecycle_state",
        label: currentState.state.name,
        variant: currentState.state.isTerminal
          ? "outline"
          : "default",
      });
    }

    // Approval status badge
    if (approvalInstance) {
      const variantMap: Record<string, BadgeDescriptor["variant"]> = {
        open: "warning",
        completed: "success",
        rejected: "destructive",
        canceled: "outline",
      };

      badges.push({
        code: "approval_status",
        label: `Approval: ${approvalInstance.status}`,
        variant: variantMap[approvalInstance.status] ?? "default",
      });
    }

    return badges;
  }

  // ==========================================================================
  // Private: Variant Derivation
  // ==========================================================================

  private deriveVariant(opCode: string): ActionDescriptor["variant"] {
    if (DESTRUCTIVE_OPS.has(opCode)) return "destructive";
    if (PRIMARY_OPS.has(opCode)) return "default";
    return "outline";
  }

  // ==========================================================================
  // Private: Safe Lifecycle Access
  // ==========================================================================

  private async safeGetCurrentState(
    entityName: string,
    entityId: string,
    tenantId: string,
  ) {
    try {
      return await this.lifecycleManager.getCurrentState(entityName, entityId, tenantId);
    } catch {
      // Entity may not have lifecycle configured
      return undefined;
    }
  }

  private async safeGetAvailableTransitions(
    entityName: string,
    entityId: string,
    ctx: RequestContext,
  ): Promise<AvailableTransition[]> {
    try {
      return await this.lifecycleManager.getAvailableTransitions(entityName, entityId, ctx);
    } catch {
      // Entity may not have lifecycle configured
      return [];
    }
  }
}
