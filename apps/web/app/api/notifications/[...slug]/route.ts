import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type Params = { params: Promise<{ slug: string[] }> };

/**
 * POST /api/notifications/{id}/read
 * POST /api/notifications/read-all
 *
 * Proxies notification mutation sub-paths to the platform service.
 * Returns 204 (no-op) if the upstream is not yet available.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const subPath = "/" + slug.join("/");

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/platform/notifications${subPath}`,
      {
        method: "POST",
        headers: {
          ...buildRuntimeHeaders(session),
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    if (res.status === 204) return new NextResponse(null, { status: 204 });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Backend not yet available — silently succeed so the UI cache refresh works
    return new NextResponse(null, { status: 204 });
  }
}
