"use server";

import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { attachmentId } = await params;
  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));

  try {
    const upstream = await fetch(`${RUNTIME_API_URL}/api/collab/attachments/${attachmentId}`, {
      method: "DELETE",
      headers,
      cache:  "no-store",
    });
    if (upstream.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch (err) {
    console.error("[collab/attachments/[attachmentId]] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
