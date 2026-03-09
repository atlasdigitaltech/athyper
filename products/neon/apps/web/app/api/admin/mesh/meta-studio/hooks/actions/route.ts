import { NextResponse } from "next/server";

import { requireAdminSession } from "../../helpers";
import { getDb, hasDirectDb } from "../../db";

import type { NextRequest } from "next/server";

/**
 * GET /api/admin/mesh/meta-studio/hooks/actions
 * List all registered hook actions visible to the tenant.
 *
 * Query params:
 *   includeInactive=true  — include deactivated actions
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

  const db = await getDb();
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";

  let query = db
    .selectFrom("meta.hook_action_registry" as any)
    .selectAll()
    .where((eb: any) =>
      eb.or([
        eb("origin", "=", "system"),
        eb.and([eb("origin", "=", "tenant"), eb("tenant_id", "=", auth.tenantId)]),
      ]),
    )
    .orderBy("origin", "asc")
    .orderBy("action_key", "asc");

  if (!includeInactive) {
    query = query.where("is_active", "=", true);
  }

  const rows = await query.execute();

  return NextResponse.json({ success: true, data: rows });
}

/**
 * POST /api/admin/mesh/meta-studio/hooks/actions
 * Register a new tenant-scoped hook action.
 *
 * Body: { actionKey, label, description?, handlerType, handlerConfig?, defaultContractRole?, defaultSafetyLevel? }
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
  const { actionKey, label, description, handlerType, handlerConfig, defaultContractRole, defaultSafetyLevel } = body;

  if (!actionKey || !label || !handlerType) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION", message: "actionKey, label, and handlerType are required" } },
      { status: 400 },
    );
  }

  if (!["built_in", "emit_event"].includes(handlerType)) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION", message: "handlerType must be 'built_in' or 'emit_event'" } },
      { status: 400 },
    );
  }

  const db = await getDb();
  const id = crypto.randomUUID();

  try {
    await (db as any)
      .insertInto("meta.hook_action_registry")
      .values({
        id,
        tenant_id: auth.tenantId,
        action_key: actionKey,
        origin: "tenant",
        label,
        description: description ?? null,
        handler_type: handlerType,
        handler_config: handlerConfig ? JSON.stringify(handlerConfig) : null,
        default_contract_role: defaultContractRole ?? "extension",
        default_safety_level: defaultSafetyLevel ?? "replaceable",
        is_active: true,
        created_by: auth.sid,
      })
      .execute();

    const row = await (db as any)
      .selectFrom("meta.hook_action_registry")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "DB_ERROR", message: error.message } },
      { status: 400 },
    );
  }
}
