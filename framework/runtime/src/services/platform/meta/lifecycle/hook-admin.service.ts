/**
 * Hook Admin Service Implementation
 *
 * Provides CRUD operations for:
 * - Hook action registry: register/deactivate custom tenant actions
 * - Hook overrides: create/update/remove override directives
 * - Hook plan preview: dry-run resolution for a transition
 */

import { uuid, now } from "../data/db-helpers.js";

import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type {
  HookActionRegistration,
  HookAdminService,
  HookContractRole,
  HookExecutionPlan,
  HookHandlerType,
  HookOverrideDirective,
  HookOverrideKind,
  HookSafetyLevel,
  HookTiming,
  RequestContext,
} from "@athyper/core/meta";

export class HookAdminServiceImpl implements HookAdminService {
  constructor(private readonly db: LifecycleDB_Type) {}

  // ============================================================================
  // Registry CRUD
  // ============================================================================

  async listActions(
    tenantId: string,
    options?: { includeInactive?: boolean },
  ): Promise<HookActionRegistration[]> {
    let query = this.db
      .selectFrom("meta.hook_action_registry")
      .selectAll()
      .where((eb) =>
        eb.or([
          eb("origin", "=", "system"),
          eb.and([eb("origin", "=", "tenant"), eb("tenant_id", "=", tenantId)]),
        ]),
      )
      .orderBy("origin", "asc")
      .orderBy("action_key", "asc");

    if (!options?.includeInactive) {
      query = query.where("is_active", "=", true);
    }

    const rows = await query.execute();

    return rows.map((r) => this.mapRegistration(r));
  }

  async registerAction(
    input: {
      tenantId: string;
      actionKey: string;
      label: string;
      description?: string;
      handlerType: HookHandlerType;
      handlerConfig?: Record<string, unknown>;
      defaultContractRole?: HookContractRole;
      defaultSafetyLevel?: HookSafetyLevel;
    },
    ctx: RequestContext,
  ): Promise<HookActionRegistration> {
    const id = uuid();

    await this.db
      .insertInto("meta.hook_action_registry")
      .values({
        id,
        tenant_id: input.tenantId,
        action_key: input.actionKey,
        origin: "tenant",
        label: input.label,
        description: input.description ?? null,
        handler_type: input.handlerType,
        handler_config: input.handlerConfig ?? null,
        default_contract_role: input.defaultContractRole ?? "extension",
        default_safety_level: input.defaultSafetyLevel ?? "replaceable",
        is_active: true,
        created_at: now(),
        created_by: ctx.userId,
      })
      .execute();

    const row = await this.db
      .selectFrom("meta.hook_action_registry")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return this.mapRegistration(row!);
  }

  async deactivateAction(
    actionId: string,
    tenantId: string,
    _ctx: RequestContext,
  ): Promise<void> {
    // Verify the action is tenant-owned (system actions cannot be deactivated)
    const action = await this.db
      .selectFrom("meta.hook_action_registry")
      .select(["origin", "tenant_id"])
      .where("id", "=", actionId)
      .executeTakeFirst();

    if (!action) {
      throw new Error(`Hook action not found: ${actionId}`);
    }
    if (action.origin === "system") {
      throw new Error("Cannot deactivate a system-registered hook action");
    }
    if (action.tenant_id !== tenantId) {
      throw new Error("Cannot deactivate another tenant's hook action");
    }

    await this.db
      .updateTable("meta.hook_action_registry")
      .set({ is_active: false })
      .where("id", "=", actionId)
      .execute();
  }

  // ============================================================================
  // Override CRUD
  // ============================================================================

  async listOverrides(
    lifecycleId: string,
    tenantId: string,
  ): Promise<HookOverrideDirective[]> {
    const rows = await this.db
      .selectFrom("meta.lifecycle_hook_override")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .where(
        "target_hook_id",
        "in",
        this.db
          .selectFrom("meta.lifecycle_transition_hook")
          .select("id")
          .where(
            "transition_id",
            "in",
            this.db
              .selectFrom("meta.lifecycle_transition")
              .select("id")
              .where("lifecycle_id", "=", lifecycleId)
              .where("tenant_id", "=", tenantId),
          ),
      )
      .orderBy("created_at", "asc")
      .execute();

    return rows.map((r) => this.mapOverride(r));
  }

