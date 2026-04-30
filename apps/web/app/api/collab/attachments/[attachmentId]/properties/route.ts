"use server";

import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { attachmentId } = await params;
  const body = await req.json().catch(() => ({}));
  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));
  headers.set("Content-Type", "application/json");

  try {
    const upstream = await fetch(
      `${RUNTIME_API_URL}/api/collab/attachments/${attachmentId}/properties`,
      { method: "PATCH", headers, body: JSON.stringify(body), cache: "no-store" },
    );
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error("[collab/attachments/properties] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
