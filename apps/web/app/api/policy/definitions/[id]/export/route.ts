import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/policy/definitions/[id]/export
 *
 * Downloads a policy bundle as JSON.
 * The runtime sets Content-Disposition: attachment; filename="policy_<entity>_export.json"
 * which triggers a browser Save-As dialog when opened directly.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/policy/definitions/${id}/export`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "EXPORT_FAILED" }, { status: res.status });
    }

    const body        = await res.arrayBuffer();
    const contentType = res.headers.get("Content-Type") ?? "application/json";
    const disposition = res.headers.get("Content-Disposition");

    const headers: Record<string, string> = { "Content-Type": contentType };
    if (disposition) headers["Content-Disposition"] = disposition;

    return new NextResponse(body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
