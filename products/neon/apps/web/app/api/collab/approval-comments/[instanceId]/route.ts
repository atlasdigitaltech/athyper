/**
 * Approval Comments by Instance API Routes
 *
 * GET /api/collab/approval-comments/[instanceId] - List comments for an approval instance
 */

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest} from "next/server";

/**
 * GET /api/collab/approval-comments/:instanceId
 *
 * Query:
 * - limit: number (optional, default 100)
 * - offset: number (optional, default 0)
 * - taskId: string (optional, filter by specific task)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  // Authenticate
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { instanceId } = await params;
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");
    const taskId = searchParams.get("taskId");

    // Build query string
    const queryParts: string[] = [];
    if (limit) queryParts.push(`limit=${encodeURIComponent(limit)}`);
    if (offset) queryParts.push(`offset=${encodeURIComponent(offset)}`);
    if (taskId) queryParts.push(`taskId=${encodeURIComponent(taskId)}`);
    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(
      `${backendUrl}/api/collab/approval-comments/${instanceId}${queryString}`,
      {
        method: "GET",
        headers: {
          Cookie: req.headers.get("cookie") || "",
          "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("List approval comments error:", error);
      return NextResponse.json(
        { error: "Failed to fetch approval comments", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("List approval comments route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 }
    );
  }
}
