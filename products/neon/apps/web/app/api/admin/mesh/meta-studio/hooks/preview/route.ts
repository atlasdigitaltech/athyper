import { NextResponse } from "next/server";

import { requireAdminSession } from "../../helpers";
import { getDb, hasDirectDb } from "../../db";

import type { NextRequest } from "next/server";

/**
 * GET /api/admin/mesh/meta-studio/hooks/preview?transitionId=<uuid>&timing=on_success
 * Dry-run hook resolution for a transition.
 * Returns what would execute without actually running anything.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  if (!hasDirectDb()) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: "Direct DB required" } },
      { status: 503 },
    );
  }

  const transitionId = request.nextUrl.searchParams.get("transitionId");
  const timing = request.nextUrl.searchParams.get("timing") ?? "on_success";

  if (!transitionId) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION", message: "transitionId query parameter is required" } },
      { status: 400 },
    );
  }

  const db = await getDb();

  // Load hooks with deterministic ordering
  const hooks = await (db as any)
    .selectFrom("meta.lifecycle_transition_hook")
    .selectAll()
    .where("transition_id", "=", transitionId)
    .where("tenant_id", "=", auth.tenantId)
    .where("timing", "=", timing)
    .where("is_active", "=", true)
    .orderBy("layer_rank", "asc")
    .orderBy("sort_order", "asc")
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .execute();

  if (hooks.length === 0) {
    return NextResponse.json({
      success: true,
      data: { transitionId, timing, nodes: [], suppressed: [], replaced: [] },
    });
  }

  // Load active overrides
  const hookIds = hooks.map((h: any) => h.id);
  const overrides = await (db as any)
    .selectFrom("meta.lifecycle_hook_override")
    .selectAll()
    .where("tenant_id", "=", auth.tenantId)
    .where("target_hook_id", "in", hookIds)
    .where("is_active", "=", true)
    .execute();

  const overrideByTarget = new Map<string, any>();
  for (const ov of overrides) {
    overrideByTarget.set(ov.target_hook_id, ov);
  }

  // Build execution plan (mirrors resolveHookPlan in lifecycle-manager.service.ts)
  const nodes: any[] = [];
  const suppressed: any[] = [];
  const replaced: any[] = [];

  for (const hook of hooks) {
    const override = overrideByTarget.get(hook.id);

    if (!override) {
      nodes.push({
        sourceHookId: hook.id,
        action: hook.action,
        config: hook.config,
        origin: hook.origin,
        layerRank: hook.layer_rank,
        sortOrder: hook.sort_order,
        contractRole: hook.contract_role,
        safetyLevel: hook.safety_level,
      });
      continue;
    }

    switch (override.override_kind) {
      case "suppress":
        suppressed.push({
          hookId: hook.id,
          action: hook.action,
          overrideId: override.id,
          reason: override.reason,
        });
        break;

      case "replace":
        replaced.push({
          hookId: hook.id,
          originalAction: hook.action,
          replacementAction: override.replacement_action,
          overrideId: override.id,
        });
        nodes.push({
          sourceHookId: hook.id,
          action: override.replacement_action,
          config: override.replacement_config,
          origin: hook.origin,
          layerRank: hook.layer_rank,
          sortOrder: hook.sort_order,
          overrideApplied: "replace",
          overrideId: override.id,
        });
        break;

      case "add_before":
        nodes.push({
          sourceHookId: null,
          action: override.replacement_action,
          config: override.replacement_config,
          origin: "tenant",
          layerRank: 20,
          sortOrder: override.sort_order,
          overrideApplied: "add_before",
          overrideId: override.id,
        });
        nodes.push({
          sourceHookId: hook.id,
          action: hook.action,
          config: hook.config,
          origin: hook.origin,
          layerRank: hook.layer_rank,
          sortOrder: hook.sort_order,
        });
        break;

      case "add_after":
        nodes.push({
          sourceHookId: hook.id,
          action: hook.action,
          config: hook.config,
          origin: hook.origin,
          layerRank: hook.layer_rank,
          sortOrder: hook.sort_order,
        });
        nodes.push({
          sourceHookId: null,
          action: override.replacement_action,
          config: override.replacement_config,
          origin: "tenant",
          layerRank: 20,
          sortOrder: override.sort_order,
          overrideApplied: "add_after",
          overrideId: override.id,
        });
        break;
    }
  }

  return NextResponse.json({
    success: true,
    data: { transitionId, timing, nodes, suppressed, replaced },
  });
}
