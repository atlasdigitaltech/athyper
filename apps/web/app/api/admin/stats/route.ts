import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/admin/stats
 *
 * BFF proxy — returns platform-level counts for the admin workbench KPI row.
 * { active_tenants, active_modules, active_principals, system_health }
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/platform/stats`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Stats unavailable" }, { status: res.status });
    }

    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Stats unavailable" }, { status: 503 });
  }
}