  async createOverride(
    input: {
      tenantId: string;
      targetHookId: string;
      overrideKind: HookOverrideKind;
      replacementAction?: string;
      replacementConfig?: Record<string, unknown>;
      sortOrder?: number;
      reason?: string;
    },
    ctx: RequestContext,
  ): Promise<HookOverrideDirective> {
    const id = uuid();

    // The DB trigger trg_hook_override_guard enforces safety rules:
    // - Cannot override contract hooks
    // - Cannot suppress/replace narrowable hooks
    // - Replacement action must exist in registry
    await this.db
      .insertInto("meta.lifecycle_hook_override")
      .values({
        id,
        tenant_id: input.tenantId,
        target_hook_id: input.targetHookId,
        override_kind: input.overrideKind,
        replacement_action: input.replacementAction ?? null,
        replacement_config: input.replacementConfig ?? null,
        sort_order: input.sortOrder ?? 0,
        reason: input.reason ?? null,
        is_active: true,
        created_at: now(),
        created_by: ctx.userId,
      })
      .execute();

    const row = await this.db
      .selectFrom("meta.lifecycle_hook_override")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return this.mapOverride(row!);
  }

  async updateOverride(
    overrideId: string,
    input: {
      overrideKind?: HookOverrideKind;
      replacementAction?: string;
      replacementConfig?: Record<string, unknown>;
      sortOrder?: number;
      reason?: string;
    },
    _ctx: RequestContext,
  ): Promise<HookOverrideDirective> {
    const updates: Record<string, unknown> = {};
    if (input.overrideKind !== undefined) updates.override_kind = input.overrideKind;
    if (input.replacementAction !== undefined) updates.replacement_action = input.replacementAction;
    if (input.replacementConfig !== undefined) updates.replacement_config = input.replacementConfig;
    if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder;
    if (input.reason !== undefined) updates.reason = input.reason;

    if (Object.keys(updates).length > 0) {
      await this.db
        .updateTable("meta.lifecycle_hook_override")
        .set(updates)
        .where("id", "=", overrideId)
        .execute();
    }

    const row = await this.db
      .selectFrom("meta.lifecycle_hook_override")
      .selectAll()
      .where("id", "=", overrideId)
      .executeTakeFirst();

    if (!row) {
      throw new Error(`Override not found: ${overrideId}`);
    }

    return this.mapOverride(row);
  }

  async removeOverride(
    overrideId: string,
    tenantId: string,
    _ctx: RequestContext,
  ): Promise<void> {
    const override = await this.db
      .selectFrom("meta.lifecycle_hook_override")
      .select(["tenant_id"])
      .where("id", "=", overrideId)
      .executeTakeFirst();

    if (!override) {
      throw new Error(`Override not found: ${overrideId}`);
    }
    if (override.tenant_id !== tenantId) {
      throw new Error("Cannot remove another tenant's override");
    }

    await this.db
      .updateTable("meta.lifecycle_hook_override")
      .set({ is_active: false })
      .where("id", "=", overrideId)
      .execute();
  }

  // ============================================================================
  // Preview
  // ============================================================================

