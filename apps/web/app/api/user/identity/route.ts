import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/user/identity — current principal's RBAC context:
 *   persona, group memberships + roles, team memberships, delegations
 *
 * Proxies to GET /api/platform/identity on the runtime backend.
 * Response: { persona, groups, teams, delegations_received, delegations_given }
 */

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/platform/identity`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({
      persona: null,
      groups: [],
      teams: [],
      delegations_received: [],
      delegations_given: [],
    });
  }
}
