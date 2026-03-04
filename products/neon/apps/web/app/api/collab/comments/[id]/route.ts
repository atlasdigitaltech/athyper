/**
 * Individual Comment API Routes
 *
 * PATCH /api/collab/comments/[id] - Update a comment
 * DELETE /api/collab/comments/[id] - Delete a comment
 */

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

/**
 * PATCH /api/collab/comments/[id]
 *
 * Body:
 * - commentText: string (required)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Authenticate
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { commentText } = body;

    if (!commentText) {
      return NextResponse.json(
        { error: "Missing required field: commentText" },
        { status: 400 },
      );
    }

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(`${backendUrl}/api/collab/comments/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("cookie") || "",
        "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
      },
      body: JSON.stringify({ commentText }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Update comment error:", error);
      return NextResponse.json(
        { error: "Failed to update comment", details: error },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Update comment route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/collab/comments/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Authenticate
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(`${backendUrl}/api/collab/comments/${id}`, {
      method: "DELETE",
      headers: {
        Cookie: req.headers.get("cookie") || "",
        "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Delete comment error:", error);
      return NextResponse.json(
        { error: "Failed to delete comment", details: error },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Delete comment route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 },
    );
  }
}
