import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

const BASE = `${RUNTIME_API_URL}/api/content/quota`;

/**
 * GET  /api/content/quota  — current usage per kind
 * POST /api/content/quota  — upsert quota config for a kind
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [usageRes, configRes] = await Promise.all([
      fetch(`${BASE}/usage`,  { headers: buildRuntimeHeaders(session), cache: "no-store" }),
      fetch(`${BASE}/config`, { headers: buildRuntimeHeaders(session), cache: "no-store" }),
    ]);
    const usage  = await usageRes.json().catch(() => ({ data: [] }));
    const config = await configRes.json().catch(() => ({ data: [] }));
    return NextResponse.json({ usage: usage.data ?? [], config: config.data ?? [] });
  } catch {
    return NextResponse.json({ usage: [], config: [] });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const res  = await fetch(`${BASE}/config`, {
    method:  "POST",
    headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
