import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/user/tenant-admin — read-only tenant administration view.
 *   Returns tenant, tenant_profile, modules, features, permission_overrides.
 *   Backend gates on tenant_admin group membership (returns 403 otherwise).
 *
 * Proxies to GET /api/platform/tenant-admin on the runtime backend.
 */

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/platform/tenant-admin`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to load tenant data" }, { status: 500 });
  }
}