  async previewHookPlan(
    transitionId: string,
    timing: HookTiming,
    tenantId: string,
  ): Promise<HookExecutionPlan> {
    // Load hooks with deterministic ordering
    const hooks = await this.db
      .selectFrom("meta.lifecycle_transition_hook")
      .selectAll()
      .where("transition_id", "=", transitionId)
      .where("tenant_id", "=", tenantId)
      .where("timing", "=", timing)
      .where("is_active", "=", true)
      .orderBy("layer_rank", "asc")
      .orderBy("sort_order", "asc")
      .orderBy("created_at", "asc")
      .orderBy("id", "asc")
      .execute();

    if (hooks.length === 0) {
      return { transitionId, timing, nodes: [], suppressed: [], replaced: [] };
    }

    // Load active overrides
    const hookIds = hooks.map((h) => h.id);
    const overrides = await this.db
      .selectFrom("meta.lifecycle_hook_override")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("target_hook_id", "in", hookIds)
      .where("is_active", "=", true)
      .execute();

    const overrideByTarget = new Map<string, typeof overrides[number]>();
    for (const ov of overrides) {
      overrideByTarget.set(ov.target_hook_id, ov);
    }

    const nodes: HookExecutionPlan["nodes"] = [];
    const suppressed: HookExecutionPlan["suppressed"] = [];
    const replaced: HookExecutionPlan["replaced"] = [];

    for (const hook of hooks) {
      const override = overrideByTarget.get(hook.id);

      if (!override) {
        nodes.push({
          sourceHookId: hook.id,
          action: hook.action,
          config: hook.config as Record<string, unknown> | null,
          origin: hook.origin as "system" | "tenant" | "overlay",
          layerRank: hook.layer_rank,
          sortOrder: hook.sort_order,
        });
        continue;
      }

      const kind = override.override_kind as HookOverrideKind;

      switch (kind) {
        case "suppress":
          suppressed.push({
            hookId: hook.id,
            overrideId: override.id,
            reason: override.reason ?? undefined,
          });
          break;

        case "replace":
          replaced.push({
            hookId: hook.id,
            originalAction: hook.action,
            replacementAction: override.replacement_action!,
            overrideId: override.id,
          });
          nodes.push({
            sourceHookId: hook.id,
            action: override.replacement_action!,
            config: override.replacement_config as Record<string, unknown> | null,
            origin: hook.origin as "system" | "tenant" | "overlay",
            layerRank: hook.layer_rank,
            sortOrder: hook.sort_order,
            overrideApplied: "replace",
            overrideId: override.id,
          });
          break;

        case "add_before":
          nodes.push({
            sourceHookId: null,
            action: override.replacement_action!,
            config: override.replacement_config as Record<string, unknown> | null,
            origin: "tenant",
            layerRank: 20,
            sortOrder: override.sort_order,
            overrideApplied: "add_before",
            overrideId: override.id,
          });
          nodes.push({
            sourceHookId: hook.id,
            action: hook.action,
            config: hook.config as Record<string, unknown> | null,
            origin: hook.origin as "system" | "tenant" | "overlay",
            layerRank: hook.layer_rank,
            sortOrder: hook.sort_order,
          });
          break;

        case "add_after":
          nodes.push({
            sourceHookId: hook.id,
            action: hook.action,
            config: hook.config as Record<string, unknown> | null,
            origin: hook.origin as "system" | "tenant" | "overlay",
            layerRank: hook.layer_rank,
            sortOrder: hook.sort_order,
          });
          nodes.push({
            sourceHookId: null,
            action: override.replacement_action!,
            config: override.replacement_config as Record<string, unknown> | null,
            origin: "tenant",
            layerRank: 20,
            sortOrder: override.sort_order,
            overrideApplied: "add_after",
            overrideId: override.id,
          });
          break;
      }
    }

    return { transitionId, timing, nodes, suppressed, replaced };
  }

  // ============================================================================
  // Mappers
  // ============================================================================

  private mapRegistration(row: any): HookActionRegistration {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      actionKey: row.action_key,
      origin: row.origin,
      label: row.label,
      description: row.description ?? undefined,
      handlerType: row.handler_type,
      handlerConfig: row.handler_config ?? undefined,
      defaultContractRole: row.default_contract_role,
      defaultSafetyLevel: row.default_safety_level,
      isActive: row.is_active,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  private mapOverride(row: any): HookOverrideDirective {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      targetHookId: row.target_hook_id,
      overrideKind: row.override_kind,
      replacementAction: row.replacement_action ?? undefined,
      replacementConfig: row.replacement_config ?? undefined,
      sortOrder: row.sort_order,
      reason: row.reason ?? undefined,
      isActive: row.is_active,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }
}
