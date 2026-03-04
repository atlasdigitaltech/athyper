/**
 * Comment Replies API Routes
 *
 * POST /api/collab/comments/[id]/replies - Create a reply to a comment
 * GET /api/collab/comments/[id]/replies - List replies for a comment
 */

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest} from "next/server";

/**
 * POST /api/collab/comments/:id/replies
 *
 * Create a reply to a comment (Phase 6: Threading)
 *
 * Body:
 * - entityType: string (required)
 * - entityId: string (required)
 * - commentText: string (required)
 * - attachmentIds: string[] (optional)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: parentCommentId } = await params;
    const body = await req.json();
    const { entityType, entityId, commentText, attachmentIds } = body;

    if (!entityType || !entityId || !commentText) {
      return NextResponse.json(
        {
          error: "Missing required fields: entityType, entityId, commentText",
        },
        { status: 400 }
      );
    }

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(
      `${backendUrl}/api/collab/comments/${parentCommentId}/replies`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: req.headers.get("cookie") || "",
          "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
        },
        body: JSON.stringify({ entityType, entityId, commentText, attachmentIds }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Create reply error:", error);
      return NextResponse.json(
        { error: "Failed to create reply", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Create reply route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/collab/comments/:id/replies
 *
 * List replies for a comment (Phase 6: Threading)
 *
 * Query:
 * - limit: number (optional, default 50)
 * - offset: number (optional, default 0)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: parentCommentId } = await params;
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");

    // Build query string
    const queryParts: string[] = [];
    if (limit) queryParts.push(`limit=${encodeURIComponent(limit)}`);
    if (offset) queryParts.push(`offset=${encodeURIComponent(offset)}`);
    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(
      `${backendUrl}/api/collab/comments/${parentCommentId}/replies${queryString}`,
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
      console.error("List replies error:", error);
      return NextResponse.json(
        { error: "Failed to fetch replies", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("List replies route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 }
    );
  }
}
