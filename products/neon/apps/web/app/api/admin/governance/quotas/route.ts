/**
 * Quota Utilization & Enforcement API
 *
 * GET /api/admin/governance/quotas → all quotas with utilization
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getApiContext, resolveTenantUuid, unauthorizedResponse } from "@/lib/api-context";

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not configured" } },
      { status: 503 },
    );
  }

  const { context } = await getApiContext();
  if (!context) return unauthorizedResponse();
  const tid = await resolveTenantUuid(db, context.tenantId);

  try {
    const quotas = await sql<{
      id: string;
      quota_key: string;
      quota_name: string;
      category: string;
      limit_value: number;
      limit_unit: string;
      warning_pct: number;
      enforcement: string;
      overage_action: string;
      current_value: number;
      version: number;
      is_active: boolean;
    }>`
      SELECT q.id, q.quota_key, q.quota_name, q.category,
             q.limit_value, q.limit_unit, q.warning_pct,
             q.enforcement, q.overage_action,
             q.current_value, q.version, q.is_active
      FROM core.tenant_resource_quota q
      WHERE q.tenant_id = ${tid}::uuid
      ORDER BY q.category, q.quota_key
    `.execute(db);

    return NextResponse.json({
      success: true,
      data: quotas.rows.map((q) => {
        const utilization = q.limit_value > 0
          ? Math.round((q.current_value / q.limit_value) * 10000) / 100
          : 0;
        return {
          id: q.id,
          quotaKey: q.quota_key,
          quotaName: q.quota_name,
          category: q.category,
          limitValue: q.limit_value,
          limitUnit: q.limit_unit,
          warningPct: q.warning_pct,
          enforcement: q.enforcement,
          overageAction: q.overage_action,
          currentValue: q.current_value,
          utilizationPct: utilization,
          status: utilization >= 100 ? "EXCEEDED" : utilization >= q.warning_pct ? "WARNING" : "OK",
          version: q.version,
          isActive: q.is_active,
        };
      }),
    });
  } catch (err) {
    console.error("[governance/quotas] Error:", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 },
    );
  }
}
