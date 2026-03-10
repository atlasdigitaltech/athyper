import { NextResponse } from "next/server";

import { hasDirectDb, getCompiledDirect } from "../../db";
import { proxyGet, requireAdminSession } from "../../helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
  params: Promise<{ entity: string }>;
}

/**
 * GET /api/admin/mesh/meta-studio/:entity/compiled
 * Returns the compiled snapshot for the entity.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;

  if (hasDirectDb()) {
    try {
      const result = await getCompiledDirect(entity, auth.tenantId);
      return NextResponse.json(result);
    } catch (err) {
      console.error("[meta-studio] Direct DB get compiled failed:", err);
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: String(err) } },
        { status: 500 },
      );
    }
  }

  return proxyGet(
    auth,
    `/api/meta/entities/${encodeURIComponent(entity)}/compiled`,
  );
}
