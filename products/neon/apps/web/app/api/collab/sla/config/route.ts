import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest} from "next/server";

/**
 * POST /api/collab/sla/config
 *
 * Set SLA configuration for an entity type.
 */
export async function POST(req: NextRequest) {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (!body.entityType || !body.slaTargetSeconds) {
      return NextResponse.json(
        { error: "Missing required fields: entityType, slaTargetSeconds" },
        { status: 400 }
      );
    }

    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";

    const response = await fetch(`${backendUrl}/api/collab/sla/config`, {
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
    console.error("Error setting SLA config:", error);
    return NextResponse.json(
      { error: "Failed to set SLA config" },
      { status: 500 }
    );
  }
}
