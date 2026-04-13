import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * POST /api/admin/session/rebuild
 *
 * Destroys and reconstructs the server-side runtime session for the
 * current principal. The user remains authenticated (BFF session intact);
 * only the runtime-layer session state is reset.
 */
export async function POST() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/platform/admin/session/rebuild`,
      {
        method: "POST",
        headers: buildRuntimeHeaders(session),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Session rebuild failed", detail: `HTTP ${res.status}` },
        { status: res.status },
      );
    }

    return NextResponse.json({
      message: "Session rebuilt successfully",
      detail: "Runtime session reconstructed. Reload the page if issues persist.",
    });
  } catch {
    return NextResponse.json(
      { error: "Session rebuild unavailable" },
      { status: 503 },
    );
  }
}
