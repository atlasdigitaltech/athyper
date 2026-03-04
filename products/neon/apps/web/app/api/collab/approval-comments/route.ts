/**
 * Approval Comments API Routes
 *
 * POST /api/collab/approval-comments - Create a new approval comment
 */

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

/**
 * POST /api/collab/approval-comments
 *
 * Body:
 * - approvalInstanceId: string (required)
 * - approvalTaskId: string (optional)
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
    const { approvalInstanceId, approvalTaskId, commentText } = body;

    if (!approvalInstanceId || !commentText) {
      return NextResponse.json(
        {
          error: "Missing required fields: approvalInstanceId, commentText",
        },
        { status: 400 },
      );
    }

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(`${backendUrl}/api/collab/approval-comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("cookie") || "",
        "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
      },
      body: JSON.stringify({ approvalInstanceId, approvalTaskId, commentText }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Create approval comment error:", error);
      return NextResponse.json(
        { error: "Failed to create approval comment", details: error },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Create approval comment route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 },
    );
  }
}
