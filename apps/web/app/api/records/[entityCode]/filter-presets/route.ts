import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET  /api/records/[entityCode]/filter-presets  — list user's + shared presets
 * POST /api/records/[entityCode]/filter-presets  — create / upsert a preset
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entityCode: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityCode } = await params;

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/records/${entityCode}/filter-presets`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: res.status });
    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Filter presets unavailable" }, { status: 502 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ entityCode: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityCode } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/records/${entityCode}/filter-presets`, {
      method: "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: res.status });
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Filter presets unavailable" }, { status: 502 });
  }
}
