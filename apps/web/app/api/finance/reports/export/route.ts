import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * POST /api/finance/reports/export
 *
 * Validates reportCode + scope, returns a short-lived download URL.
 * The runtime mints a base64url token; the download URL uses the
 * wildcard relay (/api/relay/finance/reports/download?t=TOKEN) so
 * the browser can open it directly to stream the CSV.
 *
 * Body: { reportCode, scope, format }
 * Response: { downloadUrl, expiresIn }
 */
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json();
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/reports/export`, {
      method: "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ error: "Upstream error" }));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    console.error("[api/finance/reports/export]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 502 });
  }
}
