/**
 * Activity Timeline API Route
 *
 * GET /api/collab/timeline
 *
 * Query unified activity timeline for an entity or user.
 * Includes workflow events, permission decisions, field access, security events, CRUD audit logs.
 */

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

/**
 * GET /api/collab/timeline
 *
 * Query Parameters:
 * - entityType: string (optional) - Entity type to filter by
 * - entityId: string (optional) - Entity ID to filter by
 * - actorUserId: string (optional) - Filter by actor user ID
 * - startDate: ISO date string (optional) - Start of date range
 * - endDate: ISO date string (optional) - End of date range
 * - limit: number (optional, default: 100) - Max entries to return
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
    const actorUserId = searchParams.get("actorUserId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");

    // Build query parameters
    const params = new URLSearchParams();
    if (entityType) params.set("entityType", entityType);
    if (entityId) params.set("entityId", entityId);
    if (actorUserId) params.set("actorUserId", actorUserId);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);

    // Call backend service (via API mesh or direct framework call)
    // For now, using direct framework integration (assumes shared runtime)
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(
      `${backendUrl}/api/collab/timeline?${params}`,
      {
        headers: {
          Cookie: req.headers.get("cookie") || "",
          "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Timeline API error:", error);
      return NextResponse.json(
        { error: "Failed to fetch timeline", details: error },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Timeline route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 },
    );
  }
}
