import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/policy/rules/[ruleId]/versions
 *
 * Returns the version history for a policy rule.
 * Used by the History tab in PolicyCard to show rule change audit trail.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ruleId } = await params;

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/policy/rules/${encodeURIComponent(ruleId)}/versions`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ items: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
