import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

// ── Normalise server camelCase keys to snake_case for the UI ──────────────────

function normaliseStages(stages: unknown[]): unknown[] {
  return stages.map((s) => {
    const stage = s as Record<string, unknown>;
    const rules = ((stage["rules"] as unknown[]) ?? []).map((r) => {
      const rule = r as Record<string, unknown>;
      return {
        ...rule,
        stage_no:  rule["stageNo"]  ?? rule["stage_no"],
        assign_to: rule["assignTo"] ?? rule["assign_to"],
      };
    });
    return {
      ...stage,
      stage_no:      stage["stageNo"]     ?? stage["stage_no"],
      sla_policy_id: stage["slaPolicyId"] ?? stage["sla_policy_id"],
      rules,
    };
  });
}

/** GET /api/workflow/templates/[id]/stages — stages + rules for a template */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const url    = `${RUNTIME_API_URL}/api/workflow/templates/${encodeURIComponent(id)}/stages`;

  try {
    const res  = await fetch(url, { headers: buildRuntimeHeaders(session), cache: "no-store" });
    if (!res.ok) return NextResponse.json({ stages: [] });
    const body = await res.json() as { stages?: unknown[]; template?: unknown };
    return NextResponse.json({
      template: body.template,
      stages:   normaliseStages(body.stages ?? []),
    });
  } catch {
    return NextResponse.json({ stages: [] });
  }
}

/** POST /api/workflow/templates/[id]/stages — add a stage */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body   = await request.json();
    const url    = `${RUNTIME_API_URL}/api/workflow/templates/${encodeURIComponent(id)}/stages`;

    const res = await fetch(url, {
      method:  "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/workflow/templates/[id]/stages POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
