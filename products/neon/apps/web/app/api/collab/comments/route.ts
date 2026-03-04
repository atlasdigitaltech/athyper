/**
 * Comments API Routes
 *
 * GET /api/collab/comments - List comments for an entity
 * POST /api/collab/comments - Create a new comment
 */

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest} from "next/server";

/**
 * GET /api/collab/comments
 *
 * Query Parameters:
 * - entityType: string (required) - Entity type
 * - entityId: string (required) - Entity ID
 * - limit: number (optional, default: 50) - Max comments to return
 * - offset: number (optional, default: 0) - Pagination offset
 */
export async function GET(req: NextRequest) {
  // Authenticate
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: "Missing required parameters: entityType and entityId" },
        { status: 400 }
      );
    }

    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");

    // Build query parameters
    const params = new URLSearchParams();
    params.set("entityType", entityType);
    params.set("entityId", entityId);
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(`${backendUrl}/api/collab/comments?${params}`, {
      headers: {
        Cookie: req.headers.get("cookie") || "",
        "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Comments API error:", error);
      return NextResponse.json(
        { error: "Failed to fetch comments", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Comments route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/collab/comments
 *
 * Body:
 * - entityType: string (required)
 * - entityId: string (required)
 * - commentText: string (required)
 */
export async function POST(req: NextRequest) {
  // Authenticate
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { entityType, entityId, commentText } = body;

    if (!entityType || !entityId || !commentText) {
      return NextResponse.json(
        { error: "Missing required fields: entityType, entityId, commentText" },
        { status: 400 }
      );
    }

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(`${backendUrl}/api/collab/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("cookie") || "",
        "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
      },
      body: JSON.stringify({ entityType, entityId, commentText }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Create comment error:", error);
      return NextResponse.json(
        { error: "Failed to create comment", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Create comment route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 }
    );
  }
}
