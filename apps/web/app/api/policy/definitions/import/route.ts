import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * POST /api/policy/definitions/import
 *
 * Imports a policy bundle (definitions + rules) exported from another tenant
 * or environment. Body: { definition, rules, overwrite? }
 * Returns: { policiesImported, rulesImported }
 *
 * NOTE: This is a static segment that takes precedence over /definitions/[id]
 * in Next.js route resolution.
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const res = await fetch(`${RUNTIME_API_URL}/api/policy/definitions/import`, {
      method: "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
