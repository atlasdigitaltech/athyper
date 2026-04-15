import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * POST /api/finance/journals/[jeId]/submit
 *
 * BFF proxy — submits a journal entry for approval.
 *
 * Responses from runtime:
 *   200 { workflowRequestId: null, canPostDirectly: true [, policyAction, warning] }
 *       — no approval workflow configured; policy advisory may be present.
 *   200 { workflowRequestId, status, isExisting: true, canPostDirectly: false [, policyAction] }
 *       — approval already in progress; returns existing request id.
 *   202 { workflowRequestId, status, canPostDirectly: false [, policyAction] }
 *       — workflow request created; posting blocked until approved.
 *   403 POLICY_DENIED — blocked by an active deny policy rule.
 *   409 INVALID_JE_STATUS — JE is not in 'created' status.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jeId: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jeId } = await params;

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/journals/${jeId}/submit`, {
      method: "POST",
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/finance/journals/[jeId]/submit POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
