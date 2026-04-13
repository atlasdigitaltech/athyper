import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * POST /api/admin/user/sync-profile
 *
 * Forces re-synchronisation of the current principal's identity binding
 * from Athyper IAM → master.principal_identity_binding.
 * The active session is not interrupted.
 */
export async function POST() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/platform/admin/user/sync-profile`,
      {
        method: "POST",
        headers: buildRuntimeHeaders(session),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Profile sync failed", detail: `HTTP ${res.status}` },
        { status: res.status },
      );
    }

    return NextResponse.json({
      message: "Identity sync completed",
      detail: "principal_identity_binding updated from Athyper IAM.",
    });
  } catch {
    return NextResponse.json(
      { error: "Sync service unavailable" },
      { status: 503 },
    );
  }
}
