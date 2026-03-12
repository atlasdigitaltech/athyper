import { NextResponse } from "next/server";

import { hasDirectDb, listModulesDirect } from "../db";
import { requireAdminSession } from "../helpers";

/**
 * GET /api/admin/mesh/meta-studio/modules
 * Lists all modules from core.module (code + name).
 */
export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  if (hasDirectDb()) {
    try {
      const result = await listModulesDirect();
      return NextResponse.json(result);
    } catch (err) {
      console.error("[meta-studio] Direct DB modules list failed:", err);
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: String(err) } },
        { status: 500 },
      );
    }
  }

  // Fallback: return empty list if no direct DB
  return NextResponse.json({ success: true, data: [] });
}
