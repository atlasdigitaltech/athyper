import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * POST /api/admin/autofix
 *
 * Triggers the automated repair sequence on the runtime backend:
 * token refresh → cache clear → permission reload → health verify.
 *
 * Expected response shape:
 * { message, steps: [{ label, status: "ok"|"skip"|"fail", detail }] }
 */
export async function POST() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/platform/admin/autofix`,
      {
        method: "POST",
        headers: buildRuntimeHeaders(session),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Autofix failed", detail: `HTTP ${res.status}` },
        { status: res.status },
      );
    }

    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(
      { error: "Autofix service unavailable" },
      { status: 503 },
    );
  }
}
