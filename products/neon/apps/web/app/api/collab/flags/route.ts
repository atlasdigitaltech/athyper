import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

/**
 * POST /api/collab/flags
 *
 * Flag a comment as inappropriate.
 */
export async function POST(req: NextRequest) {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";

    const response = await fetch(`${backendUrl}/api/collab/flags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("cookie") || "",
        "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error flagging comment:", error);
    return NextResponse.json(
      { error: "Failed to flag comment" },
      { status: 500 },
    );
  }
}
