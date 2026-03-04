import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

/**
 * GET /api/collab/retention/archived
 *
 * List archived comments.
 */
export async function GET(req: NextRequest) {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";

    const response = await fetch(
      `${backendUrl}/api/collab/retention/archived?${searchParams.toString()}`,
      {
        method: "GET",
        headers: {
          Cookie: req.headers.get("cookie") || "",
          "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
        },
      },
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error fetching archived comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch archived comments" },
      { status: 500 },
    );
  }
}
