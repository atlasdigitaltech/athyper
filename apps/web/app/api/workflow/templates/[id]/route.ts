import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * PUT /api/workflow/templates/[id]
 *
 * Orchestrates a full template replacement:
 *   1. PATCH header fields (name, description, behaviors, is_active, sla_policy_id)
 *   2. Delete all existing stages
 *   3. Re-create stages with rules
 *   4. Trigger a compile to update compiled_json + compiled_hash
 *
 * The server's PUT /workflow/templates/:id only patches header fields — stage
 * replacement is handled here so the UI can issue a single save operation.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id }   = await params;
  const headers  = buildRuntimeHeaders(session);
  const jsonHdrs = { ...headers, "Content-Type": "application/json" };
  const base     = `${RUNTIME_API_URL}/api/workflow/templates/${encodeURIComponent(id)}`;

  const payload = await request.json() as Record<string, unknown>;
  const stages  = (payload["stages"] as unknown[] | undefined) ?? [];

  // Step 1: update header fields
  const patchRes = await fetch(base, {
    method:  "PUT",
    headers: jsonHdrs,
    body:    JSON.stringify({
      name:          payload["name"],
      description:   payload["description"],
      behaviors:     payload["behaviors"],
      is_active:     payload["is_active"],
      sla_policy_id: payload["sla_policy_id"],
    }),
  });
  if (!patchRes.ok) {
    const data = await patchRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: patchRes.status });
  }

  // Step 2: fetch + delete existing stages
  try {
    const stRes  = await fetch(`${base}/stages`, { headers, cache: "no-store" });
    const stBody = await stRes.json() as { stages?: Array<{ id: string }> };
    const existingStages = stBody.stages ?? [];

    await Promise.all(
      existingStages.map((s) =>
        fetch(`${base}/stages/${s.id}`, { method: "DELETE", headers })
      )
    );
  } catch {
    // Non-fatal — proceed to re-create
  }

  // Step 3: re-create stages with rules
  for (const stage of stages as Array<Record<string, unknown>>) {
    const stRes = await fetch(`${base}/stages`, {
      method:  "POST",
      headers: jsonHdrs,
      body:    JSON.stringify({
        stage_no:      stage["stage_no"],
        name:          stage["name"],
        mode:          stage["mode"],
        quorum:        stage["quorum"],
        sla_policy_id: stage["sla_policy_id"],
      }),
    });
    if (!stRes.ok) continue;
    const stData = await stRes.json() as { id?: string };
    const stageId = stData["id"];
    if (!stageId) continue;

    const rules = (stage["rules"] as Array<Record<string, unknown>>) ?? [];
    for (const rule of rules) {
      await fetch(`${base}/stages/${stageId}/rules`, {
        method:  "POST",
        headers: jsonHdrs,
        body:    JSON.stringify({
          priority:   rule["priority"],
          conditions: rule["conditions"],
          assign_to:  rule["assign_to"],
        }),
      });
    }
  }

  // Step 4: recompile
  await fetch(`${base}/compile`, { method: "POST", headers }).catch(() => null);

  return NextResponse.json({ ok: true });
}
