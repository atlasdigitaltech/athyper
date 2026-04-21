"use server";

import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type Params = { params: Promise<{ attachmentId: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { attachmentId } = await params;
  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));

  try {
    const upstream = await fetch(
      `${RUNTIME_API_URL}/api/collab/attachments/${attachmentId}/download`,
      { method: "GET", headers, redirect: "follow", cache: "no-store" },
    );

    if (!upstream.ok) {
      return NextResponse.json(await upstream.json(), { status: upstream.status });
    }

    const ct          = upstream.headers.get("Content-Type") ?? "application/octet-stream";
    const disposition = upstream.headers.get("Content-Disposition");
    const resHeaders: Record<string, string> = { "Content-Type": ct };
    if (disposition) resHeaders["Content-Disposition"] = disposition;

    return new NextResponse(await upstream.arrayBuffer(), { status: 200, headers: resHeaders });
  } catch (err) {
    console.error("[collab/attachments/download] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
