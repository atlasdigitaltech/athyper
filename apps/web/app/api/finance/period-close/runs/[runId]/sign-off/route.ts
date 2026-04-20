import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * POST /api/finance/period-close/runs/[runId]/sign-off
 *
 * BFF proxy — sign off a phase and advance (or complete) the close run.
 * Body: { phaseCode: string, remarks?: string }
 * Returns: { runId, runStatus, nextPhaseCode?, message }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;

  try {
    const body = await request.json();
    const res = await fetch(
      `${RUNTIME_API_URL}/api/finance/period-close/runs/${encodeURIComponent(runId)}/sign-off`,
      {
        method: "POST",
        headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/finance/period-close/sign-off]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
