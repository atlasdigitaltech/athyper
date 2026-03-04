import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

/**
 * POST /api/collab/moderation/flags/:id/review
 *
 * Review a flag (dismiss, hide comment, or delete comment).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const flagId = id;
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";

    const response = await fetch(
      `${backendUrl}/api/collab/moderation/flags/${flagId}/review`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: req.headers.get("cookie") || "",
          "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
        },
        body: JSON.stringify(body),
      },
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error reviewing flag:", error);
    return NextResponse.json(
      { error: "Failed to review flag" },
      { status: 500 },
    );
  }
}
