/**
 * Principals Search API
 *
 * GET /api/iam/principals?search=... - Search principals for autocomplete
 */

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest} from "next/server";

/**
 * GET /api/iam/principals?search=...
 *
 * Search active principals for autocomplete (e.g., @mentions).
 *
 * Query params:
 * - search: string (required, min 2 chars)
 * - limit: number (optional, default 10, max 50)
 */
export async function GET(req: NextRequest) {
  // Authenticate
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const limit = searchParams.get("limit") || "10";

    // Validate search query
    if (!search || search.trim().length < 2) {
      return NextResponse.json(
        { error: "Search term must be at least 2 characters" },
        { status: 400 }
      );
    }

    // Build query string
    const queryParts: string[] = [];
    queryParts.push(`search=${encodeURIComponent(search)}`);
    queryParts.push(`limit=${encodeURIComponent(limit)}`);
    const queryString = `?${queryParts.join("&")}`;

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(`${backendUrl}/api/iam/principals/search${queryString}`, {
      method: "GET",
      headers: {
        Cookie: req.headers.get("cookie") || "",
        "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Principal search error:", error);
      return NextResponse.json(
        { error: "Failed to search principals", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Principal search route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 }
    );
  }
}
