import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

/**
 * PATCH /api/collab/retention/policies/:id
 *
 * Update a retention policy.
 */
export async function PATCH(
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
    const policyId = id;

    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "Missing required field: enabled (boolean)" },
        { status: 400 },
      );
    }

    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";

    const response = await fetch(
      `${backendUrl}/api/collab/retention/policies/${policyId}`,
      {
        method: "PATCH",
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
    console.error("Error updating retention policy:", error);
    return NextResponse.json(
      { error: "Failed to update retention policy" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/collab/retention/policies/:id
 *
 * Delete a retention policy.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const policyId = id;
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";

    const response = await fetch(
      `${backendUrl}/api/collab/retention/policies/${policyId}`,
      {
        method: "DELETE",
        headers: {
          Cookie: req.headers.get("cookie") || "",
          "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
        },
      },
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error deleting retention policy:", error);
    return NextResponse.json(
      { error: "Failed to delete retention policy" },
      { status: 500 },
    );
  }
}
