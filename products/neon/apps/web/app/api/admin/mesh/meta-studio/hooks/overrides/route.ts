import { NextResponse } from "next/server";

import { requireAdminSession } from "../../helpers";
import { getDb, hasDirectDb } from "../../db";

import type { NextRequest } from "next/server";

/**
 * GET /api/admin/mesh/meta-studio/hooks/overrides?lifecycleId=<uuid>
 * List active overrides for a lifecycle's hooks.
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

  const lifecycleId = request.nextUrl.searchParams.get("lifecycleId");
  if (!lifecycleId) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION", message: "lifecycleId query parameter is required" } },
      { status: 400 },
    );
  }

  const db = await getDb();

  const rows = await (db as any)
    .selectFrom("meta.lifecycle_hook_override")
    .selectAll()
    .where("tenant_id", "=", auth.tenantId)
    .where("is_active", "=", true)
    .where(
      "target_hook_id",
      "in",
      (db as any)
        .selectFrom("meta.lifecycle_transition_hook")
        .select("id")
        .where(
          "transition_id",
          "in",
          (db as any)
            .selectFrom("meta.lifecycle_transition")
            .select("id")
            .where("lifecycle_id", "=", lifecycleId)
            .where("tenant_id", "=", auth.tenantId),
        ),
    )
    .orderBy("created_at", "asc")
    .execute();

  return NextResponse.json({ success: true, data: rows });
}

/**
 * POST /api/admin/mesh/meta-studio/hooks/overrides
 * Create an override directive on a hook.
 *
 * Body: { targetHookId, overrideKind, replacementAction?, replacementConfig?, sortOrder?, reason? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  if (!hasDirectDb()) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: "Direct DB required" } },
      { status: 503 },
    );
  }

  const body = await request.json();
  const { targetHookId, overrideKind, replacementAction, replacementConfig, sortOrder, reason } = body;

  if (!targetHookId || !overrideKind) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION", message: "targetHookId and overrideKind are required" } },
      { status: 400 },
    );
  }

  if (!["suppress", "replace", "add_before", "add_after"].includes(overrideKind)) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION", message: "overrideKind must be suppress, replace, add_before, or add_after" } },
      { status: 400 },
    );
  }

  if (overrideKind !== "suppress" && !replacementAction) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION", message: "replacementAction is required for non-suppress overrides" } },
      { status: 400 },
    );
  }

  const db = await getDb();
  const id = crypto.randomUUID();

  try {
    // The DB trigger trg_hook_override_guard enforces safety rules
    await (db as any)
      .insertInto("meta.lifecycle_hook_override")
      .values({
        id,
        tenant_id: auth.tenantId,
        target_hook_id: targetHookId,
        override_kind: overrideKind,
        replacement_action: replacementAction ?? null,
        replacement_config: replacementConfig ? JSON.stringify(replacementConfig) : null,
        sort_order: sortOrder ?? 0,
        reason: reason ?? null,
        is_active: true,
        created_by: auth.sid,
      })
      .execute();

    const row = await (db as any)
      .selectFrom("meta.lifecycle_hook_override")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error: any) {
    // DB trigger errors are returned as 400 with the constraint message
    return NextResponse.json(
      { success: false, error: { code: "DB_ERROR", message: error.message } },
      { status: 400 },
    );
  }
}

/**
 * DELETE /api/admin/mesh/meta-studio/hooks/overrides?id=<uuid>
 * Deactivate an override directive.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  if (!hasDirectDb()) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: "Direct DB required" } },
      { status: 503 },
    );
  }

  const overrideId = request.nextUrl.searchParams.get("id");
  if (!overrideId) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION", message: "id query parameter is required" } },
      { status: 400 },
    );
  }

  const db = await getDb();

  // Verify ownership
  const existing = await (db as any)
    .selectFrom("meta.lifecycle_hook_override")
    .select(["tenant_id"])
    .where("id", "=", overrideId)
    .executeTakeFirst();

  if (!existing) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Override not found" } },
      { status: 404 },
    );
  }

  if (existing.tenant_id !== auth.tenantId) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Cannot remove another tenant's override" } },
      { status: 403 },
    );
  }

  await (db as any)
    .updateTable("meta.lifecycle_hook_override")
    .set({ is_active: false })
    .where("id", "=", overrideId)
    .execute();

  return NextResponse.json({ success: true });
}
