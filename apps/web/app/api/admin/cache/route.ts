import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * POST /api/admin/cache/clear?scope=app|rbac
 *
 * Clears the specified cache scope on the runtime backend.
 * Requires an authenticated session — backend enforces admin privileges.
 */
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") ?? "app";

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/platform/admin/cache/clear?scope=${scope}`,
      {
        method: "POST",
        headers: buildRuntimeHeaders(session),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Cache clear failed (scope: ${scope})` },
        { status: res.status },
      );
    }

    return NextResponse.json({
      message: `Cache cleared successfully`,
      detail: `Scope: ${scope}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Cache service unavailable" },
      { status: 503 },
    );
  }
}
