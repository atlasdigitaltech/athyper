import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/user/profile — current principal identity, display profile, and auth binding
 *
 * Proxies to GET /api/platform/profile on the runtime backend.
 * Response: { principal, profile, auth_bindings }
 */

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/platform/profile`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ principal: null, profile: null, auth_bindings: [] });
  }
}
