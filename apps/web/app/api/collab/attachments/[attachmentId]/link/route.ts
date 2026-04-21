"use server";

import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type Params = { params: Promise<{ attachmentId: string }> };

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { attachmentId } = await params;
  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));
  headers.set("Content-Type", "application/json");

  try {
    const body = await req.json();
    const upstream = await fetch(
      `${RUNTIME_API_URL}/api/collab/attachments/${attachmentId}/link`,
      { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" },
    );
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error("[collab/attachments/link] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { attachmentId } = await params;
  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));
  headers.set("Content-Type", "application/json");

  try {
    const body = await req.json();
    const upstream = await fetch(
      `${RUNTIME_API_URL}/api/collab/attachments/${attachmentId}/link`,
      { method: "DELETE", headers, body: JSON.stringify(body), cache: "no-store" },
    );
    if (upstream.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch (err) {
    console.error("[collab/attachments/unlink] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
