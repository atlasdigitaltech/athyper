import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET  /api/user/preferences — current user's persisted UI preferences
 * PATCH /api/user/preferences — save UI preferences to backend
 *
 * Body (PATCH): { appearance_mode?, density_code?, metadata? }
 * Response (GET/PATCH success): { appearance_mode, density_code, metadata }
 */

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/platform/preferences`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ appearance_mode: null, density_code: null, metadata: {} });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as Record<string, unknown>;
    const res = await fetch(`${RUNTIME_API_URL}/api/platform/preferences`, {
      method: "PATCH",
      headers: {
        ...buildRuntimeHeaders(session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
