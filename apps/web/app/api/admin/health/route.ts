import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/admin/health
 *
 * Probes platform service health: Redis, Athyper IAM, API Mesh.
 * Proxies to the runtime backend's health endpoint.
 * Shape: { services: [{ name, status, latency_ms, error? }] }
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/platform/admin/health`,
      {
        headers: buildRuntimeHeaders(session),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Health check unavailable" },
        { status: res.status },
      );
    }

    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(
      { error: "Health service unavailable" },
      { status: 503 },
    );
  }
}
