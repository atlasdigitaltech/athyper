"use server";

import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const entityType = searchParams.get("entity_type");
  const entityId   = searchParams.get("entity_id");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "Missing entity_type or entity_id" }, { status: 400 });
  }

  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));

  try {
    const upstream = await fetch(
      `${RUNTIME_API_URL}/api/collab/entity-attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`,
      { method: "GET", headers, cache: "no-store" },
    );
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error("[collab/entity-attachments] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
