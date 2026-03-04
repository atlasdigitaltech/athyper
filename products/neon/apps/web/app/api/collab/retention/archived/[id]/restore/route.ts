import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest} from "next/server";

/**
 * POST /api/collab/retention/archived/:id/restore
 *
 * Restore an archived comment.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const commentId = id;
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";

    const response = await fetch(`${backendUrl}/api/collab/retention/archived/${commentId}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("cookie") || "",
        "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error restoring comment:", error);
    return NextResponse.json(
      { error: "Failed to restore comment" },
      { status: 500 }
    );
  }
}
