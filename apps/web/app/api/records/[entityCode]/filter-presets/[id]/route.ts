import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * DELETE /api/records/[entityCode]/filter-presets/[id]  — delete own preset
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ entityCode: string; id: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityCode, id } = await params;

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/records/${entityCode}/filter-presets/${id}`,
      { method: "DELETE", headers: buildRuntimeHeaders(session), cache: "no-store" },
    );
    if (!res.ok && res.status !== 204) {
      return NextResponse.json({ error: "Upstream error" }, { status: res.status });
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Filter presets unavailable" }, { status: 502 });
  }
}
